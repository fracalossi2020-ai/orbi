import { notFound } from "next/navigation";
import { connection } from "next/server";
import { foodDemoOn } from "@/shared/food/flag";

/**
 * Orbi Food (demonstração) só existe com PRUMO_FOOD_DEMO=true. Lido a cada pedido (connection() impede que a página seja
 * montada uma vez só no build), porque quem roda `next start` liga e desliga sem refazer o build. Desligado: 404.
 */
export async function requireFoodDemo() {
  await connection();
  if (!foodDemoOn(process.env)) notFound();
}

/** Só pergunta (sem 404): a barra de baixo e o menu do painel usam para decidir se mostram o Food. */
export async function foodDemoEnabled() {
  await connection();
  return foodDemoOn(process.env);
}
