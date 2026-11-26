"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge, Empty, Note } from "@/frontend/components/ui";
import { Icon } from "@/frontend/components/Icon";
import { BackLink, BottomBar, FoodArt, Stepper } from "@/frontend/components/food/parts";
import { HeartButton } from "@/frontend/components/food/FoodUi";
import { useFoodState, useNow } from "@/frontend/lib/food-storage";
import { categoryLabel, storeById } from "@/shared/food/demo-data";
import { brasiliaMinutes, isOpenAt, turnLabel } from "@/shared/food/hours";
import { addLine, buildLine, itemCount, selectionErrors, subtotalCents } from "@/shared/food/pricing";
import type { FoodItem, OptionGroup } from "@/shared/food/types";
import { brl } from "@/shared/pricing";

/** Folha inferior do item: opcionais (escolha única ou múltipla, obrigatório, preço extra) e quantidade. */
function ItemSheet({ item, canOrder, onClose, onAdd }: { item: FoodItem; canOrder: boolean; onClose: () => void; onAdd: (sel: Record<string, string[]>, qty: number) => void }) {
  const [sel, setSel] = useState<Record<string, string[]>>({});
  const [qty, setQty] = useState(1);
  const [tried, setTried] = useState(false);
  const errors = selectionErrors(item, sel);
  const line = buildLine(item, sel, qty);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [onClose]);

  const pick = (g: OptionGroup, id: string) => setSel((s) => {
    const cur = s[g.id] ?? [];
    if (g.max === 1) return { ...s, [g.id]: cur[0] === id && !g.required ? [] : [id] };
    return { ...s, [g.id]: cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < g.max ? [...cur, id] : cur };
  });

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={item.name} data-testid="item-sheet">
      <button type="button" aria-label="Fechar" className="absolute inset-0 bg-black/45" onClick={onClose} tabIndex={-1} />
      <div className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[90svh] max-w-lg flex-col rounded-t-3xl bg-surface md:bottom-8 md:rounded-3xl">
        <div className="flex items-start gap-3 px-5 pt-5">
          <div className="min-w-0 flex-1">
            <h2 className="display text-xl">{item.name}</h2>
            <p className="mt-1 text-sm text-muted">{item.description}</p>
            <p className="mt-2 font-semibold">{brl(item.priceCents)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2"><Icon name="close" size={20} /></button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {(item.groups ?? []).map((g) => {
            const cur = sel[g.id] ?? [];
            const full = g.max > 1 && cur.length >= g.max;
            return (
              <fieldset key={g.id}>
                <legend className="mb-2 flex w-full items-center justify-between gap-2 font-semibold">
                  <span>{g.label}</span>
                  <Badge tone="neutral">{g.required ? "Obrigatório" : g.max > 1 ? `Até ${g.max}` : "Opcional"}</Badge>
                </legend>
                <div className="divide-y divide-line rounded-2xl bg-surface-2">
                  {g.options.map((o) => {
                    const on = cur.includes(o.id);
                    return (
                      <label key={o.id} className={`flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2 ${full && !on ? "opacity-50" : ""}`}>
                        <input type={g.max === 1 && g.required ? "radio" : "checkbox"} name={g.id} className="size-5 accent-[var(--primary)]" checked={on}
                          disabled={full && !on} onChange={() => pick(g, o.id)} />
                        <span className="flex-1">{o.label}</span>
                        {o.extraCents > 0 && <span className="text-sm text-muted">+ {brl(o.extraCents)}</span>}
                      </label>
                    );
                  })}
                </div>
                {tried && errors[g.id] && <p role="alert" className="mt-1.5 text-sm font-medium text-danger">{errors[g.id]}</p>}
              </fieldset>
            );
          })}
        </div>

        <div className="flex items-center gap-3 border-t border-line px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <Stepper qty={qty} onChange={(n) => setQty(Math.min(20, Math.max(1, n)))} label="Quantidade" />
          <button type="button" className="btn btn-primary min-w-0 flex-1" disabled={!canOrder}
            onClick={() => { if (!line) { setTried(true); return; } onAdd(sel, qty); }}>
            Adicionar · {brl(line ? line.baseCents * qty + line.options.reduce((s, o) => s + o.extraCents, 0) * qty : item.priceCents * qty)}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Tela da loja: capa, cardápio por categoria, folha do item e a barra "Ver sacola". */
