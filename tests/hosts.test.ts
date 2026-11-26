import { describe, expect, it } from "vitest";
import { decidePath, isAdminApiPath, hostRole, hostsConfig, hostUrl, isSameOriginRequest, pathSegments, requestHost, scopeOf, SESSION_COOKIE, type OriginCheck } from "@/shared/hosts";
import { runtimeConfigProblems } from "@/shared/runtime-config";

const env = { SITE_URL: "https://www.orbi.test", APP_URL: "https://app.orbi.test", ADMIN_URL: "https://admin.orbi.test/" };
const cfg = hostsConfig(env)!;

describe("modo com três endereços: configuração", () => {
  it("desligado sem SITE_URL e ADMIN_URL (um host só)", () => {
    expect(hostsConfig({})).toBeNull();
    expect(hostsConfig({ APP_URL: "https://app.orbi.test" })).toBeNull();
    expect(hostsConfig({ SITE_URL: env.SITE_URL, APP_URL: env.APP_URL })).toBeNull();
    expect(hostsConfig({ ADMIN_URL: env.ADMIN_URL, APP_URL: env.APP_URL })).toBeNull();
  });
  it("liga com os três, sem barra no fim, e recusa hosts repetidos ou inválidos", () => {
    expect(cfg.urls).toEqual({ www: "https://www.orbi.test", app: "https://app.orbi.test", admin: "https://admin.orbi.test" });
    expect(hostsConfig({ ...env, ADMIN_URL: env.APP_URL })).toBeNull();
    expect(hostsConfig({ ...env, SITE_URL: "www.orbi.test" })).toBeNull();
    expect(hostsConfig({ ...env, APP_URL: undefined })).toBeNull();
  });
  it("identifica o host (porta, maiúsculas, ponto final) e rejeita desconhecidos", () => {
    expect(hostRole(cfg, "WWW.orbi.test")).toBe("www");
    expect(hostRole(cfg, "admin.orbi.test.")).toBe("admin");
    expect(hostRole(cfg, "admin.orbi.test:8080")).toBeNull();
    expect(hostRole(cfg, "evil.test")).toBeNull();
    expect(hostRole(cfg, null)).toBeNull();
    // Porta padrão explícita é o mesmo host (443 em https, 80 em http); outra porta não.
    expect(hostRole(cfg, "app.orbi.test:443")).toBe("app");
    expect(hostRole(cfg, "app.orbi.test:80")).toBeNull();
    const plain = hostsConfig({ SITE_URL: "http://www.x.test", APP_URL: "http://app.x.test", ADMIN_URL: "http://admin.x.test" })!;
    expect(hostRole(plain, "app.x.test:80")).toBe("app");
    expect(hostRole(plain, "app.x.test:443")).toBeNull();
    const local = hostsConfig({ SITE_URL: "http://www.localhost:3103", APP_URL: "http://app.localhost:3103", ADMIN_URL: "http://admin.localhost:3103" })!;
    expect(hostRole(local, "app.localhost:3103")).toBe("app");
    expect(hostRole(local, "app.localhost")).toBeNull();
  });
  it("x-forwarded-host só vale com proxy confiável", () => {
    const h = { host: "internal:3000", forwardedHost: "admin.orbi.test, x.test" };
    expect(requestHost(h, false)).toBe("internal:3000");
    // Mesma regra do IP: vale o que o proxy mais próximo acrescentou (hops a partir da direita), não o primeiro, que o cliente forja.
    expect(requestHost(h, true)).toBe("x.test");
    expect(requestHost(h, true, 2)).toBe("admin.orbi.test");
    expect(requestHost(h, true, 9)).toBe("admin.orbi.test");
    expect(requestHost({ host: "h.test", forwardedHost: "forjado.test, admin.orbi.test" }, true)).toBe("admin.orbi.test");
    expect(requestHost({ host: "A.test", forwardedHost: null }, true)).toBe("a.test");
  });
  it("só app e admin têm sessão, com cookies __Host- diferentes", () => {
    expect(scopeOf("www")).toBeNull();
    expect(scopeOf(null)).toBeNull();
    expect(scopeOf("app")).toBe("app");
    expect(SESSION_COOKIE.app).not.toBe(SESSION_COOKIE.admin);
    for (const n of Object.values(SESSION_COOKIE)) expect(n.startsWith("__Host-")).toBe(true);
  });
  it("hostUrl monta a partir da configuração", () => {
    expect(hostUrl(cfg, "admin", "/admin/x?y=1")).toBe("https://admin.orbi.test/admin/x?y=1");
  });
});

