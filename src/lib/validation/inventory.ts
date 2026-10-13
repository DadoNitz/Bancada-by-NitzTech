import { z } from "zod";

import {
  MovementType,
  TrackingMode,
  UnitCondition,
  UnitStatus,
} from "@/generated/prisma/enums";

/**
 * Schemas compartilhados entre formulários e Server Actions.
 *
 * O cliente valida por conveniência; o servidor valida porque é a única
 * validação que conta (seção 21). O mesmo schema nos dois lados evita que as
 * regras divirjam com o tempo.
 */

/** Texto opcional: string vazia vira `undefined`, e não `""` no banco. */
const textoOpcional = (max = 200) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres.`)
    .transform((valor) => (valor.length === 0 ? undefined : valor))
    .optional();

/** Dinheiro: aceita "1.234,56" e "1234.56", devolve número. */
const dinheiroOpcional = z
  .union([z.string(), z.number()])
  .optional()
  .transform((valor, ctx) => {
    if (valor === undefined || valor === "") return undefined;

    const numero =
      typeof valor === "number"
        ? valor
        : Number(valor.replace(/\./g, "").replace(",", "."));

    if (!Number.isFinite(numero)) {
      ctx.addIssue({ code: "custom", message: "Valor inválido." });
      return undefined;
    }
    if (numero < 0) {
      ctx.addIssue({ code: "custom", message: "O valor não pode ser negativo." });
      return undefined;
    }
    // Duas casas: o banco guarda Decimal(12,2) e arredondar aqui evita
    // divergência entre o que a pessoa digitou e o que ficou gravado.
    return Math.round(numero * 100) / 100;
  });

const dataOpcional = z
  .union([z.string(), z.date()])
  .optional()
  .transform((valor, ctx) => {
    if (valor === undefined || valor === "") return undefined;
    const data = valor instanceof Date ? valor : new Date(valor);
    if (Number.isNaN(data.getTime())) {
      ctx.addIssue({ code: "custom", message: "Data inválida." });
      return undefined;
    }
    return data;
  });

export const cuidSchema = z.string().min(1, "Selecione uma opção.");

// ---------------------------------------------------------------------------
// Produto (o modelo da peça)
// ---------------------------------------------------------------------------

export const produtoSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da peça.").max(160),
  model: textoOpcional(120),
  partNumber: textoOpcional(80),
  categoryId: cuidSchema,
  brandId: z.string().optional(),
  trackingMode: z.enum(TrackingMode).default(TrackingMode.SERIALIZED),
  description: textoOpcional(2000),
  defaultSalePrice: dinheiroOpcional,
  lowStockThreshold: z.coerce.number().int().min(0).max(9999).default(0),
  tagIds: z.array(z.string()).default([]),
  /**
   * Validadas à parte, contra o catálogo da categoria escolhida: o schema
   * correto só é conhecido em tempo de execução.
   */
  specs: z.record(z.string(), z.unknown()).default({}),
});

export type ProdutoInput = z.input<typeof produtoSchema>;

export const atualizarProdutoSchema = produtoSchema.extend({
  id: cuidSchema,
});

// ---------------------------------------------------------------------------
// Unidade de estoque (a peça física)
// ---------------------------------------------------------------------------

const unidadeBase = z.object({
  productId: cuidSchema,
  serialNumber: textoOpcional(120),
  condition: z.enum(UnitCondition).default(UnitCondition.USED),
  locationId: z.string().optional(),
  /**
   * Sócio que pagou pela peça.
   *
   * Opcional: numa entrada às pressas nem sempre se sabe de quem saiu o
   * dinheiro, e travar o cadastro por isso faria o operador escolher qualquer
   * um só para conseguir salvar — o que estragaria justamente o extrato que o
   * campo existe para alimentar.
   */
  purchasedById: z.string().optional(),
  purchaseCost: dinheiroOpcional,
  /** Anotação no lugar do custo ("não lembro"). Ver src/lib/custo.ts. */
  purchaseCostNote: textoOpcional(80),
  estimatedSalePrice: dinheiroOpcional,
  purchaseDate: dataOpcional,
  origin: textoOpcional(160),
  notes: textoOpcional(2000),
});

export const criarUnidadeSchema = unidadeBase.extend({
  /**
   * Quantas unidades criar de uma vez.
   *
   * Atende ao pedido da seção 23: cadastrar 10 memórias iguais sem repetir o
   * formulário. Para produto serializado cria N linhas (cada uma com seu
   * código interno e seu serial); para produto por quantidade, uma linha com
   * saldo N.
   */
  quantidade: z.coerce
    .number()
    .int("Informe um número inteiro.")
    .min(1, "Mínimo de 1.")
    .max(200, "Máximo de 200 por vez.")
    .default(1),
  /**
   * Seriais informados individualmente, um por linha.
   *
   * É o que permite o caso da seção 24: mesmo produto, unidades distintas e
   * rastreáveis. Quando vazio, as unidades ficam sem serial.
   */
  seriais: z.array(z.string().trim()).default([]),
});

export type CriarUnidadeInput = z.input<typeof criarUnidadeSchema>;

export const atualizarUnidadeSchema = unidadeBase.extend({
  id: cuidSchema,
});

// ---------------------------------------------------------------------------
// Movimentação
// ---------------------------------------------------------------------------

export const movimentacaoSchema = z
  .object({
    unitId: cuidSchema,
    type: z.enum(MovementType),
    quantity: z.coerce.number().int().min(1).max(9999).default(1),
    reason: textoOpcional(200),
    notes: textoOpcional(1000),
    toLocationId: z.string().optional(),
    /** Só em SALE: por quanto vendeu e para quem. Alimentam a aba de Vendas. */
    soldPrice: dinheiroOpcional,
    soldToName: textoOpcional(120),
  })
  .refine(
    (dados) => dados.type !== MovementType.TRANSFER || Boolean(dados.toLocationId),
    {
      message: "Informe o local de destino.",
      path: ["toLocationId"],
    },
  );

export type MovimentacaoInput = z.input<typeof movimentacaoSchema>;

// ---------------------------------------------------------------------------
// Busca e filtros (seção 5)
// ---------------------------------------------------------------------------

/**
 * Filtros da listagem de estoque.
 *
 * Todos opcionais e todos aplicados no servidor. Nada de trazer o estoque
 * inteiro para filtrar no navegador — a seção 22 é explícita.
 */
export const filtroEstoqueSchema = z.object({
  /** Busca única sobre nome, modelo, part number, serial e código interno. */
  q: z.string().trim().max(120).optional(),
  categoryId: z.string().optional(),
  brandId: z.string().optional(),
  locationId: z.string().optional(),
  status: z.array(z.enum(UnitStatus)).optional(),
  condition: z.array(z.enum(UnitCondition)).optional(),
  tagId: z.string().optional(),
  precoMin: z.coerce.number().min(0).optional(),
  precoMax: z.coerce.number().min(0).optional(),
  entradaDe: dataOpcional,
  entradaAte: dataOpcional,
  /** Cursor da paginação: o `id` da última linha da página anterior. */
  cursor: z.string().optional(),
  limite: z.coerce.number().int().min(1).max(100).default(30),
  ordenacao: z
    .enum(["recentes", "antigos", "nome", "valor-maior", "valor-menor"])
    .default("recentes"),
});

export type FiltroEstoque = z.infer<typeof filtroEstoqueSchema>;
export type FiltroEstoqueInput = z.input<typeof filtroEstoqueSchema>;

// ---------------------------------------------------------------------------
// Catálogos de apoio
// ---------------------------------------------------------------------------

export const categoriaSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(80),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(
      /^[a-z0-9-]+$/,
      "Use apenas letras minúsculas, números e hífen.",
    ),
  description: textoOpcional(500),
  icon: textoOpcional(40),
  parentId: z.string().optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export const marcaSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome.").max(80),
  website: z.union([z.literal(""), z.string().url("URL inválida.")]).optional(),
});

export const localSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome.").max(80),
  code: textoOpcional(30),
  parentId: z.string().optional(),
  notes: textoOpcional(500),
});
