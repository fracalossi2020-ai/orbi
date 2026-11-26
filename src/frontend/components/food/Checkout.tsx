"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Empty, ErrorNote, Field, Note, Spinner } from "@/frontend/components/ui";
import { IconGlyph } from "@/frontend/components/IconGlyph";
import { BackLink, BottomBar, Stepper } from "@/frontend/components/food/parts";
import { newOrderCode, newOrderId, useFoodState, type FoodOrder } from "@/frontend/lib/food-storage";
import { commissionBpsFor, storeById } from "@/shared/food/demo-data";
import { itemCount, lineTotalCents, quoteOrder, setQty, subtotalCents } from "@/shared/food/pricing";
import type { CartLine, Fulfillment, PaymentChoice } from "@/shared/food/types";
import { brl } from "@/shared/pricing";

const optionsText = (l: CartLine) => l.options.map((o) => o.label).join(", ");

/** Sacola da loja: só itens e quantidades. Um carrinho por loja. */
export function BagView({ storeId }: { storeId: string }) {
  const store = storeById(storeId);
  const { state, update } = useFoodState();
  if (!store) return <Empty icon="store" title="Loja não encontrada" />;
  if (!state) return <Spinner />;
  const lines = state.carts[store.id] ?? [];
  const change = (key: string, qty: number) => update((s) => ({ ...s, carts: { ...s.carts, [store.id]: setQty(s.carts[store.id] ?? [], key, qty) } }));

  if (!lines.length) return (
    <div className="space-y-4">
      <BackLink href={`/passageiro/food/${store.id}`}>← Cardápio</BackLink>
      <Empty icon="store" title="Sua sacola está vazia"><Link href={`/passageiro/food/${store.id}`} className="font-semibold text-brand">Ver o cardápio de {store.name}</Link></Empty>
    </div>
  );
  const sub = subtotalCents(lines);
  return (
    <div className="space-y-5 pb-24">
      <BackLink href={`/passageiro/food/${store.id}`}>← Adicionar mais itens</BackLink>
      <div>
        <h1 className="display text-2xl">Sua sacola</h1>
        <p className="mt-1 text-sm text-muted">{store.name}</p>
      </div>
      <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {lines.map((l) => (
          <li key={l.key} className="flex items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{l.name}</span>
              {l.options.length > 0 && <span className="block text-sm text-muted">{optionsText(l)}</span>}
              <span className="mt-1 block text-sm font-semibold">{brl(lineTotalCents(l))}</span>
            </span>
            <Stepper qty={l.qty} min={0} onChange={(n) => change(l.key, n)} label={`Quantidade de ${l.name}`} />
          </li>
        ))}
      </ul>
      <p className="flex justify-between font-semibold"><span>Subtotal</span><span>{brl(sub)}</span></p>
      {sub < store.minOrderCents && <Note tone="warn">O pedido mínimo desta loja é {brl(store.minOrderCents)}. Faltam {brl(store.minOrderCents - sub)}.</Note>}
      <BottomBar>
        {sub >= store.minOrderCents
          ? <Link href={`/passageiro/food/${store.id}/checkout`} className="btn btn-primary w-full">Continuar · {brl(sub)}</Link>
          : <button type="button" className="btn btn-primary w-full" disabled>Continuar · {brl(sub)}</button>}
      </BottomBar>
    </div>
  );
}

