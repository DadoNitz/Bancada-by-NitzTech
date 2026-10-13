import type {
  MovementType,
  UnitCondition,
  UnitStatus,
} from "@/generated/prisma/enums";

/**
 * Rótulos e cores dos estados do estoque.
 *
 * Módulo compartilhado entre servidor e cliente: os mesmos nomes precisam
 * aparecer na tabela, no filtro, no histórico e nas mensagens de erro.
 */

export const ROTULO_STATUS: Record<UnitStatus, string> = {
  AVAILABLE: "Disponível",
  RESERVED: "Reservada",
  IN_BUILD: "Em montagem",
  SOLD: "Vendida",
  DEFECTIVE: "Com defeito",
  DISCARDED: "Descartada",
  IN_TRANSIT: "Em trânsito",
};

/**
 * Cores por estado.
 *
 * Verde/âmbar/vermelho seguem a leitura óbvia, mas nunca sozinhos: cada
 * etiqueta também traz o texto. Cor como único portador de informação exclui
 * quem tem daltonismo — e a spec pede uma interface utilizável de verdade.
 */
export const COR_STATUS: Record<UnitStatus, string> = {
  AVAILABLE: "bg-st-ok-soft text-st-ok border-transparent",
  RESERVED: "bg-st-hold-soft text-st-hold border-transparent",
  IN_BUILD: "bg-st-build-soft text-st-build border-transparent",
  SOLD: "bg-st-off-soft text-st-off border-transparent",
  DEFECTIVE: "bg-st-alert-soft text-st-alert border-transparent",
  DISCARDED: "bg-st-off-soft text-st-off/70 border-transparent",
  IN_TRANSIT: "bg-st-transit-soft text-st-transit border-transparent",
};

export const ROTULO_CONDICAO: Record<UnitCondition, string> = {
  NEW: "Novo",
  LIKE_NEW: "Seminovo",
  USED: "Usado",
  DEFECTIVE: "Com defeito",
  FOR_TESTING: "Para teste",
};

export const ROTULO_MOVIMENTO: Record<MovementType, string> = {
  INBOUND: "Entrada",
  OUTBOUND: "Saída",
  SALE: "Venda",
  RESERVE: "Reserva",
  UNRESERVE: "Reserva cancelada",
  RETURN: "Devolução",
  DEFECT: "Marcada com defeito",
  DISCARD: "Descarte",
  BUILD_ALLOCATE: "Usada em montagem",
  BUILD_RELEASE: "Liberada da montagem",
  TRANSFER: "Transferência",
  ADJUSTMENT: "Ajuste manual",
};

/** Movimentos que tiram a peça do estoque disponível, para colorir o histórico. */
export const MOVIMENTO_DE_SAIDA = new Set<MovementType>([
  "OUTBOUND",
  "SALE",
  "DISCARD",
  "DEFECT",
  "BUILD_ALLOCATE",
  "RESERVE",
]);

export const STATUS_SELECIONAVEIS: UnitStatus[] = [
  "AVAILABLE",
  "RESERVED",
  "IN_BUILD",
  "DEFECTIVE",
  "IN_TRANSIT",
  "SOLD",
  "DISCARDED",
];

/** Situações filtráveis no Estoque. Vendida tem aba própria (/estoque/vendas). */
export const STATUS_DO_ESTOQUE: UnitStatus[] = STATUS_SELECIONAVEIS.filter(
  (status) => status !== "SOLD",
);

export const CONDICOES_SELECIONAVEIS: UnitCondition[] = [
  "NEW",
  "LIKE_NEW",
  "USED",
  "DEFECTIVE",
  "FOR_TESTING",
];
