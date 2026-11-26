import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { mfaPending, readSession } from "@/backend/auth";
import { currentHostRole, separatedHosts } from "@/backend/host";
import { foodDemoEnabled } from "@/backend/food";
import { requireRole } from "@/backend/guard";
import { staffMissingMfa } from "@/backend/api";
import { adminAllowList, ipAllowed } from "@/shared/ip-allow";
import { rawClientIp } from "@/shared/client-ip";
import { STAFF } from "@/shared/permissions";
import { AdminLogin } from "@/frontend/components/app/AdminLogin";
import { AdminShell } from "./shell";

export const metadata = { title: "Administração", robots: { index: false, follow: false } };

export default async function Layout({ children }: { children: React.ReactNode }) {
  // Lista de IPs do painel (defesa em profundidade: o proxy já barra). Fora dela, a página não existe.
  if (!ipAllowed(adminAllowList(), rawClientIp(await headers()))) notFound();
  const separated = !!separatedHosts();
  if (separated) {
    // Defesa em profundidade (o proxy já barra): o painel só existe no host do painel.
    if ((await currentHostRole()) !== "admin") notFound();
    // Entrada própria: sem sessão (ou faltando o código da segunda etapa), só a tela de login, nunca o painel.
    const r = await readSession();
    if (!r || mfaPending(r)) return <AdminLogin codeStep={!!r} />;
  }
  const user = await requireRole(STAFF);
  // Equipe sem verificação em duas etapas vê só a tela de ativação: o painel tem dados de todos os usuários.
  const mfaReady = !staffMissingMfa(user);
  return <AdminShell food={await foodDemoEnabled()} role={user.role} mfaReady={mfaReady} loginHref={separated ? "/admin" : "/entrar"}>{children}</AdminShell>;
}
