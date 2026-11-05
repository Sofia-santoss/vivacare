import type { ButtonHTMLAttributes, MouseEvent } from 'react';

type Variante = 'principal' | 'secundario';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  processando?: boolean;
  textoProcessando?: string;
}

const base =
  'inline-flex h-14 w-full items-center justify-center gap-3 rounded-xl px-6 text-base font-semibold transition-colors focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-vc-botao';

const estilos = {
  principal: 'bg-vc-botao text-white hover:bg-vc-botao-hover active:bg-vc-botao-pressed',
  secundario:
    'border-2 border-vc-botao bg-vc-superficie text-vc-botao hover:bg-vc-fundo active:bg-vc-claro/25',
  processandoPrincipal: 'cursor-wait bg-vc-botao text-white',
  processandoSecundario: 'cursor-wait border-2 border-vc-botao bg-vc-superficie text-vc-botao',
  indisponivel: 'cursor-not-allowed bg-vc-desabilitado text-vc-desabilitado-texto',
} as const;

function classesDoEstado(variante: Variante, processando: boolean, indisponivel: boolean): string {
  if (indisponivel) return estilos.indisponivel;
  if (processando) {
    return variante === 'principal' ? estilos.processandoPrincipal : estilos.processandoSecundario;
  }
  return variante === 'principal' ? estilos.principal : estilos.secundario;
}

function Spinner() {
  return (
    <svg
      className="size-5 animate-spin motion-reduce:animate-none"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.35" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Button({
  variante = 'principal',
  processando = false,
  textoProcessando = 'Processando...',
  disabled = false,
  type = 'button',
  className = '',
  onClick,
  children,
  ...resto
}: ButtonProps) {
  function aoClicar(evento: MouseEvent<HTMLButtonElement>) {
    // Enquanto processa, ignora novos cliques (evita envio duplicado).
    if (processando) {
      evento.preventDefault();
      return;
    }
    onClick?.(evento);
  }

  return (
    <button
      {...resto}
      type={type}
      disabled={disabled}
      aria-busy={processando}
      aria-disabled={processando || undefined}
      onClick={aoClicar}
      className={`${base} ${classesDoEstado(variante, processando, disabled)} ${className}`.trim()}
    >
      {processando ? (
        <>
          <Spinner />
          <span>{textoProcessando}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}