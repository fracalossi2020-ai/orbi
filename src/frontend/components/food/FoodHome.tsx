"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Empty } from "@/frontend/components/ui";
import { Icon } from "@/frontend/components/Icon";
import { IconGlyph } from "@/frontend/components/IconGlyph";
import { BannerCarousel } from "@/frontend/components/food/BannerCarousel";
import { FoodWordmark, HeartButton, Sheet } from "@/frontend/components/food/FoodUi";
import { CATEGORY_GLYPH, FoodArt } from "@/frontend/components/food/parts";
import { useFoodAccount, useFoodCity } from "@/frontend/lib/food-context";
import { useFoodState, useNow, type FoodState } from "@/frontend/lib/food-storage";
import { activeFilterCount, filterStores, NO_FILTERS, SORT_LABEL, type FoodFilters, type FoodMode, type FoodSort } from "@/shared/food/catalog";
import { categoryLabel, cityName, FOOD_CATEGORIES, FOOD_CITIES, FOOD_STORES, promoOf, ratingOf } from "@/shared/food/demo-data";
import { brasiliaMinutes, isOpenAt } from "@/shared/food/hours";
import { isFinal, simulatedStatus, STATUS_LABEL } from "@/shared/food/order-state";
import { itemCount } from "@/shared/food/pricing";
import type { FoodCityId, FoodStore } from "@/shared/food/types";
import { brl } from "@/shared/pricing";

const fromCents = (s: FoodStore) => Math.min(...s.menu.map((i) => i.priceCents));
const feeText = (s: FoodStore) => (s.deliveryFeeCents === null ? "Só retirada" : s.deliveryFeeCents === 0 ? "Entrega grátis" : `Entrega ${brl(s.deliveryFeeCents)}`);

/** Botão redondo do topo (44 px) com selo de contagem opcional. */
function TopIcon({ href, icon, label, count }: { href: string; icon: string; label: string; count?: number }) {
  return (
    <Link href={href} aria-label={count ? `${label}, ${count} ${count === 1 ? "item" : "itens"}` : label} className="relative grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-ink">
      <Icon name={icon} size={22} />
      {!!count && <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--primary)] px-1 text-[11px] leading-none font-bold text-white">{count > 9 ? "9+" : count}</span>}
    </Link>
  );
}

function Chip({ on, onClick, children, role = "radio" }: { on: boolean; onClick: () => void; children: React.ReactNode; role?: "radio" | "checkbox" }) {
  return (
    <button type="button" role={role} aria-checked={on} onClick={onClick}
      className={`min-h-11 rounded-full px-4 text-sm font-semibold transition-colors ${on ? "bg-ink text-bg" : "bg-surface-2 text-ink"}`}>{children}</button>
  );
}

function FilterSheet({ f, setF, count, onClose }: { f: FoodFilters; setF: (f: FoodFilters) => void; count: number; onClose: () => void }) {
  const group = "mb-2 block text-sm font-semibold";
  return (
    <Sheet title="Filtros" onClose={onClose} testId="filter-sheet" footer={
      <div className="flex gap-3">
        <button type="button" className="btn btn-ghost" onClick={() => setF(NO_FILTERS)}>Limpar</button>
        <button type="button" className="btn btn-primary min-w-0 flex-1" onClick={onClose}>{count === 0 ? "Nenhuma loja" : `Ver ${count} ${count === 1 ? "loja" : "lojas"}`}</button>
      </div>
    }>
      <div className="space-y-5">
        <div role="radiogroup" aria-label="Categoria">
          <span className={group}>Categoria</span>
          <div className="flex flex-wrap gap-2">
            <Chip on={f.category === null} onClick={() => setF({ ...f, category: null })}>Todas</Chip>
            {FOOD_CATEGORIES.map((k) => <Chip key={k.id} on={f.category === k.id} onClick={() => setF({ ...f, category: k.id })}>{k.label}</Chip>)}
          </div>
        </div>
        <div role="radiogroup" aria-label="Como receber">
          <span className={group}>Como receber</span>
          <div className="flex flex-wrap gap-2">
            {([["all", "Tanto faz"], ["delivery", "Entrega"], ["pickup", "Retirada"]] as [FoodMode, string][]).map(([id, label]) =>
              <Chip key={id} on={f.mode === id} onClick={() => setF({ ...f, mode: id })}>{label}</Chip>)}
          </div>
        </div>
        <div>
          <span className={group}>Funcionamento</span>
          <Chip role="checkbox" on={f.openNow} onClick={() => setF({ ...f, openNow: !f.openNow })}>Aberto agora</Chip>
        </div>
        <div role="radiogroup" aria-label="Ordenar por">
          <span className={group}>Ordenar por</span>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(SORT_LABEL) as FoodSort[]).map((id) => <Chip key={id} on={f.sort === id} onClick={() => setF({ ...f, sort: id })}>{SORT_LABEL[id]}</Chip>)}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

