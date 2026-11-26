import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { currentSession, requireStepUp, type SessionRow, type SessionUser } from "./auth";
import { isUuid } from "@/shared/validation";
import { can, STAFF, type Resource, type Role } from "@/shared/permissions";
import { getDb, schema as s } from "@/database";
import { ensureSweeper, RideError } from "./rides";
import { clientIp, rateLimit } from "./security";
import { ApiError } from "./api-error";
import { currentHostRole, separatedHosts, trustForwardedHost } from "./host";
import { isAdminApiPath, isSameOriginRequest } from "@/shared/hosts";
import { proxyHops } from "@/shared/runtime-config";
import { adminAllowList, ipAllowed } from "@/shared/ip-allow";
import { rawClientIp } from "@/shared/client-ip";

export { ApiError, requireStepUp };

type Ctx<P> = { req: NextRequest; user: SessionUser; session: SessionRow; params: P };
type PublicCtx<P> = { req: NextRequest; user: SessionUser | null; session: SessionRow | null; params: P };

/**
 * Proteção contra ações disparadas por outros sites (CSRF). Ações só valem vindas do próprio site:
 * confere o Origin e, na falta dele, o Sec-Fetch-Site que o navegador envia. Regras em shared/hosts.ts (isSameOriginRequest).
 * Um host só: por trás de um proxy (hospedagem, túnel de teste), x-forwarded-host vale com TRUST_PROXY (ou fora de produção).
 * Modo separado: só o Origin do próprio host que recebeu o pedido, e x-forwarded-host só com TRUST_PROXY=true.
 */
function sameOrigin(req: NextRequest) {
  const cfg = separatedHosts();
  return isSameOriginRequest({
    method: req.method, origin: req.headers.get("origin"), secFetchSite: req.headers.get("sec-fetch-site"),
    host: req.headers.get("host"), forwardedHost: req.headers.get("x-forwarded-host"), cfg,
    hops: proxyHops(process.env) ?? 1,
    trustForwarded: cfg ? trustForwardedHost() : trustForwardedHost() || process.env.NODE_ENV !== "production",
    appUrl: process.env.APP_URL, production: process.env.NODE_ENV === "production",
  });
}

// Respostas da API têm dados pessoais: nada de cache no navegador ou em proxies, salvo quando a rota diz o contrário.
const noStore = (res: Response) => {
  if (!res.headers.has("Cache-Control")) res.headers.set("Cache-Control", "no-store");
  return res;
};

function respond(e: unknown) {
  if (e instanceof ApiError) return noStore(NextResponse.json({ error: e.message, ...(e.code ? { code: e.code } : {}) }, { status: e.status }));
  if (e instanceof RideError) return noStore(NextResponse.json({ error: e.message, ...(e.code ? { code: e.code } : {}) }, { status: e.status }));
  if (e instanceof ZodError) {
    const first = e.issues[0];
    return noStore(NextResponse.json({ error: first?.message ?? "Dados inválidos.", field: first?.path.join(".") }, { status: 400 }));
  }
  console.error("[api]", e);
  return noStore(NextResponse.json({ error: "Erro interno. Tente de novo em instantes." }, { status: 500 }));
}

type RouteCtx = { params: Promise<Record<string, string | string[]>> };

/** Teto geral por IP para ações (POST, PATCH, DELETE): segura robôs sem atrapalhar uso normal. */
const WRITE_LIMIT = Number(process.env.PRUMO_WRITE_LIMIT) || 300;

export function publicRoute<P = Record<string, string>>(fn: (ctx: PublicCtx<P>) => Promise<unknown>) {
  return async (req: NextRequest, rc: RouteCtx) => {
    try {
      if (!sameOrigin(req)) throw new ApiError(403, "Origem não permitida.");
      if (req.method !== "GET" && req.method !== "HEAD" && !rateLimit(`write:${clientIp(req)}`, WRITE_LIMIT, 5 * 60_000)) {
        throw new ApiError(429, "Muitas ações em pouco tempo. Aguarde alguns minutos.");
      }
      ensureSweeper();
      const cur = await currentSession();
      const out = await fn({ req, user: cur?.user ?? null, session: cur?.session ?? null, params: (await rc.params) as P });
      return noStore(out instanceof Response ? out : NextResponse.json(out ?? { ok: true }));
    } catch (e) { return respond(e); }
  };
}

/** Equipe sem verificação em duas etapas não usa o painel (exceto se desligado de propósito em ambiente de teste). */
export const staffMfaRequired = () => process.env.PRUMO_REQUIRE_STAFF_MFA !== "false";

/** Equipe sem a verificação em duas etapas ativa (quando ela é exigida). */
export const staffMissingMfa = (user: SessionUser) => STAFF.includes(user.role) && staffMfaRequired() && !user.totpEnabledAt;

export function route<P = Record<string, string>>(fn: (ctx: Ctx<P>) => Promise<unknown>, opts: { roles?: Role[] } = {}) {
  return publicRoute<P>(async ({ req, user, session, params }) => {
    // Defesa em profundidade (o proxy já barra): /api/admin só responde no host do painel.
    if (separatedHosts() && isAdminApiPath(req.nextUrl.pathname) && (await currentHostRole()) !== "admin") throw new ApiError(404, "Recurso não encontrado.");
    // Lista de IPs do painel (ADMIN_ALLOWED_IPS): fora dela, a API do painel nem existe.
    if (isAdminApiPath(req.nextUrl.pathname) && !ipAllowed(adminAllowList(), rawClientIp(req.headers))) throw new ApiError(404, "Recurso não encontrado.");
    if (!user || !session) throw new ApiError(401, "Entre na sua conta para continuar.");
    if (opts.roles && !opts.roles.includes(user.role)) throw new ApiError(403, "Sua conta não tem acesso a este recurso.");
    if (staffMissingMfa(user) && isAdminApiPath(req.nextUrl.pathname)) {
      throw new ApiError(403, "Para usar o painel, ative a verificação em duas etapas na sua conta.", "mfa_setup");
    }
    return fn({ req, user, session, params });
  });
}

/** Id que não é UUID nunca existe: responde 404 em vez de deixar o banco falhar com 500. */
export function requireUuid(id: unknown, message = "Registro não encontrado."): string {
  if (!isUuid(id)) throw new ApiError(404, message);
  return id;
}

export function assertCan(user: SessionUser, resource: Resource, mode: "read" | "write") {
  if (!can(user.role, resource, mode)) throw new ApiError(403, "Seu nível de acesso não permite esta ação.");
}

/** Tamanho máximo de um corpo JSON. */
const MAX_JSON = 64 * 1024;

/** Lê o corpo como JSON. Exige o tipo JSON: formulários de outros sites não conseguem enviar esse tipo sem permissão. */
export async function body<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  if (!(req.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) throw new ApiError(415, "Envie os dados em JSON.");
  if (Number(req.headers.get("content-length") ?? 0) > MAX_JSON) throw new ApiError(413, "Dados grandes demais.");
  let json: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_JSON) throw new Error("grande");
    json = JSON.parse(text);
  } catch { throw new ApiError(400, "Corpo do pedido inválido."); }
  return schema.parse(json);
}

export { audit } from "./audit-lite";
