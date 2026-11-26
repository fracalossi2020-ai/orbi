import type { Fulfillment, FoodStatus } from "./types";

/**
 * Estados do pedido do Orbi Food: pending > accepted > preparing > ready > delivered,
 * com picked_up no lugar de delivered na retirada, e cancelled (só até "em preparo").
 */
export const STATUS_LABEL: Record<FoodStatus, string> = {
  pending: "Aguardando a loja", accepted: "Pedido aceito", preparing: "Em preparo", ready: "Pronto",
  delivered: "Entregue", picked_up: "Retirado", cancelled: "Cancelado",
};

const FLOW: FoodStatus[] = ["pending", "accepted", "preparing", "ready"];

export const finalStatus = (f: Fulfillment): FoodStatus => (f === "pickup" ? "picked_up" : "delivered");

export const isFinal = (s: FoodStatus) => s === "delivered" || s === "picked_up" || s === "cancelled";

/** Linha do tempo na ordem, já com o último passo certo para o tipo de pedido. */
export const timeline = (f: Fulfillment): FoodStatus[] => [...FLOW, finalStatus(f)];

/** Próximo passo; null em estado final. */
export function nextStatus(s: FoodStatus, f: Fulfillment): FoodStatus | null {
  if (isFinal(s)) return null;
  const i = FLOW.indexOf(s);
  return i < FLOW.length - 1 ? FLOW[i + 1] : finalStatus(f);
}

/** Só avança um passo por vez; cancelar vale até "em preparo". Entrega não vira retirada nem o contrário. */
export function canTransition(from: FoodStatus, to: FoodStatus, f: Fulfillment): boolean {
  if (isFinal(from)) return false;
  if (to === "cancelled") return from === "pending" || from === "accepted" || from === "preparing";
  return nextStatus(from, f) === to;
}

/** Texto do botão da loja para o próximo passo. */
export function actionLabel(s: FoodStatus, f: Fulfillment): string | null {
  const n = nextStatus(s, f);
  if (!n) return null;
  return n === "accepted" ? "Aceitar" : n === "preparing" ? "Em preparo" : n === "ready" ? "Pronto" : n === "picked_up" ? "Retirado" : "Entregue";
}

/** Tempos da simulação (a demo anda rápido): em ms desde a criação do pedido. */
export const DEMO_SCHEDULE = { accepted: 4_000, preparing: 10_000, ready: 22_000, done: 34_000 } as const;

/** Estado simulado pelo tempo decorrido. Tempo negativo conta como zero. */
export function simulatedStatus(elapsedMs: number, f: Fulfillment, s = DEMO_SCHEDULE): FoodStatus {
  const t = Math.max(0, elapsedMs);
  if (t >= s.done) return finalStatus(f);
  if (t >= s.ready) return "ready";
  if (t >= s.preparing) return "preparing";
  if (t >= s.accepted) return "accepted";
  return "pending";
}

/** Limites do alerta de atraso no painel da loja, em minutos. */
export const DELAY_LIMITS_MIN = { pending: 5, preparing: 30 } as const;

/** Atraso: pendente há mais de 5 min ou em preparo há mais de 30. `sinceMs` é há quanto tempo está no estado atual. */
export function delayAlert(s: FoodStatus, sinceMs: number): { minutes: number; text: string } | null {
  const minutes = Math.floor(Math.max(0, sinceMs) / 60_000);
  if (s === "pending" && sinceMs > DELAY_LIMITS_MIN.pending * 60_000) return { minutes, text: `Sem resposta há ${minutes} min. Aceite ou recuse.` };
  if (s === "preparing" && sinceMs > DELAY_LIMITS_MIN.preparing * 60_000) return { minutes, text: `Em preparo há ${minutes} min. O cliente está esperando.` };
  return null;
}
