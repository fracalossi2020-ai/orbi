import { describe, expect, it } from "vitest";
import { isLocked, LOGIN_FLOOD_DELAY_MS, LOGIN_FLOOD_MAX, lockDurationMs, MFA_OVERFLOW_LIMIT, progressiveDelayMs, progressiveDelayS } from "@/shared/lockout";

describe("bloqueio de conta (A1)", () => {
  it("atraso progressivo: nada nas 2 primeiras falhas, depois min(2^(n-3), 16) segundos", () => {
    expect([1, 2].map(progressiveDelayS)).toEqual([0, 0]);
    expect([3, 4, 5, 6, 7].map(progressiveDelayS)).toEqual([1, 2, 4, 8, 16]);
    expect(progressiveDelayS(8)).toBe(16);
    expect(progressiveDelayS(500)).toBe(16);
    expect(progressiveDelayS(Number.NaN)).toBe(0);
  });
  it("o fator reduz o atraso (só testes automatizados) e 0 o desliga", () => {
    expect(progressiveDelayMs(5)).toBe(4000);
    expect(progressiveDelayMs(5, 0)).toBe(0);
    expect(progressiveDelayMs(5, 0.5)).toBe(2000);
  });
  it("bloqueia 15 min na 10ª falha, 1 h na 20ª e 24 h na 30ª (e nos múltiplos de 10 seguintes)", () => {
    expect(lockDurationMs(10)).toBe(15 * 60_000);
    expect(lockDurationMs(20)).toBe(60 * 60_000);
    expect(lockDurationMs(30)).toBe(24 * 60 * 60_000);
    expect(lockDurationMs(40)).toBe(24 * 60 * 60_000);
    for (const n of [0, 1, 9, 11, 19, 21, 29, 31, 10.5]) expect(lockDurationMs(n), String(n)).toBeNull();
  });
  it("isLocked compara com o instante dado", () => {
    const now = 1_700_000_000_000;
    expect(isLocked(null, now)).toBe(false);
    expect(isLocked(new Date(now - 1), now)).toBe(false);
    expect(isLocked(new Date(now + 1), now)).toBe(true);
  });
  it("constantes da segunda etapa e da onda de falhas", () => {
    expect(MFA_OVERFLOW_LIMIT).toBe(3);
    expect(LOGIN_FLOOD_MAX).toBe(300);
    expect(LOGIN_FLOOD_DELAY_MS).toBe(2000);
  });
});
