"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/frontend/components/Icon";
import { IconGlyph } from "@/frontend/components/IconGlyph";
import { api, ErrorNote, km, METHOD_LABEL, Spinner, useAction, useLive } from "@/frontend/components/ui";
import type { Place } from "@/frontend/components/PlaceSearch";
import { brl } from "@/shared/pricing";

type Ride = {
  id: string; status: string; statusLabel: string; origin: Place; dest: Place; stops: { label: string }[]; scheduledFor: string | null;
  createdAt: string; totalCents: number; paymentMethod: string; distanceM: number; driver: { name: string } | null; vehicle: { plate: string; model?: string } | null; myRating: number | null;
  categoryName: string; rider: { name: string } | null;
};
type Filter = "todas" | "concluidas" | "canceladas";

const path = (r: Ride) => [r.origin.label, ...r.stops.map((s) => s.label), r.dest.label].join(" → ");
const whenLabel = (iso: string) => {
  const s = new Date(iso).toLocaleString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const STATUS_LOOK: Record<string, string> = {
  completed: "bg-[color-mix(in_srgb,var(--ok)_14%,transparent)] text-ok",
  cancelled: "bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-danger",
};

/** Atividade do passageiro: agendadas no topo, depois o histórico com filtros e "Repetir". */
export default function Viagens() {
  const { data, loading, reload } = useLive<{ history: Ride[] }>("/api/rides");
  const { busy, error, run } = useAction();
  const [filter, setFilter] = useState<Filter>("todas");
  const router = useRouter();
  const all = data?.history ?? [];
  const scheduled = all.filter((r) => r.status === "scheduled").sort((a, b) => a.scheduledFor!.localeCompare(b.scheduledFor!));
  const past = all.filter((r) => r.status !== "scheduled")
    .filter((r) => filter === "todas" || (filter === "concluidas" ? r.status === "completed" : r.status === "cancelled" || r.status === "no_driver"));
  const done = all.filter((r) => r.status === "completed");
  const spent = done.reduce((a, r) => a + r.totalCents, 0);
  const distance = done.reduce((a, r) => a + r.distanceM, 0);
  const cancel = (id: string) => run(async () => { await api(`/api/rides/${id}/cancel`, { body: { reason: "Agendamento cancelado pelo passageiro" } }); reload(); });
  // Repetir: abre o pedido com o mesmo destino; a partida vem do GPS.
  const repeat = (r: Ride) => {
    try { sessionStorage.setItem("prumo-trip", JSON.stringify({ origin: null, dest: r.dest })); } catch { /* armazenamento bloqueado */ }
    router.push("/passageiro");
  };

  return (
    <div className="space-y-7">
      <div className="flex items-end justify-between gap-3">
        <h1 className="display text-[2rem] leading-none md:text-[2.75rem]">Atividade</h1>
        <IconGlyph name="clock" size={48} />
      </div>

      {loading && !data ? <Spinner /> : (
        <>
          {done.length > 0 && (
            <div className="grid grid-cols-3 gap-2" aria-label="Resumo">
              {([["Viagens", String(done.length)], ["Distância", km(distance)], ["Total gasto", brl(spent)]] as const).map(([k, v]) => (
                <div key={k} className="rounded-[20px] bg-surface-2 p-3"><p className="text-xs text-muted">{k}</p><p className="num mt-0.5 truncate font-bold">{v}</p></div>
              ))}
            </div>
          )}

          {scheduled.length > 0 && (
            <section aria-labelledby="agendadas" className="space-y-3">
              <h2 id="agendadas" className="text-lg font-bold">Agendadas</h2>
              <ul className="space-y-3">
                {scheduled.map((r) => (
                  <li key={r.id} className="flex gap-3 rounded-[24px] bg-brand-solid p-4 text-white" data-testid="scheduled-ride">
                    <IconGlyph name="calendar" size={44} tone="glass" />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">{whenLabel(r.scheduledFor!)}</p>
                      <p className="mt-0.5 text-sm text-white/85">{path(r)}</p>
                      <p className="num mt-1 text-sm text-white/75">{r.categoryName} · {brl(r.totalCents)} · {METHOD_LABEL[r.paymentMethod]}{r.rider ? ` · para ${r.rider.name}` : ""}</p>
                      <button type="button" className="mt-3 h-11 rounded-full bg-white px-4 text-sm font-semibold text-night" disabled={busy} onClick={() => cancel(r.id)}>Cancelar agendamento</button>
                    </div>
                  </li>
                ))}
              </ul>
              <ErrorNote>{error}</ErrorNote>
            </section>
          )}

          <section aria-labelledby="anteriores" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="anteriores" className="text-lg font-bold">Anteriores</h2>
              <div className="flex gap-1.5" role="radiogroup" aria-label="Filtrar viagens">
                {([["todas", "Todas"], ["concluidas", "Concluídas"], ["canceladas", "Canceladas"]] as const).map(([id, label]) => (
                  <button key={id} type="button" role="radio" aria-checked={filter === id} onClick={() => setFilter(id)}
                    className={`h-11 rounded-full px-3.5 text-sm font-semibold transition-colors ${filter === id ? "bg-ink text-bg" : "bg-surface-2 hover:bg-[color-mix(in_srgb,var(--primary)_12%,var(--surface-2))]"}`}>{label}</button>
                ))}
              </div>
            </div>

            {!past.length ? (
              <div className="rounded-[26px] bg-surface-2 p-8 text-center">
                <span className="flex justify-center"><IconGlyph name="car" size={64} /></span>
                <p className="mt-3 font-bold">{filter === "todas" ? "Você ainda não viajou com a Orbi" : "Nenhuma viagem aqui"}</p>
                <p className="mt-1 text-sm text-muted">{filter === "todas" ? "Suas viagens aparecem aqui depois do primeiro pedido." : "Troque o filtro para ver as outras."}</p>
                {filter === "todas" && <Link href="/passageiro?pedir=1" className="btn btn-primary mt-4">Pedir uma viagem</Link>}
              </div>
            ) : (
              <ul className="space-y-3">
                {past.map((r) => {
                  const at = r.scheduledFor ?? r.createdAt;
                  return (
                    <li key={r.id} className="rounded-[24px] border border-line bg-surface p-4">
                      <div className="flex gap-3">
                        <div className="w-12 shrink-0 text-center">
                          <p className="text-xs font-semibold text-muted uppercase">{dayLabel(at)}</p>
                          <span className="mt-1 flex justify-center"><IconGlyph name={r.status === "completed" ? "car" : "pin"} size={44} tone={r.status === "completed" ? "brand" : "quiet"} /></span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm text-muted">{r.categoryName} · {timeLabel(at)}</p>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_LOOK[r.status] ?? "bg-surface-2 text-muted"}`}>{r.statusLabel}</span>
                          </div>
                          <p className="mt-1 line-clamp-2 font-semibold">{path(r)}</p>
                          <p className="num mt-1 text-sm text-muted">{km(r.distanceM)} · {METHOD_LABEL[r.paymentMethod]}{r.status === "completed" ? ` · ${brl(r.totalCents)}` : ""}{r.driver ? ` · ${r.driver.name}` : ""}{r.vehicle ? ` · ${r.vehicle.plate}` : ""}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button type="button" onClick={() => repeat(r)} className="flex h-11 items-center gap-1.5 rounded-full bg-surface-2 px-3.5 text-sm font-semibold hover:bg-[color-mix(in_srgb,var(--primary)_12%,var(--surface-2))]"><Icon name="history" size={15} />Repetir</button>
                            {r.myRating ? <span className="num flex items-center gap-1 text-sm text-muted"><Icon name="star" size={15} weight="fill" className="text-[#F6B100]" />{r.myRating}</span> : null}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
