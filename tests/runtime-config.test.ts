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
