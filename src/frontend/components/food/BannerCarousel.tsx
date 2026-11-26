"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/frontend/components/Icon";
import { asset } from "@/frontend/lib/site-mode";
import { FOOD_BANNERS, type FoodBanner, type FoodBannerTheme } from "@/shared/food/demo-data";
import { categoryPhoto } from "@/shared/food/photos";

/**
 * Cores dos banners: a base é o azul elétrico da Orbi e cada banner traz UM acento (ciano, creme, amarelo, lima).
 * Texto branco sobre fundos escuros o bastante (contraste AA: o trecho mais claro sob o texto é #C2410C, 5,2:1; #6D28D9, 7,1:1; #0A3BFF, 6,3:1).
 * `ink`: cor do texto sobre o acento (selo); `cta`/`ctaInk`: botão em pílula.
 */
const THEME: Record<FoodBannerTheme, { bg: string; accent: string; ink: string; cta: string; ctaInk: string }> = {
  blue: { bg: "linear-gradient(110deg, #0A2FD6 0%, #0A3BFF 55%, #0B6BFF 100%)", accent: "#00E1FF", ink: "#02060E", cta: "#FFFFFF", ctaInk: "#0A2FD6" },
  coral: { bg: "linear-gradient(110deg, #9A3412 0%, #C2410C 58%, #EA580C 100%)", accent: "#FFF1C9", ink: "#7C2D12", cta: "#FFFFFF", ctaInk: "#9A3412" },
  violet: { bg: "linear-gradient(110deg, #4C1D95 0%, #6D28D9 58%, #7C3AED 100%)", accent: "#FDE047", ink: "#3B0764", cta: "#FFFFFF", ctaInk: "#4C1D95" },
  night: { bg: "linear-gradient(110deg, #02060E 0%, #0A1E3D 55%, #0356C5 100%)", accent: "#C6F135", ink: "#10210A", cta: "#C6F135", ctaInk: "#10210A" },
};

/** Moldura da foto de cada banner: formas diferentes para o carrossel não ficar repetitivo. */
function Photo({ b }: { b: FoodBanner }) {
  const t = THEME[b.theme];
  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- arquivo local em WebP, tamanho certo
    <img src={asset(categoryPhoto(b.photo, b.photoVariant))} alt="" loading="lazy" decoding="async" draggable={false} className="absolute inset-0 size-full object-cover" />
  );
  if (b.theme === "blue") return (
    <>
      <span aria-hidden="true" className="absolute top-1/2 -right-7 size-[172px] -translate-y-1/2 rounded-full border-[3px]" style={{ borderColor: `${t.accent}66` }} />
      <span aria-hidden="true" className="absolute top-1/2 -right-5 size-[152px] -translate-y-1/2 overflow-hidden rounded-full shadow-[0_6px_20px_rgb(0_0_0/.25)]">{img}</span>
    </>
  );
  if (b.theme === "coral") return (
    <span aria-hidden="true" className="absolute inset-y-0 right-0 w-[48%] overflow-hidden" style={{ clipPath: "polygon(34% 0, 100% 0, 100% 100%, 0 100%)" }}>{img}</span>
  );
  if (b.theme === "violet") return (
    <>
      <span aria-hidden="true" className="absolute top-3 right-0 bottom-3 w-[48%] rounded-l-full" style={{ background: `${t.accent}33` }} />
      <span aria-hidden="true" className="absolute top-5 right-0 bottom-5 w-[44%] overflow-hidden rounded-l-full">{img}</span>
    </>
  );
  return (
    <>
      <span aria-hidden="true" className="absolute right-3 bottom-0 h-[150px] w-[122px] rounded-t-full" style={{ background: `${t.accent}40` }} />
      <span aria-hidden="true" className="absolute right-[18px] bottom-0 h-[142px] w-[110px] overflow-hidden rounded-t-full">{img}</span>
    </>
  );
}

const TEXT_W: Record<FoodBannerTheme, string> = { blue: "w-[56%]", coral: "w-[56%]", violet: "w-[50%]", night: "w-[56%]" };
const BADGE_POS: Record<FoodBannerTheme, string> = { blue: "top-3 right-3", coral: "right-3 bottom-3", violet: "top-3 right-3", night: "top-3 right-3" };

