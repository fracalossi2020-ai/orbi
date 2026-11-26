"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Empty } from "@/frontend/components/ui";
import { Icon } from "@/frontend/components/Icon";
import { IconGlyph } from "@/frontend/components/IconGlyph";
import { FoodIcon, type FoodIconName } from "@/frontend/components/food/FoodIcons";
import { BannerCarousel } from "@/frontend/components/food/BannerCarousel";
import { HeartButton, Sheet } from "@/frontend/components/food/FoodUi";
import { FoodArt } from "@/frontend/components/food/parts";
import { asset } from "@/frontend/lib/site-mode";
import { categoryThumb } from "@/shared/food/photos";
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
const feeShort = (s: FoodStore) => (s.deliveryFeeCents === null ? "Só retirada" : s.deliveryFeeCents === 0 ? "Grátis" : `Entrega ${brl(s.deliveryFeeCents)}`);

/** Selo de contagem (carrinho, filtros): anel na cor do fundo para destacar. O azul fica só para ação e estado. */
function CountBadge({ n }: { n: number }) {
  return <span aria-hidden="true" className="absolute top-0.5 right-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[var(--primary)] px-1 text-[10px] leading-none font-bold text-white ring-2 ring-[var(--bg)]">{n > 9 ? "9+" : n}</span>;
}

/** Ícone do topo: só o traço, sem fundo, com 44 px de toque. */
function TopIcon({ href, icon, label, count }: { href: string; icon: FoodIconName; label: string; count?: number }) {
  return (
    <Link href={href} aria-label={count ? `${label}, ${count} ${count === 1 ? "item" : "itens"}` : label} className="relative grid size-11 shrink-0 place-items-center rounded-full text-ink active:bg-surface-2">
      <FoodIcon name={icon} size={24} />
      {!!count && <CountBadge n={count} />}
    </Link>
  );
}

const SECTION = "text-lg font-semibold";

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
    <li className="relative w-[70%] max-w-[260px] shrink-0 snap-start">
      <Link href={`/passageiro/food/${s.id}`} className="block">
        <span className="relative block">
          <FoodArt store={s} className="h-32 w-full rounded-2xl" />
          {promo && <span className="absolute top-2.5 left-2.5 rounded-md bg-[#0A3BFF] px-1.5 py-0.5 text-[11px] font-bold text-white">{promo}</span>}
          {open === false && <span className="absolute bottom-2.5 left-2.5 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-semibold text-white">Fechada</span>}
        </span>
        <span className="mt-2 block truncate font-semibold">{s.name}</span>
        <span className="block truncate text-[13px] text-muted">
          <Icon name="star" size={12} weight="fill" className="mr-0.5 inline text-[#F5A524]" />{ratingOf(s).toFixed(1).replace(".", ",")} · {s.etaMin}-{s.etaMax} min · <span className={s.deliveryFeeCents === 0 ? "font-medium text-ok" : ""}>{feeShort(s)}</span>
        </span>
      </Link>
      <HeartButton on={fav} onToggle={onFav} label={s.name} overlay className="absolute top-0 right-0" />
    </li>
  );
}

