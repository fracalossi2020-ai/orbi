"use client";
import { skipNextSplash } from "@/frontend/lib/splash";
import { useState } from "react";
import { PageTitle } from "./AppShell";
import { SecurityPanel } from "./SecurityPanel";
import { IconGlyph, type GlyphName } from "@/frontend/components/IconGlyph";

/** Assunto pronto na Ajuda: tocar preenche o tipo e o assunto do chamado. */
export type HelpTopic = { label: string; img: GlyphName; kind: string; subject: string };
import { Icon } from "@/frontend/components/Icon";
import { useReauth } from "./Reauth";
import { api, Badge, dateTime, Empty, ErrorNote, Field, Note, Spinner, useAction, useLive } from "@/frontend/components/ui";

type Ticket = { id: string; kind: string; subject: string; body: string; status: string; response: string | null; createdAt: string; priority: string };
const KIND_LABEL: Record<string, string> = { ajuda: "Ajuda", reclamacao: "Reclamação", sugestao: "Sugestão", ocorrencia: "Ocorrência", emergencia: "Emergência" };
const STATUS: Record<string, [string, "warn" | "brand" | "ok"]> = { open: ["Aberto", "warn"], in_progress: ["Em atendimento", "brand"], closed: ["Encerrado", "ok"] };

export function HelpPage({ priorityNote, topics }: { priorityNote?: string; topics?: HelpTopic[] }) {
  const { data, loading, reload } = useLive<{ tickets: Ticket[] }>("/api/account/tickets");
  const [f, setF] = useState({ kind: "ajuda", subject: "", body: "" });
  const { busy, error, run } = useAction();
  return (
    <>
      <PageTitle sub={priorityNote ?? "Ajuda, reclamações e sugestões ficam registradas aqui."}>Central de ajuda</PageTitle>
      <div className="mb-5 flex items-center gap-3 rounded-2xl p-4" style={{ background: "color-mix(in srgb, var(--danger) 10%, transparent)" }}>
        <span className="text-danger"><Icon name="sos" /></span>
        <p className="flex-1 text-sm">Em emergência, ligue para a polícia.</p>
        <a href="tel:190" className="btn btn-danger btn-sm">Ligar 190</a>
      </div>
      {topics && topics.length > 0 && (
        <section aria-labelledby="assuntos" className="mb-6">
          <h2 id="assuntos" className="mb-3 text-lg font-bold">Com o que precisa de ajuda?</h2>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {topics.map((t) => (
              <button key={t.label} type="button" aria-pressed={f.subject === t.subject}
                onClick={() => { setF({ ...f, kind: t.kind, subject: t.subject }); document.getElementById("ajuda-texto")?.focus(); }}
                className={`flex items-center gap-3 rounded-[22px] p-3.5 text-left text-sm font-semibold transition-[box-shadow,transform] active:scale-[.98] ${f.subject === t.subject ? "bg-surface shadow-[0_0_0_2px_var(--primary)_inset]" : "bg-surface-2"}`}>
                <IconGlyph name={t.img} size={38} />{t.label}
              </button>
            ))}
          </div>
        </section>
      )}
      <form className="card space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); run(async () => { await api("/api/account/tickets", { body: f }); setF({ kind: "ajuda", subject: "", body: "" }); reload(); }); }}>
        <Field label="Tipo">
          <select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            <option value="ajuda">Preciso de ajuda</option><option value="reclamacao">Quero reclamar</option><option value="sugestao">Tenho uma sugestão</option><option value="ocorrencia">Registrar ocorrência</option>
          </select>
        </Field>
        <Field label="Assunto"><input className="input" required value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
        <Field label="O que aconteceu?"><textarea id="ajuda-texto" className="input min-h-28" required value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        <ErrorNote>{error}</ErrorNote>
        <button className="btn btn-primary" disabled={busy}>{busy ? "Enviando…" : "Enviar"}</button>
      </form>
      <h2 className="display mt-8 mb-3 text-2xl">Seus chamados</h2>
      {loading && !data ? <Spinner /> : !data?.tickets.length ? <Empty icon="help" title="Nenhum chamado aberto" /> : (
        <ul className="space-y-3">
          {data.tickets.map((t) => (
            <li key={t.id} className="card p-4">
              <div className="flex flex-wrap items-center gap-2"><Badge>{KIND_LABEL[t.kind] ?? t.kind}</Badge><Badge tone={STATUS[t.status]?.[1]}>{STATUS[t.status]?.[0]}</Badge><span className="ml-auto text-xs text-muted">{dateTime(t.createdAt)}</span></div>
              <p className="mt-2 font-semibold">{t.subject}</p>
              <p className="text-sm text-muted">{t.body}</p>
              {t.response && <p className="mt-2 rounded-xl bg-surface-2 p-3 text-sm"><strong>Resposta:</strong> {t.response}</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Confirmação e troca de e-mail por código. É o canal de recuperação de senha, por isso aparece em destaque enquanto não estiver confirmado. */
function EmailCard({ email, pendingEmail, verified, viaGoogle, onDone }: { email: string | null; pendingEmail: string | null; verified: boolean; viaGoogle: boolean; onDone: () => void }) {
  const [editing, setEditing] = useState(!email && !pendingEmail);
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  // Conta do Google não tem senha: o código vai primeiro ao e-mail ATUAL ("current") e depois ao novo ("new").
  const [step, setStep] = useState<"current" | "new" | null>(null);
  const { busy, error, run } = useAction();
  // Troca de e-mail: o endereço novo fica pendente. Com senha, o código vai ao novo (a senha atual é pedida só aqui);
  // sem senha (Google), o código vai antes ao e-mail atual.
  const send = (target?: string) => run(async () => {
    const r = await api<{ sentTo: string; step?: "current" | "new" }>("/api/auth/email-send", { body: target ? { email: target, ...(viaGoogle ? {} : { password }) } : {} });
    setSentTo(r.sentTo); setStep(r.step ?? null); setCode(""); setPassword(""); setEditing(false); onDone();
  });
  const waiting = sentTo ?? (pendingEmail && !editing ? pendingEmail : null);

  if (email && verified && !editing && !waiting) {
    return (
      <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div><h2 className="display text-xl">E-mail</h2><p className="text-muted">{email} <Badge tone="ok">Confirmado</Badge></p></div>
        <button type="button" className="btn btn-soft btn-sm" onClick={() => setEditing(true)}>Trocar e-mail</button>
      </section>
    );
  }
  return (
    <section className="card space-y-3 p-5">
      <h2 className="display text-xl">{pendingEmail ? "Confirme o novo e-mail" : email ? "Confirme seu e-mail" : "Cadastre um e-mail"}</h2>
      <p className="text-sm text-muted">É por ele que você recupera a conta se esquecer a senha.</p>
      {editing ? (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); send(newEmail.trim()); }}>
          <input className="input" type="email" required aria-label="Novo e-mail" placeholder="voce@email.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          {email && viaGoogle
            ? <p className="text-sm text-muted">Para confirmar que é você, enviaremos um código para o e-mail atual ({email}) antes de aceitar o novo.</p>
            : <input className="input" type="password" autoComplete="current-password" aria-label="Senha atual" placeholder="Senha atual (para confirmar que é você)" value={password} onChange={(e) => setPassword(e.target.value)} />}
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={busy}>Enviar código</button>
            {(email || pendingEmail) && <button type="button" className="btn btn-ghost" onClick={() => { setEditing(false); setPassword(""); }}>Cancelar</button>}
          </div>
        </form>
      ) : waiting ? (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(async () => {
          const r = await api<{ next?: "new"; sentTo?: string }>("/api/auth/email-confirm", { body: { code } });
          setCode(""); onDone();
          // Código do e-mail atual aceito: agora o endereço novo recebe o dele.
          if (r.next === "new") { setSentTo(r.sentTo ?? null); setStep("new"); } else { setSentTo(null); setStep(null); }
        }); }}>
          {viaGoogle && pendingEmail && step !== "new" ? (
            <p className="text-sm">{step === "current" || !step
              ? <>Enviamos um código de 6 dígitos para o seu e-mail atual{email ? <> (<strong>{sentTo ?? email}</strong>)</> : null}, para autorizar a troca. Depois enviaremos outro para <strong>{pendingEmail}</strong>.</>
              : null}</p>
          ) : <p className="text-sm">Enviamos um código de 6 dígitos para <strong>{waiting}</strong>.{pendingEmail && email ? <> Até confirmar, seu e-mail continua sendo {email}.</> : null}</p>}
          <div className="flex gap-2">
            <input className="input num tracking-[.3em]" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} aria-label="Código de confirmação" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            <button className="btn btn-primary" disabled={busy}>Confirmar</button>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="text-sm font-semibold underline" disabled={busy} onClick={() => send()}>Enviar outro código</button>
            <button type="button" className="text-sm font-semibold underline" disabled={busy} onClick={() => { setSentTo(null); setStep(null); setEditing(true); }}>Usar outro e-mail</button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <p className="basis-full text-sm break-all">{email} <Badge tone="warn">Não confirmado</Badge></p>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => send()}>Enviar código</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>Trocar e-mail</button>
        </div>
      )}
      <ErrorNote>{error}</ErrorNote>
    </section>
  );
}

