"use client";
import Link from "next/link";
import { useState } from "react";
import { Badge, Empty, Note, Spinner } from "@/frontend/components/ui";
import { Icon } from "@/frontend/components/Icon";
import { FoodArt } from "@/frontend/components/food/parts";
import { HeartButton, Sheet, StarPicker, Stars, SubHeader } from "@/frontend/components/food/FoodUi";
import { COMPLAINT_REASONS, useFoodState, useNow, type FoodOrder, type FoodState } from "@/frontend/lib/food-storage";
import { cityName, FOOD_COUPONS, storeById, type FoodCoupon } from "@/shared/food/demo-data";
import { isFinal, simulatedStatus, STATUS_LABEL } from "@/shared/food/order-state";
import { itemCount, lineTotalCents, subtotalCents } from "@/shared/food/pricing";
import type { FoodStatus } from "@/shared/food/types";
import { brl } from "@/shared/pricing";

const TONE_BG = ["linear-gradient(135deg, #0A1E3D, #0356C5)", "linear-gradient(135deg, #0356C5, #0A3BFF)", "linear-gradient(135deg, #0B6BFF, #0A3BFF)", "linear-gradient(135deg, #02060E, #0A3BFF 120%)"];

// ------------------------------------------------------------------ cupons

function CouponCard({ c }: { c: FoodCoupon }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(c.code); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
  };
  return (
    <li className="card overflow-hidden" data-testid="coupon">
      <div className="flex items-center gap-3 px-4 py-3 text-white" style={{ background: TONE_BG[c.tone] }}>
        <Icon name="ticket" size={26} weight="duotone" />
        <h2 className="min-w-0 flex-1 font-bold">{c.title}</h2>
        <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-bold tracking-wide uppercase">Demonstração</span>
      </div>
      <div className="space-y-3 p-4">
        <p className="text-sm">{c.rule}</p>
        <p className="text-sm text-muted">Válido até {c.validUntil}</p>
        <div className="flex items-center gap-3">
          <span className="min-h-11 flex-1 rounded-2xl border border-dashed border-[var(--primary)] bg-tint px-4 py-2.5 text-center font-bold tracking-widest">{c.code}</span>
          <button type="button" className="btn btn-soft" onClick={copy}>{copied ? "Copiado" : "Copiar"}</button>
        </div>
      </div>
    </li>
  );
}

/** Cupons disponíveis. Lista fictícia: o cupom não abate nada no checkout da demonstração. */
export function CouponsView() {
  return (
    <div className="space-y-4">
      <SubHeader title="Cupons" />
      <Note>Cupons de demonstração: servem para ver como a tela vai ficar. Nenhum desconto é aplicado de verdade.</Note>
      <ul className="space-y-3" aria-label="Cupons disponíveis">{FOOD_COUPONS.map((c) => <CouponCard key={c.id} c={c} />)}</ul>
    </div>
  );
}

// ------------------------------------------------------------------ pedidos

const statusOf = (o: FoodOrder, now: number): FoodStatus => (o.cancelledAt ? "cancelled" : simulatedStatus(now - o.createdAt, o.fulfillment));
const when = (ms: number) => new Date(ms).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

type Store = { state: FoodState; update: (fn: (s: FoodState) => FoodState) => void };

