import "server-only";

import { normalizarBuscaSerial } from "@/domain/inventory/serial";
import type { Prisma } from "@/generated/prisma/client";
import type { FiltroEstoque } from "@/lib/validation/inventory";
import { prisma } from "@/server/db/client";

import { NaoEncontradoError } from "./errors";

/**
 * Leitura do estoque: busca, filtros e paginação.
 *
 * Tudo acontece no servidor (seção 22). Nenhuma tela recebe o estoque inteiro
 * para filtrar no navegador — com alguns milhares de peças isso já travaria um
 * celular, que é justamente onde o sistema mais será usado.
 */

/** Campos carregados na listagem. Enxuto de propósito: a lista não precisa de tudo. */
const SELECAO_DA_LISTA = {
  id: true,
  internalCode: true,
  serialNumber: true,
  serialLast: true,
  condition: true,
  status: true,
  quantity: true,
  purchaseCost: true,
  purchaseCostNote: true,
  estimatedSalePrice: true,
  entryDate: true,
  createdAt: true,
  location: { select: { id: true, name: true } },
  // Foto da própria unidade vem antes da foto de catálogo do modelo: é ela que
  // mostra a peça que está na prateleira. Só a miniatura, uma por linha.
  images: {
    orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
    take: 1,
    select: { thumbnailKey: true, storageKey: true },
  },
  product: {
    select: {
      id: true,
      name: true,
      model: true,
      trackingMode: true,
      referencePrice: true,
      referencePriceKind: true,
      referencePriceStatus: true,
      referencePriceAt: true,
      referencePriceData: true,
      category: { select: { id: true, slug: true, name: true, icon: true } },
      brand: { select: { id: true, name: true } },
      images: {
        // Só a miniatura da foto principal. Carregar a imagem em resolução
        // máxima numa lista de 30 itens é o erro que a seção 33 proíbe.
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        take: 1,
        select: { thumbnailKey: true, storageKey: true },
      },
    },
  },
} satisfies Prisma.InventoryUnitSelect;

export type UnidadeDaLista = Prisma.InventoryUnitGetPayload<{
  select: typeof SELECAO_DA_LISTA;
}>;

/**
 * Monta a cláusula de busca livre.
 *
 * Um único campo de busca cobrindo nome, modelo, part number, serial e código
 * interno — é como a pessoa procura de verdade: ela digita o que lembra, não
 * escolhe antes em qual coluna procurar.
 */
function clausulaDeBusca(termo: string): Prisma.InventoryUnitWhereInput[] {
  const texto = termo.trim();
  const serial = normalizarBuscaSerial(texto);

  const condicoes: Prisma.InventoryUnitWhereInput[] = [
    { internalCode: { contains: texto, mode: "insensitive" } },
    { serialNumber: { contains: texto, mode: "insensitive" } },
    {
      product: {
        is: {
          OR: [
            { name: { contains: texto, mode: "insensitive" } },
            { model: { contains: texto, mode: "insensitive" } },
            { partNumber: { contains: texto, mode: "insensitive" } },
          ],
        },
      },
    },
  ];

  // Busca pelo final do serial: usa a coluna indexada, e não um
  // `LIKE '%7812'`, que ignoraria o índice e varreria a tabela.
  if (serial.length > 0) {
    condicoes.push({ serialLast: { endsWith: serial, mode: "insensitive" } });
  }

  return condicoes;
}