/** children: seções que só um perfil tem, como os locais salvos do passageiro. */
export type AccountUser = { name: string; email: string | null; pendingEmail?: string | null; viaGoogle?: boolean; emailVerified: boolean; phone: string | null; rating: number | null; ratingCount: number };

/** hero: troca o título e o cartão do nome por um topo próprio (o passageiro usa um topo com atalhos). */
/** Baixar a cópia dos dados (LGPD): pede a senha de novo (conta do Google: código no e-mail), como o saque e a exclusão. */
function ExportData() {
  const [open, setOpen] = useState(false);
  const reauth = useReauth();
  const { busy, error, run } = useAction();
  const download = () => run(async () => {
    const data = await api("/api/me/export", { body: reauth.payload });
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = "meus-dados-orbi.json"; a.click();
    URL.revokeObjectURL(url);
    reauth.clear(); setOpen(false);
  });
  if (!open) return <button type="button" className="btn btn-soft" onClick={() => setOpen(true)}>Baixar meus dados</button>;
  return (
    <div className="space-y-2" data-testid="export-confirm">
      <Note>A cópia tem todos os seus dados pessoais. Confirme que é você para baixar.</Note>
      {reauth.field}
      <ErrorNote>{error}</ErrorNote>
      <div className="flex gap-2">
        <button type="button" className="btn btn-primary" disabled={busy || !reauth.filled} onClick={download}>{busy ? "Preparando…" : "Baixar"}</button>
        <button type="button" className="btn btn-ghost" onClick={() => { reauth.clear(); setOpen(false); }}>Cancelar</button>
      </div>
    </div>
  );
}