function ReviewSheet({ order, onClose, state, update }: { order: FoodOrder; onClose: () => void } & Store) {
  const prev = state.reviews[order.id];
  const [stars, setStars] = useState(prev?.stars ?? 0);
  const [comment, setComment] = useState(prev?.comment ?? "");
  const [tried, setTried] = useState(false);
  const save = () => {
    if (stars < 1) { setTried(true); return; }
    update((s) => ({ ...s, reviews: { ...s.reviews, [order.id]: { stars, comment: comment.trim().slice(0, 500), at: Date.now() } } }));
    onClose();
  };
  return (
    <Sheet title="Avaliar pedido" onClose={onClose} testId="review-sheet" footer={<button type="button" className="btn btn-primary w-full" onClick={save}>Enviar avaliação</button>}>
      <div className="space-y-4">
        <p className="text-sm text-muted">{order.storeName} · pedido {order.code}</p>
        <StarPicker value={stars} onChange={setStars} />
        {tried && stars < 1 && <p role="alert" className="text-sm font-medium text-danger">Escolha de 1 a 5 estrelas.</p>}
        <label className="block"><span className="mb-1.5 block text-sm font-semibold">Comentário (opcional)</span>
          <textarea className="input min-h-28 w-full rounded-2xl" maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Como foi o pedido?" /></label>
        <p className="text-xs text-muted">Demonstração: a avaliação fica só neste aparelho.</p>
      </div>
    </Sheet>
  );
}

function ComplaintSheet({ order, onClose, update }: { order: FoodOrder; onClose: () => void } & Store) {
  const [reason, setReason] = useState<string>(COMPLAINT_REASONS[0]);
  const [text, setText] = useState("");
  const [tried, setTried] = useState(false);
  const send = () => {
    if (text.trim().length < 10) { setTried(true); return; }
    update((s) => ({ ...s, complaints: { ...s.complaints, [order.id]: { reason, text: text.trim().slice(0, 1000), at: Date.now() } } }));
    onClose();
  };
  return (
    <Sheet title="Reclamar da loja" onClose={onClose} testId="complaint-sheet" footer={<button type="button" className="btn btn-primary w-full" onClick={send}>Enviar reclamação</button>}>
      <div className="space-y-4">
        <p className="text-sm text-muted">{order.storeName} · pedido {order.code}</p>
        <label className="block"><span className="mb-1.5 block text-sm font-semibold">Motivo</span>
          <select className="input w-full" value={reason} onChange={(e) => setReason(e.target.value)}>{COMPLAINT_REASONS.map((r) => <option key={r}>{r}</option>)}</select></label>
        <label className="block"><span className="mb-1.5 block text-sm font-semibold">O que aconteceu</span>
          <textarea className="input min-h-28 w-full rounded-2xl" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Conte com detalhes (mínimo 10 letras)." aria-invalid={tried && text.trim().length < 10} /></label>
        {tried && text.trim().length < 10 && <p role="alert" className="text-sm font-medium text-danger">Descreva o que aconteceu, com pelo menos 10 letras.</p>}
        <p className="text-xs text-muted">Demonstração: a reclamação não é enviada a ninguém; fica só neste aparelho.</p>
      </div>
    </Sheet>
  );
}