function montarWhere(filtro: FiltroEstoque): Prisma.InventoryUnitWhereInput {
  const where: Prisma.InventoryUnitWhereInput = {};
  const produto: Prisma.ProductWhereInput = {};

  if (filtro.q) where.OR = clausulaDeBusca(filtro.q);
  // Peça vendida não é mais estoque: mora na aba de Vendas (listarVendas).
  where.status = filtro.status?.length
    ? { in: filtro.status.filter((status) => status !== "SOLD") }
    : { not: "SOLD" };
  if (filtro.condition?.length) where.condition = { in: filtro.condition };
  if (filtro.locationId) where.locationId = filtro.locationId;

  if (filtro.categoryId) produto.categoryId = filtro.categoryId;
  if (filtro.brandId) produto.brandId = filtro.brandId;
  if (filtro.tagId) produto.tags = { some: { tagId: filtro.tagId } };
  if (Object.keys(produto).length > 0) where.product = { is: produto };

  if (filtro.precoMin !== undefined || filtro.precoMax !== undefined) {
    where.estimatedSalePrice = {
      ...(filtro.precoMin !== undefined ? { gte: filtro.precoMin } : {}),
      ...(filtro.precoMax !== undefined ? { lte: filtro.precoMax } : {}),
    };
  }

  if (filtro.entradaDe || filtro.entradaAte) {
    where.entryDate = {
      ...(filtro.entradaDe ? { gte: filtro.entradaDe } : {}),
      ...(filtro.entradaAte ? { lte: filtro.entradaAte } : {}),
    };
  }

  return where;
}

/**
 * Ordenação sempre com `id` como desempate.
 *
 * Sem um critério único no fim, a paginação por cursor pode pular ou repetir
 * linhas quando várias compartilham o mesmo valor de ordenação.
 */
function montarOrderBy(
  ordenacao: FiltroEstoque["ordenacao"],
): Prisma.InventoryUnitOrderByWithRelationInput[] {
  switch (ordenacao) {
    case "antigos":
      return [{ entryDate: "asc" }, { id: "asc" }];
    case "nome":
      return [{ product: { name: "asc" } }, { id: "asc" }];
    case "valor-maior":
      return [{ estimatedSalePrice: { sort: "desc", nulls: "last" } }, { id: "desc" }];
    case "valor-menor":
      return [{ estimatedSalePrice: { sort: "asc", nulls: "last" } }, { id: "asc" }];
    case "recentes":
    default:
      return [{ entryDate: "desc" }, { id: "desc" }];
  }
}

export interface PaginaDeUnidades {
  itens: UnidadeDaLista[];
  /** Cursor da próxima página; `null` quando acabou. */
  proximoCursor: string | null;
  total: number;
}

export async function listarUnidades(
  filtro: FiltroEstoque,
): Promise<PaginaDeUnidades> {
  const where = montarWhere(filtro);

  // Busca uma linha a mais que o pedido: é assim que se sabe se existe
  // próxima página sem fazer uma segunda consulta.
  const [linhas, total] = await Promise.all([
    prisma.inventoryUnit.findMany({
      where,
      select: SELECAO_DA_LISTA,
      orderBy: montarOrderBy(filtro.ordenacao),
      take: filtro.limite + 1,
      ...(filtro.cursor
        ? { cursor: { id: filtro.cursor }, skip: 1 }
        : {}),
    }),
    prisma.inventoryUnit.count({ where }),
  ]);

  const temMais = linhas.length > filtro.limite;
  const itens = temMais ? linhas.slice(0, filtro.limite) : linhas;

  return {
    itens,
    proximoCursor: temMais ? (itens.at(-1)?.id ?? null) : null,
    total,
  };
}

/** Detalhe completo de uma unidade, com histórico. É o destino do QR Code. */
export async function buscarUnidade(id: string) {
  const unidade = await prisma.inventoryUnit.findUnique({
    where: { id },
    include: {
      location: true,
      purchasedBy: { select: { id: true, name: true } },
      images: { orderBy: { sortOrder: "asc" } },
      product: {
        include: {
          category: true,
          brand: true,
          images: { orderBy: { sortOrder: "asc" } },
          tags: { include: { tag: true } },
          // Quantas unidades compartilham este modelo. A tela de edicao avisa
          // antes de alterar a ficha tecnica de varias pecas de uma vez.
          _count: { select: { units: true } },
        },
      },
      // Em qual montagem esta peca esta. Sem isto o estoque diz apenas "Em
      // montagem", e descobrir em QUAL PC exige abrir montagem por montagem —
      // que e justamente a pergunta de quem esta com a peca na mao.
      //
      // Filtra montagem cancelada e apagada: BuildItem sobrevive ao cancelamento
      // como historico, e apontar para uma montagem cancelada diria que a peca
      // esta presa quando ela ja voltou para a prateleira.
      buildItems: {
        where: { build: { deletedAt: null, status: { not: "CANCELLED" } } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          role: true,
          build: { select: { id: true, name: true, status: true, customerName: true } },
        },
      },
      movements: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          user: { select: { id: true, name: true } },
          fromLocation: { select: { name: true } },
          toLocation: { select: { name: true } },
        },
      },
    },
  });

  if (!unidade) throw new NaoEncontradoError("Unidade de estoque");
  return unidade;
}

