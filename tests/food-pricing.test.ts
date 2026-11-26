import { describe, expect, it } from "vitest";
import { addLine, buildLine, commissionCents, deliveryFee, groupError, itemCount, lineKey, quoteOrder, selectionErrors, setQty, subtotalCents } from "@/shared/food/pricing";
import { commissionBpsFor, FOOD_COMMISSIONS, FOOD_STORES } from "@/shared/food/demo-data";
import { foodDemoOn } from "@/shared/food/flag";
import { isOpenAt, toMinutes, turnError } from "@/shared/food/hours";
import { runtimeConfigProblems } from "@/shared/runtime-config";
import { can } from "@/shared/permissions";

const pizza = FOOD_STORES[0].menu[0]; // Margherita: massa obrigatória, borda e adicionais opcionais

describe("Orbi Food: preço", () => {
  it("monta a linha com opcionais e soma o subtotal", () => {
    const l = buildLine(pizza, { massa: ["int"], borda: ["catu"], extras: ["bacon", "azeit"] }, 2)!;
    // 56,00 + 3,00 (integral) + 8,00 (catupiry) + 6,00 + 3,00 = 76,00 por unidade
    expect(l.options.reduce((s, o) => s + o.extraCents, 0)).toBe(2000);
    expect(subtotalCents([l])).toBe(2 * 7600);
    expect(itemCount([l])).toBe(2);
  });

  it("faltando opção obrigatória, não monta a linha", () => {
    expect(buildLine(pizza, {}, 1)).toBeNull();
    expect(selectionErrors(pizza, {}).massa).toBe("Escolha uma opção.");
  });

  it("recusa escolha fora do grupo, repetida, acima do máximo e quantidade inválida", () => {
    const massa = pizza.groups![0];
    expect(groupError(massa, ["nao-existe"])).toBe("Escolha inválida.");
    expect(groupError(massa, ["trad", "trad"])).toBe("Escolha inválida.");
    expect(groupError(massa, ["trad", "int"])).toBe("Escolha até 1.");
    expect(buildLine(pizza, { massa: ["trad"] }, 0)).toBeNull();
    expect(buildLine(pizza, { massa: ["trad"] }, 21)).toBeNull();
    expect(buildLine(pizza, { massa: ["trad"], extras: ["bacon", "azeit", "cebola", "oreg"] }, 1)).toBeNull();
  });

  it("linhas iguais somam a quantidade; ordem das opções não muda a chave; zero remove", () => {
    const a = buildLine(pizza, { massa: ["trad"], extras: ["bacon", "azeit"] }, 1)!;
    const b = buildLine(pizza, { massa: ["trad"], extras: ["azeit", "bacon"] }, 2)!;
    expect(lineKey(pizza.id, a.options)).toBe(lineKey(pizza.id, b.options));
    const cart = addLine(addLine([], a), b);
    expect(cart).toHaveLength(1);
    expect(cart[0].qty).toBe(3);
    expect(setQty(cart, a.key, 0)).toEqual([]);
    expect(setQty(cart, a.key, 50)[0].qty).toBe(20);
  });

  it("taxa de entrega: retirada e loja sem entrega não cobram", () => {
    expect(deliveryFee(600, "delivery")).toBe(600);
    expect(deliveryFee(600, "pickup")).toBe(0);
    expect(deliveryFee(null, "delivery")).toBe(0);
  });

  it("comissão incide só sobre o subtotal, e vem da tabela (14% tudo incluído)", () => {
    const l = buildLine(pizza, { massa: ["trad"] }, 1)!; // 56,00
    const bps = commissionBpsFor("delivery");
    expect(bps).toBe(1400);
    const q = quoteOrder([l], "delivery", 600, bps);
    expect(q.subtotalCents).toBe(5600);
    expect(q.totalCents).toBe(6200);
    expect(q.commissionCents).toBe(784); // 14% de 56,00, sem a entrega
    expect(q.storeNetCents).toBe(5600 - 784 + 600);
    expect(commissionCents(1999, 1400)).toBe(280);
    expect(FOOD_COMMISSIONS.every((c) => c.bps === null || c.bps > 0)).toBe(true);
  });

  it("cardápios da demo: 15 lojas, 6 a 10 itens, preços e opcionais coerentes", () => {
    expect(FOOD_STORES).toHaveLength(15);
    for (const s of FOOD_STORES) {
      expect(s.menu.length).toBeGreaterThanOrEqual(6);
      expect(s.menu.length).toBeLessThanOrEqual(10);
      for (const i of s.menu) {
        expect(i.priceCents).toBeGreaterThan(0);
        for (const g of i.groups ?? []) { expect(g.max).toBeGreaterThanOrEqual(1); expect(g.options.length).toBeGreaterThan(0); }
      }
    }
  });
});

describe("Orbi Food: horários, interruptor e permissão", () => {
  it("turnos simples, que viram a meia-noite e inválidos", () => {
    const t = [{ open: "10:30", close: "15:00" }, { open: "17:30", close: "21:00" }];
    expect(isOpenAt(t, toMinutes("12:00")!)).toBe(true);
    expect(isOpenAt(t, toMinutes("16:00")!)).toBe(false);
    expect(isOpenAt([{ open: "22:00", close: "02:00" }], toMinutes("01:00")!)).toBe(true);
    expect(isOpenAt([{ open: "xx", close: "02:00" }], 60)).toBe(false);
    expect(turnError({ open: "10:00", close: "10:00" })).not.toBeNull();
    expect(turnError({ open: "25:00", close: "10:00" })).not.toBeNull();
    expect(turnError({ open: "10:00", close: "22:00" })).toBeNull();
  });

  it("interruptor é estrito e NÃO entra nos problemas de produção", () => {
    expect(foodDemoOn({ PRUMO_FOOD_DEMO: "true" })).toBe(true);
    for (const v of ["false", "1", "TRUE", "", undefined]) expect(foodDemoOn({ PRUMO_FOOD_DEMO: v })).toBe(false);
    const prod = { NODE_ENV: "production", DATABASE_URL: "postgres://x", TRUST_PROXY_HOPS: "1", APP_URL: "https://orbi.example.com" };
    expect(runtimeConfigProblems({ ...prod, PRUMO_FOOD_DEMO: "true" })).toEqual(runtimeConfigProblems(prod));
  });

  it("permissão food: administrador e gestor leem, só o administrador escreve, atendente não vê", () => {
    expect(can("admin", "food", "read")).toBe(true);
    expect(can("admin", "food", "write")).toBe(true);
    expect(can("gestor", "food", "read")).toBe(true);
    expect(can("gestor", "food", "write")).toBe(false);
    expect(can("atendente", "food", "read")).toBe(false);
    expect(can("passenger", "food", "read")).toBe(false);
  });
});
