import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/client";
import {
  adicionarPecaNaMontagem,
  atualizarMontagem,
  cancelarMontagem,
  criarMontagem,
  removerPecaDaMontagem,
  venderMontagem,
} from "@/server/services/build-write.service";
import {
  ConflitoError,
  EstoqueInvalidoError,
  RegraDeNegocioError,
} from "@/server/services/errors";
import { registrarMovimento } from "@/server/services/movement.service";
import { cadastrarPecaComUnidades } from "@/server/services/product.service";
import type { ActionContext } from "@/server/session";

/**
 * Reserva e cancelamento de montagem — regras críticas da seção 29.
 *
 * O que se verifica aqui não é a tela: é que o estoque continue dizendo a
 * verdade depois de montar, cancelar e vender. Uma peça que fica presa numa
 * montagem cancelada some do inventário sem ninguém perceber.
 */

const MARCADOR = "__teste_montagem__";

let ctx: ActionContext;
let categoryId: string;
let partnerId: string;

beforeAll(async () => {
  const usuario = await prisma.user.findFirstOrThrow({
    where: { role: "ADMIN" },
    select: { id: true, name: true, role: true },
  });
  ctx = {
    userId: usuario.id,
    role: usuario.role,
    name: usuario.name,
    ip: null,
    userAgent: "vitest",
  };

  categoryId = (
    await prisma.category.findFirstOrThrow({
      where: { slug: "gpu" },
      select: { id: true },
    })
  ).id;

  partnerId = (
    await prisma.partner.findFirstOrThrow({ select: { id: true } })
  ).id;
});

