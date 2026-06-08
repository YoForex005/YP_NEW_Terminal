import { EMPTY_DASHBOARD_SNAPSHOT } from "@/lib/dashboard/default-state";
import type { DashboardDataProvider } from "@/lib/dashboard/provider";
import type { DashboardSnapshot } from "@/types/dashboard";

const asArray = <T,>(value: T[] | undefined, fallback: T[]) =>
  Array.isArray(value) ? value : fallback;

const asObject = <T extends object>(value: T | undefined, fallback: T) =>
  value && typeof value === "object" ? value : fallback;

const normalizeSnapshot = (
  incoming: Partial<DashboardSnapshot> | null | undefined,
): DashboardSnapshot => ({
  marketInstruments: asArray(incoming?.marketInstruments, EMPTY_DASHBOARD_SNAPSHOT.marketInstruments),
  tradingSessions: asArray(incoming?.tradingSessions, EMPTY_DASHBOARD_SNAPSHOT.tradingSessions),
  wallets: asObject(incoming?.wallets, EMPTY_DASHBOARD_SNAPSHOT.wallets),
  positions: asArray(incoming?.positions, EMPTY_DASHBOARD_SNAPSHOT.positions),
  transactions: asArray(incoming?.transactions, EMPTY_DASHBOARD_SNAPSHOT.transactions),
  pnlSeries: asArray(incoming?.pnlSeries, EMPTY_DASHBOARD_SNAPSHOT.pnlSeries),
  tradingAccounts: asArray(incoming?.tradingAccounts, EMPTY_DASHBOARD_SNAPSHOT.tradingAccounts),
});

const apiEndpoint =
  process.env.NEXT_PUBLIC_DASHBOARD_SNAPSHOT_ENDPOINT ?? "/api/private/dashboard/snapshot";

// Maximum number of retry attempts
const MAX_RETRIES = 3;
// Initial delay in milliseconds (exponential backoff)
const INITIAL_RETRY_DELAY = 1000;
const DASHBOARD_SNAPSHOT_MAX_RETRIES = 1;
const DASHBOARD_SNAPSHOT_REQUEST_TIMEOUT_MS = 10_000;

/**
 * Error types for API communication
 */
export enum ApiErrorType {
  CONNECTION_REFUSED = "CONNECTION_REFUSED",
  NETWORK_ERROR = "NETWORK_ERROR",
  SERVER_UNAVAILABLE = "SERVER_UNAVAILABLE",
  UNAUTHORIZED = "UNAUTHORIZED",
  NOT_FOUND = "NOT_FOUND",
  SERVER_ERROR = "SERVER_ERROR",
  TIMEOUT = "TIMEOUT",
  UNKNOWN = "UNKNOWN",
}

/**
 * Custom API error class with detailed error information
 */
export class ApiError extends Error {
  public type: ApiErrorType;
  public statusCode?: number;
  public retryable: boolean;

