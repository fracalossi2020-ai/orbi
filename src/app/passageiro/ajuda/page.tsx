"use client";
import { HelpPage, type HelpTopic } from "@/frontend/components/app/SharedPages";

/** Os assuntos mais comuns de quem viaja: um toque preenche o chamado. */
const TOPICS: HelpTopic[] = [
  { label: "Esqueci algo no carro", img: "package", kind: "ajuda", subject: "Esqueci um objeto no carro" },
  { label: "Cobrança errada", img: "card", kind: "reclamacao", subject: "Valor cobrado diferente do combinado" },
  { label: "Problema com motorista", img: "car", kind: "reclamacao", subject: "Problema com o motorista" },
  { label: "Segurança", img: "shield", kind: "ocorrencia", subject: "Situação de segurança na viagem" },
  { label: "Minha conta", img: "user", kind: "ajuda", subject: "Ajuda com a minha conta" },
  { label: "Dar uma sugestão", img: "star", kind: "sugestao", subject: "Sugestão para a Orbi" },
];

export default function Page() { return <HelpPage topics={TOPICS} />; }
