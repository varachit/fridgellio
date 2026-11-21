import type { NextConfig } from "next";
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_SERVER,
} from "next/constants.js";

if (!process.env.NEXTAUTH_URL && process.env.FRIDGELLIO_WEB_ORIGIN) {
  process.env.NEXTAUTH_URL = process.env.FRIDGELLIO_WEB_ORIGIN;
}

const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
};
export default function nextConfig(phase: string): NextConfig {
  if (
    [PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_SERVER].includes(phase) &&
    !process.env.NEXTAUTH_SECRET &&
    !process.env.AUTH_SECRET
  ) {
    throw new Error(
      "Set NEXTAUTH_SECRET in the server environment or frontend/.env.local before starting Fridgellio.",
    );
  }
  return config;
}
