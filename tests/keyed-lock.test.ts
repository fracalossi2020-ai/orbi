import { describe, expect, it } from "vitest";
import { withKeyLock } from "@/shared/keyed-lock";

describe("withKeyLock (B4)", () => {
  it("mesma chave roda em fila; o erro de uma não trava a próxima", async () => {
    const order: string[] = [];
    const slow = withKeyLock("a", async () => { order.push("1-início"); await new Promise((r) => setTimeout(r, 30)); order.push("1-fim"); });
    const boom = withKeyLock("a", async () => { order.push("2"); throw new Error("x"); });
    const last = withKeyLock("a", async () => { order.push("3"); return 7; });
    await slow;
    await expect(boom).rejects.toThrow("x");
    expect(await last).toBe(7);
    expect(order).toEqual(["1-início", "1-fim", "2", "3"]);
  });
  it("chaves diferentes não esperam uma pela outra", async () => {
    const order: string[] = [];
    const a = withKeyLock("k1", async () => { await new Promise((r) => setTimeout(r, 30)); order.push("a"); });
    const b = withKeyLock("k2", async () => { order.push("b"); });
    await Promise.all([a, b]);
    expect(order).toEqual(["b", "a"]);
  });
});