function StoreRow({ s, open, fav, onFav }: { s: FoodStore; open: boolean | null; fav: boolean; onFav: () => void }) {
  const promo = promoOf(s);
  return (
    <li className="relative">
      <Link href={`/passageiro/food/${s.id}`} className="flex gap-3 py-3 pr-9">
        <span className="relative shrink-0">
          <FoodArt store={s} compact className="size-20 rounded-2xl" />
          {open === false && <span className="absolute inset-0 grid place-items-center rounded-2xl bg-black/55 text-[11px] font-bold text-white">Fechada</span>}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold">{s.name}</span>
          <span className="mt-0.5 block truncate text-sm text-muted"><Icon name="star" size={13} weight="fill" className="mr-0.5 inline text-[#F5A524]" />{ratingOf(s).toFixed(1).replace(".", ",")} · {categoryLabel(s.category)} · {s.etaMin}-{s.etaMax} min</span>
          <span className="mt-1 flex items-center gap-2 text-sm">
            <span className={`truncate ${s.deliveryFeeCents === 0 ? "font-medium text-ok" : "text-ink"}`}>{feeText(s)}</span>
            {promo && <span className="shrink-0 rounded-md bg-[#0A3BFF] px-1.5 py-0.5 text-[11px] font-bold text-white">{promo}</span>}
          </span>
        </span>
      </Link>
      <HeartButton on={fav} onToggle={onFav} label={s.name} className="absolute top-2 right-[-6px]" />
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
    <div className="space-y-6">
      <h1 className="sr-only">Orbi Food</h1>
      <header className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => setSheet("city")} aria-haspopup="dialog" data-testid="food-city" aria-label={`Entregar em ${cityName(city)}. Trocar cidade`} className="min-h-11 min-w-0 rounded-xl text-left">
          <span className="block text-xs text-muted">{account ? `Olá, ${account.firstName} · entregar em` : "Entregar em"}</span>
          <span className="flex items-center gap-1 text-base font-semibold"><FoodIcon name="pin" size={17} className="shrink-0 text-ink" /><span className="truncate">{cityName(city)}</span><Icon name="caret" size={13} className="shrink-0 text-muted" /></span>
        </button>
        <nav aria-label="Atalhos do Food" className="-mr-2 flex shrink-0">
          <TopIcon href="/passageiro/food/cupons" icon="coupon" label="Cupons" />
          <TopIcon href="/passageiro/food/pedidos" icon="orders" label="Meus pedidos" />
          <TopIcon href="/passageiro/food/carrinho" icon="cart" label="Carrinho e favoritos" count={cartCount(state)} />
        </nav>
      </header>

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

      <div className="relative">
        <FoodIcon name="search" size={20} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
        <input type="search" className="input h-12 w-full" style={{ paddingLeft: "2.75rem", paddingRight: "3.25rem" }} placeholder="Buscar loja ou prato" aria-label="Buscar loja ou prato" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" onClick={() => setSheet("filters")} aria-haspopup="dialog" aria-label={nFilters ? `Filtros, ${nFilters} ativos` : "Filtros"} data-testid="food-filters"
          className="absolute top-1/2 right-0.5 grid size-11 -translate-y-1/2 place-items-center rounded-full text-ink">
          <FoodIcon name="filter" size={22} />
          {nFilters > 0 && <CountBadge n={nFilters} />}
        </button>
      </div>

      {!filtering && <BannerCarousel />}

      <div role="group" aria-label="Categorias" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FOOD_CATEGORIES.map((k) => {
          const on = f.category === k.id;
          return (
            <button key={k.id} type="button" aria-pressed={on} onClick={() => setF({ ...f, category: on ? null : k.id })} className="flex w-[76px] shrink-0 flex-col items-center gap-1.5 py-1">
              <span className={`relative block size-16 overflow-hidden rounded-full transition-shadow motion-reduce:transition-none ${on ? "ring-[3px] ring-[var(--primary)] ring-offset-2 ring-offset-bg" : "ring-1 ring-line"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- miniatura local 160x160 em WebP */}
                <img src={asset(categoryThumb(k.id))} alt="" width={64} height={64} loading="lazy" decoding="async" draggable={false} className="size-full object-cover" />
              </span>
              <span className={`text-xs font-semibold ${on ? "text-brand" : "text-ink"}`}>{k.label}</span>
            </button>
          );
        })}
      </div>

      {!filtering && featured.length > 0 && (
        <section aria-label="Destaques" className="space-y-3">
          <h2 className={SECTION}>Destaques</h2>
          <ul className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {featured.map((s) => <FeaturedCard key={s.id} s={s} open={openOf(s)} fav={isFav(s.id)} onFav={() => toggleFav(s.id)} />)}
          </ul>
        </section>
      )}

      <section aria-label="Lojas" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className={SECTION}>Lojas em {cityName(city)}</h2>
          <span className="text-sm text-muted">{stores.length} {stores.length === 1 ? "loja" : "lojas"}</span>
        </div>
        {stores.length === 0 ? (
          <Empty icon="store" title="Nenhuma loja por aqui">
            Tente outra categoria, outra cidade ou outra busca.
            {nFilters > 0 && <button type="button" className="mt-3 block min-h-11 w-full font-semibold text-brand" onClick={() => setF(NO_FILTERS)}>Limpar filtros</button>}
          </Empty>
        ) : (
          <ul className="divide-y divide-line">
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
