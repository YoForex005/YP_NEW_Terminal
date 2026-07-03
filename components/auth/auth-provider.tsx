"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import type { AuthUser } from "@/lib/auth/types";

interface LoginInput {
  email: string;
  password: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  verifyStep: (step: "email" | "mobile" | "profile", data?: any) => Promise<{ ok: boolean; error?: string }>;
  createDiditSession: () => Promise<{ ok: boolean; url?: string; sessionId?: string; sessionToken?: string; error?: string }>;
  checkDiditStatus: (sessionId: string) => Promise<{ ok: boolean; status?: string; error?: string }>;
  sendVerificationCode: (purpose: string, data?: Record<string, any>) => Promise<{ ok: boolean; error?: string }>;
  verifyCode: (code: string, purpose: string) => Promise<{ ok: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Error types for authentication API communication
 */
enum AuthErrorType {
  CONNECTION_REFUSED = "CONNECTION_REFUSED",
  NETWORK_ERROR = "NETWORK_ERROR",
  SERVER_UNAVAILABLE = "SERVER_UNAVAILABLE",
  UNAUTHORIZED = "UNAUTHORIZED",
  INVALID_CREDENTIALS = "INVALID_CREDENTIALS",
  TIMEOUT = "TIMEOUT",
  UNKNOWN = "UNKNOWN",
}

/**
 * Custom authentication error class
 */
class AuthError extends Error {
  public type: AuthErrorType;
  public statusCode?: number;
  public retryable: boolean;

  constructor(
    message: string,
    type: AuthErrorType = AuthErrorType.UNKNOWN,
    statusCode?: number,
    retryable = false
  ) {
    super(message);
    this.name = "AuthError";
    this.type = type;
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

/**
 * Parse HTTP response error
 */
const parseResponseError = async (response: Response): Promise<string> => {
  try {
    const payload = (await response.json()) as any;
    if (payload?.error) {
      if (typeof payload.error === "string") return payload.error;
      if (typeof payload.error === "object" && payload.error.message) return payload.error.message;
    }
    return getDefaultErrorMessage(response.status);
  } catch {
    return getDefaultErrorMessage(response.status);
  }
};

/**
 * Get default error message based on HTTP status
 */
const getDefaultErrorMessage = (statusCode: number): string => {
  switch (statusCode) {
    case 400:
      return "Invalid request. Please check your input and try again.";
    case 401:
      return "Invalid email or password. Please try again.";
    case 403:
      return "Access denied. You don't have permission to perform this action.";
    case 404:
      return "The requested resource was not found.";
    case 408:
      return "Request timed out. Please try again.";
    case 429:
      return "Too many login attempts. Please wait a moment and try again.";
    case 500:
    case 502:
    case 503:
      return "Our servers are currently experiencing issues. Please try again later.";
    default:
      return "An unexpected error occurred. Please try again.";
  }
};

/**
 * Parse network/connection errors
 */
const parseNetworkError = (error: unknown): AuthError => {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Connection refused errors
    if (
      message.includes("connection refused") ||
      message.includes("err_connection_refused") ||
      message.includes("failed to fetch") ||
      message.includes("cannot connect") ||
      message.includes("networkerror")
    ) {
      return new AuthError(
        "Unable to connect to the server. Please check your internet connection.",
        AuthErrorType.CONNECTION_REFUSED,
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
      return new AuthError(
        "Network connection issue detected. Please check your internet connection.",
        AuthErrorType.NETWORK_ERROR,
        undefined,
        true
      );
    }

    // Timeout errors
    if (
      message.includes("timeout") ||
      message.includes("timed out") ||
      message.includes("abort") ||
      error.name === "AbortError"
    ) {
      return new AuthError(
        "The request timed out. Please try again.",
        AuthErrorType.TIMEOUT,
        undefined,
        true
      );
    }
  }

  return new AuthError(
    "An unexpected error occurred. Please try again.",
    AuthErrorType.UNKNOWN,
    undefined,
    false
  );
};

const isTerminalLaunchCodePage = (): boolean => {
  if (typeof window === "undefined") return false;
  if (window.location.pathname !== "/terminal") return false;

  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;

  return new URLSearchParams(hash).has("launch");
};

/**
 * Fetch with timeout and retry logic
 */
const fetchWithAuthRetry = async (
  url: string,
  options: RequestInit,
  maxRetries = 2
): Promise<Response> => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // If successful, return immediately
      if (response.ok) {
        return response;
      }

      // Determine if error is retryable based on status
      const retryable = response.status >= 500 || response.status === 429;

      // If it's not retryable, or we're on the last attempt, return the response to let the consumer handle it
      if (!retryable || attempt === maxRetries) {
        return response;
      }

      // Otherwise, log and apply exponential backoff before the next loop
      const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 5000);
      console.warn(
        `Auth HTTP request failed with status ${response.status} (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(delay)}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));

    } catch (error) {
      const networkError = parseNetworkError(error);

      // If it's a non-retryable network error, or we've maxed out retries, throw it
      if (!networkError.retryable || attempt === maxRetries) {
        throw networkError;
      }

      // Exponential backoff with jitter for network errors
      const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 5000);
      console.warn(
        `Auth network request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(delay)}ms...`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new AuthError("Max retries exceeded", AuthErrorType.UNKNOWN, undefined, false);
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const refresh = useCallback(async () => {
    if (isTerminalLaunchCodePage()) {
      setUser(null);
      return;
    }

    try {
      const response = await fetchWithAuthRetry("/api/auth/me", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        setUser(null);
        return;
      }

      const payload = (await response.json()) as { user: AuthUser | null };
      setUser(payload.user ?? null);
    } catch (error) {
      // Log error for debugging but silently fail for auth refresh
      if (error instanceof AuthError) {
        console.warn("Auth refresh failed:", error.message);
      } else {
        console.warn("Auth refresh failed with unknown error:", error);
      }
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      await refresh();
      setIsLoading(false);
    })();
  }, [refresh]);

  const login = useCallback(
    async ({ email, password }: LoginInput): Promise<{ ok: boolean; error?: string }> => {
      try {
        const response = await fetchWithAuthRetry(
          "/api/auth/login",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ email, password }),
          },
          1 // Only 1 retry for login to avoid locking accounts
        );

        if (!response.ok) {
          const errorMessage = await parseResponseError(response);
          return { ok: false, error: errorMessage };
        }

        const payload = (await response.json()) as { user: AuthUser };
        setUser(payload.user);
        return { ok: true };
      } catch (error) {
        // Return user-friendly error message
        if (error instanceof AuthError) {
          return { ok: false, error: error.message };
        }

        // Handle unknown errors
        const networkError = parseNetworkError(error);
        return { ok: false, error: networkError.message };
      }
    },
    []
  );

  const logout = useCallback(async () => {
    setUser(null);
    // Navigate to the logout GET route — the server clears the session cookie
    // AND redirects to /login in a single response, so the browser never makes
    // a second request while the old cookie is still present.
    window.location.href = "/api/auth/logout";
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      login,
      logout,
      refresh,
      verifyStep: async (step, data) => {
        try {
          if (!user) return { ok: false, error: "No user logged in" };

          const endpointMap = {
            email: "verify-email",
            mobile: "verify-mobile",
            profile: "verify-profile",
          };

          const response = await fetchWithAuthRetry(`/api/private/verification`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: endpointMap[step], ...data }),
          });

          if (!response.ok) {
            const error = await response.json();
            return { ok: false, error: error.error || "Verification failed" };
          }

          await refresh();
          return { ok: true };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
        }
      },
      createDiditSession: async () => {
        try {
          if (!user) return { ok: false, error: "No user logged in" };
          const response = await fetchWithAuthRetry("/verification/didit/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: user.id }),
          });
          
          if (!response.ok) {
            const errorMsg = await parseResponseError(response);
            return { ok: false, error: errorMsg };
          }
          
          return (await response.json()) as { ok: boolean; url?: string; sessionId?: string; sessionToken?: string; error?: string };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
        }
      },
      checkDiditStatus: async (sessionId) => {
        try {
          if (!user) return { ok: false, error: "No user logged in" };
          const response = await fetchWithAuthRetry(`/verification/didit/status/${sessionId}?userId=${user.id}&t=${Date.now()}`, {
            method: "GET",
            headers: {
              "Cache-Control": "no-cache, no-store, must-revalidate",
              "Pragma": "no-cache",
              "Expires": "0"
            }
          });
          
          if (!response.ok) {
            const errorMsg = await parseResponseError(response);
            return { ok: false, error: errorMsg };
          }
          
          const result = (await response.json()) as { ok: boolean; status?: string; error?: string; kycData?: any };
          if (result.ok && result.status === "completed") {
            // Optimistically update the frontend user state immediately since the Next.js server DB cache might take 60s to sync
            setUser((prev) => prev ? { 
                ...prev, 
                profileVerified: new Date().toISOString(), 
                emailVerified: new Date().toISOString(),
                mobileVerified: new Date().toISOString(),
                kycData: result.kycData || prev.kycData 
            } : prev);
            // Fire refresh silently in the background
            void refresh();
          }
          return result;
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
        }
      },
      sendVerificationCode: async (purpose: string, data?: Record<string, any>) => {
        try {
          if (!user) return { ok: false, error: "No user logged in" };
          const response = await fetchWithAuthRetry("/api/private/verification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "send-code", purpose, ...data }),
          });
          
          if (!response.ok) {
            const errorMsg = await parseResponseError(response);
            return { ok: false, error: errorMsg };
          }
          
          return (await response.json()) as { ok: boolean; error?: string };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
        }
      },
      verifyCode: async (code, purpose) => {
        try {
          if (!user) return { ok: false, error: "No user logged in" };
          const response = await fetchWithAuthRetry("/api/private/verification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "verify-code", code, purpose }),
          });
          
          if (!response.ok) {
            const errorMsg = await parseResponseError(response);
            return { ok: false, error: errorMsg };
          }
          
          return (await response.json()) as { ok: boolean; error?: string };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
        }
      },
    }),
    [isLoading, login, logout, refresh, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return context;
};

