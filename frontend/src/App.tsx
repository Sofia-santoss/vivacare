const cores = [
  { nome: 'Vermelho institucional escuro', classe: 'bg-vc-escuro', hex: '#3D0A08' },
  { nome: 'Vermelho primário FHDOD', classe: 'bg-vc-marca', hex: '#E0302A' },
  { nome: 'Vermelho claro', classe: 'bg-vc-claro', hex: '#F47C78' },
  { nome: 'Superfície', classe: 'bg-vc-superficie', hex: '#FFFFFF' },
  { nome: 'Fundo clínico', classe: 'bg-vc-fundo', hex: '#FDF5F5' },
  { nome: 'Texto', classe: 'bg-vc-texto', hex: '#2A0806' },
  { nome: 'Sucesso', classe: 'bg-vc-sucesso', hex: '#14875C' },
  { nome: 'Atenção', classe: 'bg-vc-atencao', hex: '#B66B05' },
  { nome: 'Erro', classe: 'bg-vc-erro', hex: '#8B1A1A' },
];

export function App() {
  return (
    <main className="min-h-screen p-6">
      <h1 className="text-[32px] font-bold">VivaCare</h1>
      <p className="mt-2 text-base">
        Base do frontend funcionando. Cores medidas do protótipo do Figma.
      </p>

      <button
        type="button"
        className="mt-6 h-14 w-full max-w-sm rounded-xl bg-vc-botao px-6 text-base font-semibold text-white hover:bg-vc-botao-hover active:bg-vc-botao-pressed focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-vc-marca"
      >
        Começar avaliação
      </button>

      <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cores.map((cor) => (
          <li key={cor.hex} className="rounded-xl border border-vc-claro/40 bg-vc-superficie p-3">
            <div className={`h-12 rounded-lg border border-vc-claro/40 ${cor.classe}`} />
            <p className="mt-2 text-sm font-semibold">{cor.nome}</p>
            <p className="text-xs">{cor.hex}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}