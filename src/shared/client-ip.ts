import { proxyHops, type Env } from "./runtime-config";

/** Valor usado como "IP" quando não há como saber o endereço real com segurança: todos caem no mesmo limite. */
export const UNKNOWN_IP = "ip-desconhecido";

type HeaderGetter = { get(name: string): string | null };

/**
 * IP real de quem acessa, sem agrupar (IPv6 inteiro): usado na lista de IPs do painel e para mascarar nos registros.
 * Mesma regra de confiança de resolveClientIp (security.ts): em produção, sem TRUST_PROXY_HOPS válido, nunca confia nos
 * cabeçalhos. Devolve UNKNOWN_IP (produção sem proxy configurado) ou "local" (sem cabeçalhos, fora de produção).
 */
export function rawClientIp(h: HeaderGetter, env: Env = process.env): string {
  const production = env.NODE_ENV === "production";
  const hops = proxyHops(env);
  if (production && hops === null) return UNKNOWN_IP;
  const real = h.get("x-real-ip");
  if (real && env.TRUST_X_REAL_IP === "true" && real.trim()) return real.trim();
  const list = (h.get("x-forwarded-for") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!list.length) return production ? UNKNOWN_IP : "local";
  return list[Math.max(0, list.length - (hops ?? 1))];
}
