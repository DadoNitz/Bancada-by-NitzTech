import type { BuildStatus } from "@/generated/prisma/enums";

export const ROTULO_STATUS: Record<BuildStatus, string> = {
  PLANNED: "Planejada",
  RESERVED: "Peças reservadas",
  ASSEMBLING: "Em montagem",
  ASSEMBLED: "Montada",
  SOLD: "Vendida",
  CANCELLED: "Cancelada",
};

export const COR_STATUS: Record<BuildStatus, string> = {
  PLANNED: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  RESERVED: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  ASSEMBLING: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  ASSEMBLED:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  SOLD: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  CANCELLED:
    "bg-neutral-100 text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400",
};

/** Status em que a montagem ainda segura peças do estoque — e pode ser editada. */
export const SEGURA_PECAS: BuildStatus[] = [
  "PLANNED",
  "RESERVED",
  "ASSEMBLING",
  "ASSEMBLED",
];
