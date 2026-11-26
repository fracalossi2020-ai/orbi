import { Body, Legal, PageHead } from "@/frontend/components/site/Page";
import { FOOD_PHOTO_CREDITS, photoPageUrl } from "@/shared/food/photos";

export const metadata = { title: "Créditos" };

export default function Creditos() {
  return (
    <>
      <PageHead title="Créditos" lead="Quem fez o que a Orbi usa e que não foi criado por nós." />
      <Body narrow>
        <Legal>
          <h2>Mapas</h2>
          <p>Mapas © colaboradores do OpenStreetMap, disponíveis sob a licença ODbL.</p>
          <h2>Ícones</h2>
          <p>Ícones do aplicativo: desenhos próprios da Orbi. Ícones de linha: Phosphor Icons, sob a licença MIT.</p>
          <h2>Fotos do Orbi Food</h2>
          <p>
            Fotos genéricas de comida da demonstração do Orbi Food, do Wikimedia Commons, recortadas e comprimidas.
            Cada foto segue a licença indicada, e o link leva à página original.
          </p>
          <ul>
            {FOOD_PHOTO_CREDITS.map((c) => (
              <li key={c.file}>
                <a href={photoPageUrl(c)} rel="noopener noreferrer" target="_blank">{c.title.replace(/.[A-Za-z]+$/, "")}</a>, de {c.author}, sob{" "}
                <a href={c.licenseUrl} rel="noopener noreferrer" target="_blank">{c.license}</a>.
              </li>
            ))}
          </ul>
        </Legal>
      </Body>
    </>
  );
}
