"use client";
import { createContext, useContext } from "react";

/**
 * Endereço do app (APP_URL) quando o site roda em outro host (modo separado); "" com um host só.
 * Os botões do site que levam ao app passam por useAppHref.
 */
const Ctx = createContext("");

export function AppOriginProvider({ origin, children }: { origin: string; children: React.ReactNode }) {
  return <Ctx.Provider value={origin}>{children}</Ctx.Provider>;
}

export const useAppHref = () => { const o = useContext(Ctx); return (path: string) => `${o}${path}`; };
