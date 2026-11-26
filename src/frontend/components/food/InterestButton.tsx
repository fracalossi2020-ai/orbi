"use client";
import { useState } from "react";
import { api, ErrorNote, useAction } from "@/frontend/components/ui";

/** "Quero minha loja no Orbi Food": grava em leads (kind "food") com os dados da conta logada. */
export function InterestButton() {
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useAction();
  if (sent) return <p role="status" className="rounded-2xl bg-tint px-4 py-3 text-sm font-semibold">Combinado! A equipe da Orbi avisa você quando o Orbi Food abrir na sua cidade.</p>;
  return (
    <div className="space-y-2">
      <button type="button" className="btn btn-primary w-full" disabled={busy} onClick={() => run(async () => { await api("/api/public/food-interest", { body: {} }); setSent(true); })}>
        {busy ? "Enviando…" : "Quero minha loja no Orbi Food"}
      </button>
      <p className="text-xs text-muted">Usamos o nome e o contato da sua conta, sem pedir de novo.</p>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
