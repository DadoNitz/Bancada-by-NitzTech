import "server-only";

import { derivarSerialFinal } from "@/domain/inventory/serial";
import { construirSchemaDeSpecs } from "@/domain/specs/validation";
import type { Prisma } from "@/generated/prisma/client";
import type { SpecRecord } from "@/domain/specs/types";
import { prisma } from "@/server/db/client";
import { proximosCodigosInternos } from "@/server/db/internal-code";
import type { ActionContext } from "@/server/session";

import { registrarAuditoria } from "./audit.service";
import { definicoesDeSpec } from "./catalog.service";
import { NaoEncontradoError, RegraDeNegocioError } from "./errors";

/**
 * Escrita de produtos (o modelo da peça) e das suas unidades físicas.
 *
 * O cadastro de uma peça cria as duas coisas de uma vez, porque é assim que a
 * pessoa pensa: "acabei de comprar uma RTX 3060". Separar em dois formulários
 * seria fiel ao banco e péssimo para quem usa.
 */

export interface DadosDoProduto {
  name: string;
  model?: string | undefined;
  partNumber?: string | undefined;
  categoryId: string;
  brandId?: string | undefined;
  trackingMode: "SERIALIZED" | "QUANTITY";
  description?: string | undefined;
  defaultSalePrice?: number | undefined;
  lowStockThreshold: number;
  tagIds: string[];
  specs: Record<string, unknown>;
}

export interface DadosDasUnidades {
  quantidade: number;
  seriais: string[];
  condition: "NEW" | "LIKE_NEW" | "USED" | "DEFECTIVE" | "FOR_TESTING";
  locationId?: string | undefined;
  purchasedById?: string | undefined;
  purchaseCost?: number | undefined;
  purchaseCostNote?: string | undefined;
  estimatedSalePrice?: number | undefined;
  purchaseDate?: Date | undefined;
  origin?: string | undefined;
  notes?: string | undefined;
}

/**
 * Valida as specs contra o catálogo da categoria.
 *
 * O schema só existe em tempo de execução: ele é montado a partir das
 * `SpecDefinition` da categoria escolhida. É isto que permite criar uma
 * categoria nova sem tocar em código e ainda assim ter validação.
 */
async function validarSpecs(
  categoryId: string,
  specs: Record<string, unknown>,
): Promise<SpecRecord> {
  const definicoes = await definicoesDeSpec(categoryId);
  const resultado = construirSchemaDeSpecs(definicoes).safeParse(specs);

  if (!resultado.success) {
    const detalhes = resultado.error.issues
      .map((issue) => issue.message)
      .join(" ");
    throw new RegraDeNegocioError(`Especificações inválidas: ${detalhes}`);
  }

  return resultado.data;
}

export interface ResultadoDoCadastro {
  productId: string;
  unitIds: string[];
  codigos: string[];
}

/**
 * Cadastra um produto e suas unidades físicas em uma única transação.
 *
 * Tudo ou nada: um produto criado sem as unidades deixaria um modelo órfão no
 * catálogo, e unidades sem movimentação de entrada quebrariam o histórico que
 * a seção 10 exige.
 */
export async function cadastrarPecaComUnidades(
  produto: DadosDoProduto,
  unidades: DadosDasUnidades,
  ctx: ActionContext,
): Promise<ResultadoDoCadastro> {
  const specs = await validarSpecs(produto.categoryId, produto.specs);

  const porQuantidade = produto.trackingMode === "QUANTITY";
  // Item por quantidade vira UMA linha com saldo N. Item serializado vira N
  // linhas de saldo 1 — é o que dá rastreabilidade individual.
  const linhasACriar = porQuantidade ? 1 : unidades.quantidade;

  if (linhasACriar > 200) {
    throw new RegraDeNegocioError("Máximo de 200 unidades por cadastro.");
  }

  return prisma.$transaction(async (tx) => {
    const codigos = await proximosCodigosInternos(tx, linhasACriar);

    const registroProduto = await tx.product.create({
      data: {
        name: produto.name,
        model: produto.model ?? null,
        partNumber: produto.partNumber ?? null,
        categoryId: produto.categoryId,
        brandId: produto.brandId ?? null,
        trackingMode: produto.trackingMode,
        description: produto.description ?? null,
        defaultSalePrice: produto.defaultSalePrice ?? null,
        lowStockThreshold: produto.lowStockThreshold,
        specs: specs as Prisma.InputJsonValue,
        ...(produto.tagIds.length > 0
          ? {
              tags: {
                create: produto.tagIds.map((tagId) => ({ tagId })),
              },
            }
          : {}),
      },
      select: { id: true },
    });

    const unitIds: string[] = [];

    for (let indice = 0; indice < linhasACriar; indice += 1) {
      const codigo = codigos[indice];
      if (!codigo) throw new Error("Falha ao gerar código interno.");

      // Seriais são informados um por linha. Sobrando linhas sem serial, a
      // unidade fica sem — é melhor que inventar um número.
      const serial = porQuantidade
        ? undefined
        : (unidades.seriais[indice]?.trim() || undefined);

      const unidade = await tx.inventoryUnit.create({
        data: {
          productId: registroProduto.id,
          internalCode: codigo,
          serialNumber: serial ?? null,
          serialLast: derivarSerialFinal(serial),
          condition: unidades.condition,
          status: "AVAILABLE",
          locationId: unidades.locationId ?? null,
          quantity: porQuantidade ? unidades.quantidade : 1,
          purchasedById: unidades.purchasedById ?? null,
          purchaseCost: unidades.purchaseCost ?? null,
          purchaseCostNote:
            unidades.purchaseCost == null ? (unidades.purchaseCostNote ?? null) : null,
          estimatedSalePrice:
            unidades.estimatedSalePrice ?? produto.defaultSalePrice ?? null,
          purchaseDate: unidades.purchaseDate ?? null,
          origin: unidades.origin ?? null,
          notes: unidades.notes ?? null,
        },
        select: { id: true },
      });

      unitIds.push(unidade.id);

      // Toda unidade nasce com histórico de entrada, e o valor pago fica
      // registrado no razão do sócio.
      await tx.inventoryMovement.create({
        data: {
          unitId: unidade.id,
          productId: registroProduto.id,
          type: "INBOUND",
          quantity: porQuantidade ? unidades.quantidade : 1,
          fromStatus: null,
          toStatus: "AVAILABLE",
          toLocationId: unidades.locationId ?? null,
          userId: ctx.userId,
          partnerId: unidades.purchasedById ?? null,
          amount:
            unidades.purchaseCost != null
              ? unidades.purchaseCost * (porQuantidade ? unidades.quantidade : 1)
              : null,
          reason: "Cadastro de peça",
        },
      });
    }

    await registrarAuditoria(
      {
        action: "create",
        entity: "Product",
        entityId: registroProduto.id,
        after: {
          name: produto.name,
          unidades: unitIds.length,
          codigos,
        },
      },
      ctx,
      tx,
    );

    return { productId: registroProduto.id, unitIds, codigos };
  });
}

