import { describe, expect, it } from "vitest";
import { plausibleMove } from "@/shared/location-guard";

const t0 = new Date("2026-01-01T12:00:00Z");
const at = (s: number) => new Date(t0.getTime() + s * 1000);
const prev = { lat: -19.47, lng: -42.54, at: t0 };

describe("plausibleMove (M5)", () => {
  it("sem posição anterior, aceita", () => {
    expect(plausibleMove(null, { lat: 0, lng: 0 }).ok).toBe(true);
    expect(plausibleMove({ lat: null, lng: null, at: null }, { lat: 0, lng: 0 }).ok).toBe(true);
  });
  it("movimento de carro normal passa; ruído de GPS parado passa mesmo com 1 s", () => {
    expect(plausibleMove(prev, { lat: -19.4709, lng: -42.54 }, at(10)).ok).toBe(true); // ~100 m em 10 s
    expect(plausibleMove(prev, { lat: -19.4705, lng: -42.5405 }, at(1)).ok).toBe(true); // ~70 m
  });
  it("salto de dezenas de km em segundos é recusado", () => {
    const r = plausibleMove(prev, { lat: -19.9, lng: -43.9 }, at(5));
    expect(r.ok).toBe(false);
    expect(r.speedMps).toBeGreaterThan(45);
  });
  it("o mesmo deslocamento passa quando deu tempo de percorrê-lo", () => {
    const far = { lat: -19.9, lng: -43.9 }; // ~160 km
    expect(plausibleMove(prev, far, at(600)).ok).toBe(false);
    expect(plausibleMove(prev, far, at(4 * 3600)).ok).toBe(true);
  });
  it("relógio atrasado (agora antes da posição anterior) não divide por zero", () => {
    expect(plausibleMove(prev, { lat: -19.9, lng: -43.9 }, at(-30)).ok).toBe(false);
  });
});
