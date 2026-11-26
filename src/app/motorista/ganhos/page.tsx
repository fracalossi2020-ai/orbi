"use client";
import Link from "next/link";
import { useState } from "react";
import { PageTitle } from "@/frontend/components/app/AppShell";
import { api, Badge, dateTime, Empty, ErrorNote, Field, km, Note, Spinner, useAction, useLive } from "@/frontend/components/ui";
import { brl } from "@/shared/pricing";
import { useReauth } from "@/frontend/components/app/Reauth";

type Finance = {
  balanceCents: number; minWithdrawalCents: number;
  debt: { cents: number; limitCents: number; level: "ok" | "warn" | "blocked"; pix: { key: string; name: string }; pending: { amountCents: number; createdAt: string } | null; last: { rejectReason: string | null } | null };
  summary: { rides: number; grossCents: number; commissionCents: number; netCents: number; distanceM: number };
  entries: { id: string; description: string; amountCents: number; createdAt: string; type: string }[];
  withdrawals: { id: string; amountCents: number; status: string; createdAt: string; pixKey: string }[];
};
const PERIODS = [["day", "Hoje"], ["week", "Semana"], ["month", "Mês"]] as const;
const W_STATUS: Record<string, [string, "warn" | "ok" | "danger"]> = { requested: ["Solicitado", "warn"], paid: ["Pago", "ok"], rejected: ["Recusado", "danger"] };

