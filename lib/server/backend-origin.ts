const LIVE_BACKEND_HTTP_ORIGIN = "https://backend.yopips.com";

const isUsableHttpOrigin = (value: string | undefined): value is string => {
  const normalized = value?.trim() ?? "";
  if (!normalized) return false;
  if (["proxy", "same-origin", "same_origin"].includes(normalized.toLowerCase())) {
    return false;
  }
  return /^https?:\/\//i.test(normalized);
};

export const canonicalizeBackendHttpOrigin = (
  value: string | undefined,
): string | undefined => {
  if (!isUsableHttpOrigin(value)) return undefined;
  return value
    .trim()
    .replace(/https?:\/\/api\.yopips\.com/gi, LIVE_BACKEND_HTTP_ORIGIN)
    .replace(/\/docs\/?$/i, "")
    .replace(/\/+$/, "");
};

export const resolveTerminalBackendOrigin = (): string => {
  const candidates = [
    process.env.TERMINAL_API_BASE,
    process.env.RUST_GATEWAY_PUBLIC_API_BASE_URL,
    process.env.RUST_GATEWAY_HTTP_URL,
    process.env.NEXT_PUBLIC_API_BASE_URL,
    process.env.ACCOUNTS_BACKEND_URL,
  ];
  for (const candidate of candidates) {
    const origin = canonicalizeBackendHttpOrigin(candidate);
    if (origin) return origin;
  }
  if (process.env.NODE_ENV === "production") {
    return LIVE_BACKEND_HTTP_ORIGIN;
  }
  return "http://127.0.0.1:3001";
};
