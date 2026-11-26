"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/frontend/components/Icon";
import { IconGlyph, type GlyphName } from "@/frontend/components/IconGlyph";
import type { Place } from "@/frontend/components/PlaceSearch";
import { CategoryArt, ConfortoArt } from "@/frontend/components/VehicleArt";
import { toPlace, type SavedPlace } from "@/frontend/components/app/SavedPlaces";
import { api } from "@/frontend/components/ui";
import { brl } from "@/shared/pricing";

/** O que a pessoa escolheu na tela de início antes de abrir o pedido. */
export type StartIntent = "schedule" | "other" | "moto";
export type StartPick = { dest?: Place; intent?: StartIntent | null };
/** Viagem concluída, para "Suas últimas viagens". */
export type StartTrip = { id: string; dest: Place; totalCents: number; categoryName: string; endedAt: string | null; createdAt: string };

type Tab = "viagem" | "envios" | "parceiros";
type Category = { slug: string; name: string; description: string; seats: number; fromCents: number };

/** Categorias ativas e o menor preço de cada uma (tarifa mínima, mais a taxa de serviço se houver), vindos das tarifas públicas. */
function useCategories() {
  const [cats, setCats] = useState<Category[] | null>(null);
  useEffect(() => {
    let live = true;
    api<{ cities: { categories: { slug: string; name: string; description: string; seats: number; tariff: { minCents: number; serviceFeeCents: number } }[] }[] }>("/api/public/tariffs")
      .then((r) => {
        const by = new Map<string, Category>();
        for (const city of r.cities) for (const c of city.categories) {
          const from = c.tariff.minCents + c.tariff.serviceFeeCents;
          const had = by.get(c.slug);
          if (!had || from < had.fromCents) by.set(c.slug, { slug: c.slug, name: c.name, description: c.description, seats: c.seats, fromCents: from });
        }
        if (live) setCats([...by.values()].sort((a, b) => a.fromCents - b.fromCents));
      })
      .catch(() => { if (live) setCats([]); });
    return () => { live = false; };
  }, []);
  return cats;
}

const shortDate = (iso: string) => {
  const s = new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  return s.replace(".", "");
};

/**
 * Tela de início do passageiro no celular: busca, lugares, atalhos, categorias, últimas viagens e segurança, sem mapa.
 * O mapa só abre quando a pessoa começa um pedido (o app abre mais rápido).
 * Segue o padrão dos apps de mobilidade com a cara da Orbi: azul elétrico, cantos bem redondos, ícones 3D.
 */