  constructor(
    message: string,
    type: ApiErrorType = ApiErrorType.UNKNOWN,
    statusCode?: number,
    retryable = false
  ) {
    super(message);
    this.name = "ApiError";
    this.type = type;
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

/**
 * Get user-friendly error message based on error type
 */
export function getUserFriendlyErrorMessage(error: ApiError): string {
  switch (error.type) {
    case ApiErrorType.CONNECTION_REFUSED:
      return "Unable to connect to the server. Please check your internet connection and try again.";
    case ApiErrorType.NETWORK_ERROR:
      return "Network connection issue detected. Please check your internet connection.";
    case ApiErrorType.SERVER_UNAVAILABLE:
      return "Our servers are currently unavailable. Please try again in a few moments.";
    case ApiErrorType.UNAUTHORIZED:
      return "Your session has expired. Please log in again.";
    case ApiErrorType.NOT_FOUND:
      return "The requested resource was not found.";
    case ApiErrorType.TIMEOUT:
      return "The request timed out. Please try again.";
    case ApiErrorType.SERVER_ERROR:
      return "An unexpected server error occurred. Please try again later.";
    default:
      return error.message || "An unexpected error occurred. Please try again.";
  }
}

/**
 * Determine if an error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.retryable;
  }
  if (error instanceof TypeError) {
    // Network errors are typically retryable
    const message = error.message.toLowerCase();
    return (
      message.includes("fetch") ||
      message.includes("network") ||
      message.includes("connection")
    );
  }
  return false;
}

/**
 * Sleep utility for delays between retries
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse error and convert to ApiError with proper classification
 */
function parseApiError(error: unknown, statusCode?: number): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  // Handle Response errors (HTTP status codes)
  if (statusCode) {
    switch (statusCode) {
      case 401:
        return new ApiError(
          "Unauthorized",
          ApiErrorType.UNAUTHORIZED,
          statusCode,
          false
        );
      case 404:
        return new ApiError(
          "Not Found",
          ApiErrorType.NOT_FOUND,
          statusCode,
          false
        );
      case 408:
      case 504:
        return new ApiError(
          "Request Timeout",
          ApiErrorType.TIMEOUT,
          statusCode,
          true
        );
      case 429:
        return new ApiError(
          "Too Many Requests",
          ApiErrorType.SERVER_ERROR,
          statusCode,
          true
        );
      case 500:
      case 502:
      case 503:
        return new ApiError(
          "Server Error",
          ApiErrorType.SERVER_UNAVAILABLE,
          statusCode,
          true
        );
      default:
        if (statusCode >= 500) {
          return new ApiError(
            `Server Error: ${statusCode}`,
            ApiErrorType.SERVER_ERROR,
            statusCode,
            true
          );
        }
        return new ApiError(
          `HTTP Error: ${statusCode}`,
          ApiErrorType.UNKNOWN,
          statusCode,
          false
        );
    }
  }

  // Handle Error objects
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Connection refused errors
    if (
      message.includes("connection refused") ||
      message.includes("err_connection_refused") ||
      message.includes("failed to fetch") ||
      message.includes("networkerror") ||
      message.includes("cannot connect")
    ) {
      return new ApiError(
        "Connection refused",
        ApiErrorType.CONNECTION_REFUSED,
        undefined,
        true
      );
    }

    // Network errors
    if (
      message.includes("network") ||
      message.includes("internet") ||
      message.includes("offline") ||
      message.includes("unreachable")
    ) {
      return new ApiError(
        "Network error",
        ApiErrorType.NETWORK_ERROR,
        undefined,
        true
      );
    }

    // Timeout errors
    if (
      message.includes("timeout") ||
      message.includes("timed out") ||
      message.includes("abort")
    ) {
      return new ApiError(
        "Request timeout",
        ApiErrorType.TIMEOUT,
        undefined,
        true
      );
    }

    return new ApiError(error.message, ApiErrorType.UNKNOWN, undefined, false);
  }

  return new ApiError(
    "An unknown error occurred",
    ApiErrorType.UNKNOWN,
    undefined,
    false
  );
}

/**
 * Fetch with retry logic and exponential backoff
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = MAX_RETRIES,
  initialDelay: number = INITIAL_RETRY_DELAY,
  context: {
    requestName?: string;
    timeoutMs?: number;
  } = {},
): Promise<Response> {
  let lastError: ApiError | null = null;
  const requestName = context.requestName ?? "API request";
  const timeoutMs = context.timeoutMs ?? DASHBOARD_SNAPSHOT_REQUEST_TIMEOUT_MS;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = parseApiError(null, response.status);
        if (!error.retryable || attempt === maxRetries) {
          throw error;
        }
        throw error;
      } else {
        return response;
      }
    } catch (error) {
      const apiError = parseApiError(error);
      const elapsedMs = Date.now() - startedAt;

      // Don't retry non-retryable errors
      if (!apiError.retryable) {
        throw apiError;
      }

      lastError = apiError;

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Calculate exponential backoff delay with jitter
      const delay = initialDelay * Math.pow(2, attempt) + Math.random() * 1000;
      console.warn(
        `${requestName} failed (attempt ${attempt + 1}/${maxRetries + 1}, method ${options.method ?? "GET"}, url ${url}, status ${apiError.statusCode ?? "n/a"}, elapsed ${elapsedMs}ms, timeout ${timeoutMs}ms), retrying in ${Math.round(delay)}ms...`,
        apiError.message,
      );

      await sleep(delay);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError || new ApiError("Max retries exceeded", ApiErrorType.UNKNOWN, undefined, false);
}

export const apiDashboardProvider: DashboardDataProvider = {
  async getSnapshot() {
    try {
      const response = await fetchWithRetry(
        apiEndpoint,
        {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
        },
        DASHBOARD_SNAPSHOT_MAX_RETRIES,
        INITIAL_RETRY_DELAY,
        {
          requestName: "Dashboard snapshot request",
          timeoutMs: DASHBOARD_SNAPSHOT_REQUEST_TIMEOUT_MS,
        },
      );

      const payload = (await response.json()) as Partial<DashboardSnapshot> | null;
      return normalizeSnapshot(payload);
    } catch (error) {
      // Re-throw ApiErrors as-is
      if (error instanceof ApiError) {
        throw error;
      }

      // Convert unknown errors to ApiError
      throw parseApiError(error);
    }
  },
};
