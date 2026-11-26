"use client";
import { useEffect, useRef, useState } from "react";
import { Badge, Note } from "@/frontend/components/ui";
import { InterestButton } from "@/frontend/components/food/InterestButton";
import { FoodCalculator } from "@/frontend/components/food/FoodCalculator";
import { OrbiFoodLogo } from "@/frontend/components/OrbiFoodLogo";
import { useFoodState, useNow } from "@/frontend/lib/food-storage";
import { commissionBpsFor, FOOD_STORES } from "@/shared/food/demo-data";
import { brasiliaMinutes, isOpenAt, turnError } from "@/shared/food/hours";
import { actionLabel, canTransition, delayAlert, isFinal, nextStatus, STATUS_LABEL } from "@/shared/food/order-state";
import { quoteOrder } from "@/shared/food/pricing";
import type { CartLine, FoodStatus, Fulfillment, Turn } from "@/shared/food/types";
import { brl } from "@/shared/pricing";

type PanelOrder = { id: string; code: string; customer: string; lines: CartLine[]; fulfillment: Fulfillment; status: FoodStatus; since: number; fresh: boolean };
const CUSTOMERS = ["Marina", "Carlos", "Juliana", "Pedro", "Aline", "Rafael", "Bianca", "Lucas"];
const MIN = 60_000;

/** Pedido simulado a partir do cardápio da loja (itens e quantidades determinísticos pelo número do pedido). */
function fakeOrder(storeId: string, n: number, status: FoodStatus, ageMs: number, now: number, fresh = false): PanelOrder {
  const store = FOOD_STORES.find((s) => s.id === storeId)!;
  const pick = (k: number): CartLine => {
    const it = store.menu[(n * 2 + k * 3) % store.menu.length];
    return { key: `${it.id}-${n}-${k}`, itemId: it.id, name: it.name, baseCents: it.priceCents, options: [], qty: 1 + ((n + k) % 2) };
  };
  const delivery = store.deliveryFeeCents !== null && n % 3 !== 0;
  return { id: `${storeId}-${n}`, code: `F${4200 + n * 7}`, customer: CUSTOMERS[n % CUSTOMERS.length], lines: [pick(0), pick(1)], fulfillment: delivery ? "delivery" : "pickup", status, since: now - ageMs, fresh };
}

const tone = (s: FoodStatus) => (s === "pending" ? "warn" : s === "cancelled" ? "danger" : isFinal(s) ? "ok" : "brand") as "warn" | "danger" | "ok" | "brand";

