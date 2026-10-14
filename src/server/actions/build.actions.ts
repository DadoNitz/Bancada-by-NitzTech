"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  adicionarPecaNaMontagem,
  alterarStatusDaMontagem,
  atualizarMontagem,
  cancelarMontagem,
  criarMontagem,
  removerPecaDaMontagem,
  venderMontagem,
} from "@/server/services/build-write.service";

import { runAction, type ActionResult } from "./run-action";

/**
 * Server Actions de montagem.
 *
 * Todas exigem `build:write` e passam por `runAction`, que autoriza e valida
 * antes de qualquer escrita.
 */

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

const criarSchema = z.object({
  name: z.string().trim().min(2, "De um nome a montagem.").max(120),
  customerName: z.string().trim().max(120).optional(),
  salePrice: dinheiro,
  useCase: z.string().trim().max(80).optional(),
  tier: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(2000).optional(),
  unitIds: z.array(z.string().min(1)).min(1, "Selecione ao menos uma peca."),
  // Lista fechada: so estes dois estados fazem sentido no nascimento de uma
  // montagem. Aceitar o enum inteiro deixaria criar uma ja "vendida".
  status: z.enum(["RESERVED", "ASSEMBLED"]).optional(),
  compatibilidade: z.unknown().optional(),
});

export async function salvarMontagem(
  input: unknown,
): Promise<ActionResult<{ buildId: string; pecasAlocadas: number }>> {
  const resultado = await runAction(
    {
      permission: "build:write",
      schema: criarSchema,
      handler: (dados, ctx) =>
        criarMontagem(
          {
            name: dados.name,
            customerName: dados.customerName,
            salePrice: dados.salePrice,
            useCase: dados.useCase,
            tier: dados.tier,
            notes: dados.notes,
            unitIds: dados.unitIds,
            status: dados.status,
            compatibilidade: dados.compatibilidade,
          },
          ctx,
        ),
    },
    input,
  );

  if (resultado.ok) {
    revalidatePath("/montagens", "layout");
    revalidatePath("/estoque/itens");
    revalidatePath("/dashboard");
  }
  return resultado;
}

export async function cancelar(
  input: unknown,
): Promise<ActionResult<{ pecasDevolvidas: number }>> {
  const resultado = await runAction(
    {
      permission: "build:write",
      schema: z.object({
        buildId: z.string().min(1),
        motivo: z.string().trim().max(500).optional(),
      }),
      handler: (dados, ctx) => cancelarMontagem(dados.buildId, dados.motivo, ctx),
    },
    input,
  );

  if (resultado.ok) {
    revalidatePath("/montagens", "layout");
    revalidatePath("/estoque/itens");
    revalidatePath("/dashboard");
  }
  return resultado;
}

export async function vender(
  input: unknown,
): Promise<ActionResult<{ pecasVendidas: number }>> {
  const resultado = await runAction(
    {
      permission: "build:write",
      schema: z.object({
        buildId: z.string().min(1),
        salePrice: z.coerce.number().min(0),
        customerName: z.string().trim().max(120).optional(),
      }),
      handler: (dados, ctx) =>
        venderMontagem(
          {
            buildId: dados.buildId,
            salePrice: dados.salePrice,
            customerName: dados.customerName,
          },
          ctx,
        ),
    },
    input,
  );

  if (resultado.ok) {
    revalidatePath("/montagens", "layout");
    revalidatePath("/socios");
    revalidatePath("/dashboard");
  }
  return resultado;
}

export async function mudarStatus(input: unknown): Promise<ActionResult<null>> {
  const resultado = await runAction(
    {
      permission: "build:write",
      schema: z.object({
        buildId: z.string().min(1),
        status: z.enum(["RESERVED", "ASSEMBLING", "ASSEMBLED"]),
      }),
      async handler(dados, ctx) {
        await alterarStatusDaMontagem(dados.buildId, dados.status, ctx);
        return null;
      },
    },
    input,
  );

  if (resultado.ok) revalidatePath("/montagens", "layout");
  return resultado;
}

/** Texto opcional: string vazia vira `null`, para o campo poder ser apagado. */
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((valor) => (valor === "" ? null : valor))
    .nullable()
    .optional();

const editarSchema = z.object({
  buildId: z.string().min(1),
  name: z.string().trim().min(2, "De um nome a montagem.").max(120),
  customerName: textoOpcional(120),
  // Preço vazio = sem preço definido (null), diferente de "não mexer".
  salePrice: dinheiro.transform((valor) => valor ?? null),
  useCase: textoOpcional(80),
  tier: textoOpcional(40),
  notes: textoOpcional(2000),
});

function revalidarMontagem() {
  // "layout" invalida a lista e a página de detalhe de uma vez.
  revalidatePath("/montagens", "layout");
  revalidatePath("/estoque/itens");
  revalidatePath("/dashboard");
}

export async function editarMontagem(input: unknown): Promise<ActionResult<null>> {
  const resultado = await runAction(
    {
      permission: "build:write",
      schema: editarSchema,
      async handler({ buildId, ...dados }, ctx) {
        await atualizarMontagem(buildId, dados, ctx);
        return null;
      },
    },
    input,
  );
  if (resultado.ok) revalidarMontagem();
  return resultado;
}

const pecaSchema = z.object({
  buildId: z.string().min(1),
  unitId: z.string().min(1),
});

export async function adicionarPeca(
  input: unknown,
): Promise<ActionResult<{ custoTotal: number }>> {
  const resultado = await runAction(
    {
      permission: "build:write",
      schema: pecaSchema,
      handler: (dados, ctx) => adicionarPecaNaMontagem(dados.buildId, dados.unitId, ctx),
    },
    input,
  );
  if (resultado.ok) revalidarMontagem();
  return resultado;
}

export async function removerPeca(
  input: unknown,
): Promise<ActionResult<{ custoTotal: number }>> {
  const resultado = await runAction(
    {
      permission: "build:write",
      schema: pecaSchema,
      handler: (dados, ctx) => removerPecaDaMontagem(dados.buildId, dados.unitId, ctx),
    },
    input,
  );
  if (resultado.ok) revalidarMontagem();
  return resultado;
}
