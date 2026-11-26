"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Empty } from "@/frontend/components/ui";
import { IconGlyph } from "@/frontend/components/IconGlyph";
import { OrbiFoodLogo } from "@/frontend/components/OrbiFoodLogo";
import { CATEGORY_GLYPH, FoodArt } from "@/frontend/components/food/parts";
import { useFoodState, useNow } from "@/frontend/lib/food-storage";
import { categoryLabel, FOOD_CATEGORIES, FOOD_CITIES, FOOD_STORES } from "@/shared/food/demo-data";
import { brasiliaMinutes, isOpenAt } from "@/shared/food/hours";
import { isFinal, simulatedStatus, STATUS_LABEL } from "@/shared/food/order-state";
import { brl } from "@/shared/pricing";
import type { FoodCategoryId, FoodCityId } from "@/shared/food/types";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Aba Food: cidade, busca, categorias e lojas. Uma ideia por tela: escolher onde pedir. */
export function FoodHome() {
  const { state } = useFoodState();
  const now = useNow(5000);
  const [city, setCity] = useState<FoodCityId>("ipatinga");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<FoodCategoryId | null>(null);

  const stores = useMemo(() => {
    const t = norm(q.trim());
    return FOOD_STORES.filter((s) => s.city === city && (!cat || s.category === cat)
      && (!t || norm(s.name).includes(t) || norm(categoryLabel(s.category)).includes(t) || s.menu.some((i) => norm(i.name).includes(t))));
  }, [city, q, cat]);

  const active = state?.orders.find((o) => {
    const status = o.cancelledAt ? "cancelled" : simulatedStatus((now ?? o.createdAt) - o.createdAt, o.fulfillment);
    return !isFinal(status);
  });
  const activeStatus = active && now ? simulatedStatus(now - active.createdAt, active.fulfillment) : null;

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between pt-1">
        <OrbiFoodLogo variant="a" size={26} />
      </header>

      {active && activeStatus && (
        <Link href={`/passageiro/food/pedido/${active.id}`} className="card flex items-center gap-3 p-4" data-testid="food-active-order">
          <IconGlyph name="receipt" size={44} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-muted">Pedido em andamento</span>
            <span className="block truncate font-semibold">{active.storeName}</span>
            <span className="block text-sm font-semibold text-brand">{STATUS_LABEL[activeStatus]}</span>
          </span>
        </Link>
      )}

      <div className="space-y-3">
        <label className="block">
          <span className="sr-only">Cidade</span>
          <select className="input" value={city} onChange={(e) => setCity(e.target.value as FoodCityId)} aria-label="Cidade">
            {FOOD_CITIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <input type="search" className="input" placeholder="Buscar loja ou prato" aria-label="Buscar loja ou prato" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div role="group" aria-label="Categorias" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {FOOD_CATEGORIES.map((k) => {
          const on = cat === k.id;
          return (
            <button key={k.id} type="button" aria-pressed={on} onClick={() => setCat(on ? null : k.id)}
              className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${on ? "bg-ink text-bg" : "bg-surface-2 text-ink"}`}>
              <IconGlyph name={CATEGORY_GLYPH[k.id]} size={20} bare tone={on ? "glass" : "brand"} />{k.label}
            </button>
          );
        })}
      </div>

      {stores.length === 0 ? (
        <Empty icon="store" title="Nenhuma loja por aqui">Tente outra categoria, outra cidade ou outra busca.</Empty>
      ) : (
        <ul className="space-y-3" aria-label="Lojas">
          {stores.map((s) => {
            const turns = state?.turns[s.id] ?? s.turns;
            const open = now ? isOpenAt(turns, brasiliaMinutes(new Date(now))) : null;
            return (
              <li key={s.id}>
                <Link href={`/passageiro/food/${s.id}`} className="card flex gap-3 p-3">
                  <FoodArt store={s} compact className="size-20 rounded-2xl" />
                  <span className="min-w-0 flex-1 py-0.5">
                    <span className="block truncate font-semibold">{s.name}</span>
                    <span className="block text-sm text-muted">{categoryLabel(s.category)} · {s.etaMin}-{s.etaMax} min</span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <span className="font-semibold">{s.deliveryFeeCents === null ? "Retirada" : `Entrega ${brl(s.deliveryFeeCents)}`}</span>
                      {open !== null && <Badge tone={open ? "ok" : "neutral"}>{open ? "Aberta" : "Fechada"}</Badge>}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
