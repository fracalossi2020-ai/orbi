"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { Icon } from "@/components/Icon";
import { PhoneFrame } from "./PhoneMock";

/**
 * Para motoristas, no mesmo celular claro do hero: a oferta chega com o ganho já aberto, é aceita,
 * o carro faz a corrida no mapa e o valor entra no ganho do dia. Ciclo de 12,6 s, só enquanto aparece na tela;
 * com "reduzir movimento", fica parado na oferta. Valores ilustrativos.
 */
const GROSS = 2500, FEE = 375, NET = GROSS - FEE;
const DAY = [3400, 5200, 2800, 6100, 4300]; // corridas anteriores do dia, em centavos
const OFFER = 3.2, ACCEPTED = 4.8, TRIP = 8.8, CYCLE = 12.6; // limites das etapas, em segundos
const ROUTE = "M 196 455 C 250 410, 150 330, 210 350 S 150 230, 120 170 S 40 160, 40 70";
const TRIP_MIN = 14;

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const EASE = [.2, .8, .2, 1] as const;

export function OfferFlow() {
  const reduce = useReducedMotion();
  const host = useRef<HTMLDivElement>(null);
  const visible = useInView(host, { amount: .3 });
  const [t, setT] = useState(0);

  useEffect(() => {
    if (reduce || !visible) return;
    const id = setInterval(() => setT((x) => (x + .25) % CYCLE), 250);
    return () => clearInterval(id);
  }, [reduce, visible]);

  const step = t < OFFER ? 0 : t < ACCEPTED ? 1 : t < TRIP ? 2 : 3;
  const progress = step === 2 ? (t - ACCEPTED) / (TRIP - ACCEPTED) : step === 3 ? 1 : 0;
  const minutes = Math.max(1, Math.ceil(TRIP_MIN * (1 - progress)));
  const total = DAY.reduce((a, b) => a + b, 0) + (step === 3 ? NET : 0);
  const max = Math.max(...DAY, NET);

  // Posição e direção do carro no trajeto.
  const route = useRef<SVGPathElement>(null);
  const [car, setCar] = useState({ x: 196, y: 455, a: -90 });
  useEffect(() => {
    const el = route.current;
    if (!el) return;
    const len = el.getTotalLength();
    const at = Math.min(len - 1, progress * len);
    const a = el.getPointAtLength(at), b = el.getPointAtLength(Math.min(len, at + 1));
    setCar({ x: a.x, y: a.y, a: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI });
  }, [progress]);

  const sheet = "absolute inset-x-0 bottom-0 z-10 rounded-t-[26px] bg-white px-4 pt-3 pb-5 text-[#02060E] shadow-[0_-8px_24px_-16px_rgb(2_6_14/.35)]";
  const pop = { initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 24 }, transition: { duration: .4, ease: EASE } };

  return (
    <div ref={host} className="relative mx-auto grid w-full max-w-[460px] place-items-center py-4">
      {/* A órbita do símbolo da Orbi em volta do celular */}
      <div aria-hidden="true" className="absolute top-1/2 left-1/2 aspect-square w-[min(440px,96%)] -translate-x-1/2 -translate-y-1/2">
        <motion.div className="absolute inset-0 rounded-full border-2 border-[#0356C5]/25" animate={reduce ? undefined : { rotate: 360 }} transition={{ duration: 40, repeat: Infinity, ease: "linear" }}>
          <span className="absolute -top-2 left-1/2 size-4 -translate-x-1/2 rounded-full bg-[#0356C5]" />
        </motion.div>
      </div>

      <PhoneFrame tone="light" className="relative">
        <svg viewBox="0 0 260 570" className="absolute inset-0 size-full" aria-hidden="true">
          <rect width="260" height="570" fill="#EEF2F6" />
          <path d="M150 380 C 200 370, 250 400, 260 440 L260 570 L120 570 C 110 500, 120 420, 150 380 Z" fill="#DDEFE3" />
          <path d="M-10 520 C 60 500, 120 540, 270 505" fill="none" stroke="#CFE6FA" strokeWidth="16" />
          <g fill="none" stroke="#FFFFFF" strokeLinecap="round">
            <path d="M40 0 V 600 M150 0 V 600 M228 0 V 600" strokeWidth="11" />
            <path d="M-10 70 H 270 M-10 230 H 270 M-10 350 H 270 M-10 455 H 270" strokeWidth="11" />
            <path d="M0 150 L 260 110 M90 0 L 120 600" strokeWidth="6" />
          </g>
          <path ref={route} d={ROUTE} fill="none" stroke="#0356C5" strokeOpacity=".18" strokeWidth="7" strokeLinecap="round" />
          <motion.path d={ROUTE} fill="none" stroke="#0356C5" strokeWidth="5" strokeLinecap="round" pathLength={1} strokeDasharray="1 1"
            initial={false} animate={{ strokeDashoffset: -progress, opacity: step === 0 ? .55 : 1 }} transition={{ duration: .25, ease: "linear" }} />
          {/* Partida (onde o passageiro espera) e destino */}
          <g transform="translate(196 455)"><circle r="9" fill="#FFFFFF" stroke="#0356C5" strokeWidth="4" /></g>
          <g transform="translate(40 70)"><rect x="-8" y="-8" width="16" height="16" rx="4" fill="#02060E" /></g>
          <motion.g initial={false} animate={{ x: car.x, y: car.y }} transition={{ duration: t === 0 ? 0 : .25, ease: "linear" }}>
            <g transform={`rotate(${car.a})`}>
              <rect x="-14" y="-9" width="28" height="18" rx="6" fill="#02060E" />
              <rect x="2" y="-6" width="7" height="12" rx="2" fill="#5CC8FF" />
              <rect x="-11" y="-6" width="5" height="12" rx="2" fill="#2A3346" />
            </g>
          </motion.g>
        </svg>

        {/* Faixa do topo */}
        <div className="absolute inset-x-3 top-11 z-10">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={step === 3 ? "fim" : step === 2 ? "viagem" : "oferta"} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .3 }}
              className={`flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-white shadow-[0_8px_20px_-10px_rgb(2_6_14/.5)] ${step === 3 ? "bg-[#1B7F5A]" : step === 2 ? "bg-[#02060E]" : "bg-[#0356C5]"}`}>
              <Icon name={step === 3 ? "check" : step === 2 ? "car" : "pin"} size={18} />
              <span className="text-[13px] font-semibold leading-tight">
                {step === 3 ? "Corrida concluída" : step === 2 ? <>Em viagem · <span className="num">{minutes} min</span></> : step === 1 ? "Corrida aceita" : "Nova corrida perto de você"}
              </span>
            </motion.div>
          </AnimatePresence>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {step < 2 && (
            <motion.div key="oferta" className={sheet} {...pop}>
              <span className="mx-auto mb-3 block h-1 w-9 rounded-full bg-[#D5DBE3]" />
              <div className="flex items-center justify-between">
                <p className="num text-[12px] text-[#536071]">6,2 km · ~{TRIP_MIN} min</p>
                {/* Tempo para decidir: o anel esvazia enquanto a oferta está aberta */}
                <svg width="26" height="26" viewBox="0 0 30 30" aria-hidden="true">
                  <circle cx="15" cy="15" r="12" fill="none" stroke="#0356C5" strokeOpacity=".15" strokeWidth="3" />
                  <circle cx="15" cy="15" r="12" fill="none" stroke="#0356C5" strokeWidth="3" strokeLinecap="round" transform="rotate(-90 15 15)" pathLength={1} strokeDasharray="1 1"
                    strokeDashoffset={step === 0 ? Math.min(.8, (t / OFFER) * .8) : 0} />
                </svg>
              </div>
              <dl className="num mt-2 space-y-1 text-[13px]">
                <div className="flex justify-between"><dt className="text-[#536071]">Valor bruto</dt><dd>{brl(GROSS)}</dd></div>
                <div className="flex justify-between"><dt className="text-[#536071]">Comissão Orbi</dt><dd>− {brl(FEE)}</dd></div>
                <div className="flex items-baseline justify-between border-t border-[#E3E8EE] pt-2">
                  <dt className="font-semibold">Você recebe</dt><dd className="text-2xl font-semibold text-[#0356C5]">{brl(NET)}</dd>
                </div>
              </dl>
              <div className="mt-3.5 grid grid-cols-[1fr_2fr] gap-2 text-[13px] font-semibold">
                <span className="rounded-full bg-[#F1F4F8] py-2.5 text-center text-[#536071]">Recusar</span>
                <motion.span className="rounded-full bg-[#0356C5] py-2.5 text-center text-white" initial={false}
                  animate={step === 1 && !reduce ? { scale: [1, .94, 1] } : { scale: 1 }} transition={{ duration: .5 }}>
                  {step === 0 ? "Aceitar" : <span className="inline-flex items-center gap-1.5"><Icon name="check" size={16} /> Aceita</span>}
                </motion.span>
              </div>
            </motion.div>
          )}
          {step === 3 && (
            <motion.div key="dia" className={sheet} {...pop}>
              <span className="mx-auto mb-3 block h-1 w-9 rounded-full bg-[#D5DBE3]" />
              <p className="text-[12px] font-semibold text-[#1B7F5A]">+ {brl(NET)} nesta corrida</p>
              <p className="mt-2 text-[12px] text-[#536071]">Ganho de hoje</p>
              <p className="num text-3xl font-semibold tracking-tight">{brl(total)}</p>
              <div className="mt-3 flex h-16 items-end gap-1.5">
                {[...DAY, NET].map((v, i) => {
                  const last = i === DAY.length;
                  return (
                    <motion.span key={i} className="flex-1 rounded-t-md" style={{ background: last ? "#0356C5" : "#D6E4F7", originY: 1, height: `${(v / max) * 100}%` }}
                      initial={{ scaleY: last ? 0 : 1 }} animate={{ scaleY: 1 }} transition={{ duration: .7, delay: last ? .3 : 0, ease: EASE }} />
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </PhoneFrame>
      <p className="mono-label relative mt-4 text-center text-[#536071]">Exemplo ilustrativo</p>
    </div>
  );
}
