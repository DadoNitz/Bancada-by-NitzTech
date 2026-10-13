"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { UnitCondition } from "@/generated/prisma/enums";
import {
  atualizarProduto,
  atualizarUnidade,
  atualizarResumoDaUnidade,
  atualizarVenda,
  excluirUnidade,
} from "@/server/services/unit-write.service";

import { runAction, type ActionResult } from "./run-action";

/** Server Actions de edicao e exclusao logica. */

const dinheiro = z
  .union([z.string(), z.number()])
  .transform((valor, ctx) => {
    if (valor === "" || valor === undefined) return undefined;
    const numero =
      typeof valor === "number"
        ? valor
        : Number(String(valor).replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(numero) || numero < 0) {
      ctx.addIssue({ code: "custom", message: "Valor invalido." });
      return undefined;
    }
    return Math.round(numero * 100) / 100;
  })
  .optional();

const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((valor) => (valor.length === 0 ? undefined : valor))
    .optional();

export async function salvarResumoUnidade(
  input: unknown,
): Promise<ActionResult<null>> {
  const resultado = await runAction(
    {
      permission: "inventory:write",
      schema: z.object({
        id: z.string().min(1),
        condition: z.enum(UnitCondition),
        purchaseCost: z.number().finite().min(0).max(999999999).nullable(),
        purchaseCostNote: z.string().trim().max(80).nullable().default(null),
        estimatedSalePrice: z
          .number()
          .finite()
          .min(0)
          .max(999999999)
          .nullable(),
      }),
      async handler({ id, ...dados }, ctx) {
        await atualizarResumoDaUnidade(id, dados, ctx);
        revalidatePath(`/estoque/itens/${id}`);
        return null;
      },
    },
    input,
  );
  if (resultado.ok) {
    revalidatePath("/estoque/itens");
    revalidatePath("/dashboard");
    revalidatePath("/socios");
    revalidatePath("/relatorios");
  }
  return resultado;
}

export async function salvarUnidade(
  input: unknown,
): Promise<ActionResult<null>> {
  const resultado = await runAction(
    {
      permission: "inventory:write",
      schema: z.object({
        id: z.string().min(1),
        serialNumber: texto(120),
        condition: z.enum(UnitCondition),
        purchasedById: z.string().optional(),
        purchaseCost: dinheiro,
        purchaseCostNote: texto(80),
        estimatedSalePrice: dinheiro,
        origin: texto(160),
        notes: texto(2000),
      }),
      async handler(dados, ctx) {
        await atualizarUnidade(
          dados.id,
          {
            serialNumber: dados.serialNumber,
            condition: dados.condition,
            purchasedById: dados.purchasedById || undefined,
            purchaseCost: dados.purchaseCost,
            purchaseCostNote: dados.purchaseCostNote,
            estimatedSalePrice: dados.estimatedSalePrice,
            origin: dados.origin,
            notes: dados.notes,
          },
          ctx,
        );
        return null;
      },
    },
    input,
  );

  if (resultado.ok) {
    revalidatePath("/estoque/itens");
    revalidatePath("/dashboard");
  }
  return resultado;
}

export async function salvarProduto(
  input: unknown,
): Promise<ActionResult<{ unidadesAfetadas: number }>> {
  const resultado = await runAction(
    {
      permission: "inventory:write",
      schema: z.object({
        id: z.string().min(1),
        name: z.string().trim().min(2, "Informe o nome.").max(160),
        model: texto(120),
        partNumber: texto(80),
        brandId: z.string().optional(),
        description: texto(2000),
        defaultSalePrice: dinheiro,
        lowStockThreshold: z.coerce.number().int().min(0).max(9999).default(0),
        specs: z.record(z.string(), z.unknown()).default({}),
      }),
      handler: (dados, ctx) =>
        atualizarProduto(
          dados.id,
          {
            name: dados.name,
            model: dados.model,
            partNumber: dados.partNumber,
            brandId: dados.brandId || undefined,
            description: dados.description,
            defaultSalePrice: dados.defaultSalePrice,
            lowStockThreshold: dados.lowStockThreshold,
            specs: dados.specs,
          },
          ctx,
        ),
    },
    input,
  );

  if (resultado.ok) {
    revalidatePath("/estoque/itens");
    revalidatePath("/montagens");
  }
  return resultado;
}

export async function removerUnidade(
  input: unknown,
): Promise<ActionResult<null>> {
  const resultado = await runAction(
    {
      permission: "inventory:delete",
      schema: z.object({
        id: z.string().min(1),
        motivo: texto(500),
      }),
      async handler(dados, ctx) {
        await excluirUnidade(dados.id, dados.motivo, ctx);
        return null;
      },
    },
    input,
  );

  if (resultado.ok) {
    revalidatePath("/estoque/itens");
    revalidatePath("/dashboard");
  }
  return resultado;
}

export async function salvarVenda(
  input: unknown,
): Promise<ActionResult<null>> {
  const resultado = await runAction(
    {
      permission: "inventory:write",
      schema: z.object({
        id: z.string().min(1),
        soldPrice: z.number().finite().min(0).max(999999999).nullable(),
        soldToName: z.string().trim().max(120).nullable(),
      }),
      async handler({ id, soldPrice, soldToName }, ctx) {
        await atualizarVenda(
          id,
          { soldPrice, soldToName: soldToName || null },
          ctx,
        );
        revalidatePath(`/estoque/itens/${id}`);
        return null;
      },
    },
    input,
  );
  if (resultado.ok) {
    revalidatePath("/estoque/vendas");
    revalidatePath("/dashboard");
    revalidatePath("/relatorios");
  }
  return resultado;
}
