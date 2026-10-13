"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import {
  criarUnidadeSchema,
  movimentacaoSchema,
  produtoSchema,
} from "@/lib/validation/inventory";
import {
  adicionarUnidades,
  cadastrarPecaComUnidades,
} from "@/server/services/product.service";
import { registrarMovimento } from "@/server/services/movement.service";
import {
  atualizarPrecoDeReferencia,
  marcarPendentes,
} from "@/server/services/reference-price";

import { runAction, type ActionResult } from "./run-action";

/**
 * Server Actions do estoque.
 *
 * Todas passam por `runAction`, que impõe a ordem obrigatória: autoriza,
 * valida com Zod, e só então chama o serviço. Nenhuma escreve no banco
 * diretamente.
 */

const cadastroCompletoSchema = z.object({
  produto: produtoSchema,
  unidades: criarUnidadeSchema.omit({ productId: true }),
});

export async function cadastrarPeca(
  input: unknown,
): Promise<ActionResult<{ productId: string; codigos: string[] }>> {
  const resultado = await runAction(
    {
      permission: "inventory:write",
      schema: cadastroCompletoSchema,
      async handler(dados, ctx) {
        return cadastrarPecaComUnidades(
          {
            name: dados.produto.name,
            model: dados.produto.model,
            partNumber: dados.produto.partNumber,
            categoryId: dados.produto.categoryId,
            brandId: dados.produto.brandId || undefined,
            trackingMode: dados.produto.trackingMode,
            description: dados.produto.description,
            defaultSalePrice: dados.produto.defaultSalePrice,
            lowStockThreshold: dados.produto.lowStockThreshold,
            tagIds: dados.produto.tagIds,
            specs: dados.produto.specs,
          },
          {
            quantidade: dados.unidades.quantidade,
            seriais: dados.unidades.seriais,
            condition: dados.unidades.condition,
            locationId: dados.unidades.locationId || undefined,
            purchasedById: dados.unidades.purchasedById || undefined,
            purchaseCost: dados.unidades.purchaseCost,
            purchaseCostNote: dados.unidades.purchaseCostNote,
            estimatedSalePrice: dados.unidades.estimatedSalePrice,
            purchaseDate: dados.unidades.purchaseDate,
            origin: dados.unidades.origin,
            notes: dados.unidades.notes,
          },
          ctx,
        );
      },
    },
    input,
  );

  if (resultado.ok) {
    // Preço de mercado em segundo plano: o cadastro responde na hora e a
    // lista mostra "buscando…" até o worker terminar.
    const { productId } = resultado.data;
    await marcarPendentes([productId]);
    after(() => atualizarPrecoDeReferencia(productId));

    revalidatePath("/estoque/itens");
    revalidatePath("/dashboard");
    revalidatePath("/socios");
    return {
      ok: true,
      data: {
        productId: resultado.data.productId,
        codigos: resultado.data.codigos,
      },
    };
  }

  return resultado;
}

export async function adicionarUnidadesAoProduto(
  input: unknown,
): Promise<ActionResult<{ codigos: string[] }>> {
  const resultado = await runAction(
    {
      permission: "inventory:write",
      schema: criarUnidadeSchema,
      async handler(dados, ctx) {
        return adicionarUnidades(
          dados.productId,
          {
            quantidade: dados.quantidade,
            seriais: dados.seriais,
            condition: dados.condition,
            locationId: dados.locationId || undefined,
            purchasedById: dados.purchasedById || undefined,
            purchaseCost: dados.purchaseCost,
            purchaseCostNote: dados.purchaseCostNote,
            estimatedSalePrice: dados.estimatedSalePrice,
            purchaseDate: dados.purchaseDate,
            origin: dados.origin,
            notes: dados.notes,
          },
          ctx,
        );
      },
    },
    input,
  );

  if (resultado.ok) {
    revalidatePath("/estoque/itens");
    revalidatePath("/dashboard");
    return { ok: true, data: { codigos: resultado.data.codigos } };
  }

  return resultado;
}

export async function movimentar(
  input: unknown,
): Promise<ActionResult<{ movimentoId: string }>> {
  const resultado = await runAction(
    {
      permission: "movement:create",
      schema: movimentacaoSchema,
      async handler(dados, ctx) {
        return registrarMovimento(
          {
            unitId: dados.unitId,
            type: dados.type,
            quantity: dados.quantity,
            reason: dados.reason ?? null,
            notes: dados.notes ?? null,
            toLocationId: dados.toLocationId || null,
            soldPrice: dados.type === "SALE" ? (dados.soldPrice ?? null) : null,
            soldToName: dados.type === "SALE" ? (dados.soldToName ?? null) : null,
          },
          ctx,
        );
      },
    },
    input,
  );

  if (resultado.ok) {
    revalidatePath("/estoque/itens");
    revalidatePath("/estoque/vendas");
    revalidatePath("/dashboard");
    return { ok: true, data: { movimentoId: resultado.data.id } };
  }

  return resultado;
}