function Slide({ b, focusable }: { b: FoodBanner; focusable: boolean }) {
  const t = THEME[b.theme];
  return (
    <Link href={b.to === "cupons" ? "/passageiro/food/cupons" : `/passageiro/food/${b.to}`} tabIndex={focusable ? 0 : -1}
      className="relative block h-44 overflow-hidden rounded-3xl text-white" style={{ background: t.bg }}>
      <Photo b={b} />
      <span aria-hidden="true" className={`absolute z-10 grid size-[60px] -rotate-[9deg] place-items-center rounded-full text-center leading-none font-extrabold shadow-[0_3px_10px_rgb(0_0_0/.25)] ${BADGE_POS[b.theme]}`} style={{ background: t.accent, color: t.ink }}>
        <span className="block">
          <span className="display block text-[17px]">{b.badge[0]}</span>
          <span className="mt-0.5 block text-[10px] tracking-wide uppercase">{b.badge[1]}</span>
        </span>
      </span>
      <span className={`relative z-10 flex h-full ${TEXT_W[b.theme]} flex-col items-start justify-center gap-1 pl-5`}>
        <span className="display block text-[22px] leading-[1.05] font-extrabold tracking-tight [text-wrap:balance]">{b.title}</span>
        <span className="line-clamp-2 block text-[13px] leading-tight text-white/90">{b.sub}</span>
        <span className="mt-2 inline-flex h-8 items-center gap-1 rounded-full pr-2.5 pl-3.5 text-[13px] font-bold" style={{ background: t.cta, color: t.ctaInk }}>
          {b.cta}<Icon name="arrow" size={14} />
        </span>
      </span>
    </Link>
  );
}

const AUTOPLAY_MS = 4000;

/**
 * Carrossel de banners da home: um banner centralizado com a espiada simétrica do vizinho. Passa sozinho a cada 4 s, mas só com a tela visível,
 * a aba em primeiro plano e sem o dedo em cima; quem pediu menos movimento (prefers-reduced-motion) não tem autoplay.
 * Rolagem por deslize (scroll-snap) e indicadores tocáveis. Todos os banners têm a mesma altura.
 */
export function BannerCarousel() {
  const box = useRef<HTMLUListElement>(null);
  const [i, setI] = useState(0);
  const [visible, setVisible] = useState(true);
  const [touching, setTouching] = useState(false);
  const [reduced, setReduced] = useState(true);
  const n = FOOD_BANNERS.length;

  useEffect(() => {
    const m = matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const on = () => setReduced(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const go = useCallback((k: number, smooth = true) => {
    const el = box.current;
    const child = el?.children[k] as HTMLElement | undefined;
    if (!el || !child) return;
    // Posição que deixa o banner k no centro da faixa visível.
    el.scrollTo({ left: child.offsetLeft + child.offsetWidth / 2 - el.clientWidth / 2, behavior: smooth && !reduced ? "smooth" : "auto" });
  }, [reduced]);

  // O índice acompanha a rolagem (deslize do dedo ou autoplay): o slide mais perto do centro.
  const onScroll = () => {
    const el = box.current;
    if (!el) return;
    const mid = el.scrollLeft + el.clientWidth / 2;
    let best = 0, bestD = Infinity;
    Array.from(el.children).forEach((c, k) => {
      const h = c as HTMLElement;
      const d = Math.abs(h.offsetLeft + h.offsetWidth / 2 - mid);
      if (d < bestD) { best = k; bestD = d; }
    });
    setI(best);
  };

  useEffect(() => {
    if (reduced || !visible || touching) return;
    const t = setInterval(() => { if (!document.hidden) go((i + 1) % n); }, AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [reduced, visible, touching, i, n, go]);

  return (
    <section aria-roledescription="carrossel" aria-label="Promoções" className="space-y-0">
      <ul ref={box} onScroll={onScroll} onPointerDown={() => setTouching(true)} onPointerUp={() => setTouching(false)} onPointerCancel={() => setTouching(false)}
        data-testid="food-banners" className="relative -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-7 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FOOD_BANNERS.map((b, k) => (
          <li key={b.id} aria-roledescription="slide" aria-label={`${k + 1} de ${n}`} className="w-full max-w-[420px] shrink-0 snap-center">
            <Slide b={b} focusable={k === i} />
          </li>
        ))}
      </ul>
      <div role="group" aria-label="Escolher banner" className="-mt-2.5 flex justify-center">
        {FOOD_BANNERS.map((b, k) => (
          <button key={b.id} type="button" aria-label={`Banner ${k + 1}`} aria-current={k === i} onClick={() => go(k)} className="-my-1.5 grid h-11 w-9 place-items-center">
            <span className={`block h-2 rounded-full transition-all motion-reduce:transition-none ${k === i ? "w-6 bg-[var(--primary)]" : "w-2 bg-line"}`} />
          </button>
        ))}
      </div>
    </section>
  );
}
