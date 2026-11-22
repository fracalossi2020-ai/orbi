import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, clientIp, decrypt, encrypt, findRecovery, hashRecovery, legacyHashRecovery, newRecoveryCodes, evictBuckets, ipLimitKey, resolveClientIp, UNKNOWN_IP, passwordProblem, rateLimit, sniffFile, totpAt, verifyTotp } from "@/backend/security";

describe("aplicativo autenticador (TOTP)", () => {
  // RFC 6238, apêndice B: segredo "12345678901234567890", instante 59 s → 94287082 (8 dígitos); com 6 dígitos, 287082.
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  it("base32 e vetor oficial da norma", () => {
    expect(secret).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode(secret).toString()).toBe("12345678901234567890");
    expect(totpAt(secret, Math.floor(59 / 30))).toBe("287082");
    expect(totpAt(secret, Math.floor(1111111109 / 30))).toBe("081804");
  });
  it("aceita um passo de diferença no relógio e recusa código repetido", () => {
    const now = 1_700_000_000_000;
    const step = Math.floor(now / 30_000);
    expect(verifyTotp(secret, totpAt(secret, step), null, now)).toBe(step);
    expect(verifyTotp(secret, totpAt(secret, step - 1), null, now)).toBe(step - 1);
    expect(verifyTotp(secret, totpAt(secret, step - 3), null, now)).toBeNull();
    // Já usado este passo: o mesmo código não vale de novo.
    expect(verifyTotp(secret, totpAt(secret, step), step, now)).toBeNull();
    expect(verifyTotp(secret, "12345", null, now)).toBeNull();
  });
  it("códigos de recuperação: 10, únicos, conferidos sem diferenciar traço e maiúsculas", () => {
    const key = new TextEncoder().encode("chave-de-teste-chave-de-teste-1234");
    const { codes, hashes } = newRecoveryCodes(key);
    expect(new Set(codes).size).toBe(10);
    // 64 bits: 16 caracteres hexadecimais em 4 grupos
    expect(codes[0]).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
    expect(hashRecovery(codes[0].toLowerCase().replace(/-/g, ""), key)).toBe(hashes[0]);
    expect(hashes[0]).toMatch(/^v2:/);
    expect(findRecovery(codes[3].toLowerCase(), hashes, key)).toBe(hashes[3]);
    expect(findRecovery("0000-0000-0000-0000", hashes, key)).toBeNull();
    // outra chave do servidor não reconhece os códigos
    expect(findRecovery(codes[0], hashes, new TextEncoder().encode("outra-chave-outra-chave-outra-chave"))).toBeNull();
  });
  it("aceita código de recuperação no formato antigo (SHA-256 sem sal)", () => {
    const key = new TextEncoder().encode("chave-de-teste-chave-de-teste-1234");
    const old = legacyHashRecovery("ab12c-d34ef");
    expect(findRecovery("AB12C-D34EF", [old], key)).toBe(old);
  });
});

describe("senha", () => {
  it("recusa curta, muito usada, repetida e com dados pessoais", () => {
    expect(passwordProblem("abc")).toContain("8 caracteres");
    expect(passwordProblem("12345678")).toContain("fácil de adivinhar");
    expect(passwordProblem("aaaaaaaaaa")).toContain("fácil de adivinhar");
    expect(passwordProblem("joana2026!", ["Joana"])).toContain("nome");
    expect(passwordProblem("x-31999998888", [null, null, "31999998888"])).toContain("telefone");
    expect(passwordProblem("cavalo-azul-ponte-77", ["Joana", "joana@x.com"])).toBeNull();
  });
});

