import { describe, expect, it } from "vitest";
import { actionLabel, canTransition, DEMO_SCHEDULE, delayAlert, finalStatus, isFinal, nextStatus, simulatedStatus, timeline } from "@/shared/food/order-state";

describe("Orbi Food: estados do pedido", () => {
  it("a entrega termina em entregue, a retirada em retirado", () => {
    expect(timeline("delivery")).toEqual(["pending", "accepted", "preparing", "ready", "delivered"]);
    expect(timeline("pickup")).toEqual(["pending", "accepted", "preparing", "ready", "picked_up"]);
    expect(finalStatus("pickup")).toBe("picked_up");
  });

  it("avança um passo por vez e para no final", () => {
    expect(nextStatus("pending", "delivery")).toBe("accepted");
    expect(nextStatus("ready", "delivery")).toBe("delivered");
    expect(nextStatus("ready", "pickup")).toBe("picked_up");
    for (const s of ["delivered", "picked_up", "cancelled"] as const) { expect(nextStatus(s, "delivery")).toBeNull(); expect(isFinal(s)).toBe(true); }
  });

  it("transições: sem pular, sem voltar, cancelar só até o preparo, entrega não vira retirada", () => {
    expect(canTransition("pending", "accepted", "delivery")).toBe(true);
    expect(canTransition("pending", "preparing", "delivery")).toBe(false);
    expect(canTransition("preparing", "accepted", "delivery")).toBe(false);
    expect(canTransition("pending", "cancelled", "pickup")).toBe(true);
    expect(canTransition("preparing", "cancelled", "pickup")).toBe(true);
    expect(canTransition("ready", "cancelled", "pickup")).toBe(false);
    expect(canTransition("ready", "picked_up", "delivery")).toBe(false);
    expect(canTransition("ready", "delivered", "delivery")).toBe(true);
    expect(canTransition("delivered", "cancelled", "delivery")).toBe(false);
  });

  it("rótulos dos botões da loja", () => {
    expect(actionLabel("pending", "delivery")).toBe("Aceitar");
    expect(actionLabel("accepted", "delivery")).toBe("Em preparo");
    expect(actionLabel("preparing", "delivery")).toBe("Pronto");
    expect(actionLabel("ready", "delivery")).toBe("Entregue");
    expect(actionLabel("ready", "pickup")).toBe("Retirado");
    expect(actionLabel("delivered", "delivery")).toBeNull();
  });

  it("simulação pelo tempo decorrido", () => {
    expect(simulatedStatus(-5, "delivery")).toBe("pending");
    expect(simulatedStatus(DEMO_SCHEDULE.accepted - 1, "delivery")).toBe("pending");
    expect(simulatedStatus(DEMO_SCHEDULE.accepted, "delivery")).toBe("accepted");
    expect(simulatedStatus(DEMO_SCHEDULE.preparing, "delivery")).toBe("preparing");
    expect(simulatedStatus(DEMO_SCHEDULE.ready, "pickup")).toBe("ready");
    expect(simulatedStatus(DEMO_SCHEDULE.done, "pickup")).toBe("picked_up");
    expect(simulatedStatus(DEMO_SCHEDULE.done * 10, "delivery")).toBe("delivered");
  });

  it("alerta de atraso: pendente > 5 min e em preparo > 30 min", () => {
    const min = 60_000;
    expect(delayAlert("pending", 5 * min)).toBeNull();
    expect(delayAlert("pending", 5 * min + 1)?.minutes).toBe(5);
    expect(delayAlert("preparing", 30 * min)).toBeNull();
    expect(delayAlert("preparing", 34 * min)?.text).toContain("34 min");
    expect(delayAlert("accepted", 99 * min)).toBeNull();
    expect(delayAlert("ready", 99 * min)).toBeNull();
  });
});