export function StoreView({ storeId }: { storeId: string }) {
  const store = storeById(storeId);
  const { state, update } = useFoodState();
  const now = useNow(30000);
  const [open, setOpen] = useState<FoodItem | null>(null);
  const [added, setAdded] = useState("");

  const off = useMemo(() => new Set(state?.off[storeId] ?? []), [state, storeId]);
  const sections = useMemo(() => {
    const m = new Map<string, FoodItem[]>();
    for (const i of store?.menu ?? []) if (!off.has(i.id)) m.set(i.section, [...(m.get(i.section) ?? []), i]);
    return [...m.entries()];
  }, [store, off]);

  if (!store) return <Empty icon="store" title="Loja não encontrada"><Link href="/passageiro/food" className="font-semibold text-brand">Voltar ao Food</Link></Empty>;

  const turns = state?.turns[store.id] ?? store.turns;
  const isOpen = now ? isOpenAt(turns, brasiliaMinutes(new Date(now))) : null;
  const lines = state?.carts[store.id] ?? [];
  const count = itemCount(lines);

  const favStore = !!state?.favStores.includes(store.id);
  const toggleStore = () => update((s) => ({ ...s, favStores: s.favStores.includes(store.id) ? s.favStores.filter((x) => x !== store.id) : [...s.favStores, store.id] }));
  const toggleItem = (id: string) => { const k = `${store.id}:${id}`; update((s) => ({ ...s, favItems: s.favItems.includes(k) ? s.favItems.filter((x) => x !== k) : [...s.favItems, k] })); };

  const add = (item: FoodItem, sel: Record<string, string[]>, qty: number) => {
    const line = buildLine(item, sel, qty);
    if (!line) return;
    update((s) => ({ ...s, carts: { ...s.carts, [store.id]: addLine(s.carts[store.id] ?? [], line) } }));
    setOpen(null);
    setAdded(`${item.name} foi para a sacola.`);
  };

  return (
    <div className={`space-y-5 ${count ? "pb-24" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <BackLink href="/passageiro/food">← Lojas</BackLink>
      </div>
      <div className="relative">
        <FoodArt store={store} className="h-44 rounded-3xl" />
        <HeartButton on={favStore} onToggle={toggleStore} label={store.name} overlay className="absolute top-2 right-2" />
      </div>
      <div>
        <h1 className="text-2xl font-semibold">{store.name}</h1>
        <p className="mt-1 text-sm text-muted">{store.blurb}</p>
        <p className="mt-2 text-sm">
          {categoryLabel(store.category)} · {store.etaMin}-{store.etaMax} min · <span className={store.deliveryFeeCents === 0 ? "font-medium text-ok" : "font-medium"}>{store.deliveryFeeCents === null ? "Só retirada" : store.deliveryFeeCents === 0 ? "Entrega grátis" : `Entrega ${brl(store.deliveryFeeCents)}`}</span>
          {isOpen === false && <span className="ml-2 rounded-md bg-surface-2 px-1.5 py-0.5 text-xs font-semibold text-muted">Fechada</span>}
        </p>
        <p className="mt-1 text-sm text-muted">Pedido mínimo {brl(store.minOrderCents)} · {turns.map(turnLabel).join(" e ") || "sem horário"}</p>
      </div>
      {isOpen === false && <Note tone="warn">Esta loja está fechada agora. Você pode ver o cardápio, mas só consegue pedir quando ela abrir.</Note>}
      <p role="status" className="sr-only">{added}</p>

      {sections.map(([title, items]) => (
        <section key={title} aria-label={title}>
          <h2 className="mb-2 text-lg font-semibold">{title}</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {items.map((i) => (
              <li key={i.id} className="flex items-center">
                <button type="button" onClick={() => setOpen(i)} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left active:bg-surface-2">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{i.name}</span>
                    <span className="mt-0.5 line-clamp-2 block text-sm text-muted">{i.description}</span>
                    <span className="mt-1 block text-sm font-semibold">{brl(i.priceCents)}</span>
                  </span>
                  <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink"><Icon name="plus" size={18} /></span>
                </button>
                <HeartButton on={!!state?.favItems.includes(`${store.id}:${i.id}`)} onToggle={() => toggleItem(i.id)} label={i.name} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {sections.length === 0 && <Empty icon="store" title="Cardápio indisponível agora" />}

      {open && <ItemSheet item={open} canOrder={isOpen !== false} onClose={() => setOpen(null)} onAdd={(sel, qty) => add(open, sel, qty)} />}

      {count > 0 && (
        <BottomBar>
          <Link href={`/passageiro/food/${store.id}/sacola`} className="btn btn-primary w-full justify-between" data-testid="view-bag">
            <span>Ver sacola · {count} {count === 1 ? "item" : "itens"}</span><span>{brl(subtotalCents(lines))}</span>
          </Link>
        </BottomBar>
      )}
    </div>
  );
}
