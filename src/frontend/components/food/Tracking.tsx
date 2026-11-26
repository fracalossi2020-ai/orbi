"use client";
import Link from "next/link";
import { Empty, Spinner } from "@/frontend/components/ui";
import { Icon } from "@/frontend/components/Icon";
import { IconGlyph } from "@/frontend/components/IconGlyph";
import { BackLink } from "@/frontend/components/food/parts";
import { useFoodState, useNow } from "@/frontend/lib/food-storage";
import { storeById } from "@/shared/food/demo-data";
import { canTransition, isFinal, simulatedStatus, STATUS_LABEL, timeline } from "@/shared/food/order-state";
import { lineTotalCents } from "@/shared/food/pricing";
import type { FoodStatus } from "@/shared/food/types";
import { brl } from "@/shared/pricing";

const HINT: Record<FoodStatus, (d: boolean) => string> = {
  pending: () => "Estamos avisando a loja.",
  accepted: () => "A loja confirmou e vai começar.",
  preparing: () => "O pedido está sendo preparado.",
  ready: (d) => (d ? "Pronto, saindo para a entrega." : "Pronto. Pode retirar no balcão."),
  delivered: () => "Pedido entregue. Bom apetite!",
  picked_up: () => "Pedido retirado. Bom apetite!",
  cancelled: () => "Este pedido foi cancelado. Nada foi cobrado.",
};

/** Acompanhamento: os estados avançam sozinhos (simulados pelo tempo) e há uma linha do tempo. */
export function TrackingView({ orderId }: { orderId: string }) {
  const { state, update } = useFoodState();
  const now = useNow(1000);
  if (!state || now === null) return <Spinner />;
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return (
    <div className="space-y-4">
      <BackLink href="/passageiro/food">← Food</BackLink>
      <Empty icon="receipt" title="Pedido não encontrado neste aparelho">Os pedidos da demonstração ficam só no aparelho em que foram feitos.</Empty>
    </div>
  );

  const delivery = order.fulfillment === "delivery";
  const store = storeById(order.storeId);
  const status: FoodStatus = order.cancelledAt ? "cancelled" : simulatedStatus(now - order.createdAt, order.fulfillment);
  const steps = timeline(order.fulfillment);
  const at = steps.indexOf(status);
  const cancel = () => update((s) => ({ ...s, orders: s.orders.map((o) => (o.id === order.id ? { ...o, cancelledAt: Date.now() } : o)) }));

  return (
    <div className="space-y-6">
      <BackLink href="/passageiro/food">← Food</BackLink>
      <div>
        <p className="text-sm text-muted">Pedido {order.code}</p>
        <h1 className="display text-2xl">{order.storeName}</h1>
      </div>

      <div role="status" aria-live="polite" className="flex items-center gap-4 rounded-3xl bg-tint p-5" data-testid="food-status">
        <IconGlyph name="food" size={56} tone="brand" />
        <div>
          <p className="text-xl font-bold" data-testid="food-status-label">{STATUS_LABEL[status]}</p>
          <p className="mt-0.5 text-sm text-ink/75">{HINT[status](delivery)}</p>
          {!isFinal(status) && store && <p className="mt-1 text-sm font-semibold text-brand">Previsão {store.etaMin}-{store.etaMax} min</p>}
        </div>
      </div>

      {status !== "cancelled" && (
        <ol aria-label="Linha do tempo" className="space-y-0">
          {steps.map((st, i) => {
            const done = i < at || (i === at && isFinal(status));
            const current = i === at && !isFinal(status);
            return (
              <li key={st} className="flex gap-3" aria-current={current ? "step" : undefined}>
                <div className="flex flex-col items-center">
                  <span className={`grid size-7 place-items-center rounded-full border-2 ${done ? "border-[var(--primary)] bg-[var(--primary)] text-white" : current ? "border-[var(--primary)] bg-tint" : "border-line bg-surface"}`}>
                    {done ? <Icon name="check" size={14} /> : current ? <span className="size-2.5 animate-pulse rounded-full bg-[var(--primary)] motion-reduce:animate-none" /> : null}
                  </span>
                  {i < steps.length - 1 && <span className={`h-7 w-0.5 ${i < at ? "bg-[var(--primary)]" : "bg-line"}`} />}
                </div>
                <p className={`pt-0.5 ${done || current ? "font-semibold" : "text-muted"}`}>{STATUS_LABEL[st]}</p>
              </li>
            );
          })}
        </ol>
      )}

      <section aria-label="Resumo do pedido" className="card space-y-2 p-4">
        <h2 className="font-semibold">Resumo</h2>
        {order.lines.map((l) => (
          <p key={l.key} className="flex justify-between gap-3 text-sm"><span>{l.qty}x {l.name}{l.options.length ? ` (${l.options.map((o) => o.label).join(", ")})` : ""}</span><span>{brl(lineTotalCents(l))}</span></p>
        ))}
        <p className="flex justify-between border-t border-line pt-2 font-bold"><span>Total</span><span>{brl(order.quote.totalCents)}</span></p>
        <p className="text-sm text-muted">
          {delivery ? `Entrega em ${order.address}` : "Retirada no balcão"} · {order.payment === "pix" ? "Pix (simulado)" : delivery ? "Dinheiro na entrega" : "Dinheiro no balcão"}
        </p>
      </section>

      {canTransition(status, "cancelled", order.fulfillment) && status !== "preparing" && (
        <button type="button" className="btn btn-ghost w-full" onClick={cancel}>Cancelar pedido</button>
      )}
      <Link href="/passageiro/food" className="btn btn-soft w-full">Voltar ao Food</Link>
    </div>
  );
}
