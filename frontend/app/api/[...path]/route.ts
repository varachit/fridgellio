import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";
import { activeBackendToken, backendFetch } from "@/lib/backend";

const noStore = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ path: string[] }> };

async function forward(request: NextRequest, context: Context) {
  const fail = (code: string, status: number) =>
    NextResponse.json({ code }, { status, headers: noStore });
  const publicOrigin =
    process.env.NEXTAUTH_URL ||
    process.env.FRIDGELLIO_WEB_ORIGIN ||
    request.nextUrl.protocol + "//" + request.headers.get("host");
  if (
    request.method !== "GET" &&
    request.headers.get("origin") !== new URL(publicOrigin).origin
  ) {
    return fail("origin_mismatch", 403);
  }
  const { path } = await context.params;
  if (
    path[0] === "auth" ||
    !path.every((segment) => /^[a-zA-Z0-9_-]+$/.test(segment))
  ) {
    return fail("invalid_request", 400);
  }
  const token = activeBackendToken(await getToken({ req: request }));
  if (!token) return fail("authentication_required", 401);

  const route = path.join("/");
  const headers = new Headers({ Authorization: "Bearer " + token });
  for (const name of ["content-type", "idempotency-key"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const init: RequestInit & { duplex?: "half" } = {
      method: request.method,
      headers,
    };
    if (route === "menus" || route === "photos/analyze")
      init.signal = AbortSignal.timeout(90_000);
    if (request.method === "GET" && path[0] === "barcodes")
      init.signal = AbortSignal.timeout(35_000);
    if (request.body)
      Object.assign(init, { body: request.body, duplex: "half" });
    const upstream = await backendFetch(route + request.nextUrl.search, init);
    const responseHeaders = new Headers({
      ...noStore,
      "Content-Type": "application/json",
    });
    const source = upstream.headers.get("X-Barcode-Source");
    if (source) responseHeaders.set("X-Barcode-Source", source);
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return fail("service_unavailable", 503);
  }
}
export { forward as GET, forward as POST, forward as PATCH, forward as DELETE };
