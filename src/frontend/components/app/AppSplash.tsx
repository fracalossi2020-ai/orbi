"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { OrbiMark } from "@/frontend/components/OrbiMark";
import { Wordmark } from "@/frontend/components/app/Wordmark";
import { SPLASH_SKIP_KEY } from "@/frontend/lib/splash";

/**
 * Abertura do app, toda vez que ele é aberto:
 * 1. Fundo azul vivo da marca; o símbolo e o nome "Orbi" já aparecem na primeira pintura (entrada em CSS, sem esperar o JavaScript).
 * 2. O símbolo dá dois pulos rápidos, com um leve achatar ao tocar o chão.
 * 3. O nome some; o símbolo vai para o centro girando como uma órbita e cresce até "encostar na câmera".
 *    O fundo clareia até o branco no mesmo instante, e a abertura some revelando a tela de entrada (que é branca).
 * Tocar pula. Com "reduzir movimento": sem pulos nem giro, some depois de pouco mais de 1 s.
 * Não aparece depois de uma ação de dentro do app (ver skipNextSplash em src/frontend/lib/splash.ts).
 * O azul já vem no HTML do servidor ("boot"), então cobre desde a primeira pintura.
 */

const BLUE = "#1166FF";
const HOPS_MS = 890; // dois pulos rápidos (2 × 0,42 s + pausa)
const LATE_MS = 1500; // se a página demorou mais que isso para carregar, pula os pulos e já gira
const ZOOM_MS = 700; // giro em órbita até encostar na câmera
const REDUCED_MS = 900;

// Pedido de pular (marcado pelo script do <head>): esconde antes da pintura. Se o JavaScript nunca carregar, some sozinha.
// A entrada do símbolo e do nome é CSS puro: aparece na primeira pintura, sem esperar o JavaScript carregar.
const SSR_CSS = `html[data-splash="skip"] [data-orbi-splash]{display:none}
[data-orbi-splash]{animation:orbi-splash-fallback .3s ease-out 5s forwards}
@keyframes orbi-splash-fallback{to{opacity:0;visibility:hidden;pointer-events:none}}
.orbi-splash-in{animation:orbi-splash-in .6s cubic-bezier(.34,1.56,.64,1) both}
@keyframes orbi-splash-in{from{opacity:0;transform:translateY(16px) scale(.7)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.orbi-splash-in{animation:none}}`;

// Uma vez por carregamento da página: as trocas de tela dentro do app não mostram a abertura de novo.
let shownThisLoad = false;

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function shouldShow(): boolean {
  if (shownThisLoad) return false;
  shownThisLoad = true;
  // Navegador controlado por automação (testes de ponta a ponta): a abertura de ~4 s a cada página só atrasaria os testes.
  if (navigator.webdriver) return false;
  try {
    if (sessionStorage.getItem(SPLASH_SKIP_KEY)) {
      sessionStorage.removeItem(SPLASH_SKIP_KEY);
      return false;
    }
  } catch { /* sem armazenamento: mostra */ }
  return true;
}

type Mode = "boot" | "intro" | "zoom" | "off";

