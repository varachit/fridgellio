import NextAuth from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { backendFetch } from "@/lib/backend";

type Context = { params: Promise<{ nextauth: string[] }> };

async function handle(request: NextRequest, context: Context) {
  let revokeFailed = false;
  const response: Response = await NextAuth(request, context, {
    ...authOptions,
    events: {
      async signOut({ token }) {
        if (!token?.backendToken) return;
        const revoked = await backendFetch("auth/logout", {
          method: "POST",
          headers: { Authorization: "Bearer " + token.backendToken },
        }).catch(() => null);
        revokeFailed = !revoked || (!revoked.ok && revoked.status !== 401);
      },
    },
  });
  // NextAuth normally clears the cookie even if a sign-out event fails.
  // Keep it for retry until FastAPI confirms revocation.
  if (revokeFailed)
    return NextResponse.json(
      { error: "service_unavailable" },
      {
        status: 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  if (
    request.cookies.has("fridgellio_session") &&
    response.ok &&
    request.method === "POST"
  ) {
    response.headers.append(
      "Set-Cookie",
      "fridgellio_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
    );
  }
  return response;
}

export { handle as GET, handle as POST };
