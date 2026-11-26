"use client";
import { useState } from "react";
import { Logo } from "@/frontend/components/Logo";
import { api, ErrorNote, Field, useAction } from "@/frontend/components/ui";

/**
 * Entrada própria do painel da equipe (modo com três endereços). Só e-mail e senha, mais o código do aplicativo
 * autenticador quando a conta usa a segunda etapa. Erro genérico: nada revela se a conta existe nem se é da equipe.
 * Sem "Lembrar de mim", sem Google, sem cadastro: a sessão da equipe é curta.
 */
export function AdminLogin({ codeStep = false }: { codeStep?: boolean }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needCode, setNeedCode] = useState(codeStep);
  const { run, busy, error } = useAction();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (needCode) {
        await api("/api/auth/mfa", { body: { code } });
        window.location.reload();
        return;
      }
      const r = await api<{ mfaRequired?: boolean }>("/api/auth/login", { body: { identifier, password, remember: false } });
      if (r.mfaRequired) { setNeedCode(true); return; }
      window.location.reload();
    });
  };

  return (
    <main className="grid min-h-svh place-items-center bg-bg px-5 text-ink">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4" aria-label="Entrada do painel da equipe">
        <Logo size={28} />
        <h1 className="text-2xl font-bold">Painel da equipe</h1>
        {needCode ? (
          <Field label="Código do aplicativo autenticador" hint="Ou um código de recuperação.">
            <input className="input num text-lg" name="code" inputMode="text" autoComplete="one-time-code" autoFocus required value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
        ) : (
          <>
            <Field label="E-mail">
              <input className="input" name="identifier" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus required value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
            </Field>
            <Field label="Senha">
              <input className="input" name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          </>
        )}
        <ErrorNote>{error}</ErrorNote>
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>{busy ? "Entrando…" : needCode ? "Confirmar" : "Entrar"}</button>
      </form>
    </main>
  );
}
