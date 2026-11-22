"use client";
import { useState } from "react";
import { api, Field, Note, useAction, useLive } from "@/frontend/components/ui";

/**
 * Confirmação antes de saque, troca da chave Pix e exclusão da conta: senha atual, ou, em conta do Google
 * (sem senha própria), um código enviado ao e-mail atual. `payload` vai junto do pedido; `clear` limpa depois de usar.
 */
export function useReauth() {
  const { data } = useLive<{ user: { viaGoogle?: boolean } | null }>("/api/me", { live: false });
  const viaGoogle = Boolean(data?.user?.viaGoogle);
  const [value, setValue] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const send = useAction();
  const sendCode = () => send.run(async () => { const r = await api<{ sentTo: string }>("/api/account/reauth-code", { body: {} }); setSentTo(r.sentTo); });
  const field = viaGoogle ? (
    <div className="space-y-2">
      <Note>Para sua segurança, confirmamos com um código enviado ao seu e-mail{sentTo ? ` (${sentTo})` : ""}.</Note>
      <button type="button" className="btn btn-soft" disabled={send.busy} onClick={sendCode}>{sentTo ? "Enviar outro código" : "Enviar código"}</button>
      {send.error && <p role="alert" className="text-sm text-danger">{send.error}</p>}
      <Field label="Código do e-mail"><input className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))} /></Field>
    </div>
  ) : (
    <Field label="Sua senha atual" hint="Pedimos a senha de novo para proteger seu dinheiro e seus dados.">
      <input className="input" type="password" autoComplete="current-password" value={value} onChange={(e) => setValue(e.target.value)} />
    </Field>
  );
  const payload = viaGoogle ? { code: value } : { password: value };
  return { field, payload, filled: value.length > 0, clear: () => setValue("") };
}
