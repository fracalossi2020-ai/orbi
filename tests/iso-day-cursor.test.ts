import { describe, expect, it } from "vitest";
import { isIsoDay } from "@/shared/iso-day";
import { encodeCursor, parseCursor } from "@/shared/cursor";
import { SOS_THROTTLED_MESSAGE } from "@/shared/emergency";
import { runtimeConfigProblems } from "@/shared/runtime-config";

describe("dia AAAA-MM-DD dos relatórios (N7)", () => {
  it("aceita só datas reais nesse formato", () => {
    expect(isIsoDay("2026-02-28")).toBe(true);
    for (const v of ["2026-02-31", "2026-2-3", "26-02-03", "2026-02-03T10:00", "", null, undefined, "abc"]) expect(isIsoDay(v)).toBe(false);
  });
});

describe("cursor de paginação (N8)", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";
  it("vai e volta só com o id", () => {
    expect(parseCursor(encodeCursor(id))).toEqual({ id });
  });
  it("aceita o formato antigo data|id e ignora data solta e lixo", () => {
    expect(parseCursor(`2026-05-01T12:00:00.123Z|${id.toUpperCase()}`)).toEqual({ id });
    expect(parseCursor("2026-05-01T12:00:00.000Z")).toBeNull();
    expect(parseCursor("2026-05-01T12:00:00.000Z|abc-1")).toBeNull();
    expect(parseCursor("'; drop table rides;--")).toBeNull();
    expect(parseCursor("")).toBeNull();
    expect(parseCursor(null)).toBeNull();
  });
});

describe("SOS acima do limite (N6) e webhook (N9b)", () => {
  it("a mensagem do limite é clara e cita o 190", () => {
    expect(SOS_THROTTLED_MESSAGE).toContain("registrado");
    expect(SOS_THROTTLED_MESSAGE).toContain("190");
  });
  const prod = { NODE_ENV: "production", DATABASE_URL: "postgres://x", TRUST_PROXY_HOPS: "1", APP_URL: "https://orbi.example.com" };
  it("webhook de emergência exige a chave própria", () => {
    expect(runtimeConfigProblems({ ...prod, EMERGENCY_WEBHOOK_URL: "https://x.com/h" }).join()).toContain("EMERGENCY_WEBHOOK_SECRET");
    expect(runtimeConfigProblems({ ...prod, EMERGENCY_WEBHOOK_URL: "https://x.com/h", EMERGENCY_WEBHOOK_SECRET: "  " }).join()).toContain("EMERGENCY_WEBHOOK_SECRET");
    expect(runtimeConfigProblems({ ...prod, EMERGENCY_WEBHOOK_URL: "https://x.com/h", EMERGENCY_WEBHOOK_SECRET: "k" })).toEqual([]);
    expect(runtimeConfigProblems(prod)).toEqual([]);
  });
});