export type UnidadeDetalhada = Awaited<ReturnType<typeof buscarUnidade>>;

/**
 * Localiza uma unidade pelo código interno, que é o conteúdo da etiqueta e do
 * QR Code. É o caminho de "apontei a câmera para a peça".
 */
export async function buscarUnidadePorCodigo(codigoInterno: string) {
  return prisma.inventoryUnit.findUnique({
    where: { internalCode: codigoInterno },
    select: { id: true },
  });
}

/**
 * Avisa que já existe uma unidade com o mesmo número de série.
 *
 * Aviso, e não bloqueio: fabricantes reaproveitam sequências e peças genéricas
 * repetem o número gravado. Impedir o cadastro faria o operador inventar um
 * serial falso, que é pior do que o duplicado.
 */
export async function serialJaCadastrado(
  serialNumber: string,
  ignorarUnidadeId?: string,
): Promise<{ id: string; internalCode: string } | null> {
  return prisma.inventoryUnit.findFirst({
    where: {
      serialNumber,
      ...(ignorarUnidadeId ? { id: { not: ignorarUnidadeId } } : {}),
    },
    select: { id: true, internalCode: true },
  });
}

// ---------------------------------------------------------------------------
// Vendas
// ---------------------------------------------------------------------------

/**
 * Peças vendidas. Saem da listagem do Estoque (ver `montarWhere`) e vivem
 * aqui, com o que interessa depois da venda: por quanto, quando, para quem e
 * quanto sobrou.
 */
export async function listarVendas(filtro: {
  q?: string | undefined;
  cursor?: string | undefined;
  limite?: number;
}) {
  const limite = filtro.limite ?? 30;
  const where: Prisma.InventoryUnitWhereInput = { status: "SOLD" };
  if (filtro.q) where.OR = clausulaDeBusca(filtro.q);

  const [linhas, total, somaVendidas, somaComCusto] = await Promise.all([
    prisma.inventoryUnit.findMany({
      where,
      select: {
        ...SELECAO_DA_LISTA,
        soldPrice: true,
        soldAt: true,
        soldToName: true,
      },
      orderBy: [
        { soldAt: { sort: "desc", nulls: "last" } },
        { updatedAt: "desc" },
        { id: "desc" },
      ],
      take: limite + 1,
      ...(filtro.cursor ? { cursor: { id: filtro.cursor }, skip: 1 } : {}),
    }),
    prisma.inventoryUnit.count({ where }),
    prisma.inventoryUnit.aggregate({
      where,
      _sum: { soldPrice: true },
      _count: { soldPrice: true },
    }),
    // Lucro só é honesto onde há os dois números: venda e custo.
    prisma.inventoryUnit.aggregate({
      where: {
        ...where,
        soldPrice: { not: null },
        purchaseCost: { not: null },
      },
      _sum: { soldPrice: true, purchaseCost: true },
      _count: { _all: true },
    }),
  ]);

  const temMais = linhas.length > limite;
  const itens = temMais ? linhas.slice(0, limite) : linhas;

  return {
    itens,
    proximoCursor: temMais ? (itens.at(-1)?.id ?? null) : null,
    total,
    faturamento: Number(somaVendidas._sum.soldPrice ?? 0),
    comValor: somaVendidas._count.soldPrice,
    lucro:
      Number(somaComCusto._sum.soldPrice ?? 0) -
      Number(somaComCusto._sum.purchaseCost ?? 0),
    comLucro: somaComCusto._count._all,
  };
}
