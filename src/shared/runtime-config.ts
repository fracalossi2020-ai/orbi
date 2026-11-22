/**
 * Configuração de execução: o que é "produção de verdade" e quais variáveis a impedem de subir.
 * Função pura (recebe o env), usada na subida (src/instrumentation.ts) e testada em tests/runtime-config.test.ts.
 */
import { MIN_TRIP_FLOOR_S, MIN_TRIP_FRACTION } from "./ride-guards";

export type Env = Record<string, string | undefined>;

/** Booleano estrito: só a string "true" liga. "false", "1", "yes" e vazio ficam desligados. */
export const envFlag = (v: string | undefined) => v === "true";

/** Produção (NODE_ENV=production), seja de verdade ou o modo local de teste com banco embutido. */
export const isProductionBuild = (env: Env) => env.NODE_ENV === "production";

/**
 * Banco embutido liberado: só sem DATABASE_URL e com PRUMO_ALLOW_EMBEDDED_DB=true.
 * Com DATABASE_URL definido a variável é ignorada (não dá para "fingir" produção local em cima do banco real).
 */
export const embeddedDbAllowed = (env: Env) => !env.DATABASE_URL && envFlag(env.PRUMO_ALLOW_EMBEDDED_DB);

/** Produção de verdade: NODE_ENV=production e não é o modo local de teste (banco embutido liberado). */
export const isRealProduction = (env: Env) => isProductionBuild(env) && !embeddedDbAllowed(env);

/** Número de proxies configurado em TRUST_PROXY_HOPS, ou null se ausente/inválido (precisa ser inteiro >= 1). */
export function proxyHops(env: Env): number | null {
  const raw = env.TRUST_PROXY_HOPS;
  if (raw === undefined || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
}

/**
 * Endereço público do site (links em e-mails de alerta etc.), sem barra no fim. Nunca vem do Host do pedido.
 * Fora de produção de verdade, sem APP_URL, usa o endereço local.
 */
export function appUrl(env: Env): string {
  const raw = (env.APP_URL ?? "").trim().replace(/\/+$/, "");
  return raw || "http://localhost:3000";
}

/** APP_URL válida para produção: endereço https completo. */
export const isHttpsUrl = (v: string | undefined) => {
  try { return new URL(v ?? "").protocol === "https:"; } catch { return false; }
};

const numberOrNaN = (v: string | undefined) => (v === undefined || v.trim() === "" ? undefined : Number(v));

/**
 * Lista de problemas que impedem a subida em produção de verdade. Vazia fora dela: o modo de desenvolvimento e o
 * "produção local" (banco embutido, e2e) mantêm seus atalhos de teste.
 */
export function runtimeConfigProblems(env: Env): string[] {
  if (!isRealProduction(env)) return [];
  const out: string[] = [];
  if (!env.DATABASE_URL) out.push("DATABASE_URL não definido: em produção o banco embutido não é permitido.");
  if (!env.APP_URL?.trim()) out.push("APP_URL não definido: informe o endereço público https do site (usado nos links dos e-mails de alerta).");
  else if (!isHttpsUrl(env.APP_URL)) out.push("APP_URL precisa ser um endereço https:// em produção.");
  if (envFlag(env.ALLOW_MANUAL_LOCATION)) out.push("ALLOW_MANUAL_LOCATION=true libera posição manual (fraude de GPS): remova em produção.");
  if (env.PRUMO_REQUIRE_STAFF_MFA === "false") out.push("PRUMO_REQUIRE_STAFF_MFA=false desliga a verificação em duas etapas da equipe: remova em produção.");
  const guards = env.PRUMO_RIDE_GUARDS;
  if (guards !== undefined && guards !== "" && guards !== "strict") out.push(`PRUMO_RIDE_GUARDS="${guards}" não é seguro: use "strict" ou deixe sem definir.`);
  const factor = numberOrNaN(env.PRUMO_COMPLETE_MIN_FACTOR);
  if (factor !== undefined && !(Number.isFinite(factor) && factor >= MIN_TRIP_FRACTION)) out.push(`PRUMO_COMPLETE_MIN_FACTOR precisa ser um número >= ${MIN_TRIP_FRACTION} (ou ficar sem definir).`);
  const floor = numberOrNaN(env.PRUMO_COMPLETE_MIN_S);
  if (floor !== undefined && !(Number.isFinite(floor) && floor >= MIN_TRIP_FLOOR_S)) out.push(`PRUMO_COMPLETE_MIN_S precisa ser um número >= ${MIN_TRIP_FLOOR_S} (ou ficar sem definir).`);
  if (proxyHops(env) === null) out.push("TRUST_PROXY_HOPS ausente ou inválido: informe quantos proxies há na frente do app (inteiro de 1 a 10), senão todos os usuários contam como um único IP.");
  if (env.EMERGENCY_WEBHOOK_URL?.trim() && !env.EMERGENCY_WEBHOOK_SECRET?.trim()) out.push("EMERGENCY_WEBHOOK_URL definido sem EMERGENCY_WEBHOOK_SECRET: o webhook de emergência precisa de uma chave própria para assinar o corpo.");
  if (envFlag(env.TRUST_X_REAL_IP) && proxyHops(env) === null) out.push("TRUST_X_REAL_IP=true exige TRUST_PROXY_HOPS também definido.");
  return out;
}

/** Lança com todos os problemas de uma vez. Chamada na subida do servidor. */
export function assertRuntimeConfig(env: Env) {
  const problems = runtimeConfigProblems(env);
  if (!problems.length) return;
  throw new Error(`Configuração insegura para produção, o servidor não vai subir:\n- ${problems.join("\n- ")}`);
}
