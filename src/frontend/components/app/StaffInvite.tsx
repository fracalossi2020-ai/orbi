"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Logo } from "@/frontend/components/Logo";
import { RecoveryCodes } from "@/frontend/components/app/SecurityPanel";
import { api, ErrorNote, Field, useAction } from "@/frontend/components/ui";

type Info = { name: string; email: string; role: string };
const ROLE: Record<string, string> = { admin: "Administrador", gestor: "Gestor", atendente: "Atendente" };

/**
 * Tela do convite da equipe: 1) a pessoa escolhe a senha; 2) lê o QR Code no aplicativo autenticador e digita o primeiro
 * código (ativa a segunda etapa); 3) guarda os códigos de recuperação e entra no painel.
 */
export function StaffInvite({ token }: { token: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [setup, setSetup] = useState<{ secret: string; otpauth: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const { run, busy, error } = useAction();

  useEffect(() => {
    api<Info>("/api/auth/invite-info", { body: { token } }).then(setInfo).catch((e: Error) => setGone(e.message));
  }, [token]);
  useEffect(() => {
    if (!setup) { setQr(null); return; }
    QRCode.toString(setup.otpauth, { type: "svg", margin: 1, color: { dark: "#0F2C35", light: "#FFFFFF" } }).then(setQr).catch(() => setQr(null));
  }, [setup]);

  const start = (e: React.FormEvent) => { e.preventDefault(); void run(async () => setSetup(await api("/api/auth/invite-start", { body: { token, password } }))); };
  const finish = (e: React.FormEvent) => { e.preventDefault(); void run(async () => { setCodes((await api<{ recoveryCodes: string[] }>("/api/auth/invite-finish", { body: { token, code } })).recoveryCodes); }); };

  return (
    <main className="grid min-h-svh place-items-center bg-bg px-5 py-10 text-ink">
      <div className="w-full max-w-md space-y-4">
        <Logo size={28} />
        <h1 className="text-2xl font-bold">Convite para a equipe</h1>
        {gone && <ErrorNote>{gone}</ErrorNote>}
        {!gone && !info && <p className="text-muted" role="status">Conferindo o convite…</p>}
        {info && !codes && !setup && (
          <form onSubmit={start} className="space-y-4" aria-label="Escolher a senha">
            <p className="text-muted">Olá, {info.name.split(" ")[0]}. Você foi convidado(a) como <strong className="text-ink">{ROLE[info.role] ?? info.role}</strong> ({info.email}). Escolha a sua senha: ela é só sua.</p>
            <Field label="Senha" hint="Pelo menos 10 caracteres, sem seu nome ou e-mail.">
              <input className="input" name="password" type="password" autoComplete="new-password" minLength={10} required autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <ErrorNote>{error}</ErrorNote>
            <button type="submit" className="btn btn-primary w-full" disabled={busy}>{busy ? "Salvando…" : "Continuar"}</button>
          </form>
        )}
        {info && !codes && setup && (
          <form onSubmit={finish} className="space-y-4" aria-label="Ativar a verificação em duas etapas">
            <p className="text-muted">Agora ative a verificação em duas etapas, obrigatória para a equipe. Instale um aplicativo autenticador (Google Authenticator, Microsoft Authenticator ou outro) e leia o QR Code.</p>
            {qr ? <div className="mx-auto w-[200px] overflow-hidden rounded-xl bg-white p-2" role="img" aria-label="QR Code para o aplicativo autenticador" dangerouslySetInnerHTML={{ __html: qr }} /> : <div className="map-loading mx-auto aspect-square w-[200px] rounded-xl" />}
            <p className="break-all rounded-xl bg-surface-2 p-3 font-mono text-xs" data-testid="invite-secret">{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</p>
            <Field label="Código de 6 números do aplicativo">
              <input className="input num text-center text-xl tracking-[.4em]" name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
            </Field>
            <ErrorNote>{error}</ErrorNote>
            <button type="submit" className="btn btn-primary w-full" disabled={busy}>{busy ? "Conferindo…" : "Ativar e entrar"}</button>
          </form>
        )}
        {codes && <RecoveryCodes codes={codes} onDone={() => { window.location.href = "/admin"; }} />}
      </div>
    </main>
  );
}
