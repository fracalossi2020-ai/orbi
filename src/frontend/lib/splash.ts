/**
 * Abertura do app (AppSplash). Ela aparece toda vez que o app é aberto, mas não depois de uma ação de dentro do app
 * (entrar, criar conta, sair, virar motorista): nesses casos quem redireciona chama skipNextSplash() antes.
 * Fica fora do componente porque o layout raiz (servidor) usa o script do <head>, e um módulo "use client" não exporta valores para o servidor.
 */
export const SPLASH_KEY = "orbi-splash";
export const SPLASH_SKIP_KEY = "orbi-splash-skip";

/** Marca a próxima carga da página para não mostrar a abertura (ela já foi vista nesta abertura do app). */
export function skipNextSplash() {
  try { sessionStorage.setItem(SPLASH_SKIP_KEY, "1"); } catch { /* sem armazenamento: a abertura aparece de novo, sem prejuízo */ }
}

/** Roda antes da primeira pintura: com o pedido de pular, marca <html data-splash="skip"> e o CSS da abertura a esconde, sem piscar o azul. */
export const SPLASH_HEAD_SCRIPT = `try{if(sessionStorage.getItem("${SPLASH_SKIP_KEY}"))document.documentElement.setAttribute("data-splash","skip")}catch(e){}`;
