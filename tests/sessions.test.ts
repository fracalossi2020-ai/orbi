import { describe, expect, it } from "vitest";
import { rawClientIp } from "@/shared/client-ip";
import { deviceLabel, isNewAccess, maskIp, maxSessions, sessionIdle, sessionsToRevoke, stepUpValid, STEP_UP_MS, STAFF_IDLE_MS, touchEveryMs } from "@/shared/sessions";

const at = (min: number) => new Date(1_700_000_000_000 + min * 60_000);

describe("sessões (A5, A6)", () => {
  it("equipe cai depois de 30 min sem uso; os demais não têm esse limite", () => {
    const seen = at(0), base = seen.getTime();
    expect(sessionIdle(true, seen, base + STAFF_IDLE_MS)).toBe(false);
    expect(sessionIdle(true, seen, base + STAFF_IDLE_MS + 1)).toBe(true);
    expect(sessionIdle(false, seen, base + 10 * STAFF_IDLE_MS)).toBe(false);
  });
  it("a equipe atualiza o último uso a cada 1 min; os demais a cada 5", () => {
    expect(touchEveryMs(true)).toBe(60_000);
    expect(touchEveryMs(false)).toBe(300_000);
  });
  it("limites de sessões: 3 para a equipe, 10 para os demais", () => {
    expect(maxSessions(true)).toBe(3);
    expect(maxSessions(false)).toBe(10);
  });
  it("ao abrir a sessão nova, encerra as mais antigas para caber no limite", () => {
    const mk = (id: string, m: number) => ({ id, createdAt: at(m) });
    expect(sessionsToRevoke([mk("a", 1), mk("b", 2)], 3)).toEqual([]);
    // 3 ativas + a nova = 4: a mais antiga sai
    expect(sessionsToRevoke([mk("b", 2), mk("a", 1), mk("c", 3)], 3)).toEqual(["a"]);
    expect(sessionsToRevoke([mk("a", 1), mk("b", 2), mk("c", 3), mk("d", 4), mk("e", 5)], 3)).toEqual(["c", "b", "a"]);
    expect(sessionsToRevoke(Array.from({ length: 10 }, (_, i) => mk(`s${i}`, i)), 10)).toEqual(["s0"]);
  });
  it("reautenticação vale por 5 minutos e some sem registro", () => {
    const t = at(0), now = t.getTime();
    expect(stepUpValid(null, now)).toBe(false);
    expect(stepUpValid(undefined, now)).toBe(false);
    expect(stepUpValid(t, now + STEP_UP_MS)).toBe(true);
    expect(stepUpValid(t, now + STEP_UP_MS + 1)).toBe(false);
    // relógio do futuro não vale
    expect(stepUpValid(new Date(now + 60_000), now)).toBe(false);
  });
  it("IP mascarado: IPv4 em /24, IPv6 em /64, IPv4 mapeado vira IPv4", () => {
    expect(maskIp("203.0.113.77")).toBe("203.0.113.0/24");
    expect(maskIp("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe("2001:db8:1:2::/64");
    expect(maskIp("::ffff:10.1.2.3")).toBe("10.1.2.0/24");
    expect(maskIp("[2001:db8::1]")).toBe("2001:db8:0:0::/64");
    for (const bad of [null, undefined, "", "local", "ip-desconhecido"]) expect(maskIp(bad)).toBeNull();
  });
  it("acesso novo só quando aparelho E rede são desconhecidos; primeira sessão não avisa", () => {
    const prev = [{ ip: "203.0.113.0/24", ua: "Chrome no Windows" }];
    expect(isNewAccess([], { ip: "1.1.1.0/24", ua: "x" })).toBe(false);
    expect(isNewAccess(prev, { ip: "203.0.113.0/24", ua: "Chrome no Windows" })).toBe(false);
    expect(isNewAccess(prev, { ip: "198.51.100.0/24", ua: "Chrome no Windows" })).toBe(false); // mesmo aparelho, rede nova
    expect(isNewAccess(prev, { ip: "203.0.113.0/24", ua: "Safari no iPhone" })).toBe(false); // outro aparelho, mesma rede
    expect(isNewAccess(prev, { ip: "198.51.100.0/24", ua: "Safari no iPhone" })).toBe(true);
    expect(isNewAccess(prev, { ip: null, ua: null })).toBe(true);
  });
  it("nome curto do aparelho", () => {
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537")).toBe("Chrome no Windows");
    expect(deviceLabel(null)).toBe("Aparelho desconhecido");
  });
});

describe("IP real sem agrupar (rawClientIp)", () => {
  const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });
  it("usa o último valor de x-forwarded-for com 1 proxy e respeita TRUST_PROXY_HOPS", () => {
    expect(rawClientIp(h({ "x-forwarded-for": "9.9.9.9, 203.0.113.5" }), { NODE_ENV: "production", TRUST_PROXY_HOPS: "1" })).toBe("203.0.113.5");
    expect(rawClientIp(h({ "x-forwarded-for": "9.9.9.9, 203.0.113.5, 10.0.0.1" }), { NODE_ENV: "production", TRUST_PROXY_HOPS: "2" })).toBe("203.0.113.5");
  });
  it("não agrupa IPv6 em /64 (a lista de IPs precisa do endereço inteiro)", () => {
    expect(rawClientIp(h({ "x-forwarded-for": "2001:db8::1" }), { NODE_ENV: "production", TRUST_PROXY_HOPS: "1" })).toBe("2001:db8::1");
  });
  it("produção sem TRUST_PROXY_HOPS não confia em cabeçalho nenhum", () => {
    expect(rawClientIp(h({ "x-forwarded-for": "1.2.3.4" }), { NODE_ENV: "production" })).toBe("ip-desconhecido");
    expect(rawClientIp(h({}), { NODE_ENV: "development" })).toBe("local");
  });
});