function OrderCard({ o, now, state, update }: { o: FoodOrder; now: number } & Store) {
  const [sheet, setSheet] = useState<"review" | "complaint" | null>(null);
  const status = statusOf(o, now);
  const done = status === "delivered" || status === "picked_up";
  const review = state.reviews[o.id];
  const complaint = state.complaints[o.id];
  const tone = done ? "ok" : status === "cancelled" ? "danger" : "brand";
  return (
    <li className="card space-y-3 p-4" data-testid={`my-order-${o.code}`}>
      <div className="flex items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{o.storeName}</span>
          <span className="block text-sm text-muted">Pedido {o.code} · {when(o.createdAt)}</span>
        </span>
        <Badge tone={tone}>{STATUS_LABEL[status]}</Badge>
      </div>
      <ul className="space-y-1 text-sm">
        {o.lines.map((l) => (
          <li key={l.key} className="flex justify-between gap-3"><span className="min-w-0">{l.qty}x {l.name}{l.options.length ? ` (${l.options.map((x) => x.label).join(", ")})` : ""}</span><span className="shrink-0">{brl(lineTotalCents(l))}</span></li>
        ))}
      </ul>
      <p className="flex justify-between border-t border-line pt-2 font-bold"><span>Total</span><span>{brl(o.quote.totalCents)}</span></p>

      {review && (
        <div className="rounded-2xl bg-surface-2 p-3 text-sm">
          <p className="flex items-center gap-2 font-semibold">Sua avaliação <Stars value={review.stars} /></p>
          {review.comment && <p className="mt-1 text-muted">{review.comment}</p>}
        </div>
      )}
      {complaint && (
        <div className="rounded-2xl bg-surface-2 p-3 text-sm">
          <p className="font-semibold">Reclamação registrada: {complaint.reason}</p>
          <p className="mt-1 text-muted">{complaint.text}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!isFinal(status) && <Link href={`/passageiro/food/pedido/${o.id}`} className="btn btn-primary min-h-11 flex-1">Acompanhar</Link>}
        {done && <button type="button" className="btn btn-soft min-h-11 flex-1" onClick={() => setSheet("review")}>{review ? "Editar avaliação" : "Avaliar pedido"}</button>}
        {status !== "cancelled" && !complaint && <button type="button" className="btn btn-ghost min-h-11 flex-1" onClick={() => setSheet("complaint")}>Reclamar da loja</button>}
        {isFinal(status) && <Link href={`/passageiro/food/${o.storeId}`} className="btn btn-ghost min-h-11 flex-1">Pedir de novo</Link>}
      </div>
      {sheet === "review" && <ReviewSheet order={o} state={state} update={update} onClose={() => setSheet(null)} />}
      {sheet === "complaint" && <ComplaintSheet order={o} state={state} update={update} onClose={() => setSheet(null)} />}
    </li>
  );
}

/** Ficha de pedidos: histórico dos pedidos simulados deste aparelho, com avaliação e reclamação. */
export function OrdersView() {
  const { state, update } = useFoodState();
  const now = useNow(5000);
  return (
    <div className="space-y-4">
      <SubHeader title="Meus pedidos" />
      {!state || now === null ? <Spinner /> : state.orders.length === 0 ? (
        <Empty icon="clipboard" title="Nenhum pedido ainda">Quando você pedir, o histórico aparece aqui. <Link href="/passageiro/food" className="font-semibold text-brand">Ver lojas</Link></Empty>
      ) : (
        <>
          <Note>Pedidos simulados, guardados só neste aparelho.</Note>
          <ul className="space-y-3" aria-label="Pedidos">{state.orders.map((o) => <OrderCard key={o.id} o={o} now={now} state={state} update={update} />)}</ul>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ carrinho e favoritos

/** Carrinho (sacolas por loja, ainda não finalizadas) e Favoritos (lojas e itens com coração). */
export function CartView() {
  const { state, update } = useFoodState();
  const [tab, setTab] = useState<"carrinho" | "favoritos">("carrinho");
  const bags = state ? Object.entries(state.carts).filter(([id, l]) => l.length > 0 && storeById(id)) : [];
  const favStores = state ? state.favStores.map(storeById).filter((s) => !!s) : [];
  const favItems = state ? state.favItems.flatMap((k) => {
    const [sid, iid] = k.split(":");
    const store = storeById(sid);
    const item = store?.menu.find((i) => i.id === iid);
    return store && item ? [{ key: k, store, item }] : [];
  }) : [];
  const tabCls = (on: boolean) => `min-h-11 flex-1 rounded-full text-sm font-semibold ${on ? "bg-ink text-bg" : "text-ink"}`;
  return (
    <div className="space-y-4">
      <SubHeader title="Carrinho" />
      <div role="tablist" aria-label="Carrinho e favoritos" className="flex gap-1 rounded-full bg-surface-2 p-1">
        <button type="button" role="tab" id="tab-carrinho" aria-selected={tab === "carrinho"} aria-controls="panel-cart" className={tabCls(tab === "carrinho")} onClick={() => setTab("carrinho")}>Carrinho{bags.length ? ` (${bags.length})` : ""}</button>
        <button type="button" role="tab" id="tab-favoritos" aria-selected={tab === "favoritos"} aria-controls="panel-cart" className={tabCls(tab === "favoritos")} onClick={() => setTab("favoritos")}>Favoritos{favStores.length + favItems.length ? ` (${favStores.length + favItems.length})` : ""}</button>
      </div>
      <div role="tabpanel" id="panel-cart" aria-labelledby={`tab-${tab}`} className="space-y-3">
        {!state ? <Spinner /> : tab === "carrinho" ? (
          bags.length === 0 ? <Empty icon="bag" title="Seu carrinho está vazio">Escolha uma loja e adicione itens. <Link href="/passageiro/food" className="font-semibold text-brand">Ver lojas</Link></Empty> : (
            <ul className="space-y-3" aria-label="Sacolas">
              {bags.map(([id, lines]) => {
                const s = storeById(id)!;
                const n = itemCount(lines);
                return (
                  <li key={id} className="card space-y-3 p-4" data-testid={`bag-${id}`}>
                    <div className="flex items-center gap-3">
                      <FoodArt store={s} compact className="size-14 rounded-2xl" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{s.name}</span>
                        <span className="block text-sm text-muted">{cityName(s.city)} · {n} {n === 1 ? "item" : "itens"}</span>
                      </span>
                      <span className="font-bold">{brl(subtotalCents(lines))}</span>
                    </div>
                    <ul className="space-y-0.5 text-sm text-muted">{lines.slice(0, 3).map((l) => <li key={l.key} className="truncate">{l.qty}x {l.name}</li>)}{lines.length > 3 && <li>e mais {lines.length - 3}</li>}</ul>
                    <div className="flex gap-2">
                      <Link href={`/passageiro/food/${id}/sacola`} className="btn btn-primary min-h-11 flex-1">Continuar pedido</Link>
                      <button type="button" className="btn btn-ghost min-h-11" aria-label={`Esvaziar sacola de ${s.name}`} onClick={() => update((st) => ({ ...st, carts: { ...st.carts, [id]: [] } }))}>Esvaziar</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        ) : (
          favStores.length + favItems.length === 0 ? <Empty icon="heart" title="Nada favoritado ainda">Toque no coração de uma loja ou de um item para guardar aqui.</Empty> : (
            <>
              {favStores.length > 0 && (
                <section aria-label="Lojas favoritas" className="space-y-2">
                  <h2 className="font-semibold">Lojas</h2>
                  <ul className="space-y-2">
                    {favStores.map((s) => (
                      <li key={s!.id} className="card relative">
                        <Link href={`/passageiro/food/${s!.id}`} className="flex items-center gap-3 p-3 pr-14">
                          <FoodArt store={s!} compact className="size-14 rounded-2xl" />
                          <span className="min-w-0"><span className="block truncate font-semibold">{s!.name}</span><span className="block text-sm text-muted">{cityName(s!.city)} · {s!.etaMin}-{s!.etaMax} min</span></span>
                        </Link>
                        <HeartButton on onToggle={() => update((st) => ({ ...st, favStores: st.favStores.filter((x) => x !== s!.id) }))} label={s!.name} className="absolute top-1/2 right-1 -translate-y-1/2" />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {favItems.length > 0 && (
                <section aria-label="Itens favoritos" className="space-y-2">
                  <h2 className="font-semibold">Itens</h2>
                  <ul className="space-y-2">
                    {favItems.map(({ key, store, item }) => (
                      <li key={key} className="card relative">
                        <Link href={`/passageiro/food/${store.id}`} className="block min-h-14 p-3 pr-14">
                          <span className="block font-semibold">{item.name}</span>
                          <span className="block text-sm text-muted">{store.name} · {brl(item.priceCents)}</span>
                        </Link>
                        <HeartButton on onToggle={() => update((st) => ({ ...st, favItems: st.favItems.filter((x) => x !== key) }))} label={item.name} className="absolute top-1/2 right-1 -translate-y-1/2" />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )
        )}
      </div>
    </div>
  );
}
