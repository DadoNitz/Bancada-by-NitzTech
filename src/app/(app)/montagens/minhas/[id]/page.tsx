import { ArrowLeft, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { GerarAnuncio } from "@/components/inventory/gerar-anuncio";
import { avaliarCompatibilidade } from "@/domain/compatibility/engine";
import type { SpecRecord } from "@/domain/specs/types";
import {
  ROTULO_NIVEL,
  type Componente,
  type MontagemCandidata,
  type NivelCompatibilidade,
} from "@/domain/compatibility/types";
import { iaDisponivel } from "@/lib/ai";
import { can } from "@/lib/auth/permissions";
import { formatarData, formatarMoeda, paraNumero } from "@/lib/format";
import { cn } from "@/lib/utils";
import { listarPecasParaMontar } from "@/server/services/build.service";
import { buscarMontagem } from "@/server/services/build-write.service";
import { NaoEncontradoError } from "@/server/services/errors";
import { requireContext } from "@/server/session";

import { CancelarMontagem, VenderMontagem } from "../acoes";
import { COR_STATUS, ROTULO_STATUS, SEGURA_PECAS } from "../status";
import {
  AdicionarPeca,
  EditarDados,
  RemoverPeca,
  TrocarStatus,
} from "./editor";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const build = await buscarMontagem(id);
    return { title: build.name };
  } catch {
    return { title: "Montagem não encontrada" };
  }
}

const COR_NIVEL: Record<NivelCompatibilidade, string> = {
  COMPATIBLE:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
  LIKELY_COMPATIBLE:
    "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-900",
  NEEDS_VERIFICATION:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  INCOMPATIBLE:
    "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900",
};

/** Ordem de montagem de verdade: processador primeiro, extras por último. */
const ORDEM = ["cpu", "motherboard", "ram", "gpu", "storage", "psu", "case", "cooler"];

/**
 * Detalhe de uma montagem: ver e editar a configuração.
 *
 * A compatibilidade é recalculada a cada abertura a partir das peças atuais,
 * e não lida do JSON salvo na criação — depois de trocar uma peça, o veredito
 * antigo descreveria um PC que não existe mais.
 */
