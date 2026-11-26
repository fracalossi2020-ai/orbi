import { describe, expect, it } from "vitest";
import { allowListProblems, ipAllowed, parseAllowList, parseIp } from "@/shared/ip-allow";

const allowed = (list: string, ip: string | null | undefined) => ipAllowed(parseAllowList(list), ip);

describe("lista de IPs do painel (A4)", () => {
  it("lista vazia ou só espaços: desligada, todo IP passa", () => {
    for (const raw of ["", "  ", " , ,", undefined, null]) {
      const l = parseAllowList(raw);
      expect(l.enabled).toBe(false);
      expect(ipAllowed(l, "8.8.8.8")).toBe(true);
      expect(ipAllowed(l, null)).toBe(true);
    }
  });
  it("IPv4 exato e CIDR", () => {
    expect(allowed("203.0.113.7", "203.0.113.7")).toBe(true);
    expect(allowed("203.0.113.7", "203.0.113.8")).toBe(false);
    expect(allowed("10.0.0.0/8", "10.255.1.2")).toBe(true);
    expect(allowed("10.0.0.0/8", "11.0.0.1")).toBe(false);
    expect(allowed("192.168.1.0/24, 203.0.113.7", "192.168.1.200")).toBe(true);
    expect(allowed("192.168.1.0/24", "192.168.2.1")).toBe(false);
    expect(allowed("0.0.0.0/0", "1.2.3.4")).toBe(true);
    expect(allowed("203.0.113.7/32", "203.0.113.7")).toBe(true);
  });
  it("IPv6 exato, comprimido e CIDR", () => {
    expect(allowed("2001:db8::1", "2001:0db8:0:0:0:0:0:1")).toBe(true);
    expect(allowed("2001:db8::1", "2001:db8::2")).toBe(false);
    expect(allowed("2001:db8::/32", "2001:db8:ffff::5")).toBe(true);
    expect(allowed("2001:db8::/32", "2001:db9::5")).toBe(false);
    expect(allowed("2001:db8:1:2::/64", "2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe(true);
    expect(allowed("2001:db8:1:2::/64", "2001:db8:1:3::1")).toBe(false);
    expect(allowed("::1", "::1")).toBe(true);
    expect(allowed("::/0", "2606:4700::1111")).toBe(true);
  });
  it("IPv4 dentro de IPv6 vale como IPv4; famílias diferentes não se misturam", () => {
    expect(allowed("203.0.113.7", "::ffff:203.0.113.7")).toBe(true);
    expect(allowed("203.0.113.0/24", "::ffff:203.0.113.99")).toBe(true);
    expect(allowed("2001:db8::/32", "203.0.113.7")).toBe(false);
    expect(allowed("0.0.0.0/0", "2001:db8::1")).toBe(false);
  });
  it("aceita colchetes e zona; recusa IP ausente, desconhecido ou lixo quando a lista está ligada", () => {
    expect(allowed("2001:db8::1", "[2001:db8::1]")).toBe(true);
    expect(allowed("fe80::1", "fe80::1%eth0")).toBe(true);
    for (const ip of [null, undefined, "", "local", "ip-desconhecido", "999.1.1.1", "1.2.3", "abc"]) expect(allowed("203.0.113.7", ip), String(ip)).toBe(false);
  });
  it("entradas mal formadas são recusadas e nunca liberam todo mundo", () => {
    const bad = ["1.2.3.4/33", "1.2.3/24", "::1/129", "1.2.3.4/", "1.2.3.4/a", "1.2.3.4/8/8", "300.1.1.1", "01.2.3.4", "2001:db8:::1", "1:2:3:4:5:6:7:8:9", "banana", "1.2.3.4-1.2.3.9"];
    for (const entry of bad) {
      const l = parseAllowList(entry);
      expect(l.invalid, entry).toEqual([entry]);
      expect(l.enabled).toBe(true);
      expect(ipAllowed(l, "203.0.113.7"), entry).toBe(false);
    }
    // Uma entrada boa ao lado de uma ruim continua valendo; só a ruim é ignorada (e a subida em produção recusa a lista).
    const mixed = parseAllowList("203.0.113.7, lixo");
    expect(ipAllowed(mixed, "203.0.113.7")).toBe(true);
    expect(ipAllowed(mixed, "198.51.100.1")).toBe(false);
  });
  it("allowListProblems só reclama de lista mal formada", () => {
    expect(allowListProblems("")).toEqual([]);
    expect(allowListProblems("10.0.0.0/8,2001:db8::/32")).toEqual([]);
    expect(allowListProblems("10.0.0.0/99")[0]).toContain("ADMIN_ALLOWED_IPS");
  });
  it("parseIp devolve a família e o número", () => {
    expect(parseIp("1.2.3.4")).toEqual({ v: 4, n: 0x01020304n });
    expect(parseIp("::1")).toEqual({ v: 6, n: 1n });
    expect(parseIp("nada")).toBeNull();
  });
});