export default function Ganhos() {
  const [period, setPeriod] = useState<string>("day");
  const { data, loading, reload } = useLive<Finance>(`/api/driver/finance?period=${period}`);
  const [amount, setAmount] = useState("");
  const reauth = useReauth();
  const { data: me } = useLive<{ driver: { pixKey: string | null } | null }>("/api/driver/state", { live: false });
  const { busy, error, run } = useAction();
  const [paid, setPaid] = useState({ open: false, amount: "", note: "" });
  const [copied, setCopied] = useState(false);
  if (loading && !data) return <Spinner />;
  if (!data) return null;
  const s = data.summary;
  return (
    <>
      <PageTitle sub="O que entrou, o que a Orbi reteve e o que ficou com você.">Seus ganhos</PageTitle>
      {data.debt.cents > 0 && (
        <section className={`card mb-4 p-5 ${data.debt.level === "blocked" ? "border-2 border-danger" : ""}`} data-testid="debt-card">
          <h2 className="display text-xl">Você deve <span className="num text-danger" data-testid="debt-amount">{brl(data.debt.cents)}</span> à Orbi</h2>
          <p className="mt-1 text-sm text-muted">É a parte da Orbi nas corridas pagas em dinheiro ou direto a você. <strong>Quite toda segunda-feira</strong>, pelo Pix abaixo.</p>
          {data.debt.level === "blocked" && <div className="mt-3"><Note tone="warn">Você chegou ao limite de {brl(data.debt.limitCents)}. Quite o saldo com a Orbi para voltar a dirigir. Corrida em andamento pode ser terminada.</Note></div>}
          {data.debt.level === "warn" && <div className="mt-3"><Note tone="warn">Atenção: perto do limite de {brl(data.debt.limitCents)}. Passando dele, você não fica online até quitar.</Note></div>}
          {data.debt.pix.key ? (
            <div className="mt-3 rounded-2xl bg-surface-2 p-3 text-sm">
              <p className="text-muted">Chave Pix da Orbi{data.debt.pix.name ? ` (${data.debt.pix.name})` : ""}</p>
              <div className="mt-1 flex items-center justify-between gap-2"><span className="num break-all font-semibold" data-testid="orbi-pix">{data.debt.pix.key}</span>
                <button type="button" className="btn btn-soft btn-sm" onClick={() => { navigator.clipboard?.writeText(data.debt.pix.key).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {}); }}>{copied ? "Copiado" : "Copiar"}</button></div>
            </div>
          ) : <p className="mt-3 text-sm text-muted">A chave Pix da Orbi ainda não foi cadastrada. Fale com o suporte para quitar.</p>}
          {data.debt.pending ? (
            <p className="mt-3 text-sm font-semibold" data-testid="debt-pending">Pagamento de {brl(data.debt.pending.amountCents)} informado em {dateTime(data.debt.pending.createdAt)}. A equipe vai conferir.</p>
          ) : !paid.open ? (
            <>
              {data.debt.last?.rejectReason && <p className="mt-3 text-sm text-danger">Último pagamento recusado: {data.debt.last.rejectReason}</p>}
              <button type="button" className="btn btn-primary mt-3 w-full" onClick={() => setPaid({ open: true, amount: (data.debt.cents / 100).toFixed(2).replace(".", ","), note: "" })}>Já paguei</button>
            </>
          ) : (
            <form className="mt-3 grid gap-3" onSubmit={(e) => { e.preventDefault(); run(async () => {
              await api("/api/driver/settlements", { body: { amountCents: Math.round(Number(paid.amount.replace(",", ".")) * 100), note: paid.note } });
              setPaid({ open: false, amount: "", note: "" }); reload();
            }); }}>
              <Field label="Valor que você pagou"><input className="input" inputMode="decimal" required value={paid.amount} onChange={(e) => setPaid({ ...paid, amount: e.target.value })} /></Field>
              <Field label="Código do comprovante (opcional)"><input className="input" maxLength={200} value={paid.note} onChange={(e) => setPaid({ ...paid, note: e.target.value })} /></Field>
              <div className="flex gap-2"><button className="btn btn-primary flex-1" disabled={busy}>Enviar para a equipe</button><button type="button" className="btn btn-ghost" onClick={() => setPaid({ ...paid, open: false })}>Cancelar</button></div>
            </form>
          )}
          <div className="mt-2"><ErrorNote>{error}</ErrorNote></div>
        </section>
      )}

      <div role="tablist" aria-label="Período" className="mb-4 grid grid-cols-3 gap-1 rounded-2xl bg-surface-2 p-1">
        {PERIODS.map(([v, l]) => <button key={v} type="button" role="tab" aria-selected={period === v} onClick={() => setPeriod(v)} className={`max-md:min-h-11 rounded-xl py-2 font-semibold transition-colors ${period === v ? "bg-surface shadow-sm" : "text-muted"}`}>{l}</button>)}
      </div>
      <section className="card p-5">
        <dl className="space-y-2">
          <div className="flex justify-between"><dt>Valor bruto</dt><dd className="num font-semibold">{brl(s.grossCents)}</dd></div>
          <div className="flex justify-between text-muted"><dt>Comissão Orbi</dt><dd className="num">− {brl(s.commissionCents)}</dd></div>
          <div className="display flex flex-wrap items-baseline justify-between gap-x-3 border-t border-line pt-3 text-[1.65rem] sm:text-3xl"><dt>Você recebeu</dt><dd className="num text-brand">{brl(s.netCents)}</dd></div>
        </dl>
        <p className="num mt-3 text-sm text-muted">{s.rides} corrida{s.rides === 1 ? "" : "s"} · {km(s.distanceM)}</p>
      </section>

      <section className="card mt-4 p-5">
        <div className="flex items-baseline justify-between"><h2 className="display text-xl">Saldo</h2><p className={`display num text-3xl ${data.balanceCents < 0 ? "text-danger" : ""}`} data-testid="balance">{brl(data.balanceCents)}</p></div>
        {data.balanceCents < 0 && <div className="mt-2"><Note tone="warn">Saldo negativo vem da parte da Orbi nas corridas em dinheiro. As próximas corridas digitais abatem esse valor.</Note></div>}
        <form className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); run(async () => {
          await api("/api/driver/withdrawals", { body: { amountCents: Math.round(Number(amount.replace(",", ".")) * 100), ...reauth.payload } });
          setAmount(""); reauth.clear(); reload();
        }); }}>
          <Field label="Valor do saque"><input className="input" inputMode="decimal" required placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <div className="sm:col-span-2">{reauth.field}</div>
          <button className="btn btn-primary" disabled={busy || !reauth.filled || !me?.driver?.pixKey}>Solicitar saque</button>
        </form>
        <p className="mt-2 text-xs text-muted">{me?.driver?.pixKey ? <>O saque vai para a chave Pix cadastrada no seu perfil (<span className="num">{me.driver.pixKey}</span>). Para trocar, use <Link className="underline" href="/motorista/conta#recebimento">Como você recebe</Link>.</> : <>Cadastre sua chave Pix em <Link className="underline" href="/motorista/conta#recebimento">Como você recebe</Link> para poder sacar.</>}</p>
        <p className="mt-2 text-xs text-muted">Mínimo de {brl(data.minWithdrawalCents)}. O pedido passa pela equipe financeira, e a transferência é feita fora do aplicativo até a integração com o provedor de pagamentos.</p>
        <div className="mt-2"><ErrorNote>{error}</ErrorNote></div>
        {data.withdrawals.length > 0 && (
          <ul className="mt-4 divide-y divide-line">
            {data.withdrawals.map((w) => <li key={w.id} className="flex items-center justify-between gap-2 py-2 text-sm"><span>{dateTime(w.createdAt)}</span><span className="num font-semibold">{brl(w.amountCents)}</span><Badge tone={W_STATUS[w.status][1]}>{W_STATUS[w.status][0]}</Badge></li>)}
          </ul>
        )}
      </section>

      <h2 className="display mt-8 mb-3 text-2xl">Extrato</h2>
      {!data.entries.length ? <Empty icon="receipt" title="Nenhum lançamento ainda">Cada corrida concluída aparece aqui com bruto, comissão e líquido.</Empty> : (
        <ul className="card divide-y divide-line">
          {data.entries.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3 p-4">
              <span><span className="block text-sm font-medium">{e.description}</span><span className="text-xs text-muted">{dateTime(e.createdAt)}</span></span>
              <span className={`num font-semibold whitespace-nowrap ${e.amountCents < 0 ? "text-danger" : "text-ok"}`}>{e.amountCents > 0 ? "+" : ""}{brl(e.amountCents)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
