"use client";
import { useEffect, useState } from "react";
import { api } from "@/frontend/components/ui";

/**
 * Defesa simples contra robôs nos formulários abertos: um campo-isca escondido por CSS (classe hp-field; sem estilo em
 * linha por causa da CSP) e o carimbo assinado de "página aberta agora", pedido ao servidor ao montar.
 * Uso: const bot = useBotGuard(); ... {bot.field} ... body: { ...dados, ...bot.values }
 */
export function useBotGuard() {
  const [stamp, setStamp] = useState("");
  const [website, setWebsite] = useState("");
  useEffect(() => {
    let alive = true;
    api<{ stamp: string }>("/api/public/form-stamp").then((r) => { if (alive) setStamp(r.stamp); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  const field = (
    <div className="hp-field" aria-hidden="true">
      <label>Não preencha este campo<input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
    </div>
  );
  return { field, values: { website, stamp } };
}
