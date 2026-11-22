"use client";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/frontend/components/Icon";
import { api, ErrorNote, Field, useAction } from "@/frontend/components/ui";
import { MOTO_REQUIREMENTS } from "@/shared/moto-soon";

/**
 * "Orbi Moto: em breve". Aviso honesto: o lançamento é com carro; a moto chega depois, começando por Ipatinga,
 * sem data prometida. Com `account`, o interesse é registrado com a conta que já está logada (um toque);
 * sem ela, pede nome e e-mail. Não abre cadastro de moto: a categoria segue desligada.
 */
export function MotoSoon({ account = false, compact = false }: { account?: boolean; compact?: boolean }) {
  const [sent, setSent] = useState(false);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", email: "", consent: false });
  const { busy, error, run } = useAction();

  const send = () => run(async () => {
    await api("/api/public/moto-interest", { body: account ? {} : { name: f.name, email: f.email, consent: f.consent } });
    setSent(true);
  });

  return (
    <section className="rounded-[26px] bg-tint p-5 text-ink md:p-7" aria-labelledby="moto-soon-titulo">
      <p className="flex items-center gap-2 text-sm font-semibold text-brand"><Icon name="moto" size={18} />Orbi Moto</p>
      <h2 id="moto-soon-titulo" className="display mt-1 text-2xl md:text-3xl">Orbi Moto: em breve</h2>
      <p className="mt-2 max-w-2xl text-sm text-ink/75">
        A Orbi começa só com carro. A moto chega depois do lançamento, começando por um piloto em Ipatinga. Ainda não
        temos data certa, e por isso o cadastro de moto ainda não está aberto. Avisamos aqui assim que abrir.
        Quem pilota pode ir se preparando:
      </p>
      {!compact && (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {MOTO_REQUIREMENTS.map((r) => (
            <li key={r} className="flex gap-2.5 text-sm"><span className="mt-0.5 text-brand"><Icon name="check" size={18} /></span><span>{r}</span></li>
          ))}
        </ul>
      )}
      {compact && <p className="mt-2 text-sm text-ink/75">A lista do que preparar está em <Link href="/motoristas/requisitos" className="font-semibold underline">requisitos</Link>.</p>}

      <div className="mt-4">
        {sent ? (
          <p role="status" className="rounded-xl bg-surface px-4 py-3 text-sm font-semibold">Combinado! Avisamos você quando a moto chegar.</p>
        ) : account || open ? (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
            {!account && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nome"><input className="input" autoComplete="name" required minLength={2} maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
                  <Field label="E-mail"><input className="input" type="email" autoComplete="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
                </div>
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" className="mt-0.5 size-5 accent-[var(--primary)]" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} />
                  <span>Autorizo a Orbi a usar estes dados para me avisar sobre a moto, conforme a <Link href="/privacidade" className="underline">política de privacidade</Link>.</span>
                </label>
              </>
            )}
            <ErrorNote>{error}</ErrorNote>
            <button className="btn btn-primary w-full sm:w-auto" disabled={busy}>{busy ? "Enviando…" : "Quero ser avisado quando a moto chegar"}</button>
            {account && <p className="text-xs text-ink/60">Usamos o nome e o contato da sua conta, sem pedir de novo.</p>}
          </form>
        ) : (
          <button type="button" className="btn btn-primary w-full sm:w-auto" onClick={() => setOpen(true)}>Quero ser avisado quando a moto chegar</button>
        )}
      </div>
    </section>
  );
}
