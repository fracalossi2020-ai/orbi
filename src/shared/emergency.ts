/** Regras puras do botão de emergência: posição recebida, roteiro para o 190 e mensagem para alguém de confiança. */

export type SosPoint = { lat: number; lng: number };
export type SosActor = "passenger" | "driver";
export type SosVehicle = { make?: string | null; model?: string | null; color?: string | null; plate?: string | null };

import type { RideStatus } from "./transitions";

export const EMERGENCY_NUMBER = "190";
export const SAMU_NUMBER = "192";

/** Texto fixo da folha de emergência: não promete plantão. */
export const EMERGENCY_HONEST_NOTE = "Em emergência, quem atende é o 190. A Orbi recebe este alerta e analisa cada caso, mas não é um plantão 24 horas.";

/** Aceita só coordenadas finitas e dentro do globo; qualquer outra coisa vira nulo (o alerta segue sem a posição). */
export function parseSosPoint(input: unknown): SosPoint | null {
  if (!input || typeof input !== "object") return null;
  const { lat, lng } = input as Record<string, unknown>;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export const mapLink = (p: SosPoint) => `https://www.google.com/maps?q=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
export const coordsText = (p: SosPoint) => `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;

/** "Fiat Argo prata" a partir do que o cadastro do veículo tem. */
export function vehicleText(v: SosVehicle | null | undefined): string {
  if (!v) return "";
  return [v.make, v.model, v.color].map((x) => x?.trim()).filter(Boolean).join(" ");
}

/**
 * Roteiro do que falar ao 190. `place` é o endereço aproximado (geocodificador reverso ou último endereço conhecido da corrida);
 * sem ele, vão as coordenadas.
 */
export function emergencyScript(o: { as: SosActor; vehicle?: SosVehicle | null; place?: string | null; point?: SosPoint | null; passengerName?: string | null }): string {
  const car = vehicleText(o.vehicle) || "(carro sem dados)";
  const plate = o.vehicle?.plate?.trim() || "(placa não informada)";
  const where = o.place?.trim() || (o.point ? `coordenadas ${coordsText(o.point)}` : "(local não identificado: diga a rua onde está)");
  if (o.as === "driver") {
    const who = o.passengerName ? ` com o passageiro ${o.passengerName}` : " com um passageiro";
    return `Estou no meu carro ${car}, placa ${plate},${who}, perto de ${where}.`;
  }
  return `Estou num carro ${car}, placa ${plate}, perto de ${where}.`;
}

/** Mensagem para quem a pessoa confia: placa, onde está e o link da viagem ao vivo (quando existe). */
export function trustedMessage(o: { as: SosActor; vehicle?: SosVehicle | null; place?: string | null; point?: SosPoint | null; liveUrl?: string | null }): string {
  const car = vehicleText(o.vehicle);
  const parts = [o.as === "driver" ? "Preciso de ajuda numa corrida da Orbi." : "Preciso de ajuda: estou numa corrida da Orbi."];
  if (car || o.vehicle?.plate) parts.push(`Carro: ${[car, o.vehicle?.plate ? `placa ${o.vehicle.plate}` : ""].filter(Boolean).join(", ")}.`);
  if (o.place) parts.push(`Perto de: ${o.place}.`);
  if (o.point) parts.push(`Mapa: ${mapLink(o.point)}`);
  if (o.liveUrl) parts.push(`Acompanhe a viagem ao vivo: ${o.liveUrl}`);
  return parts.join("\n");
}

export const whatsappUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

/** Assunto e corpo do e-mail enviado à equipe. Só registra e avisa: nada aqui pune ninguém. */
export function staffEmail(o: { rideId: string; as: SosActor; at: Date; panelUrl: string; points: { label: string; point: SosPoint | null }[] }) {
  const lines = [
    `Alerta de emergência acionado por ${o.as === "driver" ? "motorista" : "passageiro"} em ${o.at.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`,
    `Corrida: ${o.rideId}`,
    ...o.points.map((p) => `${p.label}: ${p.point ? mapLink(p.point) : "sem posição conhecida"}`),
    `Painel: ${o.panelUrl}`,
    "",
    "A Orbi não é um plantão 24 horas: analise o caso e, se for preciso, acione o 190 pela pessoa.",
  ];
  return { subject: `[Orbi] Alerta de emergência na corrida ${o.rideId.slice(0, 8)}`, text: lines.join("\n") };
}

/** Depois de concluída, a corrida ainda aceita o alerta por este tempo (a pessoa pode ter saído do carro em apuros). */
export const SOS_AFTER_COMPLETED_MS = 30 * 60_000;
/** Teto de alertas novos por pessoa, em qualquer corrida, numa janela de uma hora. */
export const SOS_USER_LIMIT = 3;
export const SOS_USER_WINDOW_MS = 60 * 60_000;

/** Resposta quando o limite de alertas novos por hora foi passado: o alerta fica registrado, mas sem novo e-mail. */
export const SOS_THROTTLED_MESSAGE = "Seu alerta foi registrado e a equipe pode vê-lo no painel, mas você já acionou vários alertas na última hora e não enviamos novo e-mail. Se estiver em perigo, ligue 190.";

/** null quando a corrida aceita o alerta; senão a mensagem do 409. */
export function sosProblem(status: RideStatus, endedAt: Date | null, now = new Date()): string | null {
  if (status === "accepted" || status === "arrived" || status === "in_progress") return null;
  if (status === "completed" && endedAt && now.getTime() - endedAt.getTime() <= SOS_AFTER_COMPLETED_MS) return null;
  if (status === "completed") return "O alerta de emergência só pode ser enviado até 30 minutos depois da corrida. Se ainda precisa de ajuda, ligue 190.";
  return "O alerta de emergência só vale numa corrida em andamento (com motorista a caminho, no local ou em viagem). Em perigo, ligue 190.";
}
