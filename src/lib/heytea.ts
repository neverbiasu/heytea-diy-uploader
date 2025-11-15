import MD5 from "crypto-js/md5";

type HeyteaPayload = {
  data?: Record<string, unknown>;
  userInfo?: Record<string, unknown>;
} & Record<string, unknown>;

const SIGN_SALT = "r5YWPjgSGAT2dbOJzwiDBK";
const DEFAULT_PROXY_BASE = "http://localhost:5969";
const DEFAULT_SMS_AREA = "86";

export function buildUploadSignature(userMainId: string, now = Date.now()) {
  const trimmed = userMainId.trim();
  if (!trimmed) {
    throw new Error("user_main_id is required to compute upload signature");
  }

  const timestamp = String(now);
  const sign = MD5(`${SIGN_SALT}${trimmed}${timestamp}`).toString();

  return { sign, timestamp };
}

export function getProxyBaseUrl() {
  // Allow overriding the proxy base via NEXT_PUBLIC_PROXY_BASE at build/deploy time.
  // This makes it easy to deploy the frontend to Vercel and point to a separately
  // hosted proxy service without changing source code.
  try {
    // `process.env.NEXT_PUBLIC_PROXY_BASE` is inlined by Next.js during build.
    // The check for `typeof process !== 'undefined'` keeps this safe in browser context.
     
    const env = typeof process !== "undefined" ? (process.env as any)?.NEXT_PUBLIC_PROXY_BASE : undefined;
    if (env && typeof env === "string" && env.trim().length > 0) {
      return env.trim();
    }
  } catch (e) {
    // ignore and fall back to default
  }
  return DEFAULT_PROXY_BASE;
}

export const REQUIRED_DIMENSIONS = Object.freeze({ width: 596, height: 832 });
export const DEFAULT_SMS_AREA_CODE = DEFAULT_SMS_AREA;

export function normalizeBearerToken(value?: string | null) {
  if (!value) {
    return "";
  }
  return value.startsWith("Bearer") ? value : `Bearer ${value}`;
}

export function extractTokenFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const source = payload as HeyteaPayload;
  const data = source.data ?? {};
  const candidateList = [
    data.token,
    data.accessToken,
    source.token,
    source.accessToken,
  ].filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
  const raw = candidateList[0];
  return raw ? normalizeBearerToken(raw) : "";
}

export function extractUserMainIdFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const source = payload as HeyteaPayload;
  const data = source.data ?? {};
  const candidateList = [
    data.user_main_id,
    data.userMainId,
    source.user_main_id,
    source.userMainId,
  ].filter((entry): entry is string | number => typeof entry === "string" || typeof entry === "number");
  const raw = candidateList[0];
  return raw !== undefined ? String(raw) : "";
}