export function AccountPage({ children, hero }: { children?: React.ReactNode; hero?: (u: AccountUser) => React.ReactNode } = {}) {
  const { data, reload } = useLive<{ user: AccountUser | null }>("/api/me", { live: false });
  const { busy, error, run } = useAction();
  const [confirming, setConfirming] = useState(false);
  const reauth = useReauth();
  const u = data?.user;
  return (
    <>
      {!hero && <PageTitle>Conta</PageTitle>}
      {!u ? <Spinner /> : (
        <div className="space-y-6">
          {hero ? hero(u) : <section className="card p-5">
            <p className="display text-2xl">{u.name}</p>
            <p className="text-muted">{[u.email, u.phone].filter(Boolean).join(" · ")}</p>
            <p className="mt-2 text-sm">{u.ratingCount ? <>Sua nota: <strong className="num">{u.rating!.toFixed(1).replace(".", ",")}</strong> em {u.ratingCount} avaliaç{u.ratingCount > 1 ? "ões" : "ão"}</> : "Você ainda não recebeu avaliações."}</p>
          </section>}
          <EmailCard email={u.email} pendingEmail={u.pendingEmail ?? null} verified={u.emailVerified} viaGoogle={Boolean(u.viaGoogle)} onDone={reload} />
          {children}
          <SecurityPanel />
          <section className="card space-y-3 p-5">
            <h2 className="display text-xl">Seus dados (LGPD)</h2>
            <p className="text-sm text-muted">Baixe uma cópia completa ou exclua sua conta. Registros financeiros e de viagem ficam retidos sem identificação pelo prazo legal.</p>
            <ExportData />
            {!confirming
              ? <button type="button" className="btn btn-ghost block text-danger" onClick={() => setConfirming(true)}>Excluir minha conta</button>
              : (
                <div className="space-y-2">
                  <Note tone="warn">A exclusão é definitiva. Não será possível recuperar a conta.</Note>
                  {reauth.field}
                  <div className="flex gap-2">
                    <button type="button" className="btn btn-danger" disabled={busy || !reauth.filled} onClick={() => run(async () => { await api("/api/me", { method: "DELETE", body: reauth.payload }); { skipNextSplash(); window.location.href = "/entrar"; }; })}>Excluir definitivamente</button>
                    <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)}>Manter conta</button>
                  </div>
                </div>
              )}
            <ErrorNote>{error}</ErrorNote>
          </section>
          <button type="button" className="btn btn-soft w-full md:hidden" disabled={busy} onClick={() => run(async () => { await api("/api/auth/logout", { body: {} }); { skipNextSplash(); window.location.href = "/entrar"; }; })}><Icon name="logout" size={18} /> Sair da conta</button>
        </div>
      )}
    </>
  );
}
