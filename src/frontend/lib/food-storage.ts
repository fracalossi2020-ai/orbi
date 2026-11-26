"use client";
import { useCallback, useEffect, useState } from "react";
import type { CartLine, Fulfillment, PaymentChoice, Turn } from "@/shared/food/types";
import type { FoodQuote } from "@/shared/food/pricing";

/**
 * Estado do Orbi Food (demonstração) no aparelho: carrinhos (um por loja), pedidos simulados e os ajustes do painel da loja.
 * Tudo em localStorage, sempre com try/catch (modo privado, cota cheia ou JSON quebrado não podem derrubar a tela).
 * Não há banco nem API de escrita: nada sai do aparelho.
 */
export type FoodOrder = {
  id: string; code: string; storeId: string; storeName: string; lines: CartLine[];
  fulfillment: Fulfillment; payment: PaymentChoice; address: string | null; quote: FoodQuote;
  createdAt: number; cancelledAt?: number;
};
export type FoodState = {
  carts: Record<string, CartLine[]>;
  orders: FoodOrder[];
  /** Horários que o painel da loja ajustou, por loja. */
  turns: Record<string, Turn[]>;
  /** Itens desligados no painel da loja, por loja. */
  off: Record<string, string[]>;
};

const KEY = "orbi-food-v1";
const EMPTY: FoodState = { carts: {}, orders: [], turns: {}, off: {} };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isLine = (l: unknown): l is CartLine =>
  isObj(l) && typeof l.key === "string" && typeof l.itemId === "string" && typeof l.name === "string" && Number.isInteger(l.baseCents) && Number.isInteger(l.qty)
  && (l.qty as number) >= 1 && (l.qty as number) <= 20 && Array.isArray(l.options)
  && l.options.every((o) => isObj(o) && typeof o.label === "string" && Number.isInteger(o.extraCents) && typeof o.groupId === "string" && typeof o.optionId === "string");
const isTurn = (t: unknown): t is Turn => isObj(t) && typeof t.open === "string" && typeof t.close === "string";
const isOrder = (o: unknown): o is FoodOrder =>
  isObj(o) && typeof o.id === "string" && typeof o.code === "string" && typeof o.storeId === "string" && typeof o.storeName === "string"
  && Array.isArray(o.lines) && o.lines.every(isLine) && (o.fulfillment === "pickup" || o.fulfillment === "delivery") && (o.payment === "pix" || o.payment === "cash")
  && isObj(o.quote) && typeof o.createdAt === "number";

/** Lê e limpa: o que estiver fora do formato é descartado em vez de quebrar a tela. */
export function readFoodState(): FoodState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!isObj(raw)) return { ...EMPTY };
    const carts: FoodState["carts"] = {};
    if (isObj(raw.carts)) for (const [k, v] of Object.entries(raw.carts)) if (Array.isArray(v)) { const lines = v.filter(isLine); if (lines.length) carts[k] = lines; }
    const turns: FoodState["turns"] = {};
    if (isObj(raw.turns)) for (const [k, v] of Object.entries(raw.turns)) if (Array.isArray(v) && v.every(isTurn)) turns[k] = v;
    const off: FoodState["off"] = {};
    if (isObj(raw.off)) for (const [k, v] of Object.entries(raw.off)) if (Array.isArray(v)) off[k] = v.filter((x): x is string => typeof x === "string");
    return { carts, orders: Array.isArray(raw.orders) ? raw.orders.filter(isOrder).slice(0, 20) : [], turns, off };
  } catch { return { ...EMPTY }; }
}

function writeFoodState(s: FoodState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sem armazenamento: o estado vale só nesta tela */ }
}

/** Estado do Food no aparelho. `state` é null até montar (o servidor não conhece o localStorage). */
export function useFoodState() {
  const [state, setState] = useState<FoodState | null>(null);
  useEffect(() => { setState(readFoodState()); }, []);
  // Lê de novo antes de gravar: duas telas abertas não pisam uma na outra.
  const update = useCallback((fn: (s: FoodState) => FoodState) => {
    const next = fn(readFoodState());
    writeFoodState(next);
    setState(next);
  }, []);
  return { state, update };
}

/** Relógio em ms, atualizado a cada `everyMs`; null até montar (evita diferença entre servidor e navegador). */
export function useNow(everyMs = 1000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

export function newOrderId() {
  try { return crypto.randomUUID(); } catch { return `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; }
}
export const newOrderCode = () => `F${Math.floor(1000 + Math.random() * 9000)}`;