export function PassengerStart({ firstName, greeting, recent, trips, places, hasMoto, online, onStart }: {
  firstName?: string; greeting: string; recent: Place[]; trips: StartTrip[]; places: SavedPlace[] | null; hasMoto: boolean;
  online: number | null; onStart: (p: StartPick) => void;
}) {
  const [tab, setTab] = useState<Tab>("viagem");
  const cats = useCategories();
  const home = places?.find((p) => p.kind === "home");
  const work = places?.find((p) => p.kind === "work");
  const others = places?.filter((p) => p.kind === "other") ?? [];

  // 4º atalho: Moto quando a cidade tem, senão Envios (ainda em breve).
  const extra: { label: string; sub: string; img: GlyphName; soon: boolean; go: () => void } = hasMoto
    ? { label: "Moto", sub: "Mais rápido no trânsito", img: "moto", soon: false, go: () => onStart({ intent: "moto" }) }
    : { label: "Envios", sub: "Pacotes e documentos", img: "package", soon: true, go: () => setTab("envios") };

  return (
    <div className="anim-rise mx-auto w-full max-w-xl space-y-8 px-4 pt-3 pb-[calc(var(--nav-h)+1.5rem)] md:pb-10" data-testid="passenger-start">
      {/* Abas: o que dá para fazer na Orbi. Envios e Parceiros entram em breve. */}
      <div role="tablist" aria-label="O que você quer fazer" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        {([["viagem", "Viagem", "car"], ["envios", "Envios", "package"], ["parceiros", "Parceiros", "store"]] as const).map(([id, label, img]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${tab === id ? "bg-brand-solid text-white" : "bg-surface-2 text-ink hover:bg-[color-mix(in_srgb,var(--primary)_12%,var(--surface-2))]"}`}>
            <IconGlyph name={img} size={20} bare filled={tab === id} tone={tab === id ? "glass" : "brand"} behind="var(--brand-solid)" />{label}
          </button>
        ))}
      </div>

      {tab !== "viagem" ? <Soon tab={tab} /> : (
        <>
          <div>
            {firstName && <p className="text-sm font-semibold text-brand">{greeting}, {firstName}</p>}
            <h1 className="display mt-0.5 text-[1.9rem] leading-tight">Para onde vamos hoje?</h1>
            {/* Busca: um toque abre o pedido com o mapa. "Agendar" já abre no modo agendado. */}
            <div className="mt-3 flex items-center gap-2 rounded-[24px] bg-surface-2 p-1.5 pl-4 shadow-[0_0_0_1px_var(--line)_inset]">
              <button type="button" onClick={() => onStart({})} className="flex min-h-12 flex-1 items-center gap-3 text-left text-lg font-semibold" aria-label="Para onde?">
                <Icon name="search" size={22} className="text-brand" />Para onde?
              </button>
              <button type="button" onClick={() => onStart({ intent: "schedule" })} className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-surface px-3.5 text-sm font-semibold shadow-[0_1px_4px_rgb(0_0_0/.1)]">
                <Icon name="calendar" size={16} />Agendar
              </button>
            </div>
          </div>

          {/* Lugares: casa e trabalho sempre à vista (salvos ou para salvar), depois outros salvos e os recentes. */}
          <ul className="divide-y divide-line" aria-label="Lugares">
            {([["home", "Casa", home], ["work", "Trabalho", work]] as const).map(([img, name, saved]) => (
              <li key={img}>
                {saved ? (
                  <button type="button" onClick={() => onStart({ dest: toPlace(saved) })} className="flex w-full items-center gap-3 py-3 text-left">
                    <IconGlyph name={img} size={40} />
                    <span className="min-w-0 flex-1"><span className="block font-semibold">{name}</span><span className="block truncate text-sm text-muted">{saved.label}</span></span>
                    <Icon name="arrow" size={16} className="text-muted" />
                  </button>
                ) : (
                  <Link href="/passageiro/conta#locais" className="flex w-full items-center gap-3 py-3">
                    <IconGlyph name={img} size={40} />
                    <span className="min-w-0 flex-1"><span className="block font-semibold">Adicionar {name.toLowerCase()}</span><span className="block text-sm text-muted">Peça com um toque</span></span>
                    <Icon name="plus" size={18} className="text-brand" />
                  </Link>
                )}
              </li>
            ))}
            {[...others.map((o) => ({ key: o.id, title: o.name, sub: o.label, place: toPlace(o), img: "star" as const })),
              ...recent.slice(0, 2).map((p, i) => ({ key: `r${i}`, title: p.label, sub: p.detail ?? "Viagem recente", place: p, img: "clock" as const }))].slice(0, 3).map((q) => (
              <li key={q.key}>
                <button type="button" onClick={() => onStart({ dest: q.place })} className="flex w-full items-center gap-3 py-3 text-left">
                  <IconGlyph name={q.img} size={40} />
                  <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{q.title}</span><span className="block truncate text-sm text-muted">{q.sub}</span></span>
                  <Icon name="arrow" size={16} className="text-muted" />
                </button>
              </li>
            ))}
          </ul>

          <section aria-labelledby="para-voce">
            <h2 id="para-voce" className="mb-3 text-lg font-bold">Para você</h2>
            {/* Mosaico: Viagem é o atalho principal (cartão tonal azul com o carro saindo pela borda); os outros ficam ao lado. */}
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => onStart({})}
                className="group relative row-span-2 flex min-h-[230px] flex-col overflow-hidden rounded-[28px] bg-tint p-4 text-left text-primary transition-transform active:scale-[.98] [[data-theme=dark]_&]:bg-[color-mix(in_srgb,var(--primary)_18%,var(--surface-2))] [[data-theme=dark]_&]:text-brand">
                <span className="relative text-xl leading-none font-bold">Viagem</span>
                <span className="relative mt-1 text-sm text-muted">Peça agora</span>
                {/* Carro inteiro, dentro do cartão, entre o título e a seta. */}
                <span aria-hidden="true" className="pointer-events-none relative mt-auto block w-full transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none"><ConfortoArt className="block h-auto w-full" /></span>
                <span className="relative z-10 mt-3 inline-flex size-10 items-center justify-center rounded-full bg-brand-solid text-white transition-transform group-hover:translate-x-0.5"><Icon name="arrow" size={16} /></span>
              </button>
              <Tile label="Agendar" sub="Até 7 dias antes" img="calendar" onClick={() => onStart({ intent: "schedule" })} />
              <Tile label="Para outra pessoa" sub="Você pede, ela viaja" img="users" onClick={() => onStart({ intent: "other" })} />
              <button type="button" onClick={extra.go}
                className="group col-span-2 flex items-center gap-3 rounded-[24px] bg-surface-2 p-3 pr-4 text-left transition-transform active:scale-[.98]">
                <IconGlyph name={extra.img} size={48} />
                <span className="min-w-0 flex-1"><span className="block font-bold">{extra.label}</span><span className="block truncate text-sm text-muted">{extra.sub}</span></span>
                {extra.soon ? <span className="shrink-0 rounded-full bg-ink px-2.5 py-1 text-[11px] font-bold text-bg">Em breve</span> : <Icon name="arrow" size={16} className="text-muted" />}
              </button>
            </div>
          </section>

          {/* Cartões que rolam de lado: o que vale a pena fazer agora. */}
          <section aria-labelledby="destaques">
            <h2 id="destaques" className="mb-3 text-lg font-bold">Mais formas de usar a Orbi</h2>
            <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
              <Promo onClick={() => onStart({ intent: "schedule" })} tone="blue" img="calendar" title="Agende sua viagem" text="Escolha dia e hora com até 7 dias. O preço de agora fica garantido." cta="Agendar" />
              <Promo href="/passageiro/ajuda" tone="dark" img="shield" title="Viaje com segurança" text="Compartilhe a viagem e tenha emergência a um toque." cta="Saiba mais" />
              <Promo onClick={() => onStart({ intent: "other" })} tone="light" img="users" title="Peça para alguém" text="O motorista vê o nome e o celular de quem vai viajar." cta="Pedir" />
              <Promo href="/passageiro/dirigir" tone="light" img="car" title="Dirija com a Orbi" text="Use seu carro e ganhe no Vale do Aço." cta="Quero dirigir" />
            </div>
          </section>

          {/* Categorias com o menor preço de verdade, vindo das tarifas. */}
          {cats === null && (
            <section aria-hidden="true">
              <div className="skeleton mb-3 h-6 w-44 !rounded-lg" />
              <div className="-mx-4 flex gap-3 overflow-hidden px-4">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-[184px] w-44 shrink-0" />)}</div>
            </section>
          )}
          {cats && cats.length > 0 && (
            <section aria-labelledby="categorias">
              <h2 id="categorias" className="mb-3 text-lg font-bold">Viaje do seu jeito</h2>
              <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                {cats.map((c) => (
                  <button key={c.slug} type="button" onClick={() => onStart(c.slug === "moto" ? { intent: "moto" } : {})}
                    className="flex w-44 shrink-0 snap-start flex-col rounded-[24px] bg-surface-2 p-4 text-left transition-transform active:scale-[.98]">
                    <span className="grid h-16 place-items-center rounded-[18px] bg-[linear-gradient(180deg,transparent_55%,color-mix(in_srgb,var(--primary)_10%,transparent))]"><CategoryArt slug={c.slug} seats={c.seats} className={"w-28"} /></span>
                    <span className="mt-2 flex items-center gap-1.5 font-bold">{c.name}<span className="inline-flex items-center gap-0.5 text-xs font-medium text-muted"><Icon name="user" size={12} />{c.seats}</span></span>
                    <span className="line-clamp-2 text-xs text-muted">{c.description}</span>
                    <span className="num mt-2 text-sm font-semibold text-brand">a partir de {brl(c.fromCents)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {trips.length > 0 && (
            <section aria-labelledby="ultimas">
              <div className="mb-3 flex items-center justify-between">
                <h2 id="ultimas" className="text-lg font-bold">Suas últimas viagens</h2>
                <Link href="/passageiro/viagens" className="text-sm font-semibold text-brand">Ver todas</Link>
              </div>
              <ul className="space-y-2">
                {trips.slice(0, 3).map((t) => (
                  <li key={t.id} className="flex items-center gap-3 rounded-[22px] border border-line p-3">
                    <IconGlyph name="car" size={44} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{t.dest.label}</span>
                      <span className="num block text-xs text-muted">{shortDate(t.endedAt ?? t.createdAt)} · {t.categoryName} · {brl(t.totalCents)}</span>
                    </span>
                    <button type="button" onClick={() => onStart({ dest: t.dest })} className="flex h-11 shrink-0 items-center gap-1 rounded-full bg-surface-2 px-3.5 text-xs font-semibold hover:bg-[color-mix(in_srgb,var(--primary)_12%,var(--surface-2))]">
                      <Icon name="history" size={14} />Repetir
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="seguranca" className="rounded-[26px] bg-tint p-5 text-ink [[data-theme=dark]_&]:bg-surface-2 [[data-theme=dark]_&]:text-ink">
            <h2 id="seguranca" className="text-lg font-bold">Sua segurança em primeiro lugar</h2>
            <ul className="mt-3 space-y-3">
              {([
                ["shield", "Motoristas verificados", "Documentos, carro e cadastro aprovados pela equipe Orbi."],
                ["map", "Viagem compartilhada", "Mande o link e alguém acompanha seu trajeto ao vivo."],
                ["sos", "Emergência a um toque", "Durante a viagem, abre o 190 com a placa e onde você está. Não é um plantão 24 horas."],
              ] as const).map(([img, title, text]) => (
                <li key={title} className="flex items-start gap-3">
                  <IconGlyph name={img} size={44} />
                  <span><span className="block font-semibold">{title}</span><span className="block text-sm opacity-75">{text}</span></span>
                </li>
              ))}
            </ul>
            <Link href="/passageiro/ajuda" className="mt-4 inline-flex h-11 items-center gap-1.5 rounded-full bg-ink md:h-10 px-4 text-sm font-semibold text-bg">Central de ajuda<Icon name="arrow" size={14} /></Link>
          </section>

          {online !== null && (
            <p className="flex items-center justify-center gap-2 text-xs font-semibold text-muted" role="status">
              <span className={`size-2 rounded-full ${online ? "bg-ok" : "bg-warn"}`} />
              {online ? `${online} ${online === 1 ? "motorista online" : "motoristas online"} por perto` : "Nenhum motorista online por perto agora"}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** Atalho menor do mosaico: nome em cima, ícone 3D grande saindo pelo canto. */
function Tile({ label, sub, img, onClick }: { label: string; sub: string; img: GlyphName; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="group relative flex min-h-[112px] flex-col overflow-hidden rounded-[24px] bg-surface-2 p-3.5 text-left transition-transform active:scale-[.97]">
      <span className="relative z-10 max-w-[70%] leading-tight font-bold">{label}</span>
      <span className="relative z-10 mt-0.5 max-w-[62%] text-xs leading-snug text-muted">{sub}</span>
      <span className="absolute right-3 bottom-3 transition-transform duration-300 group-hover:-translate-y-1 motion-reduce:transition-none"><IconGlyph name={img} size={44} /></span>
    </button>
  );
}

function Promo({ href, onClick, tone, img, title, text, cta }: { href?: string; onClick?: () => void; tone: "blue" | "dark" | "light"; img: GlyphName; title: string; text: string; cta: string }) {
  const look = tone === "blue" ? "bg-brand-solid text-white" : tone === "dark" ? "bg-night text-white" : "bg-tint text-ink";
  const body = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="text-xl leading-tight font-bold">{title}</span>
        <IconGlyph name={img} size={44} tone={tone === "light" ? "brand" : "glass"} className="-mt-1 -mr-1" />
      </span>
      <span className="text-sm opacity-80">{text}</span>
      <span className={`inline-flex h-9 w-fit items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold ${tone === "light" ? "bg-ink text-bg" : "bg-white text-night"}`}>{cta}<Icon name="arrow" size={14} /></span>
    </>
  );
  const cls = `flex w-[78%] max-w-[300px] shrink-0 snap-start flex-col justify-between gap-3 rounded-[26px] p-5 text-left transition-transform active:scale-[.98] ${look}`;
  return href ? <Link href={href} className={cls}>{body}</Link> : <button type="button" onClick={onClick} className={cls}>{body}</button>;
}

/** Envios e Parceiros ainda não funcionam: a aba explica o que vem, sem fingir que já existe. */
function Soon({ tab }: { tab: "envios" | "parceiros" }) {
  const info = tab === "envios"
    ? { img: "package" as const, title: "Envios chegam em breve", text: "Mande documentos, chaves e pacotes pequenos pela cidade com um motorista Orbi. Estamos preparando as regras para isso ser seguro para todo mundo.",
        items: ["Busca e entrega no mesmo dia", "Código de entrega para quem recebe", "Acompanhe o pacote no mapa"] }
    : { img: "store" as const, title: "Parceiros chegam em breve", text: "Lojas e serviços do Vale do Aço com vantagens para quem usa a Orbi. As primeiras parcerias estão sendo fechadas.",
        items: ["Descontos em lojas da região", "Vantagens para quem viaja mais", "Tudo direto no app"] };
  return (
    <div className="rounded-[26px] bg-tint p-6 text-center text-ink" data-testid={`soon-${tab}`}>
      <span className="flex justify-center"><IconGlyph name={info.img} size={76} /></span>
      <h2 className="mt-3 text-xl font-bold">{info.title}</h2>
      <p className="mt-2 text-sm text-muted">{info.text}</p>
      <ul className="mx-auto mt-4 max-w-xs space-y-2 text-left text-sm">
        {info.items.map((t) => <li key={t} className="flex items-center gap-2"><Icon name="check" size={16} className="text-brand" />{t}</li>)}
      </ul>
    </div>
  );
}
