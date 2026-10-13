import { Search, ShoppingCart } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { StatCard } from "@/components/shared/stat-card";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { can } from "@/lib/auth/permissions";
import { formatarMoeda, formatarNumero, paraNumero } from "@/lib/format";
import { linkDaPagina } from "@/lib/paginacao";
import { listarVendas } from "@/server/services/inventory.service";
import { requireContext } from "@/server/session";

import { ListaVendas, type ItemVenda } from "./lista-vendas";

export const metadata: Metadata = { title: "Vendas" };
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function texto(valor: string | string[] | undefined): string | undefined {
  const primeiro = [valor].flat()[0]?.trim();
  return primeiro ? primeiro.slice(0, 120) : undefined;
}

export default async function VendasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const q = texto(params.q);
  const cursor = texto(params.cursor);
  const [pagina, ctx] = await Promise.all([
    listarVendas({ q, cursor }),
    requireContext(),
  ]);

  const itens: ItemVenda[] = pagina.itens.map((unidade) => {
    const imagem = unidade.images[0] ?? unidade.product.images[0] ?? null;
    return {
      id: unidade.id,
      foto: imagem
        ? `/api/imagens/${imagem.thumbnailKey ?? imagem.storageKey}`
        : null,
      icone: unidade.product.category.icon,
      nome: unidade.product.name,
      marca: unidade.product.brand?.name ?? "Sem marca",
      codigo: unidade.internalCode,
      custo: paraNumero(unidade.purchaseCost),
      custoNota: unidade.purchaseCostNote,
      vendidoPor: paraNumero(unidade.soldPrice),
      vendidoEm: unidade.soldAt?.toISOString() ?? null,
      comprador: unidade.soldToName,
    };
  });

  const semValor = pagina.total - pagina.comValor;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <p className="text-primary mb-1 text-xs font-semibold tracking-widest uppercase">
          Saiu do estoque
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Vendas
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Peças vendidas, por quanto e quanto sobrou.
        </p>
      </div>

      <section
        className="grid grid-cols-2 gap-3 lg:grid-cols-3"
        aria-label="Resumo das vendas"
      >
        <StatCard
          titulo="Peças vendidas"
          valor={formatarNumero(pagina.total)}
          detalhe={q ? "com a busca atual" : "no total"}
          icone="ShoppingCart"
        />
        <StatCard
          titulo="Faturamento"
          valor={pagina.comValor ? formatarMoeda(pagina.faturamento) : "—"}
          detalhe={
            semValor > 0 ? `${semValor} sem valor de venda` : "soma das vendas"
          }
          icone="FileBarChart"
        />
        <div className="col-span-2 lg:col-span-1">
          <StatCard
            titulo="Lucro"
            valor={pagina.comLucro ? formatarMoeda(pagina.lucro) : "—"}
            detalhe={`de ${formatarNumero(pagina.comLucro)} com venda e custo`}
            icone="Check"
            destaque="positivo"
          />
        </div>
      </section>

      <form action="/estoque/vendas" className="relative">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar venda por peça, serial ou código"
          className="h-11 pl-9"
          aria-label="Buscar vendas"
        />
      </form>

      {itens.length === 0 ? (
        <div className="bg-card flex flex-col items-center gap-3 rounded-2xl border px-6 py-16 text-center">
          <ShoppingCart className="text-primary size-10" aria-hidden />
          <p className="font-medium">
            {q ? "Nenhuma venda encontrada" : "Nenhuma venda ainda"}
          </p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Para registrar uma venda, abra a peça no estoque e use Movimentar →
            Venda.
          </p>
          {q ? (
            <Link
              href="/estoque/vendas"
              className={buttonVariants({ variant: "outline" })}
            >
              Limpar busca
            </Link>
          ) : null}
        </div>
      ) : (
        <ListaVendas
          itens={itens}
          podeEditar={can(ctx.role, "inventory:write")}
        />
      )}

      {pagina.proximoCursor || cursor ? (
        <nav
          aria-label="Paginação"
          className="flex flex-wrap justify-center gap-2"
        >
          {cursor && (
            <Link
              className={buttonVariants({ variant: "outline" })}
              href={linkDaPagina("/estoque/vendas", params, null)}
            >
              Início da lista
            </Link>
          )}
          {pagina.proximoCursor && (
            <Link
              className={buttonVariants({ variant: "outline" })}
              href={linkDaPagina("/estoque/vendas", params, pagina.proximoCursor)}
            >
              Próxima página
            </Link>
          )}
        </nav>
      ) : null}
    </div>
  );
}
