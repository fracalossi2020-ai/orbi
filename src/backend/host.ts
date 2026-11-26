import { headers } from "next/headers";
import { proxyHops } from "@/shared/runtime-config";
import { hostRole, hostsConfig, hostUrl, requestHost, scopeOf, type HostRole, type HostsConfig, type SessionScope } from "@/shared/hosts";

/** x-forwarded-host só vale com proxy confiável declarado (TRUST_PROXY=true). */
export const trustForwardedHost = () => process.env.TRUST_PROXY === "true";

/** Configuração do modo separado (www/app/admin), ou null quando desligado. Lida a cada uso: vem do ambiente do servidor. */
export const separatedHosts = (): HostsConfig | null => hostsConfig(process.env);

/** Qual host recebeu o pedido atual (null: modo desligado ou host desconhecido). Funciona em rotas e páginas. */
export async function currentHostRole(): Promise<HostRole | null> {
  const cfg = separatedHosts();
  if (!cfg) return null;
  const h = await headers();
  return hostRole(cfg, requestHost({ host: h.get("host"), forwardedHost: h.get("x-forwarded-host") }, trustForwardedHost(), proxyHops(process.env) ?? 1));
}

/** Escopo da sessão neste host: "app" ou "admin" no modo separado; null no www, em host desconhecido e com o modo desligado. */
export async function currentScope(): Promise<SessionScope | null> {
  return scopeOf(await currentHostRole());
}

/**
 * Endereço para ir a um host. Modo separado: absoluto, a partir da configuração (nunca do Host do pedido).
 * Desligado: o próprio caminho (tudo é um host só).
 */
export function linkTo(role: HostRole, path: string): string {
  const cfg = separatedHosts();
  return cfg ? hostUrl(cfg, role, path) : path;
}
