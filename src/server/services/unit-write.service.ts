import "server-only";

import { derivarSerialFinal } from "@/domain/inventory/serial";
import { construirSchemaDeSpecs } from "@/domain/specs/validation";
import type { Prisma } from "@/generated/prisma/client";
import type { UnitCondition } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/client";
import type { ActionContext } from "@/server/session";

import { registrarAuditoria } from "./audit.service";
import { definicoesDeSpec } from "./catalog.service";
import {
  ConflitoError,
  EstoqueInvalidoError,
  NaoEncontradoError,
  RegraDeNegocioError,
} from "./errors";

/**
 * Edição de unidades e produtos já cadastrados.
 *
 * A separação entre as duas é a que o sistema inteiro se apoia, e aqui ela
 * fica visível: editar o **produto** muda a ficha técnica de todas as suas
 * unidades; editar a **unidade** muda só aquela peça física.
 *
 * O que a edição **não** faz: mexer em `status` e `quantity`. Esses só mudam
 * por movimentação, senão o histórico deixaria de explicar o estoque — que é
 * exatamente o que a seção 10 proíbe.
 */

export interface DadosDeEdicaoDaUnidade {
  serialNumber?: string | undefined;
  condition: UnitCondition;
  locationId?: string | undefined;
  purchasedById?: string | undefined;
  purchaseCost?: number | undefined;
  purchaseCostNote?: string | undefined;
  estimatedSalePrice?: number | undefined;
  purchaseDate?: Date | undefined;
  origin?: string | undefined;
  notes?: string | undefined;
}

/** Atualiza apenas os campos oferecidos na lista, preservando a ficha completa. */
export async function atualizarResumoDaUnidade(
  id: string,
  dados: {
    condition: UnitCondition;
    purchaseCost: number | null;
    purchaseCostNote: string | null;
    estimatedSalePrice: number | null;
  },
  ctx: ActionContext,
): Promise<void> {
  const atual = await prisma.inventoryUnit.findUnique({
    where: { id },
    select: {
      status: true,
      condition: true,
      purchaseCost: true,
      estimatedSalePrice: true,
    },
  });
  if (!atual) throw new NaoEncontradoError("Unidade de estoque");
  if (atual.status === "DISCARDED") {
    throw new EstoqueInvalidoError("Uma peça descartada não pode ser editada.");
  }
  await prisma.inventoryUnit.update({
    where: { id },
    // Valor informado apaga a anotação: os dois nunca coexistem.
    data: {
      ...dados,
      purchaseCostNote: dados.purchaseCost === null ? dados.purchaseCostNote : null,
    },
  });
  await registrarAuditoria(
    {
      action: "update",
      entity: "InventoryUnit",
      entityId: id,
      before: {
        condition: atual.condition,
        purchaseCost:
          atual.purchaseCost === null ? null : Number(atual.purchaseCost),
        estimatedSalePrice:
          atual.estimatedSalePrice === null
            ? null
            : Number(atual.estimatedSalePrice),
      },
      after: dados,
    },
    ctx,
  );
}

export async function atualizarUnidade(
  id: string,
  dados: DadosDeEdicaoDaUnidade,
  ctx: ActionContext,
): Promise<void> {
  const atual = await prisma.inventoryUnit.findUnique({
    where: { id },
    select: {
      id: true,
      serialNumber: true,
      condition: true,
      locationId: true,
      purchasedById: true,
      purchaseCost: true,
      estimatedSalePrice: true,
      origin: true,
      notes: true,
      status: true,
      product: { select: { name: true } },
    },
  });

  if (!atual) throw new NaoEncontradoError("Unidade de estoque");

  if (atual.status === "DISCARDED") {
    throw new EstoqueInvalidoError(
      "Esta unidade foi descartada. O registro é mantido como histórico e não é mais editável.",
    );
  }

  /*
   * Mudança de localização passa por movimentação, não por edição.
   *
   * Trocar o campo direto deixaria a peça "aparecendo" em outro lugar sem
   * nenhum registro de quem a moveu nem quando — e "onde esta peça esteve"
   * deixaria de ter resposta.
   */
  const querMudarLocal =
    dados.locationId !== undefined &&
    (dados.locationId || null) !== atual.locationId;

  if (querMudarLocal) {
    throw new RegraDeNegocioError(
      "Para mudar o local, registre uma transferência. Assim fica gravado quem moveu a peça e quando.",
    );
  }

  await prisma.inventoryUnit.update({
    where: { id },
    data: {
      serialNumber: dados.serialNumber ?? null,
      serialLast: derivarSerialFinal(dados.serialNumber),
      condition: dados.condition,
      purchasedById: dados.purchasedById ?? null,
      purchaseCost: dados.purchaseCost ?? null,
      purchaseCostNote:
        dados.purchaseCost === undefined ? (dados.purchaseCostNote ?? null) : null,
      estimatedSalePrice: dados.estimatedSalePrice ?? null,
      purchaseDate: dados.purchaseDate ?? null,
      origin: dados.origin ?? null,
      notes: dados.notes ?? null,
    },
  });

  await registrarAuditoria(
    {
      action: "update",
      entity: "InventoryUnit",
      entityId: id,
      before: {
        serialNumber: atual.serialNumber,
        condition: atual.condition,
        purchaseCost: Number(atual.purchaseCost ?? 0),
        estimatedSalePrice: Number(atual.estimatedSalePrice ?? 0),
        purchasedById: atual.purchasedById,
        origin: atual.origin,
      },
      after: {
        serialNumber: dados.serialNumber ?? null,
        condition: dados.condition,
        purchaseCost: dados.purchaseCost ?? null,
        estimatedSalePrice: dados.estimatedSalePrice ?? null,
        purchasedById: dados.purchasedById ?? null,
        origin: dados.origin ?? null,
      },
    },
    ctx,
  );
}