describe("qual host serve qual caminho", () => {
  const d = (role: "www" | "app" | "admin", p: string) => decidePath(role, p);
  it("/api/admin só no painel; 404 nos outros", () => {
    expect(d("admin", "/api/admin/dashboard")).toEqual({ type: "allow" });
    expect(d("app", "/api/admin/dashboard")).toEqual({ type: "notFound" });
    expect(d("www", "/api/admin")).toEqual({ type: "notFound" });
  });
  it("disfarces de caminho não enganam (//, %61, maiúsculas, ..)", () => {
    expect(d("app", "/api//admin/x").type).toBe("notFound");
    expect(d("app", "/api/%61dmin/x").type).toBe("notFound");
    expect(d("app", "/API/Admin/x").type).toBe("notFound");
    expect(d("app", "/api/auth/../admin/x").type).toBe("notFound");
    expect(d("app", "/%E0%A4%A").type).toBe("notFound");
    expect(pathSegments("/a/./b")).toBeNull();
  });
  it("/api/auth e /api/events: app e painel, não o www", () => {
    for (const p of ["/api/auth/login", "/api/events"]) {
      expect(d("app", p).type).toBe("allow");
      expect(d("admin", p).type).toBe("allow");
      expect(d("www", p).type).toBe("notFound");
    }
  });
  it("API pública nos três; o resto da API só no app", () => {
    expect(d("www", "/api/public/cities").type).toBe("allow");
    expect(d("www", "/api/geo/search").type).toBe("allow");
    for (const p of ["/api/rides", "/api/me", "/api/driver/history", "/api/account/x"]) {
      expect(d("app", p).type).toBe("allow");
      expect(d("www", p).type).toBe("notFound");
      expect(d("admin", p).type).toBe("notFound");
    }
  });
  it("o painel só tem a parte de segurança da conta (2 etapas e sessões); o resto de /api/account é do app", () => {
    for (const a of ["mfa", "mfa-start", "mfa-enable", "mfa-recovery", "mfa-disable", "sessions", "reauth-code"]) expect(d("admin", `/api/account/${a}`).type, a).toBe("allow");
    for (const a of ["become-driver", "tickets", "notifications"]) expect(d("admin", `/api/account/${a}`).type, a).toBe("notFound");
    expect(d("admin", "/api/account").type).toBe("notFound");
    expect(d("app", "/api/account/become-driver").type).toBe("allow");
    expect(d("www", "/api/account/mfa").type).toBe("notFound");
  });
  it("isAdminApiPath usa segmentos decodificados", () => {
    expect(isAdminApiPath("/api/admin/x")).toBe(true);
    expect(isAdminApiPath("/api//admin")).toBe(true);
    expect(isAdminApiPath("/api/%61dmin")).toBe(true);
    expect(isAdminApiPath("/api/me")).toBe(false);
  });
  it("/admin só no painel (404 fora)", () => {
    expect(d("admin", "/admin/viagens").type).toBe("allow");
    expect(d("www", "/admin").type).toBe("notFound");
    expect(d("app", "/admin/usuarios").type).toBe("notFound");
  });
  it("páginas do app em outro host vão para o app; /motoristas (site) não é /motorista (app)", () => {
    for (const p of ["/entrar", "/cadastro", "/passageiro/viagens", "/motorista", "/v/abc"]) {
      expect(d("app", p).type).toBe("allow");
      expect(d("www", p)).toEqual({ type: "redirect", to: "app" });
      expect(d("admin", p)).toEqual({ type: "redirect", to: "app" });
    }
    expect(d("www", "/motoristas").type).toBe("allow");
    expect(d("www", "/motoristas/requisitos").type).toBe("allow");
    expect(d("app", "/motoristas")).toEqual({ type: "redirect", to: "www" });
  });
  it("páginas do site vão para o www; a raiz do app e do painel vão para a entrada de cada um", () => {
    expect(d("www", "/").type).toBe("allow");
    expect(d("www", "/creditos").type).toBe("allow");
    expect(d("app", "/creditos")).toEqual({ type: "redirect", to: "www" });
    expect(d("app", "/")).toEqual({ type: "redirect", path: "/entrar" });
    expect(d("admin", "/")).toEqual({ type: "redirect", path: "/admin" });
    expect(d("admin", "/clube")).toEqual({ type: "redirect", to: "www" });
  });
  it("manifest só no app; robots e sitemap respondem em todos (cada um se adapta)", () => {
    expect(d("app", "/manifest.webmanifest").type).toBe("allow");
    expect(d("www", "/manifest.webmanifest").type).toBe("notFound");
    expect(d("admin", "/manifest.webmanifest").type).toBe("notFound");
    for (const r of ["www", "app", "admin"] as const) { expect(d(r, "/robots.txt").type).toBe("allow"); expect(d(r, "/sitemap.xml").type).toBe("allow"); }
  });
});