describe("arquivos e segredos", () => {
  it("reconhece o tipo pelo conteúdo, não pelo nome", () => {
    expect(sniffFile(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    expect(sniffFile(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffFile(Buffer.from("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffFile(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
  });
  it("cifra e decifra; com outra chave, falha", () => {
    const k = new TextEncoder().encode("k".repeat(40));
    const blob = encrypt("SEGREDO", k);
    expect(blob).not.toContain("SEGREDO");
    expect(decrypt(blob, k)).toBe("SEGREDO");
    expect(() => decrypt(blob, new TextEncoder().encode("x".repeat(40)))).toThrow();
  });
});

describe("IP e limite", () => {
  it("usa o IP acrescentado pelo proxy, não o que o navegador inventou", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "6.6.6.6, 200.1.2.3" } });
    expect(clientIp(req)).toBe("200.1.2.3");
  });
  it("limite por chave", () => {
    const key = `t:${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(rateLimit(key, 3)).toBe(true);
    expect(rateLimit(key, 3)).toBe(false);
  });
});

describe("IP de quem acessa (M3)", () => {
  const h = (xff?: string) => new Headers(xff ? { "x-forwarded-for": xff } : {});
  it("em produção sem configuração, não confia no cabeçalho", () => {
    expect(resolveClientIp(h("6.6.6.6, 200.1.2.3"), { NODE_ENV: "production" })).toBe(UNKNOWN_IP);
  });
  it("em produção com TRUST_PROXY_HOPS, usa o IP do proxy", () => {
    expect(resolveClientIp(h("6.6.6.6, 200.1.2.3"), { NODE_ENV: "production", TRUST_PROXY_HOPS: "1" })).toBe("200.1.2.3");
    expect(resolveClientIp(h("6.6.6.6, 200.1.2.3, 10.0.0.1"), { NODE_ENV: "production", TRUST_PROXY_HOPS: "2" })).toBe("200.1.2.3");
  });
  it("TRUST_X_REAL_IP sozinho não basta em produção: exige TRUST_PROXY_HOPS", () => {
    const hh = new Headers({ "x-real-ip": "9.9.9.9" });
    expect(resolveClientIp(hh, { NODE_ENV: "production", TRUST_X_REAL_IP: "true" })).toBe(UNKNOWN_IP);
    expect(resolveClientIp(hh, { NODE_ENV: "production", TRUST_X_REAL_IP: "true", TRUST_PROXY_HOPS: "1" })).toBe("9.9.9.9");
  });
  it("IPv6 é agrupado pelo prefixo /64", () => {
    const env = { NODE_ENV: "production", TRUST_PROXY_HOPS: "1" };
    const a = resolveClientIp(h("2001:db8:1:2:aaaa:bbbb:cccc:dddd"), env);
    const b = resolveClientIp(h("2001:DB8:1:2::1"), env);
    expect(a).toBe(b);
    expect(a).toBe("2001:0db8:0001:0002::/64");
    expect(resolveClientIp(h("2001:db8:1:3::1"), env)).not.toBe(a);
    expect(ipLimitKey("::ffff:200.1.2.3")).toBe("200.1.2.3");
    expect(ipLimitKey("200.1.2.3")).toBe("200.1.2.3");
  });
  it("fora de produção mantém o padrão de 1 proxy", () => {
    expect(resolveClientIp(h("6.6.6.6, 200.1.2.3"), { NODE_ENV: "development" })).toBe("200.1.2.3");
    expect(resolveClientIp(h(), { NODE_ENV: "development" })).toBe("local");
  });
});

describe("descarte de contadores (M3)", () => {
  it("tira primeiro os vencidos e, se ainda estiver cheio, os mais antigos, sem zerar tudo", () => {
    const m = new Map<string, { n: number; until: number }>();
    const now = 1000;
    m.set("vencido", { n: 1, until: 500 });
    for (let i = 0; i < 20; i++) m.set(`ativo${i}`, { n: 1, until: now + 1000 });
    evictBuckets(m, now, 10);
    expect(m.has("vencido")).toBe(false);
    expect(m.size).toBeGreaterThan(0);
    expect(m.size).toBeLessThanOrEqual(10);
    expect(m.has("ativo19")).toBe(true);
    expect(m.has("ativo0")).toBe(false);
  });
  it("bloqueios ativos sobrevivem ao descarte enquanto houver outras chaves para tirar", () => {
    const m = new Map<string, { n: number; until: number; blocked?: boolean }>();
    const now = 1000;
    m.set("bloqueado", { n: 99, until: now + 1000, blocked: true });
    for (let i = 0; i < 20; i++) m.set(`ativo${i}`, { n: 1, until: now + 1000 });
    evictBuckets(m, now, 10);
    expect(m.has("bloqueado")).toBe(true);
    expect(m.size).toBeLessThanOrEqual(10);
  });
  it("com espaço sobrando, só os vencidos saem", () => {
    const m = new Map([["a", { n: 1, until: 1 }], ["b", { n: 1, until: 5000 }]]);
    evictBuckets(m, 1000, 10);
    expect([...m.keys()]).toEqual(["b"]);
  });
});
