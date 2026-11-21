import "server-only";
import type { JWT } from "next-auth/jwt";

export function backendFetch(path: string, init: RequestInit = {}) {
  const url = new URL(
    "/api/" + path,
    process.env.FRIDGELLIO_API_URL || "http://127.0.0.1:8000",
  );
  return fetch(url, {
    ...init,
    cache: "no-store",
    redirect: "error",
    signal: init.signal ?? AbortSignal.timeout(20_000),
  });
}

export function activeBackendToken(jwt: JWT | null) {
  if (!jwt?.backendExpiresAt || jwt.backendExpiresAt <= Date.now()) return null;
  return jwt.backendToken ?? null;
}
