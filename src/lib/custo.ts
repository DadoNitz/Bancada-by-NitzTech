/**
 * Campo de custo que aceita valor OU anotação.
 *
 * Muita peça chega sem nota: veio num lote, foi troca, ninguém lembra quanto
 * pagou. Deixar o custo vazio não diz nada ("esqueceram de preencher?");
 * escrever "não lembro" ou "veio no lote do Tiago" diz. Por isso o mesmo campo
 * aceita os dois: se o texto parece dinheiro vira `purchaseCost`, senão vira
 * `purchaseCostNote`. Os dois nunca coexistem — valor informado apaga a nota.
 */

export const MAX_NOTA_DE_CUSTO = 80;

export type CustoLido =
  | { ok: true; valor: number | null; nota: string | null }
  | { ok: false; erro: string };

/** Aceita "1.234,56", "1234.56", "R$ 300", "300". */
const PARECE_DINHEIRO = /^(r\$)?\s*[\d.,\s]+$/i;

export function lerCusto(entrada: string | null | undefined): CustoLido {
  const texto = (entrada ?? "").trim();
  if (texto === "") return { ok: true, valor: null, nota: null };

  if (PARECE_DINHEIRO.test(texto)) {
    const limpo = texto.replace(/r\$/i, "").replace(/\s/g, "");
    // Com vírgula, o ponto é separador de milhar (padrão brasileiro). Sem
    // vírgula, "1234.56" é decimal — é assim que o próprio campo exibe.
    const normalizado = limpo.includes(",")
      ? limpo.replace(/\./g, "").replace(",", ".")
      : limpo;
    const valor = Number(normalizado);
    if (!Number.isFinite(valor) || valor < 0 || valor > 999_999_999) {
      return {
        ok: false,
        erro: "Custo inválido. Use um valor como 300,00 ou escreva uma anotação.",
      };
    }
    return { ok: true, valor: Math.round(valor * 100) / 100, nota: null };
  }

  if (texto.length > MAX_NOTA_DE_CUSTO) {
    return {
      ok: false,
      erro: `A anotação do custo tem no máximo ${MAX_NOTA_DE_CUSTO} caracteres.`,
    };
  }
  return { ok: true, valor: null, nota: texto };
}

/** Texto para preencher o campo ao editar: o valor, ou a anotação. */
export function custoParaCampo(
  valor: number | null | undefined,
  nota: string | null | undefined,
): string {
  if (valor !== null && valor !== undefined) {
    return valor.toFixed(2).replace(".", ",");
  }
  return nota ?? "";
}
