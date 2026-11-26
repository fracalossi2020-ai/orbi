/**
 * Três endereços para o mesmo sistema (modo "separado"), ligados só por configuração:
 *   www   (SITE_URL)  site de marketing, /creditos e a API pública. Nunca tem sessão.
 *   app   (APP_URL)   entrada, apps do passageiro e do motorista, /v/[token] e a API (menos /api/admin).
 *   admin (ADMIN_URL) painel da equipe, /api/admin, /api/auth e /api/events, com login próprio.
 * Sem SITE_URL e ADMIN_URL, nada disto liga: um endereço só, como sempre. Funções puras (sem I/O), testadas em tests/hosts.test.ts.
 */
import type { Env } from "./runtime-config";

export type HostRole = "www" | "app" | "admin";
export type SessionScope = "app" | "admin";

export type HostsConfig = {
  /** Endereço completo de cada host, sem barra no fim. Sempre vem do ambiente, nunca do pedido. */
  urls: Record<HostRole, string>;
  /** host:porta de cada um, em minúsculas. */
  hosts: Record<HostRole, string>;
};

const clean = (v: string | undefined) => (v ?? "").trim().replace(/\/+$/, "");

function parse(v: string | undefined): { url: string; host: string } | null {
  const raw = clean(v);
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return { url: u.origin, host: u.host.toLowerCase() };
  } catch { return null; }
}

/**
 * Configuração do modo separado, ou null (desligado). Só liga com SITE_URL, APP_URL e ADMIN_URL válidas e
 * em hosts diferentes. Configuração pela metade fica desligada aqui; em produção de verdade, a subida recusa (runtimeConfigProblems).
 */
export function hostsConfig(env: Env): HostsConfig | null {
  if (!clean(env.SITE_URL) || !clean(env.ADMIN_URL)) return null;
  const www = parse(env.SITE_URL), app = parse(env.APP_URL), admin = parse(env.ADMIN_URL);
  if (!www || !app || !admin) return null;
  if (new Set([www.host, app.host, admin.host]).size !== 3) return null;
  return { urls: { www: www.url, app: app.url, admin: admin.url }, hosts: { www: www.host, app: app.host, admin: admin.host } };
}

/** Problemas da configuração dos três endereços (usado na checagem de produção de verdade). Vazia se nada foi pedido. */
export function hostsProblems(env: Env): string[] {
  const site = clean(env.SITE_URL), admin = clean(env.ADMIN_URL);
  if (!site && !admin) return [];
  const out: string[] = [];
  if (!site) out.push("ADMIN_URL definido sem SITE_URL: o modo com três endereços precisa de SITE_URL, APP_URL e ADMIN_URL juntas.");
  if (!admin) out.push("SITE_URL definido sem ADMIN_URL: o modo com três endereços precisa de SITE_URL, APP_URL e ADMIN_URL juntas.");
  for (const [name, v] of [["SITE_URL", site], ["ADMIN_URL", admin]] as const) {
    if (!v) continue;
    const p = parse(v);
    if (!p || p.url.startsWith("http:")) out.push(`${name} precisa ser um endereço https:// em produção.`);
  }
  // APP_URL ausente ou sem https já é cobrada pela checagem geral (runtimeConfigProblems).
  const hs = [site, clean(env.APP_URL), admin].map(parse);
  if (!out.length && hs.every(Boolean) && new Set(hs.map((h) => h!.host)).size !== 3) {
    out.push("SITE_URL, APP_URL e ADMIN_URL precisam apontar para três hosts diferentes (o cookie e a segurança de cada um dependem disso).");
  }
  return out;
}

/**
 * Host do pedido. x-forwarded-host só vale com proxy confiável. Mesma regra do IP (clientIp): vale o valor que o proxy
 * mais próximo do app acrescentou, contando `hops` proxies a partir da direita da lista (padrão 1: o último). Senão, o Host.
 */
