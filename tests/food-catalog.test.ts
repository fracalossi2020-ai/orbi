import { describe, expect, it } from "vitest";
import { foodCityAt, foodCityFromName, shouldAskCity } from "@/shared/food/city";
import { activeFilterCount, filterStores, NO_FILTERS } from "@/shared/food/catalog";
import { avgPriceCents, FOOD_BANNERS, FOOD_CITIES, FOOD_COUPONS, FOOD_STORES, promoOf, ratingOf, storeById } from "@/shared/food/demo-data";

describe("Orbi Food: cidade", () => {
  it("nome da conta vira cidade do Food (com acento, abreviação e caixa)", () => {
    expect(foodCityFromName("Ipatinga")).toBe("ipatinga");
    expect(foodCityFromName("Coronel Fabriciano")).toBe("fabriciano");
    expect(foodCityFromName("Cel. Fabriciano")).toBe("fabriciano");
    expect(foodCityFromName("TIMÓTEO")).toBe("timoteo");
    expect(foodCityFromName("Belo Horizonte")).toBeNull();
    expect(foodCityFromName(null)).toBeNull();
    expect(foodCityFromName("")).toBeNull();
  });

  it("GPS: a cidade mais próxima dentro do raio; fora do Vale do Aço, nenhuma", () => {
    expect(foodCityAt({ lat: -19.4683, lng: -42.5367 })).toBe("ipatinga");
    expect(foodCityAt({ lat: -19.5186, lng: -42.6289 })).toBe("fabriciano");
    expect(foodCityAt({ lat: -19.5817, lng: -42.6439 })).toBe("timoteo");
    expect(foodCityAt({ lat: -19.9167, lng: -43.9345 })).toBeNull(); // Belo Horizonte
    expect(foodCityAt(null)).toBeNull();
    expect(foodCityAt({ lat: Number.NaN, lng: 0 })).toBeNull();
  });

  it("só pergunta quando o GPS achou outra cidade e ela ainda não foi respondida na sessão", () => {
    expect(shouldAskCity("timoteo", "fabriciano", [])).toBe(true);
    expect(shouldAskCity("timoteo", "fabriciano", ["fabriciano"])).toBe(false);
    expect(shouldAskCity("timoteo", "timoteo", [])).toBe(false);
    expect(shouldAskCity("timoteo", null, [])).toBe(false);
  });
});

describe("Orbi Food: lojas da demo e filtros", () => {
  it("cada cidade tem ao menos 5 lojas e todas as categorias e ids são válidos", () => {
    for (const c of FOOD_CITIES) expect(FOOD_STORES.filter((s) => s.city === c.id).length).toBeGreaterThanOrEqual(5);
    expect(new Set(FOOD_STORES.map((s) => s.id)).size).toBe(FOOD_STORES.length);
    for (const b of FOOD_BANNERS) expect(b.to === "cupons" || !!storeById(b.to)).toBe(true);
    expect(FOOD_COUPONS.length).toBeGreaterThan(0);
    for (const s of FOOD_STORES) { expect(ratingOf(s)).toBeGreaterThan(0); expect(ratingOf(s)).toBeLessThanOrEqual(5); }
    expect(promoOf({ id: "nao-existe" })).toBeNull();
  });

  it("filtra por cidade, busca (sem acento), categoria, entrega, aberto agora e ordena", () => {
    const all = filterStores(FOOD_STORES, "ipatinga", "", NO_FILTERS, null);
    expect(all.every((s) => s.city === "ipatinga")).toBe(true);
    expect(filterStores(FOOD_STORES, "ipatinga", "acai", NO_FILTERS, null).map((s) => s.id)).toContain("tropical-acai");
    expect(filterStores(FOOD_STORES, "ipatinga", "", { ...NO_FILTERS, category: "japones" }, null).map((s) => s.id)).toEqual(["sushi-vale-sakura"]);
    // Açaí Pé Vermelho (Timóteo) só faz retirada.
    const tim = (mode: "all" | "delivery") => filterStores(FOOD_STORES, "timoteo", "", { ...NO_FILTERS, mode }, null).map((s) => s.id);
    expect(tim("all")).toContain("acai-pe-vermelho");
    expect(tim("delivery")).not.toContain("acai-pe-vermelho");
    // "Aberto agora" com a hora ainda desconhecida não esconde ninguém; com a lista de abertas, só elas.
    expect(filterStores(FOOD_STORES, "ipatinga", "", { ...NO_FILTERS, openNow: true }, null)).toHaveLength(all.length);
    expect(filterStores(FOOD_STORES, "ipatinga", "", { ...NO_FILTERS, openNow: true }, new Set(["forno-da-serra"])).map((s) => s.id)).toEqual(["forno-da-serra"]);
    const byRating = filterStores(FOOD_STORES, "ipatinga", "", { ...NO_FILTERS, sort: "rating" }, null).map(ratingOf);
    expect(byRating).toEqual([...byRating].sort((a, b) => b - a));
    const byPrice = filterStores(FOOD_STORES, "ipatinga", "", { ...NO_FILTERS, sort: "price" }, null).map(avgPriceCents);
    expect(byPrice).toEqual([...byPrice].sort((a, b) => a - b));
    const byTime = filterStores(FOOD_STORES, "ipatinga", "", { ...NO_FILTERS, sort: "time" }, null).map((s) => s.etaMin + s.etaMax);
    expect(byTime).toEqual([...byTime].sort((a, b) => a - b));
  });

  it("conta os filtros ligados", () => {
    expect(activeFilterCount(NO_FILTERS)).toBe(0);
    expect(activeFilterCount({ category: "pizza", mode: "delivery", openNow: true, sort: "price" })).toBe(4);
  });
});