export interface DadosDeEdicaoDoProduto {
  name: string;
  model?: string | undefined;
  partNumber?: string | undefined;
  brandId?: string | undefined;
  description?: string | undefined;
  defaultSalePrice?: number | undefined;
  lowStockThreshold: number;
  specs: Record<string, unknown>;
}

/**
 * Edita o produto — e portanto a ficha técnica de todas as suas unidades.
 *
 * Devolve quantas unidades foram afetadas, para que a interface possa dizer
 * isso à pessoa em vez de mudar 12 registros em silêncio.
 */
export async function atualizarProduto(
  id: string,
  dados: DadosDeEdicaoDoProduto,
  ctx: ActionContext,
): Promise<{ unidadesAfetadas: number }> {
  const atual = await prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      model: true,
      categoryId: true,
      brandId: true,
      specs: true,
      defaultSalePrice: true,
      lowStockThreshold: true,
      _count: { select: { units: true } },
    },
  });

  if (!atual) throw new NaoEncontradoError("Produto");

  // As specs passam pela mesma validação do cadastro: editar não é caminho
  // para inserir um valor que o cadastro recusaria.
  const definicoes = await definicoesDeSpec(atual.categoryId);
  const validado = construirSchemaDeSpecs(definicoes).safeParse(dados.specs);

  if (!validado.success) {
    throw new RegraDeNegocioError(
      `Especificações inválidas: ${validado.error.issues.map((i) => i.message).join(" ")}`,
    );
  }

  await prisma.product.update({
    where: { id },
    data: {
      name: dados.name,
      model: dados.model ?? null,
      partNumber: dados.partNumber ?? null,
      brandId: dados.brandId ?? null,
      description: dados.description ?? null,
      defaultSalePrice: dados.defaultSalePrice ?? null,
      lowStockThreshold: dados.lowStockThreshold,
      specs: validado.data as Prisma.InputJsonValue,
    },
  });

  await registrarAuditoria(
    {
      action: "update",
      entity: "Product",
      entityId: id,
      before: {
        name: atual.name,
        model: atual.model,
        specs: atual.specs as Prisma.InputJsonValue,
      },
      after: {
        name: dados.name,
        model: dados.model ?? null,
        specs: validado.data as Prisma.InputJsonValue,
      },
    },
    ctx,
  );

  return { unidadesAfetadas: atual._count.units };
}

/**
 * Exclusão lógica de uma unidade.
 *
 * Só o que nunca foi movimentado além da entrada pode sair: uma peça com
 * histórico de venda ou de montagem faz parte do passado da operação, e
 * escondê-la distorceria relatórios já emitidos. Para essas, o caminho é
 * descarte, que é uma movimentação e fica registrado.
 */
export async function excluirUnidade(
  id: string,
  motivo: string | undefined,
  ctx: ActionContext,
): Promise<void> {
  const unidade = await prisma.inventoryUnit.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      internalCode: true,
      _count: { select: { movements: true, buildItems: true } },
    },
  });

  if (!unidade) throw new NaoEncontradoError("Unidade de estoque");

  if (unidade.status !== "AVAILABLE") {
    throw new EstoqueInvalidoError(
      `Só é possível excluir peça disponível. Esta está com outra situação — use descarte, que fica registrado no histórico.`,
    );
  }

  if (unidade._count.buildItems > 0) {
    throw new ConflitoError(
      "Esta peça já participou de uma montagem. Excluí-la apagaria parte do histórico dessa montagem.",
    );
  }

  // Só a movimentação de entrada: qualquer outra significa que a peça teve
  // vida no estoque, e isso precisa continuar contável.
  if (unidade._count.movements > 1) {
    throw new ConflitoError(
      "Esta peça já foi movimentada. Excluí-la distorceria relatórios de período já emitidos. Use descarte.",
    );
  }

  await prisma.inventoryUnit.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await registrarAuditoria(
    {
      action: "delete",
      entity: "InventoryUnit",
      entityId: id,
      before: { internalCode: unidade.internalCode },
      after: { motivo: motivo ?? null },
    },
    ctx,
  );
}

/** Ajusta preço e comprador de uma peça que já está vendida. */
export async function atualizarVenda(
  id: string,
  dados: { soldPrice: number | null; soldToName: string | null },
  ctx: ActionContext,
): Promise<void> {
  const atual = await prisma.inventoryUnit.findUnique({
    where: { id },
    select: { status: true, soldPrice: true, soldToName: true, soldAt: true },
  });
  if (!atual) throw new NaoEncontradoError("Unidade de estoque");
  if (atual.status !== "SOLD") {
    throw new EstoqueInvalidoError(
      "Só dá para editar a venda de uma peça vendida. Registre a venda pelo botão Movimentar.",
    );
  }
  await prisma.inventoryUnit.update({
    where: { id },
    // Venda antiga, marcada antes de existir este campo, ganha a data de hoje
    // só se ainda não tinha nenhuma.
    data: { ...dados, soldAt: atual.soldAt ?? new Date() },
  });
  await registrarAuditoria(
    {
      action: "update",
      entity: "InventoryUnit",
      entityId: id,
      before: {
        soldPrice: atual.soldPrice === null ? null : Number(atual.soldPrice),
        soldToName: atual.soldToName,
      },
      after: dados,
    },
    ctx,
  );
}
