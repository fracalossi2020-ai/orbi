"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/frontend/components/Icon";
import { api } from "@/frontend/components/ui";
import {
  EMERGENCY_HONEST_NOTE, EMERGENCY_NUMBER, SAMU_NUMBER, coordsText, emergencyScript, trustedMessage, whatsappUrl,
  type SosActor, type SosPoint, type SosVehicle,
} from "@/shared/emergency";

type Props = {
  rideId: string;
  as: SosActor;
  vehicle: SosVehicle | null;
  /** Motorista: nome de quem está no carro. */
  passengerName?: string | null;
  /** Passageiro: token do link da viagem ao vivo (/v/[token]). */
  shareToken?: string | null;
  /** Posição que o app já conhece (GPS do motorista); vale quando o aparelho não der a posição. */
  knownPoint?: SosPoint | null;
  /** Último endereço conhecido da corrida, para quando não houver geocodificador. */
  fallbackPlace?: string | null;
  onClose: () => void;
};

/** Posição do aparelho, sem travar: some em poucos segundos se o sinal ou a permissão não vierem. */
function devicePosition(ms: number): Promise<SosPoint | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    const timer = setTimeout(() => resolve(null), ms);
    navigator.geolocation.getCurrentPosition(
      (p) => { clearTimeout(timer); resolve({ lat: p.coords.latitude, lng: p.coords.longitude }); },
      () => { clearTimeout(timer); resolve(null); },
      { enableHighAccuracy: true, timeout: ms, maximumAge: 60_000 },
    );
  });
}

/**
 * Folha de emergência. A ligação para o 190 nunca espera o servidor: o alerta à Orbi sai uma vez, em segundo plano.
 * Texto honesto e fixo: quem atende emergência é o 190; a Orbi só recebe o alerta.
 */
export function EmergencySheet({ rideId, as, vehicle, passengerName, shareToken, knownPoint, fallbackPlace, onClose }: Props) {
  const [point, setPoint] = useState<SosPoint | null>(knownPoint ?? null);
  const [place, setPlace] = useState<string | null>(null);
  // "alert": limite atingido ou erro (ex.: 409 fora do período); "status": aviso informativo (alerta já registrado).
  const [notice, setNotice] = useState<{ text: string; kind: "alert" | "status" } | null>(null);
  const firstRef = useRef<HTMLAnchorElement>(null);
  const sent = useRef(false);
  const known = useRef(knownPoint ?? null);
  known.current = knownPoint ?? null;

  useEffect(() => { firstRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Posição do aparelho e alerta ao servidor, uma única vez. Falha de rede não atrapalha a ligação.
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    (async () => {
      const here = await devicePosition(4000);
      const best = here ?? known.current;
      if (best) setPoint(best);
      api<{ message?: string; throttled?: boolean }>(`/api/rides/${rideId}/emergency`, { body: best ? { lat: best.lat, lng: best.lng } : {} })
        .then((r) => { if (r?.message || r?.throttled) setNotice({ text: r.message ?? `Seu alerta foi registrado, mas não geramos novo aviso por e-mail. Se estiver em perigo, ligue ${EMERGENCY_NUMBER}.`, kind: r.throttled ? "alert" : "status" }); })
        .catch((e: Error) => { setNotice({ text: e?.message || `Não foi possível enviar o alerta à Orbi. Se estiver em perigo, ligue ${EMERGENCY_NUMBER}.`, kind: "alert" }); });
    })();
  }, [rideId]);

  // Endereço aproximado pelo geocodificador reverso do projeto; sem ele valem o último endereço da corrida ou as coordenadas.
  useEffect(() => {
    if (!point) return;
    let alive = true;
    api<{ place: { label: string; detail?: string } | null }>(`/api/geo/reverse?lat=${point.lat}&lng=${point.lng}`)
      .then((r) => { if (alive && r.place) setPlace([r.place.label, r.place.detail].filter(Boolean).join(", ")); })
      .catch(() => null);
    return () => { alive = false; };
  }, [point?.lat, point?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const where = place ?? (point ? null : fallbackPlace ?? null);
  const script = emergencyScript({ as, vehicle, place: where, point, passengerName });
  const wa = useMemo(() => whatsappUrl(trustedMessage({
    as, vehicle, place: where, point,
    liveUrl: as === "passenger" && shareToken && typeof location !== "undefined" ? `${location.origin}/v/${shareToken}` : null,
  })), [as, vehicle, where, point, shareToken]);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={onClose} data-testid="sos-overlay">
      <div role="dialog" aria-modal="true" aria-labelledby="sos-title" className="max-h-[92dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-[28px] border border-line bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-ink sm:rounded-[28px]" onClick={(e) => e.stopPropagation()} data-testid="sos-sheet">
        <div className="flex items-center gap-2">
          <span className="text-danger"><Icon name="sos" size={26} /></span>
          <h2 id="sos-title" className="display flex-1 text-2xl">Emergência</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Fechar">Fechar</button>
        </div>

        {notice && <p role={notice.kind} className="rounded-2xl border-2 border-danger p-3 text-base font-semibold leading-snug" data-testid="sos-notice">{notice.text}</p>}

        <a ref={firstRef} href={`tel:${EMERGENCY_NUMBER}`} className="btn btn-danger btn-lg w-full !text-2xl !font-extrabold" data-testid="sos-call-190">
          <Icon name="phone" size={24} /> Ligar {EMERGENCY_NUMBER}
        </a>

        <div className="rounded-2xl border-2 border-ink p-4" data-testid="sos-script">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Diga ao 190</p>
          <p className="mt-1 text-xl font-bold leading-snug">{script}</p>
          {point && <p className="num mt-2 text-sm text-muted">Coordenadas: {coordsText(point)}</p>}
        </div>

        <a href={wa} target="_blank" rel="noreferrer" className="btn btn-soft w-full" data-testid="sos-trusted">
          <Icon name="share" size={18} /> Avisar alguém de confiança
        </a>
        <a href={`tel:${SAMU_NUMBER}`} className="btn btn-soft btn-sm w-full" data-testid="sos-call-192">Ligar {SAMU_NUMBER} (SAMU)</a>

        <p className="text-sm font-medium">{EMERGENCY_HONEST_NOTE}</p>
      </div>
    </div>
  );
}
