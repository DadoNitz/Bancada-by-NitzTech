import { ChevronRight, Cpu } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { formatarData, formatarMoeda, paraNumero } from "@/lib/format";
import { iaDisponivel } from "@/lib/ai";
import { can } from "@/lib/auth/permissions";
import { listarMontagens } from "@/server/services/build-write.service";
import { requireContext } from "@/server/session";
import { cn } from "@/lib/utils";

import { GerarAnuncio } from "@/components/inventory/gerar-anuncio";

import { CancelarMontagem, VenderMontagem } from "./acoes";
import { COR_STATUS, ROTULO_STATUS, SEGURA_PECAS } from "./status";

export const metadata: Metadata = { title: "Minhas montagens" };
export const dynamic = "force-dynamic";

export default async function MinhasMontagensPage() {
  const [montagens, ctx] = await Promise.all([
    listarMontagens(),
    requireContext(),
  ]);
  const podeAnunciar = can(ctx.role, "ai:use") && iaDisponivel();

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Minhas montagens
          </h1>
          <p className="text-muted-foreground text-sm">
            Peças reservadas voltam ao estoque se a montagem for cancelada.
          </p>
        </div>
        <Link href="/montagens" className="text-sm underline">
          Ver sugestões do estoque
        </Link>
      </div>

      {montagens.length === 0 ? (
        <div className="bg-card flex flex-col items-center gap-3 rounded-lg border px-6 py-16 text-center">
          <Cpu className="text-muted-foreground size-10" aria-hidden />
          <p className="font-medium">Nenhuma montagem ainda</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Abra as sugestões, escolha uma configuração e reserve as peças.
          </p>
          <Link href="/montagens" className="text-sm underline">
            Montar com meu estoque
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {montagens.map((montagem) => {
            const custo = paraNumero(montagem.totalCost) ?? 0;
            const venda = paraNumero(montagem.salePrice);
            const margem = venda !== null ? venda - custo : null;

            return (
              <li key={montagem.id} className="bg-card rounded-lg border p-4">
                {/*
                  Duas colunas fixas: conteúdo (1fr) + seta (auto). Dentro do
                  conteúdo, título e preço empilham no celular e só ficam lado
                  a lado a partir de `sm` — no mobile não há largura para os
                  dois sem espremer o nome.
                */}
                <Link
                  href={`/montagens/minhas/${montagem.id}`}
                  className="hover:bg-muted/50 -m-2 grid grid-cols-[1fr_auto] items-center gap-2 rounded-md p-2 transition-colors"
                  aria-label={`Ver e editar ${montagem.name}`}
                >
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-medium text-balance">{montagem.name}</h2>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            COR_STATUS[montagem.status],
                          )}
                        >
                          {ROTULO_STATUS[montagem.status]}
                        </span>
                      </div>
                      <p className="text-muted-foreground mt-1 text-sm">
                        {montagem._count.items} peças ·{" "}
                        {formatarData(montagem.createdAt)}
                        {montagem.customerName ? ` · ${montagem.customerName}` : ""}
                        {montagem.createdBy ? ` · por ${montagem.createdBy.name}` : ""}
                      </p>
                    </div>

                    <div className="shrink-0 sm:text-right">
                      <p className="text-muted-foreground text-xs">
                        custo {formatarMoeda(custo)}
                      </p>
                      {venda !== null ? (
                        <p className="text-sm font-medium tabular-nums">
                          {formatarMoeda(venda)}
                          {margem !== null ? (
                            <span
                              className={cn(
                                "ml-2 text-xs",
                                margem >= 0 ? "text-emerald-600" : "text-red-600",
                              )}
                            >
                              {margem >= 0 ? "+" : ""}
                              {formatarMoeda(margem)}
                            </span>
                          ) : null}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <ChevronRight
                    className="text-muted-foreground size-5 shrink-0"
                    aria-hidden
                  />
                </Link>

                {SEGURA_PECAS.includes(montagem.status) ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <VenderMontagem
                      buildId={montagem.id}
                      totalDePecas={montagem._count.items}
                      precoSugerido={venda ?? custo * 1.4}
                      clienteAtual={montagem.customerName ?? ""}
                    />
                    <CancelarMontagem
                      buildId={montagem.id}
                      totalDePecas={montagem._count.items}
                    />
                    {podeAnunciar ? (
                      <GerarAnuncio
                        buildId={montagem.id}
                        precoSugerido={venda ?? undefined}
                      />
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
