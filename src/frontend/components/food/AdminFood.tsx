"use client";
import { useState } from "react";
import { PageTitle } from "@/frontend/components/app/AppShell";
import { Badge, Note } from "@/frontend/components/ui";
import { FoodCalculator } from "@/frontend/components/food/FoodCalculator";
import { DemoBanner } from "@/frontend/components/food/parts";
import { useNow } from "@/frontend/lib/food-storage";
import { categoryLabel, cityName, FOOD_COMMISSIONS, FOOD_STORES, recentDemoOrders, todaySummary } from "@/shared/food/demo-data";
import { brasiliaMinutes, isOpenAt, turnLabel } from "@/shared/food/hours";
import { STATUS_LABEL } from "@/shared/food/order-state";
import { MARKET_REFERENCE } from "@/shared/food/calculator";
import { brl } from "@/shared/pricing";

const TABS = [["geral", "Visão geral"], ["lojas", "Lojas"], ["pedidos", "Pedidos"], ["comissoes", "Comissões"], ["calculadora", "Calculadora"]] as const;
const pct = (bps: number) => `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="card p-4"><p className="text-sm text-muted">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p>{hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}</div>;
}

/** Seção /admin/food (demonstração): visão geral, lojas, pedidos, comissões e a calculadora iFood x Orbi Food. Só leitura. */
export function AdminFood() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("geral");
  const now = useNow(30000);
  const sum = todaySummary();
  return (
    <>
      <DemoBanner>Números inventados para a demonstração. Nenhum pedido ou pagamento é real.</DemoBanner>
      <PageTitle sub="Lojas, pedidos do dia e comissão do Orbi Food (demonstração, só leitura).">Orbi Food</PageTitle>
      <div role="tablist" aria-label="Orbi Food" className="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} aria-controls="food-admin-panel" onClick={() => setTab(id)}
            className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${tab === id ? "bg-ink text-bg" : "bg-surface-2"}`}>{label}</button>
        ))}
      </div>

      <div role="tabpanel" id="food-admin-panel">
        {tab === "geral" && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Lojas" value={String(sum.stores)} hint="3 cidades do Vale do Aço" />
            <Stat label="Pedidos hoje (simulados)" value={String(sum.orders)} />
            <Stat label="Ticket médio" value={brl(sum.ticketCents)} hint={`Venda do dia ${brl(sum.grossCents)}`} />
            <Stat label="Comissão estimada" value={brl(sum.commissionCents)} hint="14% tudo incluído, sobre os itens" />
          </div>
        )}

        {tab === "lojas" && (
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-surface-2 text-muted"><tr><th className="px-4 py-3">Loja</th><th className="px-4 py-3">Cidade</th><th className="px-4 py-3">Categoria</th><th className="px-4 py-3">Entrega</th><th className="px-4 py-3">Horários</th><th className="px-4 py-3">Status</th></tr></thead>
              <tbody className="divide-y divide-line">
                {FOOD_STORES.map((s) => {
                  const open = now ? isOpenAt(s.turns, brasiliaMinutes(new Date(now))) : null;
                  return (
                    <tr key={s.id}>
                      <td className="px-4 py-3 font-semibold">{s.name}</td><td className="px-4 py-3">{cityName(s.city)}</td><td className="px-4 py-3">{categoryLabel(s.category)}</td>
                      <td className="px-4 py-3">{s.deliveryFeeCents === null ? "Só retirada" : brl(s.deliveryFeeCents)}</td>
                      <td className="px-4 py-3">{s.turns.map(turnLabel).join(" · ")}</td>
                      <td className="px-4 py-3">{open === null ? "…" : <Badge tone={open ? "ok" : "neutral"}>{open ? "Aberta" : "Fechada"}</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {tab === "pedidos" && (
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-surface-2 text-muted"><tr><th className="px-4 py-3">Pedido</th><th className="px-4 py-3">Loja</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Há</th></tr></thead>
              <tbody className="divide-y divide-line">
                {recentDemoOrders().map((o) => (
                  <tr key={o.code}>
                    <td className="px-4 py-3 font-semibold">{o.code}</td><td className="px-4 py-3">{o.storeName}</td>
                    <td className="px-4 py-3">{o.fulfillment === "delivery" ? "Entrega" : "Retirada"}</td><td className="px-4 py-3">{brl(o.totalCents)}</td>
                    <td className="px-4 py-3">{STATUS_LABEL[o.status]}</td><td className="px-4 py-3">{o.minutesAgo} min</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "comissoes" && (
          <div className="space-y-4">
            <Note>Decisão do dono: 14% tudo incluído na entrega própria do restaurante (pagamento online incluso, sem mensalidade e sem taxa extra), sobre o subtotal dos itens. A referência é ficar 1 ponto abaixo do custo total do iFood, com piso de 6%.</Note>
            <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead className="bg-surface-2 text-muted"><tr><th className="px-4 py-3">Modalidade</th><th className="px-4 py-3">Comissão</th><th className="px-4 py-3">O que inclui</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {FOOD_COMMISSIONS.map((c) => (
                    <tr key={c.id}><td className="px-4 py-3 font-semibold">{c.label} {c.soon && <Badge tone="warn">em breve</Badge>}</td><td className="px-4 py-3">{c.bps === null ? "Em breve" : pct(c.bps)}</td><td className="px-4 py-3">{c.note}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted">Entrega Orbi: em breve, sem número na demo (não há entregador Orbi na fase 1). Referência de mercado, {MARKET_REFERENCE.asOf} ({MARKET_REFERENCE.source}).</p>
          </div>
        )}

        {tab === "calculadora" && <div className="max-w-xl"><FoodCalculator /></div>}
      </div>
    </>
  );
}
