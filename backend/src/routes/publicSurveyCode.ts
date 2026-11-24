const uuidPublico = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const slugPublico = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

export function filtroPesquisaPublica(identifier: string): { condition: string; value: string } | null {
  if (uuidPublico.test(identifier)) {
    return { condition: 'p.codigo_publico = $1::uuid', value: identifier };
  }
  if (!slugPublico.test(identifier)) return null;
  return {
    condition: "btrim(regexp_replace(translate(lower(s.nome), 'áàãâäéèêëíìîïóòõôöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '[^a-z0-9]+', '-', 'g'), '-') = $1",
    value: identifier.toLowerCase(),
  };
}