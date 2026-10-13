import "server-only";

import {
  calcularNovoSaldo,
  permitidoParaQuantidade,
  REGRAS_DE_MOVIMENTO,
  validarTransicao,
} from "@/domain/inventory/movement-rules";
import type { InventoryMovement } from "@/generated/prisma/client";
import type { MovementType } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/client";
import type { ActionContext } from "@/server/session";

import { registrarAuditoria } from "./audit.service";
import {
  ConflitoError,
  EstoqueInvalidoError,
  NaoEncontradoError,
} from "./errors";

/**
 * Único caminho de escrita do estoque.
 *
 * Nenhuma Server Action, componente ou outro serviço altera
 * `InventoryUnit.status` ou `quantity` diretamente. Concentrar isso aqui é o
 * que garante três coisas ao mesmo tempo (seção 10 e docs/00 §3):
 *
 * 1. toda alteração de estoque tem uma movimentação correspondente;
 * 2. histórico e saldo mudam na mesma transação, ou nenhum muda;
 * 3. a validação de transição não pode ser contornada por engano.
 */

export interface RegistrarMovimentoInput {
  unitId: string;
  type: MovementType;
  /** Para itens serializados é sempre 1. */
  quantity?: number;
  reason?: string | null;
  notes?: string | null;
  /** Obrigatório em TRANSFER. */
  toLocationId?: string | null;
  buildId?: string | null;
  /** Só em SALE. */
  soldPrice?: number | null;
  soldToName?: string | null;
}

export async function registrarMovimento(
  input: RegistrarMovimentoInput,
  ctx: ActionContext,
): Promise<InventoryMovement> {
  const quantidade = input.quantity ?? 1;

  return prisma.$transaction(async (tx) => {
    const unidade = await tx.inventoryUnit.findUnique({
      where: { id: input.unitId },
      select: {
        id: true,
        productId: true,
        status: true,
        quantity: true,
        locationId: true,
        internalCode: true,
        product: { select: { trackingMode: true, name: true } },
      },
    });

    if (!unidade) throw new NaoEncontradoError("Unidade de estoque");

    const porQuantidade = unidade.product.trackingMode === "QUANTITY";

    if (porQuantidade && !permitidoParaQuantidade(input.type)) {
      throw new EstoqueInvalidoError(
        `"${REGRAS_DE_MOVIMENTO[input.type].rotulo}" não se aplica a ${unidade.product.name}, ` +
          "que é controlado por quantidade e não por unidade individual.",
      );
    }

    if (!porQuantidade && quantidade !== 1) {
      throw new EstoqueInvalidoError(
        "Item serializado movimenta uma unidade por vez.",
      );
    }

    const transicao = validarTransicao(input.type, unidade.status);
    if (!transicao.ok) throw new EstoqueInvalidoError(transicao.motivo);

    if (input.type === "TRANSFER" && !input.toLocationId) {
      throw new EstoqueInvalidoError(
        "Informe o local de destino para registrar a transferência.",
      );
    }

    const saldo = porQuantidade
      ? calcularNovoSaldo(unidade.quantity, input.type, quantidade)
      : ({ ok: true, novoSaldo: unidade.quantity } as const);

    if (!saldo.ok) throw new EstoqueInvalidoError(saldo.motivo);

    const novoLocationId =
      input.type === "TRANSFER" ? input.toLocationId : unidade.locationId;

    /*
     * Atualização condicionada ao estado que acabamos de ler
     * (compare-and-swap). Duas requisições simultâneas tentando reservar a
     * mesma peça: a primeira muda o status, a segunda encontra `count === 0` e
     * é recusada. Sem isso, as duas leriam "AVAILABLE" e as duas gravariam
     * "RESERVED" — a peça seria prometida a dois clientes.
     */
    const atualizadas = await tx.inventoryUnit.updateMany({
      where: {
        id: unidade.id,
        status: unidade.status,
        quantity: unidade.quantity,
      },
      data: {
        status: transicao.novoStatus,
        quantity: saldo.novoSaldo,
        locationId: novoLocationId,
        // Venda grava preço, data e comprador; devolução de peça vendida
        // apaga os três, senão a aba de Vendas e os relatórios contariam
        // uma venda que foi desfeita.
        ...(input.type === "SALE"
          ? {
              soldPrice: input.soldPrice ?? null,
              soldAt: new Date(),
              soldToName: input.soldToName ?? null,
            }
          : unidade.status === "SOLD"
            ? { soldPrice: null, soldAt: null, soldToName: null }
            : {}),
      },
    });

    if (atualizadas.count !== 1) {
      throw new ConflitoError(
        "Esta unidade foi alterada por outra operação enquanto você trabalhava. " +
          "Recarregue a página e tente de novo.",
      );
    }

    const movimento = await tx.inventoryMovement.create({
      data: {
        unitId: unidade.id,
        productId: unidade.productId,
        type: input.type,
        quantity: quantidade,
        fromStatus: unidade.status,
        toStatus: transicao.novoStatus,
        fromLocationId: unidade.locationId,
        toLocationId: novoLocationId,
        userId: ctx.userId,
        reason: input.reason ?? null,
        notes: input.notes ?? null,
        buildId: input.buildId ?? null,
      },
    });

    await registrarAuditoria(
      {
        action: "movement",
        entity: "InventoryUnit",
        entityId: unidade.id,
        before: { status: unidade.status, quantity: unidade.quantity },
        after: {
          status: transicao.novoStatus,
          quantity: saldo.novoSaldo,
          ...(input.type === "SALE"
            ? { soldPrice: input.soldPrice ?? null, soldToName: input.soldToName ?? null }
            : {}),
        },
      },
      ctx,
      tx,
    );

    return movimento;
  });
}

/**
 * Registra a entrada inicial de uma unidade recém-cadastrada.
 *
 * Separado de `registrarMovimento` porque não há transição a validar: a
 * unidade acabou de nascer. Ainda assim precisa gerar histórico, senão a peça
 * apareceria no estoque sem nenhum registro de como chegou lá.
 */
export async function registrarEntradaInicial(
  args: {
    unitId: string;
    productId: string;
    quantity: number;
    locationId: string | null;
    reason?: string | null;
  },
  ctx: ActionContext,
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
): Promise<void> {
  await tx.inventoryMovement.create({
    data: {
      unitId: args.unitId,
      productId: args.productId,
      type: "INBOUND",
      quantity: args.quantity,
      fromStatus: null,
      toStatus: "AVAILABLE",
      toLocationId: args.locationId,
      userId: ctx.userId,
      reason: args.reason ?? "Cadastro inicial",
    },
  });
}
