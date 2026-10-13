import { ArrowLeftRight, PackageSearch, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { StatCard } from "@/components/shared/stat-card";
import { can } from "@/lib/auth/permissions";
import { formatarMoeda, formatarNumero, paraNumero } from "@/lib/format";
import { linkDaPagina } from "@/lib/paginacao";
import { estaBuscando, lerDadosDoPreco } from "@/lib/preco-de-mercado";
import { filtroEstoqueSchema } from "@/lib/validation/inventory";
import {
  listarMarcas,
  listarCategorias,
  listarLocais,
} from "@/server/services/catalog.service";
import { listarUnidades } from "@/server/services/inventory.service";
import { requireContext } from "@/server/session";
import {
  AtualizarEnquantoBusca,
  BotaoAtualizarPrecosDoEstoque,
} from "@/components/inventory/preco-de-mercado";
import { Filtros } from "./filtros";
import { ListaEstoque } from "./lista-estoque";

export const metadata: Metadata = { title: "Estoque" };
export const dynamic = "force-dynamic";
// O botão "Preços de mercado" dispara o worker por `after()`, que herda o
// prazo desta rota. Trinta e poucos modelos com pausa entre eles cabem aqui.
export const maxDuration = 300;
type SearchParams = Record<string, string | string[] | undefined>;

function lerFiltro(searchParams: SearchParams) {
  const resultado = filtroEstoqueSchema.safeParse({
    ...searchParams,
    status: searchParams.status ? [searchParams.status].flat() : undefined,
    condition: searchParams.condition
      ? [searchParams.condition].flat()
      : undefined,
  });
  return resultado.success ? resultado.data : filtroEstoqueSchema.parse({});
}

export default async function EstoquePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filtro = lerFiltro(params);
  const [pagina, categorias, marcas, locais, ctx] = await Promise.all([
    listarUnidades(filtro),
    listarCategorias(),
    listarMarcas(),
    listarLocais(),
    requireContext(),
  ]);
  const itens = pagina.itens.map((unidade) => {
    const imagem = unidade.images[0] ?? unidade.product.images[0] ?? null;
    return {
    id: unidade.id,
    foto: imagem
      ? `/api/imagens/${imagem.thumbnailKey ?? imagem.storageKey}`
      : null,
    nome: unidade.product.name,
    marca: unidade.product.brand?.name ?? "Sem marca",
    codigo: unidade.internalCode,
    icone: unidade.product.category.icon,
    local: unidade.location?.name ?? null,
    condition: unidade.condition,
    status: unidade.status,
    quantidade: unidade.quantity,
    custo: paraNumero(unidade.purchaseCost),
    custoNota: unidade.purchaseCostNote,
    valor: paraNumero(unidade.estimatedSalePrice),
    referencia: {
      valor: paraNumero(unidade.product.referencePrice),
      tipo: unidade.product.referencePriceKind,
      status: unidade.product.referencePriceStatus,
      em: unidade.product.referencePriceAt?.toISOString() ?? null,
      dados: lerDadosDoPreco(unidade.product.referencePriceData),
    },
    buscandoPreco: estaBuscando(
      unidade.product.referencePriceStatus,
      unidade.product.referencePriceAt,
    ),
    };
  });
  const algumBuscando = itens.some((item) => item.buscandoPreco);
  const valorPagina = itens.reduce(
    (soma, item) => soma + (item.valor ?? 0) * item.quantidade,
    0,
  );
  const semValor = itens.filter((item) => item.valor === null).length;
  const podeEditar = can(ctx.role, "inventory:write");
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <AtualizarEnquantoBusca ativo={algumBuscando} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-primary mb-1 text-xs font-semibold tracking-widest uppercase">
            Seu inventário
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Estoque
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Peças, valores e ações em um só lugar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {podeEditar && <BotaoAtualizarPrecosDoEstoque />}
          <Link
            href="/estoque/movimentacoes"
            className={buttonVariants({ variant: "outline" })}
          >
            <ArrowLeftRight className="size-4" />
            Histórico
          </Link>
          {podeEditar && (
            <Link href="/estoque/novo" className={buttonVariants()}>
              <Plus className="size-4" />
              Nova peça
            </Link>
          )}
        </div>
      </div>
      <section
        className="grid grid-cols-2 gap-3 lg:grid-cols-3"
        aria-label="Resumo da listagem"
      >
        <StatCard
          titulo="Peças encontradas"
          valor={formatarNumero(pagina.total)}
          detalhe="com os filtros atuais"
          icone="Package"
        />
        <div className="hidden lg:block">
          <StatCard
            titulo="Disponíveis nesta página"
            valor={formatarNumero(
              itens
                .filter((i) => i.status === "AVAILABLE")
                .reduce((s, i) => s + i.quantidade, 0),
            )}
            detalhe="unidades prontas para uso"
            icone="Check"
            destaque="positivo"
          />
        </div>
        <StatCard
          titulo="Valor nesta página"
          valor={
            itens.length > 0 && semValor === itens.length
              ? "—"
              : formatarMoeda(valorPagina)
          }
          detalhe={
            semValor ? `${semValor} sem valor definido` : "estimativa de venda"
          }
          icone="FileBarChart"
        />
      </section>
      <Filtros
        categorias={categorias.map((c) => ({ id: c.id, name: c.name }))}
        marcas={marcas}
        locais={locais}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          Peças{" "}
          <span className="text-muted-foreground ml-1 font-normal">
            ({itens.length} de {formatarNumero(pagina.total)})
          </span>
        </h2>
        {podeEditar && (
          <p className="text-muted-foreground text-xs">
            Toque na venda para editar
            <span className="hidden lg:inline">
              {" "}
              · Botão direito para mais ações
            </span>
          </p>
        )}
      </div>
      {itens.length === 0 ? (
        <div className="bg-card flex flex-col items-center gap-3 rounded-2xl border px-6 py-16 text-center">
          <PackageSearch className="text-primary size-10" aria-hidden />
          <p className="font-medium">Nenhuma peça encontrada</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Ajuste os filtros ou busque por nome, modelo, serial ou código
            interno.
          </p>
          <Link
            href="/estoque/itens"
            className={buttonVariants({ variant: "outline" })}
          >
            Limpar busca e filtros
          </Link>
        </div>
      ) : (
        <ListaEstoque
          itens={itens}
          podeEditar={podeEditar}
          podeExcluir={can(ctx.role, "inventory:delete")}
        />
      )}
      {pagina.proximoCursor || filtro.cursor ? (
        <nav
          aria-label="Paginação"
          className="flex flex-wrap justify-center gap-2"
        >
          {filtro.cursor && (
            <Link
              className={buttonVariants({ variant: "outline" })}
              href={linkDaPagina("/estoque/itens", params, null)}
            >
              Início da lista
            </Link>
          )}
          {pagina.proximoCursor && (
            <Link
              className={buttonVariants({ variant: "outline" })}
              href={linkDaPagina(
                "/estoque/itens",
                params,
                pagina.proximoCursor,
              )}
            >
              Próxima página
            </Link>
          )}
        </nav>
      ) : null}
    </div>
  );
}