function Choice({ checked, onChange, title, sub, extra, name, value }: { checked: boolean; onChange: () => void; title: string; sub?: string; extra?: string; name: string; value: string }) {
  return (
    <label className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 ${checked ? "border-[var(--primary)] bg-tint" : "border-line bg-surface"}`}>
      <input type="radio" name={name} value={value} className="size-5 accent-[var(--primary)]" checked={checked} onChange={onChange} />
      <span className="min-w-0 flex-1"><span className="block font-semibold">{title}</span>{sub && <span className="block text-sm text-muted">{sub}</span>}</span>
      {extra && <span className="text-sm font-semibold">{extra}</span>}
    </label>
  );
}

/** Checkout: como receber, como pagar e o resumo. O Pix é SIMULADO: nada é cobrado. */
export function CheckoutView({ storeId }: { storeId: string }) {
  const store = storeById(storeId);
  const router = useRouter();
  const { state, update } = useFoodState();
  const [fulfillment, setFulfillment] = useState<Fulfillment | null>(null);
  const [payment, setPayment] = useState<PaymentChoice>("pix");
  const [address, setAddress] = useState("Rua das Acácias, 120, Centro (endereço de exemplo)");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  if (!store) return <Empty icon="store" title="Loja não encontrada" />;
  if (!state || done) return <Spinner />;
  const lines = state.carts[store.id] ?? [];
  if (!lines.length) return (
    <div className="space-y-4">
      <BackLink href={`/passageiro/food/${store.id}`}>← Cardápio</BackLink>
      <Empty icon="store" title="Sua sacola está vazia" />
    </div>
  );

  const canDeliver = store.deliveryFeeCents !== null;
  const f: Fulfillment = fulfillment ?? (canDeliver ? "delivery" : "pickup");
  const quote = quoteOrder(lines, f, store.deliveryFeeCents, commissionBpsFor(f));
  const belowMin = quote.subtotalCents < store.minOrderCents;
  const addressOk = f === "pickup" || address.trim().length >= 8;

  const place = () => {
    setError("");
    if (belowMin) { setError(`O pedido mínimo desta loja é ${brl(store.minOrderCents)}.`); return; }
    if (!addressOk) { setError("Informe o endereço de entrega."); return; }
    setBusy(true);
    // Pix simulado: uma espera curta no lugar do provedor de pagamento. Dinheiro vai direto.
    setTimeout(() => {
      const order: FoodOrder = {
        id: newOrderId(), code: newOrderCode(), storeId: store.id, storeName: store.name, lines, fulfillment: f, payment,
        address: f === "delivery" ? address.trim() : null, quote, createdAt: Date.now(),
      };
      setDone(true);
      update((s) => ({ ...s, orders: [order, ...s.orders].slice(0, 20), carts: { ...s.carts, [store.id]: [] } }));
      router.push(`/passageiro/food/pedido/${order.id}`);
    }, payment === "pix" ? 1400 : 300);
  };

  return (
    <div className="space-y-6 pb-24">
      <BackLink href={`/passageiro/food/${store.id}/sacola`}>← Sacola</BackLink>
      <div>
        <h1 className="display text-2xl">Finalizar pedido</h1>
        <p className="mt-1 text-sm text-muted">{store.name} · {itemCount(lines)} {itemCount(lines) === 1 ? "item" : "itens"}</p>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 font-semibold">Como receber</legend>
        {canDeliver && <Choice name="fulfillment" value="delivery" checked={f === "delivery"} onChange={() => setFulfillment("delivery")} title="Entrega pela loja" sub={`${store.etaMin}-${store.etaMax} min`} extra={brl(store.deliveryFeeCents!)} />}
        <Choice name="fulfillment" value="pickup" checked={f === "pickup"} onChange={() => setFulfillment("pickup")} title="Retirar no balcão" sub="Sem taxa de entrega" extra="Grátis" />
        {f === "delivery" && (
          <div className="pt-2"><Field label="Endereço de entrega"><input className="input" value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" maxLength={120} /></Field></div>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 font-semibold">Pagamento</legend>
        <Choice name="payment" value="pix" checked={payment === "pix"} onChange={() => setPayment("pix")} title="Pix" sub="Pagamento simulado na demonstração" />
        <Choice name="payment" value="cash" checked={payment === "cash"} onChange={() => setPayment("cash")} title={f === "delivery" ? "Dinheiro na entrega" : "Dinheiro no balcão"} sub="Pague quando receber" />
      </fieldset>

      <section aria-label="Resumo" className="card space-y-2 p-4">
        <h2 className="font-semibold">Resumo</h2>
        {lines.map((l) => <p key={l.key} className="flex justify-between gap-3 text-sm"><span>{l.qty}x {l.name}</span><span>{brl(lineTotalCents(l))}</span></p>)}
        <div className="space-y-1 border-t border-line pt-2 text-sm">
          <p className="flex justify-between"><span className="text-muted">Subtotal</span><span>{brl(quote.subtotalCents)}</span></p>
          <p className="flex justify-between"><span className="text-muted">Entrega</span><span>{f === "delivery" ? brl(quote.deliveryFeeCents) : "Grátis"}</span></p>
          <p className="flex justify-between text-base font-bold"><span>Total</span><span data-testid="food-total">{brl(quote.totalCents)}</span></p>
        </div>
      </section>

      <ErrorNote>{error}</ErrorNote>
      <BottomBar>
        <button type="button" className="btn btn-primary w-full" disabled={busy || belowMin || !addressOk} onClick={place}>
          <IconGlyph name={payment === "pix" ? "card" : "receipt"} size={20} bare tone="glass" />
          {busy ? (payment === "pix" ? "Confirmando o Pix…" : "Enviando…") : payment === "pix" ? `Pagar com Pix · ${brl(quote.totalCents)}` : `Fazer pedido · ${brl(quote.totalCents)}`}
        </button>
      </BottomBar>
    </div>
  );
}
