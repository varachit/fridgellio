import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Kitchen } from "@/components/kitchen";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const session = await getServerSession(authOptions);
  return (
    <Kitchen session={session} expired={(await searchParams).expired === "1"} />
  );
}
