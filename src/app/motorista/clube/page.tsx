"use client";
import { useState } from "react";
import { PageTitle } from "@/frontend/components/app/AppShell";
import { Icon } from "@/frontend/components/Icon";
import { api, Badge, dateTime, Empty, ErrorNote, Field, Note, pct, Spinner, useAction, useLive } from "@/frontend/components/ui";
import { brl } from "@/shared/pricing";
import { planSpec } from "@/shared/plans";
import Link from "next/link";

type Partner = { id: string; name: string; category: string; city: string; address: string; phone: string; benefit: string };
type Club = {
  partners: Partner[]; plans: { id: string; name: string; description: string; priceCents: number; periodDays: number; commissionBps: number; tier: string | null }[];
  current: { planId: string; until: string } | null;
  campaigns: { id: string; name: string; description: string; kind: string; bonusPerRideCents: number }[];
  savings: { id: string; partnerName: string; originalCents: number; paidCents: number; createdAt: string }[]; totalSavedCents: number;
};
const parse = (v: string) => Math.round(Number(v.replace(",", ".")) * 100);

export default function ClubePage() {
  const { data, loading, reload } = useLive<Club>("/api/driver/club", { live: false });
  const [f, setF] = useState({ partnerId: "", original: "", paid: "" });
  const { busy, error, run } = useAction();
  if (loading && !data) return <Spinner />;
  if (!data) return null;
  return (
    <>
      <PageTitle sub="Condições especiais com parceiros, para quem movimenta a cidade.">Clube Orbi</PageTitle>

      <section className="on-deep rounded-card bg-deep p-6 text-on-deep">
        <p className="text-sm text-on-deep-muted">Minha Economia</p>
        <p className="display num mt-1 text-5xl" data-testid="saved">{brl(data.totalSavedCents)}</p>
        <p className="mt-1 text-sm text-on-deep-muted">{data.savings.length ? "É o que você deixou de gastar usando parceiros." : "Registre o uso de um parceiro para começar a somar."}</p>
      </section>

      {data.campaigns.length > 0 && (
        <section className="mt-6">
          <h2 className="display mb-3 text-2xl">Oportunidades</h2>
          <ul className="space-y-2">
            {data.campaigns.map((c) => <li key={c.id} className="card p-4"><p className="font-semibold">{c.name}{c.bonusPerRideCents > 0 && <Badge tone="brand"> + {brl(c.bonusPerRideCents)} por corrida</Badge>}</p><p className="text-sm text-muted">{c.description}</p></li>)}
          </ul>
        </section>
      )}

      <section className="mt-6">
        <h2 className="display mb-3 text-2xl">Parceiros</h2>
        {!data.partners.length ? <Empty icon="store" title="As primeiras parcerias estão a caminho">A Orbi está negociando com oficinas, borracharias e lojas do Vale do Aço. Os parceiros confirmados aparecem aqui.</Empty> : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.partners.map((p) => (
              <li key={p.id} className="card p-4"><Badge>{p.category}</Badge><p className="display mt-2 text-xl">{p.name}</p><p className="mt-1 text-sm font-medium text-brand">{p.benefit}</p>
                <p className="mt-2 text-sm text-muted">{[p.address, p.city].filter(Boolean).join(", ")}</p>{p.phone && <a className="text-sm underline" href={`tel:${p.phone}`}>{p.phone}</a>}</li>
            ))}
          </ul>
        )}
      </section>

      {data.partners.length > 0 && (
        <section className="card mt-6 p-5">
          <h2 className="display mb-1 text-xl">Registrar economia</h2>
          <p className="mb-3 text-sm text-muted">Informe o preço normal e quanto você pagou. Os valores são declarados por você.</p>
          <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); run(async () => {
            await api("/api/driver/savings", { body: { partnerId: f.partnerId, originalCents: parse(f.original), paidCents: parse(f.paid) } });
            setF({ partnerId: "", original: "", paid: "" }); reload();
          }); }}>
            <Field label="Parceiro"><select className="input" required value={f.partnerId} onChange={(e) => setF({ ...f, partnerId: e.target.value })}><option value="">Escolha</option>{data.partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label="Preço normal"><input className="input" inputMode="decimal" required value={f.original} onChange={(e) => setF({ ...f, original: e.target.value })} /></Field>
            <Field label="Valor pago"><input className="input" inputMode="decimal" required value={f.paid} onChange={(e) => setF({ ...f, paid: e.target.value })} /></Field>
            <button className="btn btn-primary sm:col-span-3" disabled={busy}>Registrar</button>
          </form>
          <div className="mt-2"><ErrorNote>{error}</ErrorNote></div>
          {data.savings.length > 0 && <ul className="mt-4 divide-y divide-line text-sm">{data.savings.map((s) => <li key={s.id} className="flex justify-between py-2"><span>{s.partnerName} · {dateTime(s.createdAt)}</span><span className="num font-semibold text-ok">{brl(s.originalCents - s.paidCents)}</span></li>)}</ul>}
        </section>
      )}

      <section className="mt-6" aria-labelledby="planos">
        <h2 id="planos" className="display mb-1 text-2xl">Planos para motoristas</h2>
        <p className="mb-4 text-sm text-muted">Desconto nas oficinas parceiras do Vale do Aço e, nos planos maiores, crédito todo mês e comissão menor. Não é seguro: a oficina responde pelo serviço.</p>
        {!data.plans.length ? <Note>Nenhum plano disponível no momento. A comissão padrão da sua cidade continua valendo.</Note> : (
          <ul className="grid gap-3 lg:grid-cols-3">
            {data.plans.map((p) => {
              const spec = planSpec(p.tier);
              const mine = data.current?.planId === p.id;
              const top = p.tier === "pro";
              return (
                <li key={p.id} data-testid={`plan-${p.tier ?? p.id}`} className={`relative flex flex-col rounded-[26px] p-5 ${top ? "bg-brand-solid text-white" : "card"}`}>
                  {top && <span className="absolute -top-2.5 right-5 rounded-full bg-night px-2.5 py-1 text-[11px] font-bold text-white">Mais completo</span>}
                  <p className="display text-2xl">{p.name}</p>
                  <p className={`text-sm ${top ? "text-white/80" : "text-muted"}`}>{spec?.tagline ?? p.description}</p>
                  <p className="num mt-3"><span className="display text-4xl">{brl(p.priceCents)}</span><span className={`text-sm ${top ? "text-white/80" : "text-muted"}`}> / {p.periodDays} dias</span></p>
                  <p className={`num text-sm ${top ? "text-white/80" : "text-muted"}`}>Comissão de {pct(p.commissionBps)} nas corridas</p>
                  {spec && (
                    <ul className="mt-4 flex-1 space-y-2 text-sm">
                      {spec.benefits.map((b) => <li key={b} className="flex gap-2"><Icon name="check" size={18} className={`mt-px shrink-0 ${top ? "text-white" : "text-brand"}`} />{b}</li>)}
                    </ul>
                  )}
                  {mine && <p className={`mt-4 text-sm font-semibold ${top ? "" : "text-ok"}`}>Seu plano, ativo até {dateTime(data.current!.until)}</p>}
                  <button type="button" className={`btn btn-sm mt-4 w-full ${top ? "bg-white text-night" : "btn-primary"}`} disabled={busy}
                    onClick={() => { if (window.confirm(`Assinar o ${p.name} por ${brl(p.priceCents)}? O valor sai do seu saldo na Orbi. Ao assinar, você aceita os termos do plano.`)) run(async () => { await api("/api/driver/plan", { body: { planId: p.id } }); reload(); }); }}>
                    {mine ? "Renovar por mais 30 dias" : "Assinar com meu saldo"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-2"><ErrorNote>{error}</ErrorNote></div>
        <p className="mt-3 text-sm"><Link href="/motorista/clube/termos" className="font-semibold underline">Ler os termos dos planos</Link></p>
      </section>
    </>
  );
}
