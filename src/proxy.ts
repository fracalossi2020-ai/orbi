import { NextResponse, type NextRequest } from "next/server";
import { proxyHops } from "@/shared/runtime-config";
import { decidePath, hostRole, hostsConfig, hostUrl, isStaffAreaPath, requestHost, type HostRole } from "@/shared/hosts";
import { adminAllowList, ipAllowed } from "@/shared/ip-allow";
import { rawClientIp } from "@/shared/client-ip";

/**
 * Política de Segurança de Conteúdo (CSP) com um código aleatório (nonce) por página.
 * Só rodam scripts do próprio site marcados com esse código: um script injetado por um invasor não executa.
 * O Next coloca o nonce nos próprios scripts sozinho, a partir deste cabeçalho.
 */
const MAP_HOST = "https://tiles.openfreemap.org";

/** Resposta de recusa (404) do host errado: sem página, sem pista de que o caminho existe em outro lugar. */
function notFound(api: boolean, role: HostRole) {
  const res = api ? NextResponse.json({ error: "Recurso não encontrado." }, { status: 404 }) : new NextResponse("Página não encontrada.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return noindex(res, role);
}

/** App e painel não aparecem em buscadores. */
function noindex<T extends NextResponse>(res: T, role: HostRole | null): T {
  if (role === "app" || role === "admin") res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const api = path === "/api" || path.startsWith("/api/");

  // Modo separado (www / app / admin): cada host só serve o que é dele. Desligado (sem SITE_URL e ADMIN_URL), nada disto roda.
  const cfg = hostsConfig(process.env);
  const list = adminAllowList();
  let role: HostRole | null = null;
  if (cfg) {
    // x-forwarded-host só com TRUST_PROXY=true; um Host que não é um dos três nunca é atendido (421).
    role = hostRole(cfg, requestHost({ host: req.headers.get("host"), forwardedHost: req.headers.get("x-forwarded-host") }, process.env.TRUST_PROXY === "true", proxyHops(process.env) ?? 1));
    if (!role) return new NextResponse("Endereço não atendido.", { status: 421, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    // Lista de IPs do painel (ADMIN_ALLOWED_IPS, vazia = desligada): fora dela o host do painel inteiro não existe (404, igual a uma página que nunca houve).
    // Vem antes de qualquer redirecionamento: nada revela que o painel está aqui.
    if (list.enabled && role === "admin" && !ipAllowed(list, rawClientIp(req.headers))) return notFound(api, role);
    const d = decidePath(role, path);
    if (d.type === "notFound") return notFound(api, role);
    if (d.type === "redirect") {
      // Destino montado a partir da configuração (nunca do Host do pedido, que o cliente controla).
      const to = hostUrl(cfg, d.to ?? role, d.path ?? path) + (d.path ? "" : req.nextUrl.search);
      return noindex(NextResponse.redirect(to, 307), role);
    }
  }

  // Um host só: o painel é /admin, /convite e /api/admin, e só os IPs da lista os enxergam (404).
  if (!cfg && list.enabled && isStaffAreaPath(path) && !ipAllowed(list, rawClientIp(req.headers))) return notFound(api, "admin");

  // A API recebe os cabeçalhos do next.config; só as páginas ganham a política com nonce.
  if (api) return noindex(NextResponse.next(), role);
  // Pré-busca de links não renderiza página: não precisa de política (e a de verdade vem na navegação).
  if (req.headers.has("next-router-prefetch") || req.headers.get("purpose") === "prefetch") return noindex(NextResponse.next(), role);

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV === "development";
  const https = cfg && role ? cfg.urls[role].startsWith("https://") : (process.env.APP_URL ?? "").startsWith("https://");
  // O painel não usa WebAssembly (o decodificador do carro 3D saiu): sem 'wasm-unsafe-eval' nele.
  const wasm = role === "admin" ? "" : " 'wasm-unsafe-eval'";
  const csp = [
    "default-src 'self'",
    // strict-dynamic: scripts carregados por um script confiável (os pedaços do app) também valem.
    // wasm-unsafe-eval: ficou do decodificador do carro 3D; no painel já não vai. Em desenvolvimento, o React usa eval.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${wasm}${dev ? " 'unsafe-eval'" : ""}`,
    // Estilos em linha: usados pelo mapa e pelas animações; não executam código.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${MAP_HOST}`,
    "font-src 'self' data:",
    `connect-src 'self' ${MAP_HOST}${dev ? " ws: wss:" : ""}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  // A tela de entrada precisa saber o perfil pedido (?perfil=motorista) para mandar quem já entrou ao lugar certo.
  // Sempre regravado aqui: um valor enviado pelo navegador não passa adiante.
  headers.set("x-perfil", req.nextUrl.searchParams.get("perfil") ?? "");
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return noindex(res, role);
}

export const config = {
  // Tudo menos os arquivos estáticos do Next. A API entra para o modo separado poder barrar o host errado.
  matcher: ["/((?!_next/static|_next/image|maplibre|models|cursors|icon.svg|favicon.ico).*)"],
};
