import { ApiError, route } from "@/backend/api";
import { PASSENGER_APP } from "@/shared/permissions";
import { checkRateLimit } from "@/backend/auth";
import { nearbyDrivers } from "@/backend/rides";

/** Carros online por perto, em posição aproximada, para o mapa do passageiro. */
export const GET = route(async ({ req, user }) => {
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  if (!url.searchParams.has("lat") || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new ApiError(400, "Coordenadas inválidas.");
  // O mapa atualiza de poucos em poucos segundos; o teto segura quem varre posições de motoristas.
  if (!checkRateLimit(`nearby:${user.id}`, 120, 60_000)) throw new ApiError(429, "Muitas consultas em pouco tempo. Aguarde um instante.");
  // Motorista também usa o app de passageiro: o próprio carro não aparece no mapa.
  return nearbyDrivers({ lat, lng }, undefined, user.id);
}, { roles: PASSENGER_APP });
