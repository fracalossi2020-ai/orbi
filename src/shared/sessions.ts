/**
 * Regras puras das sessões: tempo parado da equipe, limite de aparelhos, IP mascarado e aviso de acesso novo.
 * Testadas em tests/sessions.test.ts.
 */
import { parseIp } from "./ip-allow";

/** A sessão da equipe cai depois de tanto tempo sem uso. */
export const STAFF_IDLE_MS = 30 * 60_000;
/** A equipe atualiza o "visto por último" a cada 1 min (os demais, a cada 5). */
export const STAFF_TOUCH_MS = 60_000;
export const USER_TOUCH_MS = 5 * 60_000;
export const STAFF_MAX_SESSIONS = 3;
export const USER_MAX_SESSIONS = 10;
/** Janela de memória dos aparelhos conhecidos para o aviso de "novo acesso". */
export const KNOWN_DEVICE_MS = 90 * 24 * 60 * 60_000;
/** Reautenticação (step-up) vale por 5 minutos. */
export const STEP_UP_MS = 5 * 60_000;
/** Convite de conta da equipe vale por 24 h. */
export const INVITE_TTL_MS = 24 * 60 * 60_000;

export const maxSessions = (staff: boolean) => (staff ? STAFF_MAX_SESSIONS : USER_MAX_SESSIONS);
export const touchEveryMs = (staff: boolean) => (staff ? STAFF_TOUCH_MS : USER_TOUCH_MS);

/** Sessão da equipe parada há tempo demais? (Só a equipe tem esse limite.) */
export const sessionIdle = (staff: boolean, lastSeenAt: Date, now = Date.now()) => staff && now - lastSeenAt.getTime() > STAFF_IDLE_MS;

/** Reautenticação ainda vale? */
export const stepUpValid = (stepUpAt: Date | null | undefined, now = Date.now(), windowMs = STEP_UP_MS) =>
  !!stepUpAt && now - stepUpAt.getTime() <= windowMs && stepUpAt.getTime() <= now + 5_000;

/**
 * Quais sessões ativas encerrar para caber no limite, contando a nova (que ainda vai entrar): sobram `max - 1` das atuais.
 * Encerra as mais antigas (por criação). Recebe só sessões ativas.
 */
export function sessionsToRevoke<T extends { id: string; createdAt: Date }>(active: T[], max: number): string[] {
  const keep = Math.max(0, max - 1);
  if (active.length <= keep) return [];
  return [...active].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(keep).map((s) => s.id);
}

/** IP para guardar nos registros: IPv4 em /24 (último trecho zerado), IPv6 em /64. null: não é um IP. */
export function maskIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const p = parseIp(raw);
  if (!p) return null;
  if (p.v === 4) {
    const n = Number(p.n);
    return `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.0/24`;
  }
  const groups: string[] = [];
  for (let i = 0; i < 4; i++) groups.push(((p.n >> BigInt(112 - 16 * i)) & 0xffffn).toString(16));
  return `${groups.join(":")}::/64`;
}

export type KnownAccess = { ip: string | null; ua: string | null };

/**
 * Acesso novo: o aparelho (navegador) e o prefixo de IP são ambos desconhecidos nos últimos 90 dias.
 * Quem nunca teve acesso antes (primeira sessão da conta) não recebe aviso: seria o próprio cadastro.
 */
export function isNewAccess(previous: KnownAccess[], current: KnownAccess): boolean {
  if (!previous.length) return false;
  const sameDevice = previous.some((p) => !!current.ua && p.ua === current.ua);
  const sameNet = previous.some((p) => !!current.ip && p.ip === current.ip);
  return !sameDevice && !sameNet;
}

/** Nome curto do aparelho a partir do navegador, para e-mails e listas. */
export function deviceLabel(ua: string | null | undefined): string {
  if (!ua) return "Aparelho desconhecido";
  const os = /iPhone|iPad/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Aparelho";
  const br = /Edg\//.test(ua) ? "Edge" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "navegador";
  return `${br} no ${os}`;
}