export function requestHost(h: { host?: string | null; forwardedHost?: string | null }, trustForwarded: boolean, hops = 1): string | null {
  const list = (h.forwardedHost ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const raw = trustForwarded && list.length ? list[Math.max(0, list.length - Math.max(1, hops))] : h.host;
  const v = (raw ?? "").trim().toLowerCase().replace(/\.$/, "");
  return v || null;
}

/** Qual dos três é este host? null: host desconhecido. */
export function hostRole(cfg: HostsConfig, host: string | null | undefined): HostRole | null {
  if (!host) return null;
  const h = host.trim().toLowerCase().replace(/\.(?=$|:)/, "");
  const roles = Object.keys(cfg.hosts) as HostRole[];
  const exact = roles.find((r) => cfg.hosts[r] === h);
  if (exact) return exact;
  // Porta padrão escrita de propósito (app.x.com:443 em https, :80 em http) é o mesmo host: a configuração guarda sem ela.
  return roles.find((r) => cfg.hosts[r] + (cfg.urls[r].startsWith("https:") ? ":443" : ":80") === h) ?? null;
}

/** Escopo de sessão do host: só app e admin têm sessão; o www nunca. */
export const scopeOf = (role: HostRole | null): SessionScope | null => (role === "app" || role === "admin" ? role : null);

/** Nome do cookie de sessão por escopo no modo separado: __Host- (Secure, Path=/, sem Domain: nenhum outro subdomínio consegue plantá-lo). */
export const SESSION_COOKIE: Record<SessionScope, string> = { app: "__Host-orbi_session", admin: "__Host-orbi_admin" };
/** Cookies do fluxo do Google (só no app) no modo separado. */
export const GOOGLE_COOKIES = { flow: "__Host-prumo_google_flow", pending: "__Host-prumo_google_new" } as const;

export type PathDecision =
  | { type: "allow" }
  | { type: "notFound" }
  /** Vai para outro host (to) ou, sem "to", para outro caminho do mesmo host (path). */
  | { type: "redirect"; to?: HostRole; path?: string };

const APP_PAGES = new Set(["entrar", "cadastro", "passageiro", "motorista", "v", "loja"]);
/** APIs sem sessão obrigatória, úteis aos três (cidades, busca de lugares, mapa). */
const SHARED_API = new Set(["public", "geo", "map-style"]);
const ADMIN_ACCOUNT = new Set(["mfa", "mfa-start", "mfa-enable", "mfa-recovery", "mfa-disable", "sessions", "reauth-code", "step-up"]);
/** O caminho é da API do painel (/api/admin...)? Usa os segmentos decodificados, como o proxy. Caminho estranho conta como sim (recusa por precaução). */
export function isAdminApiPath(pathname: string): boolean {
  const seg = pathSegments(pathname);
  return !seg || (seg[0] === "api" && seg[1] === "admin");
}

/** O caminho é da área da equipe (/admin, /convite ou /api/admin)? Vale para a lista de IPs do painel. */
export function isStaffAreaPath(pathname: string): boolean {
  const seg = pathSegments(pathname);
  if (!seg) return true;
  return seg[0] === "admin" || seg[0] === "convite" || (seg[0] === "api" && seg[1] === "admin");
}

/** Arquivos que qualquer host pode servir (imagens, robots e sitemap, que se adaptam ao host). */
const OPEN_FILES = new Set(["_next", "robots.txt", "sitemap.xml", "icon.svg", "favicon.ico", "opengraph-image", "twitter-image", "app-icon"]);

/** Caminho em segmentos já decodificados; "//" e "%61" não enganam a classificação. null: não decodifica. */
export function pathSegments(pathname: string): string[] | null {
  let p: string;
  try { p = decodeURIComponent(pathname); } catch { return null; }
  if (p.includes("\\") || p.split("/").some((s) => s === ".." || s === ".")) return null;
  return p.split("/").filter(Boolean).map((s) => s.toLowerCase());
}

/** O que cada host faz com o caminho pedido: serve, 404, ou manda para o host certo. */
export function decidePath(role: HostRole, pathname: string): PathDecision {
  const seg = pathSegments(pathname);
  if (!seg) return { type: "notFound" };
  const [a, b, c] = seg;

  if (a === "api") {
    if (b === "admin") return role === "admin" ? { type: "allow" } : { type: "notFound" };
    if (b === "auth" || b === "events") return role === "www" ? { type: "notFound" } : { type: "allow" };
    // O painel ativa e gerencia a verificação em duas etapas e as sessões da própria conta (lista fechada; o resto de /api/account é do app).
    if (b === "account" && role === "admin") return c && ADMIN_ACCOUNT.has(c) ? { type: "allow" } : { type: "notFound" };
    if (b && SHARED_API.has(b)) return { type: "allow" };
    return role === "app" ? { type: "allow" } : { type: "notFound" };
  }
  if (a === "admin" || a === "convite") return role === "admin" ? { type: "allow" } : { type: "notFound" };
  if (a && OPEN_FILES.has(a)) return { type: "allow" };
  if (a === "manifest.webmanifest") return role === "app" ? { type: "allow" } : { type: "notFound" };

  if (a && APP_PAGES.has(a)) {
    if (role === "app") return { type: "allow" };
    return { type: "redirect", to: "app" };
  }
  // Páginas do site (e qualquer outra coisa).
  if (role === "www") return { type: "allow" };
  if (!a) return { type: "redirect", path: role === "app" ? "/entrar" : "/admin" };
  return { type: "redirect", to: "www" };
}

/** Endereço absoluto no host pedido. path começa com "/". Sempre a partir da configuração. */
export const hostUrl = (cfg: HostsConfig, role: HostRole, path = "/") => `${cfg.urls[role]}${path.startsWith("/") ? path : `/${path}`}`;

export type OriginCheck = {
  method: string;
  origin: string | null;
  secFetchSite: string | null;
  host: string | null;
  forwardedHost: string | null;
  /** Modo separado ligado (hostsConfig não nulo). */
  cfg: HostsConfig | null;
  /** x-forwarded-host vale (TRUST_PROXY=true; fora do modo separado também fora de produção). */
  trustForwarded: boolean;
  /** Proxies na frente (TRUST_PROXY_HOPS), para escolher o x-forwarded-host certo. Padrão 1. */
  hops?: number;
  /** APP_URL (modo de um host só). */
  appUrl?: string;
  production: boolean;
};

/**
 * Proteção contra ações disparadas por outros sites (CSRF): ações só valem vindas do próprio site.
 * Modo separado: só o Origin do próprio host que recebeu o pedido; nada de "qualquer APP_URL vale", nem túnel.
 * Modo de um host só: o comportamento de sempre.
 */
export function isSameOriginRequest(i: OriginCheck): boolean {
  if (i.method === "GET" || i.method === "HEAD") return true;
  if (!i.origin) return !i.secFetchSite || i.secFetchSite === "same-origin" || i.secFetchSite === "none";
  let originHost: string;
  try { originHost = new URL(i.origin).host.toLowerCase(); } catch { return false; }
  if (i.cfg) {
    const own = hostRole(i.cfg, requestHost({ host: i.host, forwardedHost: i.forwardedHost }, i.trustForwarded, i.hops));
    return own !== null && hostRole(i.cfg, originHost) === own;
  }
  if (originHost === (i.host ?? "").toLowerCase()) return true;
  if (i.trustForwarded && originHost === (i.forwardedHost ?? "").toLowerCase()) return true;
  try { if (i.appUrl && originHost === new URL(i.appUrl).host.toLowerCase()) return true; } catch { /* APP_URL inválida */ }
  // Teste no celular pelo túnel da Cloudflare (npm run celular): só fora de produção.
  return !i.production && originHost.endsWith(".trycloudflare.com");
}
