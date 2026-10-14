import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/platform/admin";

export const dynamic = "force-dynamic";

export default async function PlatformHome() {
  await requirePlatformAdmin();
  redirect("/platform/crons");
}
