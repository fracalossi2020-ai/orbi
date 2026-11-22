import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "@/database";
import type { sniffFile } from "./security";
import { ApiError } from "./api";
import { isRealProduction } from "@/shared/runtime-config";

type Mime = NonNullable<ReturnType<typeof sniffFile>>;

/** Pasta dos documentos enviados. */
export const uploadsDir = () => path.join(dataDir(), "uploads");

let warned = false;

/**
 * Tira os metadados (EXIF: GPS, aparelho, data) das fotos antes de guardar, mantendo a orientação certa.
 * Usa a biblioteca sharp, que já vem instalada com o Next. Se ela não puder ser carregada, a foto segue como veio
 * (com um aviso no log) fora da produção; em produção de verdade o envio é recusado; se a imagem estiver corrompida, devolve null para o envio ser recusado.
 */
export async function stripImageMetadata(buf: Buffer, mime: Mime): Promise<Buffer | null> {
  if (mime === "application/pdf") return buf;
  // Tipagem mínima: só usamos rotate() e toBuffer().
  type Sharp = (input: Buffer, opts?: { limitInputPixels?: number }) => { rotate(): { toBuffer(): Promise<Buffer> } };
  let sharp: Sharp;
  try {
    const mod = (await import("sharp")) as unknown as { default?: Sharp } & Sharp;
    sharp = (mod.default ?? mod) as Sharp;
  }
  catch {
    // Em produção de verdade a foto (selfie, CNH, comprovantes) com GPS e aparelho no EXIF não pode ser gravada:
    // melhor recusar com erro claro do que guardar dado pessoal que prometemos remover.
    if (isRealProduction(process.env)) {
      console.error("[uploads] sharp indisponível em produção: envios de imagem recusados para não gravar o EXIF. Instale o sharp (veja o README).");
      throw new ApiError(503, "Não conseguimos processar fotos neste momento. Tente de novo mais tarde ou fale com o suporte.");
    }
    if (!warned) { warned = true; console.warn("[uploads] sharp indisponível: as fotos ficam com os metadados originais (EXIF)."); }
    return buf;
  }
  try {
    // rotate() aplica a orientação do EXIF antes de ele sair; sem withMetadata(), o resto é descartado.
    return await sharp(buf, { limitInputPixels: 80_000_000 }).rotate().toBuffer();
  } catch { return null; }
}

/** Apaga arquivos enviados (exclusão de conta). Arquivo que já não existe não é erro. */
export async function removeUploads(storedNames: string[]) {
  for (const name of storedNames) {
    // Só nomes simples: nada de sair da pasta de envios.
    if (!/^[\w-]+\.[a-z]+$/i.test(name)) continue;
    await fs.rm(path.join(uploadsDir(), name), { force: true }).catch(() => undefined);
  }
}
