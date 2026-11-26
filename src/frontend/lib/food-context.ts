"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLive } from "@/frontend/components/ui";
import type { FoodState } from "@/frontend/lib/food-storage";
import { foodCityAt, foodCityFromName, shouldAskCity } from "@/shared/food/city";
import type { FoodCityId } from "@/shared/food/types";

/**
 * Conta única: o Food usa a conta do app de viagens (passageiro, ou motorista usando o app de passageiro).
 * Nome, telefone e cidade do endereço vêm de /api/me; não existe cadastro do Food.
 */
export type FoodAccount = { name: string; firstName: string; initials: string; phone: string | null; homeCity: FoodCityId | null };

export function useFoodAccount(): FoodAccount | null {
  const { data } = useLive<{ user: { name: string; phone: string | null; addressCity?: string | null } | null }>("/api/me", { live: false });
  const u = data?.user;
  if (!u) return null;
  const parts = u.name.trim().split(/\s+/).filter(Boolean);
  const initials = ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "O";
  return { name: u.name, firstName: parts[0] ?? "", initials, phone: u.phone, homeCity: foodCityFromName(u.addressCity) };
}

const ASKED_KEY = "orbi-food-city-asked";
const readAsked = (): FoodCityId[] => { try { const v = JSON.parse(sessionStorage.getItem(ASKED_KEY) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const writeAsked = (c: FoodCityId) => { try { sessionStorage.setItem(ASKED_KEY, JSON.stringify([...new Set([...readAsked(), c])])); } catch { /* sem armazenamento: pergunta de novo */ } };

export type GpsState = "idle" | "asking" | "denied" | "outside" | "unsupported";

/**
 * Cidade do Food. Ordem: última cidade escolhida (localStorage) > cidade do endereço da conta > Ipatinga.
 * O GPS do navegador (nunca IP) só é lido sozinho se a permissão já foi dada; senão, só quando a pessoa toca em "Usar minha localização".
 * Se o GPS achar outra cidade, `pending` traz a cidade detectada e a tela PERGUNTA antes de trocar (uma vez por cidade e por sessão).
 */
export function useFoodCity(account: FoodAccount | null, { state, update }: { state: FoodState | null; update: (fn: (s: FoodState) => FoodState) => void }) {
  const [pending, setPending] = useState<FoodCityId | null>(null);
  const [gps, setGps] = useState<GpsState>("idle");
  const tried = useRef(false);
  const city: FoodCityId = state?.city ?? account?.homeCity ?? "ipatinga";
  const ready = !!state && !!account;

  const choose = useCallback((c: FoodCityId) => update((s) => ({ ...s, city: c })), [update]);

  const detect = useCallback((manual: boolean) => {
    if (!navigator.geolocation) { setGps("unsupported"); return; }
    if (manual) setGps("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const found = foodCityAt({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        if (!found) { setGps("outside"); return; }
        setGps("idle");
        const cur = state?.city ?? account?.homeCity ?? "ipatinga";
        if (found === cur) return;
        // Pedido explícito: a pergunta aparece mesmo se já foi respondida antes nesta sessão.
        if (manual || shouldAskCity(cur, found, readAsked())) setPending(found);
      },
      () => setGps("denied"),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  }, [state?.city, account?.homeCity]);

  useEffect(() => {
    if (!ready || tried.current) return;
    tried.current = true;
    if (!navigator.geolocation) { setGps("unsupported"); return; }
    if (!navigator.permissions) return;
    navigator.permissions.query({ name: "geolocation" }).then((p) => { if (p.state === "granted") detect(false); else if (p.state === "denied") setGps("denied"); }, () => {});
  }, [ready, detect]);

  const answer = (c: FoodCityId) => { if (pending) writeAsked(pending); choose(c); setPending(null); };
  return { city, ready, choose, detect: () => detect(true), pending, answer, gps, loaded: !!state };
}
