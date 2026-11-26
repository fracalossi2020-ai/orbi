import { haversineM, type LatLng } from "../geo";
import type { FoodCityId } from "./types";

/**
 * Cidade do Orbi Food (demonstração): do endereço da conta, do GPS ou do texto. Regras puras, sem I/O.
 * Os centros são aproximados e servem só para dizer "em qual das três cidades o aparelho está".
 */
const CENTERS: { id: FoodCityId; name: string; lat: number; lng: number }[] = [
  { id: "ipatinga", name: "Ipatinga", lat: -19.4683, lng: -42.5367 },
  { id: "fabriciano", name: "Coronel Fabriciano", lat: -19.5186, lng: -42.6289 },
  { id: "timoteo", name: "Timóteo", lat: -19.5817, lng: -42.6439 },
];
/** Além disso (km do centro mais próximo) o ponto não é do Vale do Aço atendido pela demo. */
export const FOOD_CITY_MAX_KM = 9;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();

/** Cidade do Food pelo nome ("Coronel Fabriciano", "cel. fabriciano", "timoteo"). null: não é uma das três. */
export function foodCityFromName(name: string | null | undefined): FoodCityId | null {
  if (!name) return null;
  const n = norm(name);
  if (!n) return null;
  if (n.includes("ipatinga")) return "ipatinga";
  if (n.includes("fabriciano")) return "fabriciano";
  if (n.includes("timoteo")) return "timoteo";
  return null;
}

/** Cidade do Food que cobre o ponto do GPS (a mais próxima dentro do raio). null: fora das três. */
export function foodCityAt(point: LatLng | null | undefined): FoodCityId | null {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
  let best: { id: FoodCityId; d: number } | null = null;
  for (const c of CENTERS) {
    const d = haversineM(point, c);
    if (!best || d < best.d) best = { id: c.id, d };
  }
  return best && best.d <= FOOD_CITY_MAX_KM * 1000 ? best.id : null;
}

/** Pergunta "quer trocar?" só quando o GPS achou uma cidade diferente da atual e ainda não foi respondida para ela nesta sessão. */
export function shouldAskCity(current: FoodCityId, detected: FoodCityId | null, answered: readonly FoodCityId[]): boolean {
  return !!detected && detected !== current && !answered.includes(detected);
}