afterAll(async () => {
  const produtos = await prisma.product.findMany({
    where: { name: { startsWith: MARCADOR } },
    select: { id: true },
  });
  const produtoIds = produtos.map((produto) => produto.id);
  if (produtoIds.length === 0) return;

  const builds = await prisma.build.findMany({
    where: { name: { startsWith: MARCADOR } },
    select: { id: true },
  });
  const buildIds = builds.map((build) => build.id);

  await prisma.$executeRawUnsafe(
    `DELETE FROM "inventory_movements" WHERE "productId" = ANY($1::text[])`,
    produtoIds,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "build_items" WHERE "buildId" = ANY($1::text[])`,
    buildIds,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "audit_logs" WHERE "entityId" = ANY($1::text[]) OR "entityId" = ANY($2::text[])`,
    produtoIds,
    buildIds,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "inventory_units" WHERE "productId" = ANY($1::text[])`,
    produtoIds,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "builds" WHERE id = ANY($1::text[])`,
    buildIds,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM "products" WHERE id = ANY($1::text[])`,
    produtoIds,
  );
});

async function criarPecas(quantidade: number, custo = 100): Promise<string[]> {
  const resultado = await cadastrarPecaComUnidades(
    {
      name: `${MARCADOR} peça ${Date.now()}-${Math.random()}`,
      categoryId,
      trackingMode: "SERIALIZED",
      lowStockThreshold: 0,
      tagIds: [],
      specs: {},
    },
    {
      quantidade,
      seriais: [],
      condition: "USED",
      purchasedById: partnerId,
      purchaseCost: custo,
    },
    ctx,
  );
  return resultado.unitIds;
}

async function statusDe(unitId: string) {
  const unidade = await prisma.inventoryUnit.findUniqueOrThrow({
    where: { id: unitId },
    select: { status: true, soldPrice: true },
  });
  return unidade;
}

describe("criar montagem", () => {
  it("reserva as peças em vez de retirá-las", async () => {
    const unidades = await criarPecas(3);

    const { buildId, pecasAlocadas } = await criarMontagem(
      { name: `${MARCADOR} PC gamer`, unitIds: unidades },
      ctx,
    );

    expect(pecasAlocadas).toBe(3);

    for (const unitId of unidades) {
      expect((await statusDe(unitId)).status).toBe("IN_BUILD");
    }

    const build = await prisma.build.findUniqueOrThrow({
      where: { id: buildId },
      select: { status: true, totalCost: true },
    });
    expect(build.status).toBe("RESERVED");
    // Custo total somado das peças: 3 x 100.
    expect(Number(build.totalCost)).toBe(300);
  });

  it("nasce como ASSEMBLED quando o PC já foi montado", async () => {
    // A tela de montagem manual existe para o caso em que a máquina já está
    // pronta na bancada. Nascer "reservada" obrigaria a mudar o status logo em
    // seguida, registrando um estado que nunca existiu — e, entre os dois
    // passos, a montagem apareceria como planejada quando já estava montada.
    const unidades = await criarPecas(2);

    const { buildId } = await criarMontagem(
      { name: `${MARCADOR} ja montado`, unitIds: unidades, status: "ASSEMBLED" },
      ctx,
    );

    const build = await prisma.build.findUniqueOrThrow({
      where: { id: buildId },
      select: { status: true },
    });
    expect(build.status).toBe("ASSEMBLED");

    // O que importa para o estoque é o mesmo dos dois jeitos: as peças saem do
    // disponível. É esta parte que faz o estoque parar de mentir.
    for (const unitId of unidades) {
      expect((await statusDe(unitId)).status).toBe("IN_BUILD");
    }
  });

  it("a peça montada aponta de volta para a montagem", async () => {
    // É o que a tela da peça mostra: "Montada em <nome>". Sem este vínculo, o
    // estoque diz apenas "em montagem" e descobrir em QUAL PC exigiria abrir
    // montagem por montagem.
    const unidades = await criarPecas(1);
    const unitId = unidades[0]!;

    const { buildId } = await criarMontagem(
      { name: `${MARCADOR} com vinculo`, unitIds: unidades, status: "ASSEMBLED" },
      ctx,
    );

    const vinculo = await prisma.buildItem.findFirstOrThrow({
      where: { unitId, build: { deletedAt: null, status: { not: "CANCELLED" } } },
      select: { build: { select: { id: true, name: true } } },
    });

    expect(vinculo.build.id).toBe(buildId);
    expect(vinculo.build.name).toContain("com vinculo");
  });

  it("registra movimentação de alocação para cada peça", async () => {
    const unidades = await criarPecas(2);
    const { buildId } = await criarMontagem(
      { name: `${MARCADOR} com histórico`, unitIds: unidades },
      ctx,
    );

    const movimentos = await prisma.inventoryMovement.findMany({
      where: { buildId, type: "BUILD_ALLOCATE" },
      select: { fromStatus: true, toStatus: true },
    });

    expect(movimentos).toHaveLength(2);
    expect(movimentos.every((m) => m.toStatus === "IN_BUILD")).toBe(true);
  });

  it("recusa peça que já está em outra montagem", async () => {
    const unidades = await criarPecas(1);
    await criarMontagem(
      { name: `${MARCADOR} primeira`, unitIds: unidades },
      ctx,
    );

    await expect(
      criarMontagem({ name: `${MARCADOR} segunda`, unitIds: unidades }, ctx),
    ).rejects.toBeInstanceOf(EstoqueInvalidoError);
  });

  it("recusa peça vendida", async () => {
    const unidades = await criarPecas(1);
    await registrarMovimento({ unitId: unidades[0]!, type: "SALE" }, ctx);

    await expect(
      criarMontagem({ name: `${MARCADOR} com vendida`, unitIds: unidades }, ctx),
    ).rejects.toBeInstanceOf(EstoqueInvalidoError);
  });

  it("sob concorrência, só uma montagem fica com a peça", async () => {
    const unidades = await criarPecas(1);

    const resultados = await Promise.allSettled([
      criarMontagem({ name: `${MARCADOR} corrida A`, unitIds: unidades }, ctx),
      criarMontagem({ name: `${MARCADOR} corrida B`, unitIds: unidades }, ctx),
    ]);

    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);

    const falha = resultados.find((r) => r.status === "rejected");
    expect(
      falha?.status === "rejected" &&
        (falha.reason instanceof ConflitoError ||
          falha.reason instanceof EstoqueInvalidoError),
    ).toBe(true);

    // E a peça precisa ter apenas uma alocação no histórico.
    const alocacoes = await prisma.inventoryMovement.count({
      where: { unitId: unidades[0]!, type: "BUILD_ALLOCATE" },
    });
    expect(alocacoes).toBe(1);
  });

  it("recusa a mesma peça informada duas vezes", async () => {
    const unidades = await criarPecas(1);
    await expect(
      criarMontagem(
        { name: `${MARCADOR} duplicada`, unitIds: [unidades[0]!, unidades[0]!] },
        ctx,
      ),
    ).rejects.toThrow(/mais de uma vez/);
  });
});

describe("cancelar montagem", () => {
  it("devolve todas as peças ao estoque", async () => {
    // O modo de falha que este teste existe para impedir: peça que fica presa
    // numa montagem cancelada e some do inventário sem ninguém perceber.
    const unidades = await criarPecas(3);
    const { buildId } = await criarMontagem(
      { name: `${MARCADOR} a cancelar`, unitIds: unidades },
      ctx,
    );

    const { pecasDevolvidas } = await cancelarMontagem(
      buildId,
      "Cliente desistiu",
      ctx,
    );

    expect(pecasDevolvidas).toBe(3);
    for (const unitId of unidades) {
      expect((await statusDe(unitId)).status).toBe("AVAILABLE");
    }

    const build = await prisma.build.findUniqueOrThrow({
      where: { id: buildId },
      select: { status: true },
    });
    expect(build.status).toBe("CANCELLED");
  });

  it("as peças devolvidas voltam a poder ser montadas", async () => {
    const unidades = await criarPecas(2);
    const primeira = await criarMontagem(
      { name: `${MARCADOR} ciclo 1`, unitIds: unidades },
      ctx,
    );
    await cancelarMontagem(primeira.buildId, undefined, ctx);

    const segunda = await criarMontagem(
      { name: `${MARCADOR} ciclo 2`, unitIds: unidades },
      ctx,
    );
    expect(segunda.pecasAlocadas).toBe(2);
  });

  it("não cancela montagem já vendida", async () => {
    const unidades = await criarPecas(1);
    const { buildId } = await criarMontagem(
      { name: `${MARCADOR} vendida`, unitIds: unidades },
      ctx,
    );
    await venderMontagem({ buildId, salePrice: 500 }, ctx);

    await expect(
      cancelarMontagem(buildId, undefined, ctx),
    ).rejects.toBeInstanceOf(EstoqueInvalidoError);
  });

  it("não cancela duas vezes", async () => {
    const unidades = await criarPecas(1);
    const { buildId } = await criarMontagem(
      { name: `${MARCADOR} cancelar 2x`, unitIds: unidades },
      ctx,
    );
    await cancelarMontagem(buildId, undefined, ctx);

    await expect(
      cancelarMontagem(buildId, undefined, ctx),
    ).rejects.toBeInstanceOf(EstoqueInvalidoError);
  });
});

describe("vender montagem", () => {
  it("marca as peças como vendidas e rateia o valor pelo custo", async () => {
    // Rateio proporcional importa para o extrato por sócio: quem pagou pela
    // peça cara precisa receber a parte maior da venda.
    const caras = await criarPecas(1, 300);
    const baratas = await criarPecas(1, 100);
    const unidades = [...caras, ...baratas];

    const { buildId } = await criarMontagem(
      { name: `${MARCADOR} para vender`, unitIds: unidades },
      ctx,
    );

    await venderMontagem(
      { buildId, salePrice: 800, customerName: "Cliente teste" },
      ctx,
    );

    const cara = await statusDe(caras[0]!);
    const barata = await statusDe(baratas[0]!);

    expect(cara.status).toBe("SOLD");
    expect(barata.status).toBe("SOLD");

    // 300/400 de 800 = 600; 100/400 de 800 = 200.
    expect(Number(cara.soldPrice)).toBeCloseTo(600, 2);
    expect(Number(barata.soldPrice)).toBeCloseTo(200, 2);
  });

  it("o valor da venda entra no extrato do sócio", async () => {
    const unidades = await criarPecas(2, 150);
    const { buildId } = await criarMontagem(
      { name: `${MARCADOR} extrato`, unitIds: unidades },
      ctx,
    );

    await venderMontagem({ buildId, salePrice: 1000 }, ctx);

    const vendas = await prisma.inventoryMovement.findMany({
      where: { buildId, type: "SALE" },
      select: { amount: true, partnerId: true },
    });

    expect(vendas).toHaveLength(2);
    expect(vendas.every((venda) => venda.partnerId === partnerId)).toBe(true);
    const total = vendas.reduce((soma, v) => soma + Number(v.amount), 0);
    expect(total).toBeCloseTo(1000, 2);
  });
});

describe("editar montagem", () => {
  it("adicionar peça reserva a unidade e recalcula o custo", async () => {
    const [a, b] = await criarPecas(2, 100);
    const [extra] = await criarPecas(1, 250);
    const { buildId } = await criarMontagem(
      { name: `${MARCADOR} editar add`, unitIds: [a!, b!] },
      ctx,
    );

    const { custoTotal } = await adicionarPecaNaMontagem(buildId, extra!, ctx);

    expect(custoTotal).toBe(450);
    expect((await statusDe(extra!)).status).toBe("IN_BUILD");
    const mov = await prisma.inventoryMovement.findFirst({
      where: { unitId: extra!, buildId, type: "BUILD_ALLOCATE" },
    });
    expect(mov).not.toBeNull();
  });

  it("remover peça devolve ao estoque e recalcula o custo", async () => {
    const [a, b] = await criarPecas(2, 100);
    const { buildId } = await criarMontagem(
      { name: `${MARCADOR} editar remove`, unitIds: [a!, b!] },
      ctx,
    );

    const { custoTotal } = await removerPecaDaMontagem(buildId, b!, ctx);

    expect(custoTotal).toBe(100);
    expect((await statusDe(b!)).status).toBe("AVAILABLE");
    const restantes = await prisma.buildItem.count({ where: { buildId } });
    expect(restantes).toBe(1);
  });

  it("não remove a última peça — para isso existe cancelar", async () => {
    const [a] = await criarPecas(1);
    const { buildId } = await criarMontagem(
      { name: `${MARCADOR} editar ultima`, unitIds: [a!] },
      ctx,
    );

    await expect(removerPecaDaMontagem(buildId, a!, ctx)).rejects.toBeInstanceOf(
      RegraDeNegocioError,
    );
    expect((await statusDe(a!)).status).toBe("IN_BUILD");
  });

  it("não adiciona peça que já está em outra montagem", async () => {
    const [a, b] = await criarPecas(2);
    const { buildId } = await criarMontagem(
      { name: `${MARCADOR} editar ocupada 1`, unitIds: [a!] },
      ctx,
    );
    await criarMontagem({ name: `${MARCADOR} editar ocupada 2`, unitIds: [b!] }, ctx);

    await expect(adicionarPecaNaMontagem(buildId, b!, ctx)).rejects.toBeInstanceOf(
      EstoqueInvalidoError,
    );
  });

  it("atualiza dados e permite limpar o preço", async () => {
    const [a] = await criarPecas(1);
    const { buildId } = await criarMontagem(
      { name: `${MARCADOR} editar dados`, unitIds: [a!], salePrice: 900 },
      ctx,
    );

    await atualizarMontagem(
      buildId,
      { name: `${MARCADOR} editar dados v2`, customerName: "João", salePrice: null },
      ctx,
    );

    const build = await prisma.build.findUniqueOrThrow({ where: { id: buildId } });
    expect(build.name).toContain("v2");
    expect(build.customerName).toBe("João");
    expect(build.salePrice).toBeNull();
  });

  it("montagem vendida não pode mais ser editada", async () => {
    const [a, b] = await criarPecas(2);
    const [extra] = await criarPecas(1);
    const { buildId } = await criarMontagem(
      { name: `${MARCADOR} editar vendida`, unitIds: [a!, b!] },
      ctx,
    );
    await venderMontagem({ buildId, salePrice: 500 }, ctx);

    await expect(adicionarPecaNaMontagem(buildId, extra!, ctx)).rejects.toBeInstanceOf(
      EstoqueInvalidoError,
    );
    await expect(removerPecaDaMontagem(buildId, a!, ctx)).rejects.toBeInstanceOf(
      EstoqueInvalidoError,
    );
    await expect(
      atualizarMontagem(buildId, { name: `${MARCADOR} x` }, ctx),
    ).rejects.toBeInstanceOf(EstoqueInvalidoError);
  });
});
