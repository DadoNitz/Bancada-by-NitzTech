import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import type { SpecValue } from "@/domain/specs/types";
import { can } from "@/lib/auth/permissions";
import {
  definicoesDeSpec,
  listarMarcas,
} from "@/server/services/catalog.service";
import { NaoEncontradoError } from "@/server/services/errors";
import { buscarUnidade } from "@/server/services/inventory.service";
import { listarSocios } from "@/server/services/partner.service";
import { requireContext } from "@/server/session";

import { FormularioDeEdicao } from "./formulario";

export const metadata: Metadata = { title: "Editar peça" };
export const dynamic = "force-dynamic";

function paraCampo(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  return String(valor);
}

export default async function EditarUnidadePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireContext();
  if (!can(ctx.role, "inventory:write")) redirect("/estoque/itens");

  const { id } = await params;

  let unidade;
  try {
    unidade = await buscarUnidade(id);
  } catch (erro) {
    if (erro instanceof NaoEncontradoError) notFound();
    throw erro;
  }

  const [marcas, socios, specs] = await Promise.all([
    listarMarcas(),
    listarSocios(),
    definicoesDeSpec(unidade.product.categoryId),
  ]);

  // Só peça disponível e sem histórico além da entrada pode ser excluída. As
  // demais fazem parte do passado da operação e distorceriam relatórios já
  // emitidos se sumissem — para elas o caminho é descarte.
  const podeExcluir =
    can(ctx.role, "inventory:delete") &&
    unidade.status === "AVAILABLE" &&
    unidade.movements.length <= 1;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href={`/estoque/itens/${unidade.id}`}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Voltar para a peça
      </Link>

      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Editar {unidade.product.name}
        </h1>
        <p className="text-muted-foreground text-sm">
          Situação e quantidade não são editadas aqui: mudam por movimentação,
          para que o histórico continue explicando o estoque.
        </p>
      </div>

      <FormularioDeEdicao
        marcas={marcas}
        socios={socios.map((socio) => ({ id: socio.id, name: socio.name }))}
        specs={specs}
        dados={{
          unitId: unidade.id,
          productId: unidade.product.id,
          codigoInterno: unidade.internalCode,
          serialNumber: unidade.serialNumber ?? "",
          condition: unidade.condition,
          purchasedById: unidade.purchasedById ?? "",
          // O campo aceita valor ou anotação ("não lembro").
          purchaseCost:
            unidade.purchaseCost === null
              ? (unidade.purchaseCostNote ?? "")
              : paraCampo(unidade.purchaseCost),
          estimatedSalePrice: paraCampo(unidade.estimatedSalePrice),
          origin: unidade.origin ?? "",
          notes: unidade.notes ?? "",
          podeExcluir,

          produtoNome: unidade.product.name,
          produtoModelo: unidade.product.model ?? "",
          produtoPartNumber: unidade.product.partNumber ?? "",
          produtoBrandId: unidade.product.brandId ?? "",
          produtoPrecoPadrao: paraCampo(unidade.product.defaultSalePrice),
          produtoEstoqueMinimo: unidade.product.lowStockThreshold,
          produtoSpecs: (unidade.product.specs ?? {}) as Record<string, SpecValue>,
          unidadesDoProduto: unidade.product._count.units,
        }}
      />
    </div>
  );
}