function Orders({ storeId }: { storeId: string }) {
  const store = FOOD_STORES.find((s) => s.id === storeId)!;
  const now = useNow(1000);
  const [orders, setOrders] = useState<PanelOrder[]>([]);
  const [alertText, setAlertText] = useState("");
  const counter = useRef(10);

  // Pedidos de exemplo: um parado há 7 min, um em preparo há 34 min e um pronto. Depois, chega um novo a cada 25 s (até 4).
  useEffect(() => {
    const t = Date.now();
    setOrders([fakeOrder(storeId, 1, "pending", 7 * MIN, t), fakeOrder(storeId, 2, "preparing", 34 * MIN, t), fakeOrder(storeId, 3, "ready", 2 * MIN, t)]);
    setAlertText("");
    counter.current = 10;
    let sent = 0;
    const id = setInterval(() => {
      if (sent >= 4) { clearInterval(id); return; }
      sent++;
      const o = fakeOrder(storeId, counter.current++, "pending", 0, Date.now(), true);
      setOrders((cur) => [o, ...cur]);
      setAlertText(`Novo pedido ${o.code} de ${o.customer}!`);
    }, 25_000);
    return () => clearInterval(id);
  }, [storeId]);

  const advance = (id: string, to: FoodStatus) => setOrders((cur) => cur.map((o) => (o.id === id && canTransition(o.status, to, o.fulfillment) ? { ...o, status: to, since: Date.now(), fresh: false } : o)));
  const live = orders.filter((o) => !isFinal(o.status));
  const done = orders.filter((o) => isFinal(o.status));

  return (
    <div className="space-y-4">
      {alertText && (
        <div role="alert" className="flex items-center gap-3 rounded-2xl bg-[var(--primary)] px-4 py-3 font-semibold text-white" data-testid="new-order-alert">
          <span className="size-3 shrink-0 animate-ping rounded-full bg-white motion-reduce:animate-none" />{alertText}
        </div>
      )}
      {live.length === 0 && <Note>Nenhum pedido em andamento. Os novos aparecem aqui com um aviso.</Note>}
      <ul className="space-y-3" aria-label="Pedidos em andamento">
        {live.map((o) => {
          const q = quoteOrder(o.lines, o.fulfillment, store.deliveryFeeCents, commissionBpsFor(o.fulfillment));
          const late = now ? delayAlert(o.status, now - o.since) : null;
          const label = actionLabel(o.status, o.fulfillment);
          return (
            <li key={o.id} className={`card space-y-3 p-4 ${o.fresh ? "ring-2 ring-[var(--primary)]" : ""} ${late ? "ring-2 ring-[var(--warn)]" : ""}`} data-testid={`order-${o.code}`}>
              <div className="flex items-start justify-between gap-2">
                <div><p className="font-bold">{o.code} · {o.customer}</p><p className="text-sm text-muted">{o.fulfillment === "delivery" ? "Entrega" : "Retirada no balcão"}</p></div>
                <Badge tone={tone(o.status)}>{STATUS_LABEL[o.status]}</Badge>
              </div>
              <p className="text-sm">{o.lines.map((l) => `${l.qty}x ${l.name}`).join(", ")}</p>
              <p className="text-sm text-muted">Total {brl(q.totalCents)} · você recebe {brl(q.storeNetCents)} <span className="whitespace-nowrap">(comissão {(q.commissionBps / 100).toLocaleString("pt-BR")}% = {brl(q.commissionCents)})</span></p>
              {late && <p role="alert" className="rounded-xl bg-[color-mix(in_srgb,var(--warn)_14%,transparent)] px-3 py-2 text-sm font-semibold text-warn">Atraso: {late.text}</p>}
              <div className="flex gap-2">
                {label && <button type="button" className="btn btn-primary min-w-0 flex-1" onClick={() => advance(o.id, nextStatus(o.status, o.fulfillment)!)}>{label}</button>}
                {o.status === "pending" && <button type="button" className="btn btn-ghost" onClick={() => advance(o.id, "cancelled")}>Recusar</button>}
              </div>
            </li>
          );
        })}
      </ul>
      {done.length > 0 && (
        <section aria-label="Concluídos"><h3 className="mb-2 text-sm font-semibold text-muted">Concluídos</h3>
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {done.map((o) => <li key={o.id} className="flex justify-between gap-2 px-4 py-3 text-sm"><span>{o.code} · {o.customer}</span><span className="text-muted">{STATUS_LABEL[o.status]}</span></li>)}
          </ul>
        </section>
      )}
    </div>
  );
}