describe("sameOrigin (anti-CSRF)", () => {
  const base: OriginCheck = {
    method: "POST", origin: "https://admin.orbi.test", secFetchSite: "same-origin", host: "admin.orbi.test", forwardedHost: null,
    cfg, trustForwarded: false, appUrl: env.APP_URL, production: true,
  };
  const ok = (o: Partial<OriginCheck>) => isSameOriginRequest({ ...base, ...o });
  it("GET e HEAD sempre passam", () => { expect(ok({ method: "GET", origin: "https://evil.test" })).toBe(true); });
  it("modo separado: só o Origin do próprio host", () => {
    expect(ok({})).toBe(true);
    expect(ok({ origin: "https://www.orbi.test" })).toBe(false);
    expect(ok({ origin: "https://app.orbi.test" })).toBe(false);
    expect(ok({ origin: "https://evil.test" })).toBe(false);
    expect(ok({ origin: "not a url" })).toBe(false);
  });
  it("modo separado: x-forwarded-host só com proxy confiável", () => {
    const behind = { host: "internal:3000", forwardedHost: "admin.orbi.test" };
    expect(ok({ ...behind, trustForwarded: false })).toBe(false);
    expect(ok({ ...behind, trustForwarded: true })).toBe(true);
    expect(ok({ ...behind, trustForwarded: true, origin: "https://www.orbi.test" })).toBe(false);
  });
  it("modo separado: porta padrão explícita no Host ou no Origin é o mesmo host", () => {
    expect(ok({ host: "admin.orbi.test:443" })).toBe(true);
    expect(ok({ origin: "https://admin.orbi.test:443" })).toBe(true);
  });
  it("modo separado: host fora dos três não passa, nem túnel", () => {
    expect(ok({ host: "evil.test", origin: "https://evil.test" })).toBe(false);
    expect(ok({ production: false, origin: "https://x.trycloudflare.com", host: "x.trycloudflare.com" })).toBe(false);
  });
  it("sem Origin: depende do Sec-Fetch-Site", () => {
    expect(ok({ origin: null, secFetchSite: "same-origin" })).toBe(true);
    expect(ok({ origin: null, secFetchSite: null })).toBe(true);
    expect(ok({ origin: null, secFetchSite: "same-site" })).toBe(false);
    expect(ok({ origin: null, secFetchSite: "cross-site" })).toBe(false);
  });
  it("um host só: comportamento de sempre (APP_URL, forwarded, túnel fora de produção)", () => {
    const one: Partial<OriginCheck> = { cfg: null, host: "localhost:3000", origin: "http://localhost:3000" };
    expect(ok(one)).toBe(true);
    expect(ok({ ...one, origin: "https://app.orbi.test" })).toBe(true); // APP_URL vale
    expect(ok({ ...one, origin: "https://evil.test" })).toBe(false);
    expect(ok({ ...one, origin: "https://x.trycloudflare.com", production: false })).toBe(true);
    expect(ok({ ...one, origin: "https://x.trycloudflare.com", production: true })).toBe(false);
    expect(ok({ ...one, origin: "https://pub.test", forwardedHost: "pub.test", trustForwarded: true })).toBe(true);
    expect(ok({ ...one, origin: "https://pub.test", forwardedHost: "pub.test", trustForwarded: false })).toBe(false);
  });
});

describe("checagem de produção dos três endereços", () => {
  const prod = { NODE_ENV: "production", DATABASE_URL: "postgres://x", TRUST_PROXY_HOPS: "1", ...env };
  it("três https corretos: sem problemas; sem nenhum dos novos: sem problemas (um host só)", () => {
    expect(runtimeConfigProblems(prod)).toEqual([]);
    expect(runtimeConfigProblems({ NODE_ENV: "production", DATABASE_URL: "postgres://x", TRUST_PROXY_HOPS: "1", APP_URL: "https://orbi.example.com" })).toEqual([]);
  });
  it("exige https, os três juntos e hosts diferentes", () => {
    const bad = (e: Record<string, string | undefined>) => runtimeConfigProblems({ ...prod, ...e }).join("|");
    expect(bad({ SITE_URL: "http://www.orbi.test" })).toContain("SITE_URL precisa ser um endereço https://");
    expect(bad({ ADMIN_URL: "http://admin.orbi.test" })).toContain("ADMIN_URL precisa ser um endereço https://");
    expect(bad({ ADMIN_URL: undefined })).toContain("sem ADMIN_URL");
    expect(bad({ SITE_URL: undefined })).toContain("sem SITE_URL");
    expect(bad({ ADMIN_URL: env.APP_URL })).toContain("três hosts diferentes");
    expect(bad({ APP_URL: undefined })).toContain("APP_URL");
  });
  it("fora de produção de verdade nada é cobrado", () => {
    expect(runtimeConfigProblems({ SITE_URL: "http://www.localhost", ADMIN_URL: "x" })).toEqual([]);
  });
});
