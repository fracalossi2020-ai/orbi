"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconGlyph } from "@/frontend/components/IconGlyph";
import { CATEGORY_GLYPH } from "@/frontend/components/food/parts";
import { FOOD_BANNERS } from "@/shared/food/demo-data";
import type { CoverTone } from "@/shared/food/types";

/** Fundos dos banners: degradês azuis da paleta Orbi, todos escuros o bastante para texto branco. */
const BG: Record<CoverTone, string> = {
  0: "linear-gradient(135deg, #0A1E3D 0%, #0356C5 100%)",
  1: "linear-gradient(135deg, #0356C5 0%, #0A3BFF 100%)",
  2: "linear-gradient(135deg, #0B6BFF 0%, #0A3BFF 100%)",
  3: "linear-gradient(135deg, #02060E 0%, #0A3BFF 120%)",
};
const AUTOPLAY_MS = 4000;

/**
 * Carrossel de banners da home. Passa sozinho a cada 4 s, mas só com a tela visível, a aba em primeiro plano e sem o dedo em cima;
 * quem pediu menos movimento (prefers-reduced-motion) não tem autoplay. Rolagem por deslize (scroll-snap) e indicadores tocáveis.
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
    const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0;
    el.scrollTo({ left: child.offsetLeft - pad, behavior: smooth && !reduced ? "smooth" : "auto" });
  }, [reduced]);

  // O índice acompanha a rolagem (deslize do dedo ou autoplay): o slide mais perto do início.
  const onScroll = () => {
    const el = box.current;
    if (!el) return;
    const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0;
    let best = 0, bestD = Infinity;
    Array.from(el.children).forEach((c, k) => { const d = Math.abs((c as HTMLElement).offsetLeft - pad - el.scrollLeft); if (d < bestD) { best = k; bestD = d; } });
    setI(best);
  };

  useEffect(() => {
    if (reduced || !visible || touching) return;
    const t = setInterval(() => { if (!document.hidden) go((i + 1) % n); }, AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [reduced, visible, touching, i, n, go]);

  return (
    <section aria-roledescription="carrossel" aria-label="Promoções" className="space-y-2.5">
      <ul ref={box} onScroll={onScroll} onPointerDown={() => setTouching(true)} onPointerUp={() => setTouching(false)} onPointerCancel={() => setTouching(false)}
        data-testid="food-banners" className="relative -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FOOD_BANNERS.map((b, k) => (
          <li key={b.id} aria-roledescription="slide" aria-label={`${k + 1} de ${n}`} className="w-[86%] max-w-[420px] shrink-0 snap-start">
            <Link href={b.to === "cupons" ? "/passageiro/food/cupons" : `/passageiro/food/${b.to}`} tabIndex={k === i ? 0 : -1}
              className="relative flex h-36 items-center overflow-hidden rounded-3xl px-5 text-white" style={{ background: BG[b.tone] }}>
              <span aria-hidden="true" className="absolute -top-10 -right-8 size-40 rounded-full bg-[#00E1FF]/25" />
              <span aria-hidden="true" className="absolute -right-3 -bottom-14 size-36 rounded-full bg-white/10" />
              <span className="relative z-10 max-w-[62%]">
                <span className="mb-2 inline-block rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap">Demonstração</span>
                <span className="display block text-xl leading-tight">{b.title}</span>
                <span className="mt-1 block text-sm text-white/85">{b.sub}</span>
              </span>
              <span aria-hidden="true" className="absolute right-4 bottom-4 z-10"><IconGlyph name={CATEGORY_GLYPH[b.glyph]} size={64} bare tone="glass" /></span>
            </Link>
          </li>
        ))}
      </ul>
      <div role="group" aria-label="Escolher banner" className="flex justify-center">
        {FOOD_BANNERS.map((b, k) => (
          <button key={b.id} type="button" aria-label={`Banner ${k + 1}`} aria-current={k === i} onClick={() => go(k)} className="-my-1.5 grid h-11 w-9 place-items-center">
            <span className={`block h-2 rounded-full transition-all motion-reduce:transition-none ${k === i ? "w-6 bg-[var(--primary)]" : "w-2 bg-line"}`} />
          </button>
        ))}
      </div>
    </section>
  );
}