function Menu({ storeId }: { storeId: string }) {
  const store = FOOD_STORES.find((s) => s.id === storeId)!;
  const { state, update } = useFoodState();
  const off = new Set(state?.off[storeId] ?? []);
  const toggle = (id: string) => update((s) => {
    const cur = new Set(s.off[storeId] ?? []);
    if (cur.has(id)) cur.delete(id); else cur.add(id);
    return { ...s, off: { ...s.off, [storeId]: [...cur] } };
  });
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Item desligado some do cardápio do app (neste aparelho, na demonstração).</p>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {store.menu.map((i) => {
          const on = !off.has(i.id);
          return (
            <li key={i.id} className="flex min-h-16 items-center gap-3 px-4 py-2">
              <span className="min-w-0 flex-1"><span className="block font-semibold">{i.name}</span><span className="text-sm text-muted">{brl(i.priceCents)}</span></span>
              <button type="button" role="switch" aria-checked={on} aria-label={`${i.name}: ${on ? "ligado" : "desligado"}`} onClick={() => toggle(i.id)}
                className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${on ? "bg-[var(--primary)]" : "bg-line"}`}>
                <span className={`absolute top-1 size-6 rounded-full bg-white transition-all ${on ? "left-7" : "left-1"}`} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Hours({ storeId }: { storeId: string }) {
  const store = FOOD_STORES.find((s) => s.id === storeId)!;
  const { state, update } = useFoodState();
  const now = useNow(30000);
  const saved = state?.turns[storeId] ?? store.turns;
  const [draft, setDraft] = useState<Turn[] | null>(null);
  const [ok, setOk] = useState(false);
  const turns = draft ?? saved;
  const errors = turns.map(turnError);
  const set = (i: number, patch: Partial<Turn>) => { setOk(false); setDraft(turns.map((t, j) => (j === i ? { ...t, ...patch } : t))); };
  const open = now ? isOpenAt(saved, brasiliaMinutes(new Date(now))) : null;
  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-sm">Agora: {open === null ? "…" : <Badge tone={open ? "ok" : "neutral"}>{open ? "Aberta" : "Fechada"}</Badge>}</p>
      <ul className="space-y-3">
        {turns.map((t, i) => (
          <li key={i} className="card space-y-2 p-4">
            <p className="font-semibold">Turno {i + 1}</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-semibold">Abre<input type="time" className="input mt-1" value={t.open} onChange={(e) => set(i, { open: e.target.value })} aria-label={`Turno ${i + 1}, abre`} /></label>
              <label className="block text-sm font-semibold">Fecha<input type="time" className="input mt-1" value={t.close} onChange={(e) => set(i, { close: e.target.value })} aria-label={`Turno ${i + 1}, fecha`} /></label>
            </div>
            {errors[i] && <p role="alert" className="text-sm font-medium text-danger">{errors[i]}</p>}
            {turns.length > 1 && <button type="button" className="min-h-11 text-sm font-semibold text-danger" onClick={() => { setOk(false); setDraft(turns.filter((_, j) => j !== i)); }}>Remover turno</button>}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        {turns.length < 3 && <button type="button" className="btn btn-soft flex-1" onClick={() => { setOk(false); setDraft([...turns, { open: "18:00", close: "22:00" }]); }}>Adicionar turno</button>}
        <button type="button" className="btn btn-primary flex-1" disabled={!draft || errors.some(Boolean)} onClick={() => { update((s) => ({ ...s, turns: { ...s.turns, [storeId]: turns } })); setDraft(null); setOk(true); }}>Salvar horários</button>
      </div>
      {ok && <p role="status" className="text-sm font-semibold text-ok">Horários salvos neste aparelho.</p>}
    </div>
  );
}

const TABS = [["pedidos", "Pedidos"], ["cardapio", "Cardápio"], ["horarios", "Horários"], ["calculadora", "Quanto sobra"]] as const;

/** Painel da loja (demonstração). Qualquer pessoa logada abre; os pedidos são simulados e nada é gravado no servidor. */
export function ShopPanel() {
  const [storeId, setStoreId] = useState(FOOD_STORES[0].id);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("pedidos");
  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <OrbiFoodLogo variant="a" size={24} />
        <span className="rounded-full bg-surface-2 px-3 py-1 text-sm font-semibold">Painel da loja</span>
      </header>
      <label className="block"><span className="sr-only">Loja</span>
        <select className="input" value={storeId} onChange={(e) => setStoreId(e.target.value)} aria-label="Loja">
          {FOOD_STORES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <div role="tablist" aria-label="Painel da loja" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls="panel-loja" onClick={() => setTab(id)}
            className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${tab === id ? "bg-ink text-bg" : "bg-surface-2"}`}>{label}</button>
        ))}
      </div>
      <div role="tabpanel" id="panel-loja" aria-labelledby={`tab-${tab}`}>
        {tab === "pedidos" && <Orders key={storeId} storeId={storeId} />}
        {tab === "cardapio" && <Menu storeId={storeId} />}
        {tab === "horarios" && <Hours key={storeId} storeId={storeId} />}
        {tab === "calculadora" && (
          <div className="space-y-6">
            <div><h2 className="display text-xl">Quanto sobra para a sua loja</h2><p className="mt-1 text-sm text-muted">Compare o que você paga hoje com o Orbi Food.</p></div>
            <FoodCalculator />
            <InterestButton />
          </div>
        )}
      </div>
    </div>
  );
}
