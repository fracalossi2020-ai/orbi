/** Roda uma vez na subida do servidor: recusa configuração perigosa em produção de verdade. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertRuntimeConfig } = await import("@/shared/runtime-config");
  try {
    assertRuntimeConfig(process.env);
  } catch (e) {
    console.error(`[segurança] ${(e as Error).message}`);
    throw e;
  }
}