export default function AppSplash() {
  const [mode, setMode] = useState<Mode>("boot");
  const reduce = useReducedMotion();
  const mark = useRef<HTMLSpanElement>(null);
  // Quanto o símbolo anda para chegar ao centro da tela quando começa o giro.
  const [shift, setShift] = useState({ x: 0, y: 0 });
  // Quando os pulos começam (s), ou null se a página demorou e a abertura vai direto para o giro.
  const [hopDelay, setHopDelay] = useState<number | null>(null);

  useIsoLayoutEffect(() => {
    const show = shouldShow();
    if (!show) document.documentElement.removeAttribute("data-splash");
    setMode(show ? "intro" : "off");
  }, []);

  useEffect(() => {
    if (mode === "intro") {
      // O tempo conta desde a abertura da página, não desde o fim do carregamento: num celular lento, não soma espera.
      const since = performance.now();
      const late = since > LATE_MS;
      const delay = late ? 0.1 : Math.max(0.1, (650 - since) / 1000); // pulos depois da entrada em CSS (~0,6 s)
      setHopDelay(late || reduce ? null : delay);
      const wait = reduce ? Math.max(200, REDUCED_MS - since) : late ? 150 : delay * 1000 + HOPS_MS + 100;
      const t = window.setTimeout(() => {
        if (reduce) { setMode("off"); return; }
        const r = mark.current?.getBoundingClientRect();
        if (r) setShift({ x: innerWidth / 2 - (r.left + r.width / 2), y: innerHeight / 2 - (r.top + r.height / 2) });
        setMode("zoom");
      }, wait);
      return () => window.clearTimeout(t);
    }
    if (mode === "zoom") {
      const t = window.setTimeout(() => setMode("off"), ZOOM_MS);
      return () => window.clearTimeout(t);
    }
  }, [mode, reduce]);

  const zoom = mode === "zoom";
  const hopping = mode === "intro" && !reduce && hopDelay !== null;
  // Chegada à câmera: começa devagar e acelera, como algo vindo na nossa direção.
  const rush = [0.6, 0, 0.9, 0.4] as const;

  return (
    <AnimatePresence>
      {mode !== "off" && (
        <motion.div
          key="orbi-splash"
          aria-hidden="true"
          data-testid="app-splash"
          data-orbi-splash=""
          data-mode={mode}
          onPointerDown={() => setMode("off")}
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden select-none"
          style={{ backgroundColor: BLUE, color: "#FFFFFF" }}
          initial={{ opacity: 1 }}
          animate={{ backgroundColor: zoom ? "#FFFFFF" : BLUE }}
          transition={{ backgroundColor: { duration: zoom ? 0.32 : 0, delay: zoom ? 0.34 : 0, ease: "easeIn" } }}
          // Saída direto do "boot" (pedido de pular): some na hora. Depois do giro: um fade curto revela a entrada.
          exit={{ opacity: 0, transition: { duration: mode === "boot" ? 0 : reduce ? 0.2 : 0.3, ease: "easeOut" } }}
        >
          <style>{SSR_CSS}</style>
          <div className="orbi-splash-in flex items-center gap-3.5">
            {/* Símbolo: entra, pula e, no fim, gira em órbita até ocupar a tela. */}
            <motion.span
              ref={mark}
              className="block will-change-transform"
              initial={false}
              animate={zoom ? { x: shift.x, y: shift.y, scale: 42, rotate: 600 } : { scale: 1, x: 0, y: 0, rotate: 0 }}
              transition={zoom ? { duration: ZOOM_MS / 1000, ease: rush } : { duration: 0 }}
            >
              <motion.span
                className="block"
                style={{ transformOrigin: "50% 100%" }}
                initial={false}
                animate={hopping ? { y: [0, -16, 0], scaleX: [1.06, 0.97, 1.06], scaleY: [0.92, 1.05, 0.92] } : { y: 0, scaleX: 1, scaleY: 1 }}
                transition={hopping
                  ? { duration: 0.42, times: [0, 0.5, 1], ease: ["easeOut", "easeIn"], repeat: 1, repeatDelay: 0.05, delay: hopDelay ?? 0 }
                  : { duration: 0.15 }}
              >
                <OrbiMark size={60} flat="#FFFFFF" gid="orbi-splash-g" />
              </motion.span>
            </motion.span>
            {/* Nome: entra logo depois do símbolo e sai rápido quando começa o giro. */}
            <motion.span
              className="block"
              initial={false}
              animate={zoom ? { opacity: 0, x: 12, scale: 0.85 } : { opacity: 1, x: 0, scale: 1 }}
              transition={zoom ? { duration: 0.22, ease: "easeIn" } : { duration: 0 }}
            >
              <Wordmark className="text-[48px] pb-[0.06em]" />
            </motion.span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
