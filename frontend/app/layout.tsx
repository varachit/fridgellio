import type { Metadata } from "next";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/dm-serif-text/latin-400.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fridgellio · Household pantry",
  description:
    "Manage your household pantry, keep track of expiry dates and plan meals together.",
};

export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
