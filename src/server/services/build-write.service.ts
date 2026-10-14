import "server-only";

import type { BuildRole, BuildStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/client";
import type { ActionContext } from "@/server/session";

import { registrarAuditoria } from "./audit.service";
import {
  ConflitoError,
  EstoqueInvalidoError,
  NaoEncontradoError,
  RegraDeNegocioError,
} from "./errors";

/**
 * Escrita de montagens (seção 11).
 *
 * A decisão central: confirmar uma montagem **reserva** as peças, não as
 * retira. As unidades vão para `IN_BUILD` e voltam para `AVAILABLE` se a
 * montagem for cancelada. Retirar seria irreversível, e montagem cancelada é
 * situação comum — cliente desiste, peça chega com defeito, aparece uma
 * configuração melhor.
 *
 * A saída definitiva do estoque acontece só na venda.
 *
 * Toda alocação e liberação passa pelo mesmo caminho transacional do resto do
 * estoque: nenhuma peça muda de status sem uma movimentação correspondente.
 */

/** Mapeia o slug da categoria para o papel na montagem. */
const PAPEL_POR_SLUG: Record<string, BuildRole> = {
  cpu: "CPU",
  motherboard: "MOTHERBOARD",
  ram: "RAM",
  gpu: "GPU",
  storage: "STORAGE",
  psu: "PSU",
  case: "CASE",
  cooler: "COOLER",
  monitor: "MONITOR",
  peripheral: "PERIPHERAL",
};

export function papelDaCategoria(slug: string): BuildRole {
  return PAPEL_POR_SLUG[slug] ?? "OTHER";
}

export interface CriarMontagemInput {
  name: string;
  customerName?: string | undefined;
  salePrice?: number | undefined;
  notes?: string | undefined;
  useCase?: string | undefined;
  tier?: string | undefined;
  /** Unidades que compõem a montagem. */
  unitIds: string[];
  /**
   * Situação em que a montagem nasce.
   *
   * `RESERVED` é o padrão e serve ao fluxo de sugestões: as peças ficam
   * separadas para um PC que ainda vai ser montado.
   *
   * `ASSEMBLED` existe para o caminho oposto, e mais comum na bancada: o PC
   * **já foi montado** e só falta o estoque saber. Nascer como reservada
   * obrigaria a mudar o status logo em seguida — um passo a mais que registra
   * um estado que nunca existiu.
   */
  status?: "RESERVED" | "ASSEMBLED" | undefined;
  /** Resultado do motor no momento da criação, guardado como evidência. */
  compatibilidade?: unknown;
}

/**
 * Cria a montagem e reserva as peças.
 *
 * Tudo dentro de uma transação: uma montagem criada com metade das peças
 * alocadas deixaria o estoque mentindo sobre o que está disponível.
 */
export async function criarMontagem(
  input: CriarMontagemInput,
  ctx: ActionContext,
): Promise<{ buildId: string; pecasAlocadas: number }> {
  if (input.unitIds.length === 0) {
    throw new RegraDeNegocioError("Selecione ao menos uma peça para a montagem.");
  }

  const unicos = [...new Set(input.unitIds)];
  if (unicos.length !== input.unitIds.length) {
    throw new RegraDeNegocioError("A mesma peça foi informada mais de uma vez.");
  }

  return prisma.$transaction(async (tx) => {
    const unidades = await tx.inventoryUnit.findMany({
      where: { id: { in: unicos } },
      select: {
        id: true,
        status: true,
        productId: true,
        locationId: true,
        purchaseCost: true,
        internalCode: true,
        product: {
          select: { name: true, category: { select: { slug: true } } },
        },
      },
    });

    if (unidades.length !== unicos.length) {
      throw new NaoEncontradoError("Uma das unidades selecionadas");
    }

    const indisponiveis = unidades.filter(
      (unidade) => unidade.status !== "AVAILABLE" && unidade.status !== "RESERVED",
    );
    if (indisponiveis.length > 0) {
      const nomes = indisponiveis
        .map((unidade) => `${unidade.product.name} (${unidade.internalCode})`)
        .join(", ");
      throw new EstoqueInvalidoError(
        `Estas peças não estão disponíveis para montagem: ${nomes}.`,
      );
    }

    const custoTotal = unidades.reduce(
      (soma, unidade) => soma + Number(unidade.purchaseCost ?? 0),
      0,
    );

    const build = await tx.build.create({
      data: {
        name: input.name,
        customerName: input.customerName ?? null,
        status: input.status ?? "RESERVED",
        totalCost: custoTotal,
        salePrice: input.salePrice ?? null,
        useCase: input.useCase ?? null,
        tier: input.tier ?? null,
        notes: input.notes ?? null,
        createdById: ctx.userId,
        ...(input.compatibilidade
          ? { compatibility: input.compatibilidade as object }
          : {}),
      },
      select: { id: true },
    });

    for (const unidade of unidades) {
      await tx.buildItem.create({
        data: {
          buildId: build.id,
          unitId: unidade.id,
          role: papelDaCategoria(unidade.product.category.slug),
          quantity: 1,
        },
      });

      /*
       * Alteração condicionada ao status lido (compare-and-swap).
       *
       * Duas pessoas montando ao mesmo tempo podem escolher a mesma GPU. A
       * segunda encontra `count === 0` e a transação inteira é desfeita —
       * melhor do que duas montagens prometendo a mesma peça.
       */
      const atualizadas = await tx.inventoryUnit.updateMany({
        where: { id: unidade.id, status: unidade.status },
        data: { status: "IN_BUILD" },
      });

      if (atualizadas.count !== 1) {
        throw new ConflitoError(
          `A peça ${unidade.product.name} (${unidade.internalCode}) foi alocada por outra operação. Recarregue e monte de novo.`,
        );
      }

      await tx.inventoryMovement.create({
        data: {
          unitId: unidade.id,
          productId: unidade.productId,
          type: "BUILD_ALLOCATE",
          quantity: 1,
          fromStatus: unidade.status,
          toStatus: "IN_BUILD",
          fromLocationId: unidade.locationId,
          toLocationId: unidade.locationId,
          userId: ctx.userId,
          buildId: build.id,
          reason: `Montagem: ${input.name}`,
        },
      });
    }

    await registrarAuditoria(
      {
        action: "create",
        entity: "Build",
        entityId: build.id,
        after: { nome: input.name, pecas: unidades.length, custoTotal },
      },
      ctx,
      tx,
    );

    return { buildId: build.id, pecasAlocadas: unidades.length };
  });
}

/**
 * Cancela a montagem e devolve as peças ao estoque.
 *
 * Devolver por movimentação, e não por edição direta do status, é o que
 * mantém o histórico coerente: depois de cancelar, ainda dá para responder
 * "onde esta peça esteve".
 */
export async function cancelarMontagem(
  buildId: string,
  motivo: string | undefined,
  ctx: ActionContext,
): Promise<{ pecasDevolvidas: number }> {
  return prisma.$transaction(async (tx) => {
    const build = await tx.build.findUnique({
      where: { id: buildId },
      select: {
        id: true,
        name: true,
        status: true,
        items: {
          select: {
            unitId: true,
            unit: {
              select: { id: true, status: true, productId: true, locationId: true },
            },
          },
        },
      },
    });

    if (!build) throw new NaoEncontradoError("Montagem");

    if (build.status === "SOLD") {
      throw new EstoqueInvalidoError(
        "Esta montagem já foi vendida. Para desfazer, registre uma devolução.",
      );
    }
    if (build.status === "CANCELLED") {
      throw new EstoqueInvalidoError("Esta montagem já está cancelada.");
    }

    let devolvidas = 0;

    for (const item of build.items) {
      // Peça que já saiu por outro caminho (vendida avulsa, descartada) não
      // volta: seu status atual é a verdade.
      if (item.unit.status !== "IN_BUILD") continue;

      await tx.inventoryUnit.updateMany({
        where: { id: item.unitId, status: "IN_BUILD" },
        data: { status: "AVAILABLE" },
      });

      await tx.inventoryMovement.create({
        data: {
          unitId: item.unitId,
          productId: item.unit.productId,
          type: "BUILD_RELEASE",
          quantity: 1,
          fromStatus: "IN_BUILD",
          toStatus: "AVAILABLE",
          fromLocationId: item.unit.locationId,
          toLocationId: item.unit.locationId,
          userId: ctx.userId,
          buildId: build.id,
          reason: motivo ?? `Montagem cancelada: ${build.name}`,
        },
      });

      devolvidas += 1;
    }

    await tx.build.update({
      where: { id: buildId },
      data: { status: "CANCELLED", notes: motivo ?? undefined },
    });

    await registrarAuditoria(
      {
        action: "update",
        entity: "Build",
        entityId: buildId,
        before: { status: build.status },
        after: { status: "CANCELLED", pecasDevolvidas: devolvidas },
      },
      ctx,
      tx,
    );

    return { pecasDevolvidas: devolvidas };
  });
}

/** Muda o status da montagem sem mexer nas peças (planejada, em montagem...). */
export async function alterarStatusDaMontagem(
  buildId: string,
  status: Extract<BuildStatus, "ASSEMBLING" | "ASSEMBLED" | "RESERVED">,
  ctx: ActionContext,
): Promise<void> {
  const build = await prisma.build.findUnique({
    where: { id: buildId },
    select: { status: true },
  });

  if (!build) throw new NaoEncontradoError("Montagem");
  if (build.status === "SOLD" || build.status === "CANCELLED") {
    throw new EstoqueInvalidoError(
      "Montagem vendida ou cancelada não muda mais de status.",
    );
  }

  await prisma.build.update({ where: { id: buildId }, data: { status } });

  await registrarAuditoria(
    {
      action: "update",
      entity: "Build",
      entityId: buildId,
      before: { status: build.status },
      after: { status },
    },
    ctx,
  );
}

/**
 * Vende a montagem: as peças saem do estoque em definitivo.
 *
 * O valor da venda é rateado entre as unidades proporcionalmente ao custo de
 * cada uma. Sem o rateio, o extrato por sócio ficaria errado — quem pagou pela
 * GPU precisa receber a parte maior da venda de um PC gamer.
 */
export async function venderMontagem(
  args: {
    buildId: string;
    salePrice: number;
    customerName?: string | undefined;
  },
  ctx: ActionContext,
): Promise<{ pecasVendidas: number }> {
  return prisma.$transaction(async (tx) => {
    const build = await tx.build.findUnique({
      where: { id: args.buildId },
      select: {
        id: true,
        name: true,
        status: true,
        items: {
          select: {
            unitId: true,
            unit: {
              select: {
                id: true,
                status: true,
                productId: true,
                locationId: true,
                purchaseCost: true,
                purchasedById: true,
              },
            },
          },
        },
      },
    });

    if (!build) throw new NaoEncontradoError("Montagem");
    if (build.status === "SOLD") {
      throw new EstoqueInvalidoError("Esta montagem já foi vendida.");
    }
    if (build.status === "CANCELLED") {
      throw new EstoqueInvalidoError("Esta montagem está cancelada.");
    }

    const custoTotal = build.items.reduce(
      (soma, item) => soma + Number(item.unit.purchaseCost ?? 0),
      0,
    );

    const agora = new Date();
    let vendidas = 0;

    for (const item of build.items) {
      if (item.unit.status !== "IN_BUILD") continue;

      const custo = Number(item.unit.purchaseCost ?? 0);
      // Sem custo cadastrado em nenhuma peça, divide igualmente: é o rateio
      // menos errado possível quando não há base para proporcionalidade.
      const parcela =
        custoTotal > 0
          ? (custo / custoTotal) * args.salePrice
          : args.salePrice / build.items.length;

      await tx.inventoryUnit.updateMany({
        where: { id: item.unitId, status: "IN_BUILD" },
        data: {
          status: "SOLD",
          soldPrice: Math.round(parcela * 100) / 100,
          soldAt: agora,
          soldToName: args.customerName ?? null,
        },
      });

      await tx.inventoryMovement.create({
        data: {
          unitId: item.unitId,
          productId: item.unit.productId,
          type: "SALE",
          quantity: 1,
          fromStatus: "IN_BUILD",
          toStatus: "SOLD",
          fromLocationId: item.unit.locationId,
          userId: ctx.userId,
          partnerId: item.unit.purchasedById,
          amount: Math.round(parcela * 100) / 100,
          buildId: build.id,
          reason: `Venda da montagem: ${build.name}`,
        },
      });

      vendidas += 1;
    }

    await tx.build.update({
      where: { id: args.buildId },
      data: {
        status: "SOLD",
        salePrice: args.salePrice,
        customerName: args.customerName ?? undefined,
      },
    });

    await registrarAuditoria(
      {
        action: "update",
        entity: "Build",
        entityId: args.buildId,
        before: { status: build.status },
        after: { status: "SOLD", salePrice: args.salePrice, pecas: vendidas },
      },
      ctx,
      tx,
    );

    return { pecasVendidas: vendidas };
  });
}

/** Lista as montagens, da mais recente para a mais antiga. */
export async function listarMontagens(limite = 50) {
  return prisma.build.findMany({
    orderBy: { createdAt: "desc" },
    take: limite,
    select: {
      id: true,
      name: true,
      customerName: true,
      status: true,
      totalCost: true,
      salePrice: true,
      tier: true,
      useCase: true,
      createdAt: true,
      createdBy: { select: { name: true } },
      _count: { select: { items: true } },
    },
  });
}

export async function buscarMontagem(id: string) {
  const build = await prisma.build.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true } },
      items: {
        include: {
          unit: {
            select: {
              id: true,
              internalCode: true,
              status: true,
              condition: true,
              purchaseCost: true,
              estimatedSalePrice: true,
              location: { select: { name: true } },
              product: {
                select: {
                  name: true,
                  specs: true,
                  brand: { select: { name: true } },
                  category: { select: { name: true, icon: true, slug: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!build) throw new NaoEncontradoError("Montagem");
  return build;
}

/** Status em que a montagem ainda segura peças — e, portanto, pode ser editada. */
const EDITAVEL: BuildStatus[] = ["PLANNED", "RESERVED", "ASSEMBLING", "ASSEMBLED"];

function exigirEditavel(status: BuildStatus) {
  if (!EDITAVEL.includes(status)) {
    throw new EstoqueInvalidoError(
      status === "SOLD"
        ? "Montagem vendida não pode mais ser alterada."
        : "Montagem cancelada não pode mais ser alterada.",
    );
  }
}

/** Recalcula o custo a partir das peças que estão de fato na montagem. */
async function recalcularCusto(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  buildId: string,
): Promise<number> {
  const itens = await tx.buildItem.findMany({
    where: { buildId },
    select: { unit: { select: { purchaseCost: true } } },
  });
  const custo = itens.reduce(
    (soma, item) => soma + Number(item.unit.purchaseCost ?? 0),
    0,
  );
  await tx.build.update({ where: { id: buildId }, data: { totalCost: custo } });
  return custo;
}

export interface AtualizarMontagemInput {
  name: string;
  customerName?: string | null | undefined;
  salePrice?: number | null | undefined;
  useCase?: string | null | undefined;
  tier?: string | null | undefined;
  notes?: string | null | undefined;
}

/**
 * Edita os dados descritivos da montagem (nome, cliente, preço, observações).
 *
 * Não toca nas peças nem no status: essas mudanças têm efeito no estoque e
 * passam pelos caminhos próprios, que geram movimentação.
 */
export async function atualizarMontagem(
  buildId: string,
  input: AtualizarMontagemInput,
  ctx: ActionContext,
): Promise<void> {
  const build = await prisma.build.findUnique({
    where: { id: buildId },
    select: {
      status: true,
      name: true,
      customerName: true,
      salePrice: true,
      useCase: true,
      tier: true,
      notes: true,
    },
  });
  if (!build) throw new NaoEncontradoError("Montagem");
  exigirEditavel(build.status);

  const depois = {
    name: input.name,
    customerName: input.customerName ?? null,
    salePrice: input.salePrice ?? null,
    useCase: input.useCase ?? null,
    tier: input.tier ?? null,
    notes: input.notes ?? null,
  };

  await prisma.build.update({ where: { id: buildId }, data: depois });

  await registrarAuditoria(
    {
      action: "update",
      entity: "Build",
      entityId: buildId,
      before: { ...build, salePrice: build.salePrice ? Number(build.salePrice) : null },
      after: depois,
    },
    ctx,
  );
}

/**
 * Coloca mais uma peça na montagem (ou a peça nova de uma troca).
 *
 * Mesmo caminho da criação: compare-and-swap no status da unidade e
 * movimentação `BUILD_ALLOCATE`. O custo é recalculado a partir das peças.
 */
export async function adicionarPecaNaMontagem(
  buildId: string,
  unitId: string,
  ctx: ActionContext,
): Promise<{ custoTotal: number }> {
  return prisma.$transaction(async (tx) => {
    const build = await tx.build.findUnique({
      where: { id: buildId },
      select: { id: true, name: true, status: true },
    });
    if (!build) throw new NaoEncontradoError("Montagem");
    exigirEditavel(build.status);

    const unidade = await tx.inventoryUnit.findUnique({
      where: { id: unitId },
      select: {
        id: true,
        status: true,
        productId: true,
        locationId: true,
        internalCode: true,
        deletedAt: true,
        product: { select: { name: true, category: { select: { slug: true } } } },
      },
    });
    if (!unidade || unidade.deletedAt) throw new NaoEncontradoError("Peça");

    if (unidade.status !== "AVAILABLE" && unidade.status !== "RESERVED") {
      throw new EstoqueInvalidoError(
        `${unidade.product.name} (${unidade.internalCode}) não está disponível.`,
      );
    }

    const atualizadas = await tx.inventoryUnit.updateMany({
      where: { id: unidade.id, status: unidade.status },
      data: { status: "IN_BUILD" },
    });
    if (atualizadas.count !== 1) {
      throw new ConflitoError(
        `A peça ${unidade.product.name} foi alocada por outra operação. Recarregue e tente de novo.`,
      );
    }

    await tx.buildItem.create({
      data: {
        buildId,
        unitId: unidade.id,
        role: papelDaCategoria(unidade.product.category.slug),
        quantity: 1,
      },
    });

    await tx.inventoryMovement.create({
      data: {
        unitId: unidade.id,
        productId: unidade.productId,
        type: "BUILD_ALLOCATE",
        quantity: 1,
        fromStatus: unidade.status,
        toStatus: "IN_BUILD",
        fromLocationId: unidade.locationId,
        toLocationId: unidade.locationId,
        userId: ctx.userId,
        buildId,
        reason: `Adicionada à montagem: ${build.name}`,
      },
    });

    const custoTotal = await recalcularCusto(tx, buildId);

    await registrarAuditoria(
      {
        action: "update",
        entity: "Build",
        entityId: buildId,
        after: { pecaAdicionada: unidade.internalCode, custoTotal },
      },
      ctx,
      tx,
    );

    return { custoTotal };
  });
}

/**
 * Tira uma peça da montagem e a devolve ao estoque disponível.
 *
 * A última peça não sai: montagem vazia não descreve PC nenhum — para isso
 * existe "cancelar", que devolve tudo e registra o motivo.
 */
export async function removerPecaDaMontagem(
  buildId: string,
  unitId: string,
  ctx: ActionContext,
): Promise<{ custoTotal: number }> {
  return prisma.$transaction(async (tx) => {
    const build = await tx.build.findUnique({
      where: { id: buildId },
      select: { id: true, name: true, status: true, _count: { select: { items: true } } },
    });
    if (!build) throw new NaoEncontradoError("Montagem");
    exigirEditavel(build.status);

    const item = await tx.buildItem.findUnique({
      where: { buildId_unitId: { buildId, unitId } },
      select: {
        id: true,
        unit: {
          select: { status: true, productId: true, locationId: true, internalCode: true },
        },
      },
    });
    if (!item) throw new NaoEncontradoError("Peça na montagem");

    if (build._count.items <= 1) {
      throw new RegraDeNegocioError(
        "Esta é a última peça. Para desfazer a montagem inteira, use Cancelar.",
      );
    }

    await tx.buildItem.delete({ where: { id: item.id } });

    // Só volta ao estoque o que ainda está preso nesta montagem. Se a peça
    // saiu por outro caminho, o status atual dela é a verdade.
    if (item.unit.status === "IN_BUILD") {
      await tx.inventoryUnit.updateMany({
        where: { id: unitId, status: "IN_BUILD" },
        data: { status: "AVAILABLE" },
      });

      await tx.inventoryMovement.create({
        data: {
          unitId,
          productId: item.unit.productId,
          type: "BUILD_RELEASE",
          quantity: 1,
          fromStatus: "IN_BUILD",
          toStatus: "AVAILABLE",
          fromLocationId: item.unit.locationId,
          toLocationId: item.unit.locationId,
          userId: ctx.userId,
          buildId,
          reason: `Removida da montagem: ${build.name}`,
        },
      });
    }

    const custoTotal = await recalcularCusto(tx, buildId);

    await registrarAuditoria(
      {
        action: "update",
        entity: "Build",
        entityId: buildId,
        after: { pecaRemovida: item.unit.internalCode, custoTotal },
      },
      ctx,
      tx,
    );

    return { custoTotal };
  });
}
