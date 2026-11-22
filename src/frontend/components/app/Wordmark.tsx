/**
 * Nome "Orbi" numa fonte geométrica moderna e cheia (Outfit 800, variável --f-round carregada no layout raiz): "O" redondo, cantos suaves.
 * Herda a cor (currentColor) e o tamanho de quem usa: passe text-* e text-[cor] pela className.
 */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-block font-[family-name:var(--f-round)] font-extrabold leading-none tracking-[-0.035em] ${className}`}>
      Orbi
    </span>
  );
}

export default Wordmark;
