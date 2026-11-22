import { describe, expect, it } from "vitest";
import { showsDriverLocation, type RideStatus } from "@/shared/transitions";

describe("posição do motorista na corrida", () => {
  it("aparece só enquanto a corrida está aceita, com o motorista no local ou em viagem", () => {
    const visible: RideStatus[] = ["accepted", "arrived", "in_progress"];
    for (const st of visible) expect(showsDriverLocation(st)).toBe(true);
  });

  it("não aparece antes de aceitar nem depois de terminar", () => {
    const hidden: RideStatus[] = ["scheduled", "searching", "completed", "cancelled", "no_driver"];
    for (const st of hidden) expect(showsDriverLocation(st)).toBe(false);
  });
});