/**
 * Adiciona unidades a um produto que já existe.
 *
 * É o caminho para "comprei mais três dessas": aproveita o modelo já
 * cadastrado, sem redigitar nenhuma especificação técnica.
 */
export async function adicionarUnidades(
  productId: string,
  unidades: DadosDasUnidades,
  ctx: ActionContext,
): Promise<ResultadoDoCadastro> {
  const produto = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, trackingMode: true, defaultSalePrice: true },
  });

  if (!produto) throw new NaoEncontradoError("Produto");

  const porQuantidade = produto.trackingMode === "QUANTITY";
  const linhasACriar = porQuantidade ? 1 : unidades.quantidade;

  return prisma.$transaction(async (tx) => {
    const codigos = await proximosCodigosInternos(tx, linhasACriar);
    const unitIds: string[] = [];

    for (let indice = 0; indice < linhasACriar; indice += 1) {
      const codigo = codigos[indice];
      if (!codigo) throw new Error("Falha ao gerar código interno.");

      const serial = porQuantidade
        ? undefined
        : (unidades.seriais[indice]?.trim() || undefined);

      const unidade = await tx.inventoryUnit.create({
        data: {
          productId,
          internalCode: codigo,
          serialNumber: serial ?? null,
          serialLast: derivarSerialFinal(serial),
          condition: unidades.condition,
          status: "AVAILABLE",
          locationId: unidades.locationId ?? null,
          quantity: porQuantidade ? unidades.quantidade : 1,
          purchasedById: unidades.purchasedById ?? null,
          purchaseCost: unidades.purchaseCost ?? null,
          purchaseCostNote:
            unidades.purchaseCost == null ? (unidades.purchaseCostNote ?? null) : null,
          estimatedSalePrice:
            unidades.estimatedSalePrice ??
            (produto.defaultSalePrice ? Number(produto.defaultSalePrice) : null),
          purchaseDate: unidades.purchaseDate ?? null,
          origin: unidades.origin ?? null,
          notes: unidades.notes ?? null,
        },
        select: { id: true },
      });

      unitIds.push(unidade.id);

      await tx.inventoryMovement.create({
        data: {
          unitId: unidade.id,
          productId,
          type: "INBOUND",
          quantity: porQuantidade ? unidades.quantidade : 1,
          fromStatus: null,
          toStatus: "AVAILABLE",
          toLocationId: unidades.locationId ?? null,
          userId: ctx.userId,
          partnerId: unidades.purchasedById ?? null,
          amount:
            unidades.purchaseCost != null
              ? unidades.purchaseCost * (porQuantidade ? unidades.quantidade : 1)
              : null,
          reason: "Entrada de unidades",
        },
      });
    }

    await registrarAuditoria(
      {
        action: "create",
        entity: "InventoryUnit",
        entityId: unitIds[0] ?? productId,
        after: { productId, unidades: unitIds.length, codigos },
      },
      ctx,
      tx,
    );

    return { productId, unitIds, codigos };
  });
}

/** Produtos existentes, para o cadastro reaproveitar um modelo já criado. */
export async function buscarProdutosPorTermo(termo: string, limite = 10) {
  const texto = termo.trim();
  if (texto.length < 2) return [];

  return prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: texto, mode: "insensitive" } },
        { model: { contains: texto, mode: "insensitive" } },
        { partNumber: { contains: texto, mode: "insensitive" } },
      ],
    },
    take: limite,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      model: true,
      trackingMode: true,
      defaultSalePrice: true,
      category: { select: { id: true, name: true, icon: true } },
      brand: { select: { id: true, name: true } },
      _count: { select: { units: true } },
    },
  });
}
