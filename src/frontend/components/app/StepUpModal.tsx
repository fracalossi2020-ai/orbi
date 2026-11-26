"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ErrorNote, Field, setStepUpHandler, useAction } from "@/frontend/components/ui";

type Pending = { resolve: () => void; reject: (e: Error) => void };

/**
 * Reautenticação do painel (step-up). Quando uma ação sensível volta com code "step_up", o api() chama este modal:
 * pede o código do aplicativo autenticador (ou a senha, onde a segunda etapa não é exigida, só ambiente de teste),
 * confirma no servidor e a ação é repetida. Montado uma vez no AdminShell.
 */
export function StepUpModal() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [method, setMethod] = useState<"totp" | "password">("totp");
  const [value, setValue] = useState("");
  const { run, busy, error, setError } = useAction();
  const queue = useRef<Promise<void> | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // Vários pedidos de uma vez dividem o mesmo modal (uma confirmação só).
  const ask = useCallback(() => {
    if (queue.current) return queue.current;
    queue.current = new Promise<void>((resolve, reject) => {
      api<{ stepUp: "totp" | "password" | null }>("/api/account/mfa").then((m) => setMethod(m.stepUp === "password" ? "password" : "totp")).catch(() => undefined);
      setValue(""); setError(null);
      setPending({ resolve, reject });
    }).finally(() => { queue.current = null; });
    return queue.current;
  }, [setError]);

  useEffect(() => { setStepUpHandler(ask); return () => setStepUpHandler(null); }, [ask]);
  useEffect(() => { if (pending) input.current?.focus(); }, [pending]);

  if (!pending) return null;
  const close = () => { pending.reject(new Error("Confirmação cancelada.")); setPending(null); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api("/api/account/step-up", { body: method === "totp" ? { code: value.replace(/\s/g, "") } : { password: value } });
      pending.resolve();
      setPending(null);
    });
  };
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-4" onKeyDown={(e) => { if (e.key === "Escape") close(); }}>
      <form role="dialog" aria-modal="true" aria-labelledby="stepup-titulo" onSubmit={submit} className="card max-h-[92dvh] w-full max-w-sm space-y-4 overflow-y-auto p-5" data-testid="step-up">
        <div>
          <h2 id="stepup-titulo" className="display text-xl">Confirme que é você</h2>
          <p className="mt-1 text-sm text-muted">Esta ação mexe em dinheiro, regras ou acesso da equipe. {method === "totp" ? "Digite o código de 6 números do aplicativo autenticador." : "Digite a sua senha."}</p>
        </div>
        <Field label={method === "totp" ? "Código do aplicativo" : "Senha"}>
          {method === "totp"
            ? <input ref={input} className="input num text-center text-xl tracking-[.4em]" name="step-up-code" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" maxLength={7} required value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d\s]/g, ""))} />
            : <input ref={input} className="input" name="step-up-password" type="password" autoComplete="current-password" required value={value} onChange={(e) => setValue(e.target.value)} />}
        </Field>
        <ErrorNote>{error}</ErrorNote>
        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost flex-1" onClick={close}>Cancelar</button>
          <button type="submit" className="btn btn-primary flex-1" disabled={busy}>{busy ? "Conferindo…" : "Confirmar"}</button>
        </div>
      </form>
    </div>
  );
}