export default async function MontagemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let build;
  try {
    build = await buscarMontagem(id);
  } catch (erro) {
    if (erro instanceof NaoEncontradoError) notFound();
    throw erro;
  }

  const ctx = await requireContext();
  const editavel = SEGURA_PECAS.includes(build.status);
  const podeEditar = editavel && can(ctx.role, "build:write");
  const podeAnunciar = editavel && can(ctx.role, "ai:use") && iaDisponivel();

  // Só busca o estoque disponível quando dá para adicionar peça.
  const disponiveis = podeEditar ? await listarPecasParaMontar() : [];

  const itens = [...build.items].sort((a, b) => {
    const ia = ORDEM.indexOf(a.unit.product.category.slug);
    const ib = ORDEM.indexOf(b.unit.product.category.slug);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  const componentes = itens.map(
    (item): Componente & { slug: string } => ({
      id: item.unit.id,
      nome: item.unit.product.brand
        ? `${item.unit.product.brand.name} ${item.unit.product.name}`
        : item.unit.product.name,
      categorySlug: item.unit.product.category.slug,
      slug: item.unit.product.category.slug,
      specs: (item.unit.product.specs ?? {}) as SpecRecord,
    }),
  );
  const porPapel = (slug: string) => componentes.filter((c) => c.slug === slug);
  const candidata: MontagemCandidata = {
    cpu: porPapel("cpu")[0],
    motherboard: porPapel("motherboard")[0],
    ram: porPapel("ram"),
    gpu: porPapel("gpu")[0],
    storage: porPapel("storage"),
    psu: porPapel("psu")[0],
    case: porPapel("case")[0],
    cooler: porPapel("cooler")[0],
  };
  const compat = avaliarCompatibilidade(candidata);
  const alertas = compat.checks.filter(
    (check) => check.nivel === "INCOMPATIBLE" || check.nivel === "NEEDS_VERIFICATION",
  );

  const custo = paraNumero(build.totalCost) ?? 0;
  const venda = paraNumero(build.salePrice);
  const margem = venda !== null ? venda - custo : null;

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-8">
      <div>
        <Link
          href="/montagens/minhas"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Minhas montagens
        </Link>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">
              {build.name}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {build.items.length} peças · {formatarData(build.createdAt)}
              {build.createdBy ? ` · por ${build.createdBy.name}` : ""}
            </p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
              COR_STATUS[build.status],
            )}
          >
            {ROTULO_STATUS[build.status]}
          </span>
        </div>
      </div>

      {/* Números */}
      <section className="bg-card grid grid-cols-3 gap-3 rounded-lg border p-4">
        <div>
          <p className="text-muted-foreground text-xs">Custo</p>
          <p className="font-mono text-sm font-medium tabular-nums">
            {formatarMoeda(custo)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Venda</p>
          <p className="font-mono text-sm font-medium tabular-nums">
            {formatarMoeda(venda)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Margem</p>
          <p
            className={cn(
              "font-mono text-sm font-medium tabular-nums",
              margem === null
                ? ""
                : margem >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400",
            )}
          >
            {margem === null ? "—" : `${margem >= 0 ? "+" : ""}${formatarMoeda(margem)}`}
          </p>
        </div>
      </section>

      {/* Dados */}
      <section className="bg-card space-y-3 rounded-lg border p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-medium">Dados</h2>
          {podeEditar ? (
            <EditarDados
              buildId={build.id}
              inicial={{
                name: build.name,
                customerName: build.customerName ?? "",
                salePrice: venda !== null ? String(venda).replace(".", ",") : "",
                useCase: build.useCase ?? "",
                tier: build.tier ?? "",
                notes: build.notes ?? "",
              }}
            />
          ) : null}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Campo rotulo="Cliente" valor={build.customerName} />
          <Campo rotulo="Uso" valor={build.useCase} />
          <Campo rotulo="Faixa" valor={build.tier} />
          <Campo
            rotulo="Atualizada"
            valor={formatarData(build.updatedAt)}
          />
          {build.notes ? (
            <div className="col-span-2">
              <dt className="text-muted-foreground text-xs">Observações</dt>
              <dd className="whitespace-pre-wrap">{build.notes}</dd>
            </div>
          ) : null}
        </dl>

        {podeEditar ? (
          <div className="border-t pt-3">
            <p className="text-muted-foreground mb-2 text-xs">Situação</p>
            <TrocarStatus
              buildId={build.id}
              atual={build.status as "RESERVED" | "ASSEMBLING" | "ASSEMBLED" | "PLANNED"}
            />
          </div>
        ) : null}
      </section>

      {/* Configuração */}
      <section className="bg-card rounded-lg border">
        <div className="flex items-center justify-between gap-2 p-4 pb-2">
          <div>
            <h2 className="font-medium">Configuração</h2>
            {compat.consumoEstimadoW > 0 ? (
              <p className="text-muted-foreground text-xs">
                ~{compat.consumoEstimadoW} W · fonte recomendada{" "}
                {compat.fonteRecomendadaW} W
              </p>
            ) : null}
          </div>
          <span
            className={cn(
              "rounded-md border px-2 py-0.5 text-xs font-medium",
              COR_NIVEL[compat.nivel],
            )}
          >
            {ROTULO_NIVEL[compat.nivel]}
          </span>
        </div>

        {alertas.length > 0 || compat.pecasFaltando.length > 0 ? (
          <ul className="mx-4 mb-2 space-y-1.5 rounded-md bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
            {compat.pecasFaltando.length > 0 ? (
              <li className="flex gap-1.5">
                <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                Faltando: {compat.pecasFaltando.join(", ")}
              </li>
            ) : null}
            {alertas.map((alerta) => (
              <li key={alerta.regra + (alerta.subjectId ?? "")} className="flex gap-1.5">
                <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                <span>
                  <strong className="font-medium">{alerta.titulo}:</strong>{" "}
                  {alerta.mensagem}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <ul className="divide-y">
          {itens.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-3">
              <Link
                href={`/estoque/itens/${item.unit.id}`}
                className="min-w-0 flex-1"
              >
                <p className="text-muted-foreground text-xs">
                  {item.unit.product.category.name}
                </p>
                <p className="truncate text-sm font-medium">
                  {item.unit.product.brand
                    ? `${item.unit.product.brand.name} ${item.unit.product.name}`
                    : item.unit.product.name}
                </p>
                <p className="text-muted-foreground font-mono text-xs tabular-nums">
                  {item.unit.internalCode} · {formatarMoeda(item.unit.purchaseCost)}
                </p>
              </Link>
              {podeEditar ? (
                <RemoverPeca
                  buildId={build.id}
                  unitId={item.unit.id}
                  nome={item.unit.product.name}
                  ultima={build.items.length <= 1}
                />
              ) : null}
            </li>
          ))}
        </ul>

        {podeEditar ? (
          <div className="border-t p-3">
            <AdicionarPeca buildId={build.id} pecas={disponiveis} />
          </div>
        ) : null}
      </section>

      {editavel && can(ctx.role, "build:write") ? (
        <div className="flex flex-wrap gap-2">
          <VenderMontagem
            buildId={build.id}
            totalDePecas={build.items.length}
            precoSugerido={venda ?? custo * 1.4}
            clienteAtual={build.customerName ?? ""}
          />
          <CancelarMontagem buildId={build.id} totalDePecas={build.items.length} />
          {podeAnunciar ? (
            <GerarAnuncio buildId={build.id} precoSugerido={venda ?? undefined} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd>{valor || "—"}</dd>
    </div>
  );
}
