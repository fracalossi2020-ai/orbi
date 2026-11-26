"use client";
import { useState } from "react";
import { Badge, Note } from "@/frontend/components/ui";
import { compareFees, MARKET_REFERENCE, parseReais, type CalcRow } from "@/shared/food/calculator";
import { ORBI_FOOD_BPS } from "@/shared/food/demo-data";
import { brl } from "@/shared/pricing";

const pct = (bps: number) => `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/** O que compõe o custo de cada um, sempre junto do custo total (nunca só o percentual da comissão). */
function breakdown(r: CalcRow) {
  if (r.id === "orbi") return `${pct(r.commissionBps)} tudo incluído: pagamento online incluso, sem mensalidade`;
  if (r.id === "food99") return `${pct(MARKET_REFERENCE.food99.minBps)} a ${pct(MARKET_REFERENCE.food99.maxBps)} + ${pct(r.paymentBps)} de pagamento online`;
  return `${pct(r.commissionBps)} + ${pct(r.paymentBps)} de pagamento online + mensalidade de ${brl(r.monthlyCents)}`;
}

/**
 * Calculadora iFood x Orbi Food. A comparação principal é SEMPRE em reais por mês; o percentual efetivo é secundário.
 * A conta é pura (shared/food/calculator.ts); a comissão da Orbi vem da tabela de comissões e a do mercado da referência de nov/2026.
 * Usada no painel da loja e no admin.
 */
export function FoodCalculator() {
  const [orders, setOrders] = useState("300");
  const [ticket, setTicket] = useState("45,00");

  const o = Number(orders.replace(/\D/g, ""));
  const t = parseReais(ticket);
  const valid = Number.isFinite(o) && o > 0 && o <= 100000 && t !== null && t > 0 && t <= 1_000_000;
  const r = valid ? compareFees({ ordersPerMonth: o, ticketCents: t!, orbiBps: ORBI_FOOD_BPS }) : null;

  return (
    <section aria-label="Calculadora iFood x Orbi Food" className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="mb-1.5 block text-sm font-semibold">Pedidos por mês</span>
          <input className="input" inputMode="numeric" value={orders} onChange={(e) => setOrders(e.target.value)} aria-label="Pedidos por mês" maxLength={6} /></label>
        <label className="block"><span className="mb-1.5 block text-sm font-semibold">Ticket médio (R$)</span>
          <input className="input" inputMode="decimal" value={ticket} onChange={(e) => setTicket(e.target.value)} aria-label="Ticket médio" maxLength={10} /></label>
      </div>

      {!r ? <Note tone="warn">Digite pedidos por mês e o ticket médio (por exemplo, 45,00).</Note> : (
        <>
          <div className="rounded-3xl bg-[var(--primary)] p-5 text-white" data-testid="calc-savings">
            <p className="text-sm opacity-85">Fica no seu bolso com o Orbi Food</p>
            <p className="mt-1 text-3xl font-bold" data-testid="calc-savings-month">{brl(Math.max(0, r.savingsMonthCents))} por mês</p>
            <p className="mt-1 text-lg font-semibold" data-testid="calc-savings-year">{brl(Math.max(0, r.savingsYearCents))} por ano</p>
            <p className="mt-2 text-sm opacity-85">Comparando com o iFood Básico, para vendas de {brl(r.salesCents)} por mês.</p>
          </div>

          <p className="text-sm font-semibold text-muted">Quanto você paga por mês</p>
          <ul className="space-y-3" data-testid="calc-rows">
            {r.rows.map((row) => (
              <li key={row.id} className={`rounded-2xl p-4 ${row.id === "orbi" ? "bg-tint" : "bg-surface-2"}`} data-testid={`calc-${row.id}`}>
                <p className="font-bold">{row.label}</p>
                <p className="mt-1 text-2xl font-bold" data-testid={`calc-${row.id}-fee`}>
                  {row.feeMaxCents ? `${brl(row.feeCents)} a ${brl(row.feeMaxCents)}` : brl(row.feeCents)} <span className="text-base font-semibold text-muted">por mês</span>
                </p>
                <p className="mt-1 text-sm text-muted">{breakdown(row)}</p>
                <p className="text-sm text-muted">Custo total: {row.feeMaxCents ? `${pct(row.effectiveBps)} a ${pct(row.effectiveBps + MARKET_REFERENCE.food99.maxBps - MARKET_REFERENCE.food99.minBps)}` : pct(row.effectiveBps)} das suas vendas</p>
                {row.id === "food99" && <p className="mt-2"><Badge tone="warn">Ainda não atende o Vale do Aço</Badge></p>}
              </li>
            ))}
          </ul>
          {r.savingsVsEntregaMonthCents > 0 && <p className="text-sm text-muted">Contra o iFood Entrega, a diferença é de {brl(r.savingsVsEntregaMonthCents)} por mês.</p>}
        </>
      )}
      <p className="text-xs text-muted">
        Referência de mercado, {MARKET_REFERENCE.asOf} ({MARKET_REFERENCE.source}). Entrega Orbi: em breve. Confira o seu contrato: os valores do iFood mudam.
      </p>
    </section>
  );
}
