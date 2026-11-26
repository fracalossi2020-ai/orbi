import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { currentHostRole, separatedHosts } from "@/backend/host";
import { adminAllowList, ipAllowed } from "@/shared/ip-allow";
import { rawClientIp } from "@/shared/client-ip";
import { StaffInvite } from "@/frontend/components/app/StaffInvite";

// O endereço leva o token do convite: nunca vai para buscadores nem para outros sites (Referer).
export const metadata = { title: "Convite para a equipe", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  // Mesmas regras do painel: no modo separado só no host do painel; e só dos IPs da lista, se houver.
  if (separatedHosts() && (await currentHostRole()) !== "admin") notFound();
  if (!ipAllowed(adminAllowList(), rawClientIp(await headers()))) notFound();
  const { token } = await params;
  return <StaffInvite token={token} />;
}
