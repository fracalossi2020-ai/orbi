import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getDb } from "@/database";
import { getSetting } from "@/database/seed";
import { siteUser } from "@/backend/auth";
import { can } from "@/shared/permissions";
import { IdentityBoard } from "@/frontend/components/site/IdentityBoard";
import { envFlag, isRealProduction } from "@/shared/runtime-config";

export const metadata = { title: "Identidade visual" };

export default async function Identidade() {
  // Página de trabalho da marca: em produção de verdade só aparece com PRUMO_SHOW_IDENTITY=true.
  if (isRealProduction(process.env) && !envFlag(process.env.PRUMO_SHOW_IDENTITY)) notFound();
  const db = await getDb();
  const official = await getSetting(db, "identity", "a");
  const preview = (await cookies()).get("prumo_identity_preview")?.value ?? null;
  const user = await siteUser();
  return <IdentityBoard official={official} preview={preview} canSetOfficial={!!user && can(user.role, "settings", "write")} />;
}