function CitySheet({ city, home, gps, onPick, onLocate, onClose }: { city: FoodCityId; home: FoodCityId | null; gps: string; onPick: (c: FoodCityId) => void; onLocate: () => void; onClose: () => void }) {
  const note: Record<string, string> = {
    asking: "Buscando sua localização…",
    denied: "Sem permissão de localização. Escolha a cidade na lista.",
    outside: "Não encontramos lojas na sua região. Escolha uma das cidades abaixo.",
    unsupported: "Este aparelho não oferece GPS. Escolha a cidade na lista.",
  };
  return (
    <Sheet title="Onde você quer pedir?" onClose={onClose} testId="city-sheet">
      <div className="space-y-4">
        <ul role="radiogroup" aria-label="Cidade" className="space-y-2">
          {FOOD_CITIES.map((c) => (
            <li key={c.id}>
              <button type="button" role="radio" aria-checked={city === c.id} onClick={() => { onPick(c.id); onClose(); }}
                className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left ${city === c.id ? "border-[var(--primary)] bg-tint" : "border-line bg-surface"}`}>
                <span className="min-w-0 flex-1 font-semibold">{c.name}</span>
                {home === c.id && <Badge tone="brand">Sua cidade</Badge>}
                {city === c.id && <Icon name="check" size={20} className="text-brand" />}
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-soft w-full" onClick={onLocate} disabled={gps === "asking"}><Icon name="locate" size={20} />Usar minha localização</button>
        {note[gps] && <p role="status" className="text-sm text-muted">{note[gps]}</p>}
      </div>
    </Sheet>
  );
}

/** Pergunta antes de trocar de cidade quando o GPS achou outra. Duas saídas, sem trocar sozinho. */
function CityPrompt({ current, found, onAnswer }: { current: FoodCityId; found: FoodCityId; onAnswer: (c: FoodCityId) => void }) {
  return (
    <Sheet title="Você mudou de cidade?" onClose={() => onAnswer(current)} testId="city-prompt">
      <p className="text-base">Você está em {cityName(found)}. Quer ver lojas de {cityName(found)} ou continuar em {cityName(current)}?</p>
      <div className="mt-5 space-y-2">
        <button type="button" className="btn btn-primary w-full whitespace-normal" onClick={() => onAnswer(found)}>Ver lojas de {cityName(found)}</button>
        <button type="button" className="btn btn-ghost w-full whitespace-normal" onClick={() => onAnswer(current)}>Continuar em {cityName(current)}</button>
      </div>
    </Sheet>
  );
}

function FeaturedCard({ s, open, fav, onFav }: { s: FoodStore; open: boolean | null; fav: boolean; onFav: () => void }) {
  const promo = promoOf(s);
  return (
    <li className="relative w-[232px] shrink-0 snap-start">
      <Link href={`/passageiro/food/${s.id}`} className="block">
        <span className="relative block">
          <FoodArt store={s} className="h-36 w-full rounded-3xl" />
          {promo && <span className="absolute top-3 left-3 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[#0356C5]">{promo}</span>}
          {open === false && <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white">Fechada</span>}
        </span>
        <span className="mt-2 block truncate pr-12 font-semibold">{s.name}</span>
        <span className="block text-sm text-muted"><Icon name="star" size={13} weight="fill" className="mr-0.5 inline text-[#F5A524]" />{ratingOf(s).toFixed(1).replace(".", ",")} · {s.etaMin}-{s.etaMax} min</span>
        <span className="block text-sm"><span className="font-semibold">{feeText(s)}</span><span className="text-muted"> · a partir de {brl(fromCents(s))}</span></span>
      </Link>
      <HeartButton on={fav} onToggle={onFav} label={s.name} className="absolute top-1 right-0 bg-surface/90" />
    </li>
  );
}

function StoreRow({ s, open, fav, onFav }: { s: FoodStore; open: boolean | null; fav: boolean; onFav: () => void }) {
  const promo = promoOf(s);
  return (
    <li className="card relative">
      <Link href={`/passageiro/food/${s.id}`} className="flex gap-3 p-3 pr-14">
        <FoodArt store={s} compact className="size-24 rounded-2xl" />
        <span className="min-w-0 flex-1 py-0.5">
          <span className="block truncate font-semibold">{s.name}</span>
          <span className="block truncate text-sm text-muted">{categoryLabel(s.category)} · {s.etaMin}-{s.etaMax} min</span>
          <span className="block text-sm text-muted"><Icon name="star" size={13} weight="fill" className="mr-0.5 inline text-[#F5A524]" />{ratingOf(s).toFixed(1).replace(".", ",")}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-semibold">{feeText(s)}</span>
            {open !== null && <Badge tone={open ? "ok" : "neutral"}>{open ? "Aberta" : "Fechada"}</Badge>}
            {promo && <Badge tone="brand">{promo}</Badge>}
          </span>
        </span>
      </Link>
      <HeartButton on={fav} onToggle={onFav} label={s.name} className="absolute top-1.5 right-1" />
    </li>
  );
}

const cartCount = (s: FoodState | null) => (s ? Object.values(s.carts).reduce((t, l) => t + itemCount(l), 0) : 0);

/** Aba Food: topo com a conta e a cidade, busca com filtros, banners, categorias, destaques e lojas. */
export function FoodHome() {
  const { state, update } = useFoodState();
  const account = useFoodAccount();
  const geo = useFoodCity(account, { state, update });
  const now = useNow(5000);
  const [q, setQ] = useState("");
  const [f, setF] = useState<FoodFilters>(NO_FILTERS);
  const [sheet, setSheet] = useState<"filters" | "city" | null>(null);
  const { city } = geo;

  const openIds = useMemo(() => {
    if (!now) return null;
    const m = brasiliaMinutes(new Date(now));
    return new Set(FOOD_STORES.filter((s) => isOpenAt(state?.turns[s.id] ?? s.turns, m)).map((s) => s.id));
  }, [now, state?.turns]);
  const stores = useMemo(() => filterStores(FOOD_STORES, city, q, f, openIds), [city, q, f, openIds]);
  const featured = useMemo(() => FOOD_STORES.filter((s) => s.city === city && promoOf(s)).sort((a, b) => ratingOf(b) - ratingOf(a)).slice(0, 6), [city]);
  const openOf = (s: FoodStore) => (openIds ? openIds.has(s.id) : null);
  const toggleFav = (id: string) => update((s) => ({ ...s, favStores: s.favStores.includes(id) ? s.favStores.filter((x) => x !== id) : [...s.favStores, id] }));
  const isFav = (id: string) => !!state?.favStores.includes(id);

  const active = state?.orders.find((o) => {
    const status = o.cancelledAt ? "cancelled" : simulatedStatus((now ?? o.createdAt) - o.createdAt, o.fulfillment);
    return !isFinal(status);
  });
  const activeStatus = active && now ? simulatedStatus(now - active.createdAt, active.fulfillment) : null;
  const filtering = !!q.trim() || activeFilterCount(f) > 0;
  const nFilters = activeFilterCount(f);

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <FoodWordmark />
        <header className="flex items-center gap-2">
          <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full text-sm font-bold text-white" style={{ background: "var(--grad)", textShadow: "0 1px 2px rgb(0 0 0 / .25)" }}>{account?.initials ?? ""}</span>
          <button type="button" onClick={() => setSheet("city")} aria-haspopup="dialog" data-testid="food-city" className="min-h-11 min-w-0 flex-1 rounded-2xl px-2 text-left">
            <span className="block text-xs text-muted">{account ? `Olá, ${account.firstName}` : "Entregar em"}</span>
            <span className="flex items-center gap-1 font-semibold"><span className="truncate">{cityName(city)}</span><Icon name="caret" size={14} className="shrink-0 text-brand" /></span>
          </button>
          <nav aria-label="Atalhos do Food" className="flex shrink-0 gap-1.5">
            <TopIcon href="/passageiro/food/cupons" icon="ticket" label="Cupons" />
            <TopIcon href="/passageiro/food/pedidos" icon="clipboard" label="Meus pedidos" />
            <TopIcon href="/passageiro/food/carrinho" icon="bag" label="Carrinho e favoritos" count={cartCount(state)} />
          </nav>
        </header>
      </div>

      {active && activeStatus && (
        <Link href={`/passageiro/food/pedido/${active.id}`} className="card flex items-center gap-3 p-4" data-testid="food-active-order">
          <IconGlyph name="receipt" size={44} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-muted">Pedido em andamento</span>
            <span className="block truncate font-semibold">{active.storeName}</span>
            <span className="block text-sm font-semibold text-brand">{STATUS_LABEL[activeStatus]}</span>
          </span>
        </Link>
      )}

      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Icon name="search" size={20} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
          <input type="search" className="input h-12 w-full" style={{ paddingLeft: "2.75rem" }} placeholder="Buscar loja ou prato" aria-label="Buscar loja ou prato" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button type="button" onClick={() => setSheet("filters")} aria-haspopup="dialog" aria-label={nFilters ? `Filtros, ${nFilters} ativos` : "Filtros"} data-testid="food-filters"
          className="relative grid size-12 shrink-0 place-items-center rounded-full bg-surface-2">
          <Icon name="sliders" size={22} />
          {nFilters > 0 && <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--primary)] px-1 text-[11px] leading-none font-bold text-white">{nFilters}</span>}
        </button>
      </div>

      {!filtering && <BannerCarousel />}

      <div role="group" aria-label="Categorias" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FOOD_CATEGORIES.map((k) => {
          const on = f.category === k.id;
          return (
            <button key={k.id} type="button" aria-pressed={on} onClick={() => setF({ ...f, category: on ? null : k.id })} className="flex w-[76px] shrink-0 flex-col items-center gap-1.5 py-1">
              <span className={`grid size-16 place-items-center rounded-full transition-colors ${on ? "bg-[var(--primary)] ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-bg" : "bg-tint"}`}>
                <IconGlyph name={CATEGORY_GLYPH[k.id]} size={32} bare tone={on ? "glass" : "brand"} />
              </span>
              <span className={`text-xs font-semibold ${on ? "text-brand" : "text-ink"}`}>{k.label}</span>
            </button>
          );
        })}
      </div>

      {!filtering && featured.length > 0 && (
        <section aria-label="Destaques" className="space-y-3">
          <h2 className="display text-xl">Destaques</h2>
          <ul className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {featured.map((s) => <FeaturedCard key={s.id} s={s} open={openOf(s)} fav={isFav(s.id)} onFav={() => toggleFav(s.id)} />)}
          </ul>
        </section>
      )}

      <section aria-label="Lojas" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="display text-xl">Lojas em {cityName(city)}</h2>
          <span className="text-sm text-muted">{stores.length} {stores.length === 1 ? "loja" : "lojas"}</span>
        </div>
        {stores.length === 0 ? (
          <Empty icon="store" title="Nenhuma loja por aqui">
            Tente outra categoria, outra cidade ou outra busca.
            {nFilters > 0 && <button type="button" className="mt-3 block min-h-11 w-full font-semibold text-brand" onClick={() => setF(NO_FILTERS)}>Limpar filtros</button>}
          </Empty>
        ) : (
          <ul className="space-y-3">
            {stores.map((s) => <StoreRow key={s.id} s={s} open={openOf(s)} fav={isFav(s.id)} onFav={() => toggleFav(s.id)} />)}
          </ul>
        )}
      </section>

      {sheet === "filters" && <FilterSheet f={f} setF={setF} count={stores.length} onClose={() => setSheet(null)} />}
      {sheet === "city" && <CitySheet city={city} home={account?.homeCity ?? null} gps={geo.gps} onPick={geo.choose} onLocate={geo.detect} onClose={() => setSheet(null)} />}
      {geo.pending && !sheet && <CityPrompt current={city} found={geo.pending} onAnswer={geo.answer} />}
    </div>
  );
}
