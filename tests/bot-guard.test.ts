import { describe, expect, it } from "vitest";
import { capDay, capKey, DAILY_CAPS, FORM_MAX_MS, FORM_MIN_MS, honeypotFilled, parseStamp, stampVerdict } from "@/shared/bot-guard";

describe("defesa contra robôs (A7)", () => {
  it("campo-isca: só preenchido (com algo além de espaços) denuncia", () => {
    expect(honeypotFilled("")).toBe(false);
    expect(honeypotFilled("   ")).toBe(false);
    expect(honeypotFilled(undefined)).toBe(false);
    expect(honeypotFilled(null)).toBe(false);
    expect(honeypotFilled("http://spam.example")).toBe(true);
  });
  it("carimbo: formato <ms>.<64 hex>", () => {
    const sig = "a".repeat(64);
    expect(parseStamp(`1700000000000.${sig}`)).toEqual({ ts: 1_700_000_000_000, sig });
    for (const bad of [undefined, null, "", "abc", "1700000000000.zz", `1700000000000.${"a".repeat(63)}`, `x.${sig}`, 5]) expect(parseStamp(bad), String(bad)).toBeNull();
  });
  it("menos de 3 s ou mais de 2 h é recusado; no meio, vale", () => {
    const now = 1_700_000_000_000;
    expect(FORM_MIN_MS).toBe(3000);
    expect(FORM_MAX_MS).toBe(2 * 60 * 60_000);
    expect(stampVerdict(now - 1000, now)).toBe("fast");
    expect(stampVerdict(now - (FORM_MIN_MS - 1), now)).toBe("fast");
    expect(stampVerdict(now - FORM_MIN_MS, now)).toBe("ok");
    expect(stampVerdict(now - FORM_MAX_MS, now)).toBe("ok");
    expect(stampVerdict(now - FORM_MAX_MS - 1, now)).toBe("old");
    expect(stampVerdict(now + 60_000, now)).toBe("future");
    // tempo mínimo configurável (só nos testes automatizados, com o servidor recusando a variável em produção)
    expect(stampVerdict(now - 10, now, 0)).toBe("ok");
  });
  it("tetos por dia: cadastro 500, leads 300, moto-interest 300, e a chave segue o dia de Brasília", () => {
    expect(DAILY_CAPS).toEqual({ register: 500, leads: 300, "moto-interest": 300, "food-interest": 300 });
    // 02:00 UTC ainda é o dia anterior em Brasília (UTC-3)
    expect(capDay(Date.UTC(2026, 10, 24, 2, 0))).toBe("2026-11-23");
    expect(capDay(Date.UTC(2026, 10, 24, 12, 0))).toBe("2026-11-24");
    expect(capKey("leads", Date.UTC(2026, 10, 24, 12, 0))).toBe("cap:leads:2026-11-24");
  });
});
