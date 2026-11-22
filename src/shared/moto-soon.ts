import { haversineM } from "./geo";

/**
 * Orbi Moto: em breve. A moto NÃO entra no lançamento; a previsão é de uns 60 a 120 dias depois,
 * com piloto em Ipatinga. Sem data exata prometida. A categoria "moto" segue desligada até a equipe liberar.
 */
export const MOTO_LEAD_KIND = "moto";
export const MOTO_LEAD_MESSAGE = "Orbi Moto: quer ser avisado quando a moto chegar.";

/** O que o motociclista já pode ir providenciando. */
export const MOTO_REQUIREMENTS = [
  "CNH categoria A com a observação EAR (exerce atividade remunerada), há pelo menos 2 anos",
  "21 anos ou mais",
  "Curso especializado de mototaxista (Resolução CONTRAN 930/2022)",
  "CRLV da moto em dia",
  "Colete refletivo e antena corta-pipa na moto",
  "Capacete extra, com viseira, para o passageiro",
  "Certidão de antecedentes criminais",
  "Inscrição no INSS ou MEI",
] as const;

type MotoCity = { lat: number; lng: number; radiusKm: number; categories: { slug: string }[] };

/**
 * Moto aparece nos atalhos? Sem ponto conhecido, vale qualquer cidade com a categoria ligada.
 * Com o ponto (partida ou GPS do passageiro), só a cidade que cobre esse ponto conta.
 */
export function motoOfferedAt(cities: MotoCity[], point?: { lat: number; lng: number } | null): boolean {
  const has = (c: MotoCity) => c.categories.some((k) => k.slug === "moto");
  if (!point) return cities.some(has);
  return cities.some((c) => has(c) && haversineM(point, c) <= c.radiusKm * 1000);
}
