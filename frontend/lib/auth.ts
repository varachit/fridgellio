import "server-only";
import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { activeBackendToken, backendFetch } from "./backend";

const week = 7 * 24 * 60 * 60;

function readProfile(account: {
  first_name?: unknown;
  last_name?: unknown;
  profile_picture_url?: unknown;
}) {
  return {
    firstName:
      typeof account.first_name === "string" ? account.first_name : null,
    lastName: typeof account.last_name === "string" ? account.last_name : null,
    image:
      typeof account.profile_picture_url === "string" &&
      /^https:\/\//i.test(account.profile_picture_url)
        ? account.profile_picture_url
        : null,
  };
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
  session: { strategy: "jwt", maxAge: week },
  pages: { signIn: "/sign-in" },
  providers: [
    Credentials({
      credentials: {
        username: { type: "text" },
        password: { type: "password" },
        firstName: { type: "text" },
        lastName: { type: "text" },
        intent: { type: "hidden" },
        language: { type: "hidden" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials.password) return null;
        const { username, password, intent, language } = credentials;
        const register = intent === "register";
        const response = await backendFetch(
          register ? "auth/register" : "auth/login",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username,
              password,
              ...(register && {
                language: language === "th" ? "th" : "en",
                first_name: credentials.firstName,
                last_name: credentials.lastName,
              }),
            }),
          },
        ).catch(() => null);
        if (!response) throw new Error("service_unavailable");
        if (response.status === 401) return null;
        if (response.status === 409 && register)
          throw new Error("username_unavailable");
        if (response.status === 429) throw new Error("auth_rate_limited");
        if (response.status === 422) throw new Error("invalid_request");
        if (!response.ok) throw new Error("service_unavailable");
        const data = await response.json().catch(() => null);
        const expiresAt = Date.parse(data?.expires_at);
        if (
          typeof data?.account?.id !== "string" ||
          typeof data.account.username !== "string" ||
          typeof data.token !== "string" ||
          !/^[A-Za-z0-9_-]{43}$/.test(data.token) ||
          !Number.isFinite(expiresAt) ||
          expiresAt <= Date.now()
        )
          throw new Error("invalid_response");
        return {
          id: data.account.id,
          name: data.account.username,
          ...readProfile(data.account),
          backendToken: data.token,
          backendExpiresAt: expiresAt,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user)
        return {
          ...token,
          firstName: user.firstName,
          lastName: user.lastName,
          picture: user.image,
          backendToken: user.backendToken,
          backendExpiresAt: user.backendExpiresAt,
        };
      const bearer = activeBackendToken(token);
      if (!bearer) throw new Error("Backend session expired");
      // Password resets and other revocations can precede the cookie expiry.
      const response = await backendFetch("auth/me", {
        headers: { Authorization: "Bearer " + bearer },
      }).catch(() => null);
      if (response?.status === 401) throw new Error("Backend session revoked");
      if (response?.ok) {
        const account = await response.json();
        if (account?.id !== token.sub)
          throw new Error("Invalid backend account");
        const profile = readProfile(account);
        return {
          ...token,
          firstName: profile.firstName,
          lastName: profile.lastName,
          picture: profile.image,
        };
      }
      void response?.body?.cancel().catch(() => {});
      return token;
    },
    session({ token }) {
      return {
        user: {
          id: token.sub!,
          name: token.name!,
          firstName: token.firstName ?? null,
          lastName: token.lastName ?? null,
          image: token.picture ?? null,
        },
        expires: new Date(token.backendExpiresAt!).toISOString(),
      };
    },
  },
};
