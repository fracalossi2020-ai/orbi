import { describe, expect, it } from "vitest";
import { appUrl, assertRuntimeConfig, embeddedDbAllowed, envFlag, isRealProduction, proxyHops, runtimeConfigProblems } from "@/shared/runtime-config";

const prod = { NODE_ENV: "production", DATABASE_URL: "postgres://x", TRUST_PROXY_HOPS: "1", APP_URL: "https://orbi.example.com" };

describe("configuração de execução (N1/N3)", () => {
  it("booleanos são estritos", () => {
    expect(envFlag("true")).toBe(true);
    for (const v of ["false", "1", "TRUE", "yes", "", undefined]) expect(envFlag(v)).toBe(false);
  });
  it("PRUMO_ALLOW_EMBEDDED_DB=false não libera o banco embutido; com DATABASE_URL é ignorado", () => {
    expect(embeddedDbAllowed({ NODE_ENV: "production", PRUMO_ALLOW_EMBEDDED_DB: "false" })).toBe(false);
    expect(isRealProduction({ NODE_ENV: "production", PRUMO_ALLOW_EMBEDDED_DB: "false" })).toBe(true);
    expect(embeddedDbAllowed({ PRUMO_ALLOW_EMBEDDED_DB: "true", DATABASE_URL: "postgres://x" })).toBe(false);
    expect(isRealProduction({ NODE_ENV: "production", PRUMO_ALLOW_EMBEDDED_DB: "true", DATABASE_URL: "postgres://x" })).toBe(true);
    expect(isRealProduction({ NODE_ENV: "production", PRUMO_ALLOW_EMBEDDED_DB: "true" })).toBe(false);
  });
  it("produção de verdade correta não tem problemas", () => {
    expect(runtimeConfigProblems(prod)).toEqual([]);
    expect(runtimeConfigProblems({ ...prod, PRUMO_RIDE_GUARDS: "strict", PRUMO_COMPLETE_MIN_FACTOR: "0.5", PRUMO_COMPLETE_MIN_S: "90", TRUST_X_REAL_IP: "true" })).toEqual([]);
  });
  it("recusa cada configuração perigosa", () => {
    const bad = (extra: Record<string, string>) => runtimeConfigProblems({ ...prod, ...extra }).join("|");
    expect(bad({ ALLOW_MANUAL_LOCATION: "true" })).toContain("ALLOW_MANUAL_LOCATION");
    expect(bad({ PRUMO_REQUIRE_STAFF_MFA: "false" })).toContain("PRUMO_REQUIRE_STAFF_MFA");
    expect(bad({ PRUMO_RIDE_GUARDS: "off" })).toContain("PRUMO_RIDE_GUARDS");
    expect(bad({ PRUMO_COMPLETE_MIN_FACTOR: "0" })).toContain("PRUMO_COMPLETE_MIN_FACTOR");
    expect(bad({ PRUMO_COMPLETE_MIN_FACTOR: "abc" })).toContain("PRUMO_COMPLETE_MIN_FACTOR");
    expect(bad({ PRUMO_COMPLETE_MIN_S: "0" })).toContain("PRUMO_COMPLETE_MIN_S");
    expect(() => assertRuntimeConfig({ ...prod, ALLOW_MANUAL_LOCATION: "true" })).toThrow(/ALLOW_MANUAL_LOCATION/);
  });
  it("exige TRUST_PROXY_HOPS, inclusive com TRUST_X_REAL_IP", () => {
    expect(runtimeConfigProblems({ NODE_ENV: "production", DATABASE_URL: "x" }).join()).toContain("TRUST_PROXY_HOPS");
    expect(runtimeConfigProblems({ NODE_ENV: "production", DATABASE_URL: "x", TRUST_X_REAL_IP: "true" }).join()).toContain("TRUST_X_REAL_IP");
    expect(proxyHops({ TRUST_PROXY_HOPS: "0" })).toBeNull();
    expect(proxyHops({ TRUST_PROXY_HOPS: "2" })).toBe(2);
  });
  it("produção sem DATABASE_URL nem banco embutido não sobe", () => {
    expect(runtimeConfigProblems({ NODE_ENV: "production", TRUST_PROXY_HOPS: "1" }).join()).toContain("DATABASE_URL");
  });
  it("A11: recusa pular o DNS do e-mail, endereços do Google trocados, limites absurdos e o atraso reduzido do login", () => {
    const bad = (extra: Record<string, string>) => runtimeConfigProblems({ ...prod, ...extra }).join("|");
    expect(bad({ PRUMO_SKIP_EMAIL_DNS: "true" })).toContain("PRUMO_SKIP_EMAIL_DNS");
    for (const name of ["GOOGLE_AUTH_URL", "GOOGLE_TOKEN_URL", "GOOGLE_JWKS_URL", "GOOGLE_ISSUER"]) expect(bad({ [name]: "http://localhost:3102/x" }), name).toContain(name);
    // o endereço oficial escrito explicitamente continua valendo
    expect(runtimeConfigProblems({ ...prod, GOOGLE_TOKEN_URL: "https://oauth2.googleapis.com/token", GOOGLE_ISSUER: "https://accounts.google.com,accounts.google.com" })).toEqual([]);
    for (const v of ["0", "-5", "100000", "abc", "1.5"]) expect(bad({ PRUMO_WRITE_LIMIT: v }), v).toContain("PRUMO_WRITE_LIMIT");
    expect(bad({ PRUMO_CPF_LOOKUP_LIMIT: "999999" })).toContain("PRUMO_CPF_LOOKUP_LIMIT");
    expect(runtimeConfigProblems({ ...prod, PRUMO_WRITE_LIMIT: "300", PRUMO_CPF_LOOKUP_LIMIT: "300" })).toEqual([]);
    expect(bad({ PRUMO_LOGIN_DELAY_SCALE: "0" })).toContain("PRUMO_LOGIN_DELAY_SCALE");
    expect(bad({ PRUMO_FORM_GUARD_RELAX: "true" })).toContain("PRUMO_FORM_GUARD_RELAX");
  });
  it("A4: recusa ADMIN_ALLOWED_IPS mal formada, aceita bem formada e vazia", () => {
    expect(runtimeConfigProblems({ ...prod, ADMIN_ALLOWED_IPS: "203.0.113.7, 10.0.0.0/8, 2001:db8::/32" })).toEqual([]);
    expect(runtimeConfigProblems({ ...prod, ADMIN_ALLOWED_IPS: "" })).toEqual([]);
    expect(runtimeConfigProblems({ ...prod, ADMIN_ALLOWED_IPS: "203.0.113.7, banana" }).join()).toContain("ADMIN_ALLOWED_IPS");
    expect(runtimeConfigProblems({ ...prod, ADMIN_ALLOWED_IPS: "10.0.0.0/40" }).join()).toContain("ADMIN_ALLOWED_IPS");
  });
  it("os atalhos de teste (e2e, produção local) seguem livres", () => {
    const e2e = { NODE_ENV: "production", PRUMO_ALLOW_EMBEDDED_DB: "true", PRUMO_SKIP_EMAIL_DNS: "true", PRUMO_LOGIN_DELAY_SCALE: "0", PRUMO_FORM_GUARD_RELAX: "true", GOOGLE_AUTH_URL: "http://localhost:3102/auth", PRUMO_WRITE_LIMIT: "100000" };
    expect(runtimeConfigProblems(e2e)).toEqual([]);
  });
  it("APP_URL é obrigatória e https em produção de verdade, mas não no modo local", () => {
    const { APP_URL: _a, ...semUrl } = prod;
    expect(runtimeConfigProblems(semUrl).join()).toContain("APP_URL");
    expect(runtimeConfigProblems({ ...prod, APP_URL: "http://orbi.example.com" }).join()).toContain("https");
    expect(runtimeConfigProblems({ ...prod, APP_URL: "orbi" }).join()).toContain("https");
    expect(runtimeConfigProblems({ NODE_ENV: "production", PRUMO_ALLOW_EMBEDDED_DB: "true" })).toEqual([]);
    expect(appUrl({})).toBe("http://localhost:3000");
    expect(appUrl({ APP_URL: "https://orbi.example.com/" })).toBe("https://orbi.example.com");
  });
  it("produção local (banco embutido) e desenvolvimento seguem livres, como no e2e", () => {
    const e2e = { NODE_ENV: "production", PRUMO_ALLOW_EMBEDDED_DB: "true", ALLOW_MANUAL_LOCATION: "true", PRUMO_REQUIRE_STAFF_MFA: "false", PRUMO_RIDE_GUARDS: "strict", PRUMO_COMPLETE_MIN_FACTOR: "0", PRUMO_COMPLETE_MIN_S: "0" };
    expect(runtimeConfigProblems(e2e)).toEqual([]);
    expect(runtimeConfigProblems({ NODE_ENV: "production", PRUMO_ALLOW_EMBEDDED_DB: "true" })).toEqual([]);
    expect(runtimeConfigProblems({ NODE_ENV: "development", ALLOW_MANUAL_LOCATION: "true" })).toEqual([]);
  });
});
