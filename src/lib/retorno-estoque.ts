/**
 * Memória da listagem do estoque para a volta.
 *
 * Ao abrir uma peça, guarda os filtros (a query string), a posição da rolagem
 * e qual peça foi aberta. Na volta — pelo botão "Voltar ao estoque" ou pelo
 * gesto/botão de voltar do navegador — a lista reabre com os mesmos filtros,
 * na mesma altura, e destaca a peça de onde se veio.
 *
 * Fica em sessionStorage: é por aba e some quando a aba fecha, que é o
 * horizonte certo para "onde eu estava".
 */
const CHAVE = "bancada:retorno-estoque";
/** Depois disso a volta é uma visita nova, não uma volta. */
const VALIDADE_MS = 30 * 60 * 1000;

export interface RetornoEstoque {
  /** Query string da lista, com "?" ou vazia. */
  busca: string;
  scrollY: number;
  /** Peça aberta a partir da lista; some depois de restaurar. */
  itemId: string | null;
  em: number;
}

function ler(): RetornoEstoque | null {
  try {
    const bruto = sessionStorage.getItem(CHAVE);
    if (!bruto) return null;
    const dados = JSON.parse(bruto) as RetornoEstoque;
    if (Date.now() - dados.em > VALIDADE_MS) return null;
    return dados;
  } catch {
    return null;
  }
}

function gravar(dados: RetornoEstoque) {
  try {
    sessionStorage.setItem(CHAVE, JSON.stringify(dados));
  } catch {
    // Aba privada ou storage bloqueado: a volta só perde a memória.
  }
}

export function lerRetornoEstoque() {
  return ler();
}

/** Chamado na lista: guarda filtros e rolagem atuais (e a peça aberta). */
export function salvarRetornoEstoque(itemId: string | null) {
  gravar({
    busca: window.location.search,
    scrollY: window.scrollY,
    itemId,
    em: Date.now(),
  });
}

/** Marca a volta como consumida, mantendo os filtros para o próximo "voltar". */
export function consumirRetornoEstoque() {
  const atual = ler();
  if (atual) gravar({ ...atual, itemId: null });
}

/** Endereço da lista com os últimos filtros usados. */
export function hrefDoEstoque() {
  return `/estoque/itens${ler()?.busca ?? ""}`;
}
