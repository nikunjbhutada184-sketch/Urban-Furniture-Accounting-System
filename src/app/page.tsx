import { redirect } from "next/navigation";
import { getCurrentActor, homePathForRole } from "@/server/auth/session";

/** Entry point: routes each role to its own home. */
export default async function RootPage() {
  const actor = await getCurrentActor();
  redirect(actor ? homePathForRole(actor.role) : "/login");
}
