export class ApiError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}
export function errorCode(error: unknown): string | null {
  if (!error) return null;
  return error instanceof ApiError ? error.code : "service_unavailable";
}

export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  options: { key?: string; signal?: AbortSignal } = {},
): Promise<T> {
  const headers = new Headers();
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers.set("Content-Type", "application/json");
    payload = JSON.stringify(body);
  }
  if (options.key) headers.set("Idempotency-Key", options.key);
  const response = await fetch("/api/" + path, {
    method,
    headers,
    body: payload,
    signal: options.signal,
    cache: "no-store",
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (response.status === 401) {
      window.dispatchEvent(new Event("session-ended"));
    }
    throw new ApiError(error.code || "service_unavailable");
  }
  return response.status === 204 ? (undefined as T) : await response.json();
}
export async function allPages<T extends { id: string }>(
  path: string,
  signal: AbortSignal,
) {
  const items = new Map<string, T>();
  for (let offset = 0; ; offset += 200) {
    const query = path.includes("?") ? "&" : "?";
    const page = await api<T[]>(
      path + query + "limit=200&offset=" + offset,
      "GET",
      undefined,
      { signal },
    );
    for (const item of page) items.set(item.id, item);
    if (page.length < 200) return [...items.values()];
  }
}
