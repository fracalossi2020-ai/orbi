import { avgPriceCents, categoryLabel, ratingOf } from "./demo-data";
import type { FoodCategoryId, FoodCityId, FoodStore } from "./types";

/** Filtros e ordem da lista de lojas da home do Food (demonstração). Puro: a hora de funcionamento chega pronta em `openIds`. */
export type FoodSort = "relevance" | "price" | "time" | "rating";
export type FoodMode = "all" | "delivery" | "pickup";
export type FoodFilters = { category: FoodCategoryId | null; mode: FoodMode; openNow: boolean; sort: FoodSort };
export const NO_FILTERS: FoodFilters = { category: null, mode: "all", openNow: false, sort: "relevance" };

export const SORT_LABEL: Record<FoodSort, string> = { relevance: "Relevância", price: "Menor preço", time: "Mais rápida", rating: "Melhor avaliada" };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Quantos filtros além da categoria estão ligados (para o selo do botão de filtros). */
export const activeFilterCount = (f: FoodFilters) => (f.category ? 1 : 0) + (f.mode !== "all" ? 1 : 0) + (f.openNow ? 1 : 0) + (f.sort !== "relevance" ? 1 : 0);

/**
 * Lojas da cidade, com busca, categoria, entrega/retirada, "aberto agora" e ordem.
 * `openIds`: lojas abertas agora; null enquanto a hora ainda não carregou (aí "aberto agora" não esconde ninguém).
 */
export function filterStores(stores: readonly FoodStore[], city: FoodCityId, q: string, f: FoodFilters, openIds: ReadonlySet<string> | null): FoodStore[] {
  const t = norm(q.trim());
  const out = stores.filter((s) =>
    s.city === city
    && (!f.category || s.category === f.category)
    && (f.mode === "all" || (f.mode === "delivery" ? s.deliveryFeeCents !== null : true))
    && (!f.openNow || !openIds || openIds.has(s.id))
    && (!t || norm(s.name).includes(t) || norm(categoryLabel(s.category)).includes(t) || s.menu.some((i) => norm(i.name).includes(t))));
  const by: Record<FoodSort, ((a: FoodStore, b: FoodStore) => number) | null> = {
    relevance: null,
    price: (a, b) => avgPriceCents(a) - avgPriceCents(b),
    time: (a, b) => (a.etaMin + a.etaMax) - (b.etaMin + b.etaMax),
    rating: (a, b) => ratingOf(b) - ratingOf(a),
  };
  const cmp = by[f.sort];
  // Array.sort é estável: empate mantém a ordem original.
  return cmp ? [...out].sort(cmp) : out;
}
