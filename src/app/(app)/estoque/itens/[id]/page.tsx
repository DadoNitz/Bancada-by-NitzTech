import { Cpu, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FotosDaPeca } from "@/components/inventory/fotos";
import { VoltarAoEstoque } from "@/components/inventory/voltar-ao-estoque";
import { GerarAnuncio } from "@/components/inventory/gerar-anuncio";
import { AdicionarUnidades } from "@/components/inventory/adicionar-unidades";
import { MovimentarUnidade } from "@/components/inventory/movimentar";
import {
  AtualizarEnquantoBusca,
  BotaoBuscarPrecoDaPeca,
  PrecoDeMercado,
} from "@/components/inventory/preco-de-mercado";
import { Icone } from "@/components/layout/icon";
import { ConditionBadge, StatusBadge } from "@/components/shared/status-badge";
import { conteudoQrCode } from "@/domain/inventory/serial";
import {
  formatarData,
  formatarDataHora,
  formatarMoeda,
  paraNumero,
} from "@/lib/format";
import { estaBuscando, lerDadosDoPreco } from "@/lib/preco-de-mercado";
import {
  MOVIMENTO_DE_SAIDA,
  ROTULO_MOVIMENTO,
} from "@/lib/inventory-labels";
import { iaDisponivel } from "@/lib/ai";
import { can } from "@/lib/auth/permissions";
import { caminhoDoLocal, listarLocais } from "@/server/services/catalog.service";
import { NaoEncontradoError } from "@/server/services/errors";
import { buscarUnidade } from "@/server/services/inventory.service";
import { listarSocios } from "@/server/services/partner.service";
import { requireContext } from "@/server/session";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const unidade = await buscarUnidade(id);
    return { title: `${unidade.product.name} · ${unidade.internalCode}` };
  } catch {
    return { title: "Unidade não encontrada" };
  }
}

/**
 * Detalhe da unidade física.
 *
 * É o destino do QR Code da etiqueta: apontar a câmera para a peça leva
 * exatamente aqui. Por isso a página abre com o que se precisa saber em pé na
 * frente da prateleira — o que é, onde está, em que situação — e só depois
 * mostra valores e histórico.
 */
export default async function UnidadePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let unidade;
  try {
    unidade = await buscarUnidade(id);
  } catch (erro) {
    if (erro instanceof NaoEncontradoError) notFound();
    throw erro;
  }

  const [locais, socios, ctx] = await Promise.all([
    listarLocais(),
    listarSocios(),
    requireContext(),
  ]);
  const caminho = caminhoDoLocal(locais, unidade.locationId);
  // A consulta ja filtra montagem cancelada e apagada; aqui e so o primeiro
  // (e unico) vinculo ativo.
  const montagem = unidade.buildItems[0] ?? null;
  const podeMovimentar = can(ctx.role, "movement:create");
  // O botao so aparece quando ha chave configurada: oferecer o que vai falhar
  // ao clicar e pior do que nao oferecer.
  const podeAnunciar = can(ctx.role, "ai:use") && iaDisponivel();

  const specs = Object.entries(
    (unidade.product.specs ?? {}) as Record<string, unknown>,
  );
  const referencia = {
    valor: paraNumero(unidade.product.referencePrice),
    tipo: unidade.product.referencePriceKind,
    status: unidade.product.referencePriceStatus,
    em: unidade.product.referencePriceAt?.toISOString() ?? null,
    dados: lerDadosDoPreco(unidade.product.referencePriceData),
  };
  const buscandoPreco = estaBuscando(
    unidade.product.referencePriceStatus,
    unidade.product.referencePriceAt,
  );
  const dadosDaReferencia = unidade.product.referencePriceData as {
    consulta?: string;
    rigor?: "estrito" | "aproximado" | null;
    resumo?: { amostras: number; minimo: number; maximo: number } | null;
    anuncios?: { fonte: string; titulo: string; preco: number; url: string }[];
    falhas?: { fonte: string; motivo: string }[];
  } | null;
  const podeEditarPeca = can(ctx.role, "inventory:write");
  const imagemDeCapa =
    unidade.images.find((i) => i.isPrimary) ??
    unidade.images[0] ??
    unidade.product.images.find((i) => i.isPrimary) ??
    unidade.product.images[0] ??
    null;
  const fotoDeCapa = imagemDeCapa
    ? `/api/imagens/${imagemDeCapa.thumbnailKey ?? imagemDeCapa.storageKey}`
    : null;

  const margem =
    unidade.estimatedSalePrice && unidade.purchaseCost
      ? Number(unidade.estimatedSalePrice) - Number(unidade.purchaseCost)
      : null;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <VoltarAoEstoque />

      <header className="bg-card rounded-lg border p-4">
        <div className="flex items-start gap-3">
          <div className="bg-muted flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl sm:size-20">
            {fotoDeCapa ? (
              // eslint-disable-next-line @next/next/no-img-element -- rota privada
              <img
                src={fotoDeCapa}
                alt={unidade.product.name}
                className="size-full object-cover"
              />
            ) : (
              <Icone
                nome={unidade.product.category.icon}
                className="text-muted-foreground size-6"
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
              {unidade.product.name}
            </h1>
            <p className="text-muted-foreground text-sm">
              {unidade.product.brand?.name ?? "Sem marca"} ·{" "}
              {unidade.product.category.name}
              {unidade.product.model ? ` · ${unidade.product.model}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={unidade.status} />
              <ConditionBadge condition={unidade.condition} />
            </div>

            {/*
              Em qual PC a peca esta. "Em montagem" sozinho nao responde a
              pergunta de quem esta com a peca na mao — e sem o link, descobrir
              exigia abrir montagem por montagem.
            */}
            {montagem ? (
              <Link
                href={`/montagens/minhas#${montagem.build.id}`}
                className="mt-2 inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200 dark:hover:bg-sky-900"
              >
                <Cpu className="size-4 shrink-0" aria-hidden />
                <span>
                  Montada em <strong>{montagem.build.name}</strong>
                  {montagem.build.customerName
                    ? ` · ${montagem.build.customerName}`
                    : ""}
                </span>
              </Link>
            ) : null}
          </div>
        </div>

        {podeMovimentar || podeAnunciar ? (
          <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
            {podeAnunciar ? (
              <GerarAnuncio
                unitId={unidade.id}
                precoSugerido={
                  unidade.estimatedSalePrice
                    ? Number(unidade.estimatedSalePrice)
                    : undefined
                }
              />
            ) : null}
            {can(ctx.role, "inventory:write") ? (
              <Link
                href={`/estoque/itens/${unidade.id}/editar`}
                className="hover:bg-muted inline-flex h-11 items-center gap-2 rounded-lg border px-4 text-sm"
              >
                <Pencil className="size-4" aria-hidden />
                Editar
              </Link>
            ) : null}
            {can(ctx.role, "inventory:write") ? (
              <AdicionarUnidades
                productId={unidade.product.id}
                nomeDoProduto={unidade.product.name}
                porQuantidade={unidade.product.trackingMode === "QUANTITY"}
                localAtual={unidade.locationId ?? undefined}
                custoSugerido={
                  unidade.purchaseCost ? String(unidade.purchaseCost) : undefined
                }
                locais={locais.map((local) => ({
                  id: local.id,
                  name: local.name,
                }))}
                socios={socios.map((socio) => ({
                  id: socio.id,
                  name: socio.name,
                }))}
              />
            ) : null}
            {podeMovimentar ? (
              <MovimentarUnidade
                unitId={unidade.id}
                statusAtual={unidade.status}
                nomeDaPeca={`${unidade.product.name} (${unidade.internalCode})`}
                porQuantidade={unidade.product.trackingMode === "QUANTITY"}
                saldoAtual={unidade.quantity}
                locais={locais.map((local) => ({
                  id: local.id,
                  name: local.name,
                }))}
              />
            ) : null}
          </div>
        ) : null}
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="bg-card rounded-lg border">
          <h2 className="border-b px-4 py-3 text-sm font-medium">
            Identificação e local
          </h2>
          <dl className="divide-y">
            <Linha rotulo="Código interno">
              <span className="font-mono">{unidade.internalCode}</span>
            </Linha>
            <Linha rotulo="Conteúdo do QR Code">
              <span className="font-mono text-xs">
                {conteudoQrCode(unidade.internalCode)}
              </span>
            </Linha>
            <Linha rotulo="Número de série">
              {unidade.serialNumber ? (
                <span className="font-mono">{unidade.serialNumber}</span>
              ) : (
                <span className="text-muted-foreground">Não informado</span>
              )}
            </Linha>
            <Linha rotulo="Final do serial">
              {unidade.serialLast ? (
                <span className="font-mono">••••{unidade.serialLast}</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Linha>
            <Linha rotulo="Localização">
              {caminho || (
                <span className="text-muted-foreground">Sem local definido</span>
              )}
            </Linha>
            <Linha rotulo="Quantidade">
              {unidade.quantity}
              {unidade.product.trackingMode === "QUANTITY" ? (
                <span className="text-muted-foreground ml-1 text-xs">
                  (controlado por saldo)
                </span>
              ) : null}
            </Linha>
          </dl>
        </section>

        <section className="bg-card rounded-lg border">
          <h2 className="border-b px-4 py-3 text-sm font-medium">
            Valores e origem
          </h2>
          <dl className="divide-y">
            <Linha rotulo="Comprado por">
              {unidade.purchasedBy ? (
                <Link
                  href={`/socios#${unidade.purchasedBy.id}`}
                  className="font-medium hover:underline"
                >
                  {unidade.purchasedBy.name}
                </Link>
              ) : (
                <span className="text-muted-foreground">Não informado</span>
              )}
            </Linha>
            <Linha rotulo="Valor de compra">
              {formatarMoeda(unidade.purchaseCost)}
            </Linha>
            <Linha rotulo="Valor estimado de venda">
              {formatarMoeda(unidade.estimatedSalePrice)}
            </Linha>
            <Linha rotulo="Preço de mercado">
              {referencia.valor === null &&
              !buscandoPreco &&
              referencia.status === null ? (
                <span className="text-muted-foreground opacity-60">
                  Ainda não buscado
                </span>
              ) : (
                <PrecoDeMercado
                  referencia={referencia}
                  buscando={buscandoPreco}
                  className="text-sm"
                />
              )}
            </Linha>
            {margem !== null ? (
              <Linha rotulo="Margem estimada">
                <span
                  className={cn(
                    "tabular-nums",
                    margem >= 0 ? "text-emerald-600" : "text-red-600",
                  )}
                >
                  {formatarMoeda(margem)}
                </span>
              </Linha>
            ) : null}
            {unidade.soldPrice ? (
              <Linha rotulo="Vendido por">
                {formatarMoeda(unidade.soldPrice)}
                {unidade.soldAt ? ` em ${formatarData(unidade.soldAt)}` : ""}
              </Linha>
            ) : null}
            <Linha rotulo="Data de entrada">
              {formatarData(unidade.entryDate)}
            </Linha>
            <Linha rotulo="Origem">
              {unidade.origin ?? (
                <span className="text-muted-foreground">Não informada</span>
              )}
            </Linha>
          </dl>
        </section>
      </div>

      <AtualizarEnquantoBusca ativo={buscandoPreco} />
      <section className="bg-card rounded-lg border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
          <h2 className="text-sm font-medium">
            Preço de mercado
            <span className="text-muted-foreground ml-2 text-xs font-normal">
              estimativa buscada na internet, por modelo
            </span>
          </h2>
          {podeEditarPeca ? <BotaoBuscarPrecoDaPeca unitId={unidade.id} /> : null}
        </div>
        <div className="space-y-3 p-4 text-sm">
          {buscandoPreco ? (
            <PrecoDeMercado referencia={referencia} buscando />
          ) : referencia.valor !== null && dadosDaReferencia?.resumo ? (
            <p className="text-muted-foreground opacity-70">
              Média de {dadosDaReferencia.resumo.amostras}{" "}
              {dadosDaReferencia.resumo.amostras === 1 ? "anúncio" : "anúncios"}{" "}
              {referencia.tipo === "USADO" ? "de peça usada" : "de loja (peça nova)"}
              , de {formatarMoeda(dadosDaReferencia.resumo.minimo)} a{" "}
              {formatarMoeda(dadosDaReferencia.resumo.maximo)}
              {dadosDaReferencia.rigor === "aproximado"
                ? " · modelo aproximado, confira os anúncios"
                : ""}
              {unidade.product.referencePriceAt
                ? ` · buscado em ${formatarDataHora(unidade.product.referencePriceAt)}`
                : ""}
              .
            </p>
          ) : (
            <p className="text-muted-foreground opacity-70">
              {referencia.status === "NOT_FOUND"
                ? `Nenhum anúncio parecido com “${dadosDaReferencia?.consulta ?? unidade.product.name}”.`
                : referencia.status === "FAILED"
                  ? "As fontes de preço não responderam na última busca."
                  : "Ainda não foi buscado."}
            </p>
          )}
          {dadosDaReferencia?.anuncios && dadosDaReferencia.anuncios.length > 0 ? (
            <ul className="divide-y rounded-md border opacity-80">
              {dadosDaReferencia.anuncios.map((anuncio) => (
                <li
                  key={anuncio.url + anuncio.preco}
                  className="flex items-baseline justify-between gap-3 px-3 py-2"
                >
                  <a
                    href={anuncio.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 truncate hover:underline"
                    title={anuncio.titulo}
                  >
                    <span className="text-muted-foreground text-xs">
                      {anuncio.fonte} ·{" "}
                    </span>
                    {anuncio.titulo}
                  </a>
                  <span className="shrink-0 tabular-nums">
                    {formatarMoeda(anuncio.preco)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {dadosDaReferencia?.falhas && dadosDaReferencia.falhas.length > 0 ? (
            <p className="text-muted-foreground text-xs opacity-60">
              Não consultado:{" "}
              {dadosDaReferencia.falhas
                .map((falha) => `${falha.fonte} (${falha.motivo})`)
                .join(" · ")}
            </p>
          ) : null}
        </div>
      </section>

      {specs.length > 0 ? (
        <section className="bg-card rounded-lg border">
          <h2 className="border-b px-4 py-3 text-sm font-medium">
            Especificações técnicas
            <span className="text-muted-foreground ml-2 text-xs font-normal">
              do modelo, compartilhadas por todas as unidades
            </span>
          </h2>
          <dl className="grid gap-x-6 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {specs.map(([chave, valor]) => (
              <div key={chave} className="flex justify-between gap-2 py-1.5 text-sm">
                <dt className="text-muted-foreground">{chave}</dt>
                <dd className="text-right font-medium">
                  {Array.isArray(valor)
                    ? valor.join(", ")
                    : typeof valor === "boolean"
                      ? valor
                        ? "Sim"
                        : "Não"
                      : String(valor)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {can(ctx.role, "inventory:write") ? (
        <section className="bg-card rounded-lg border p-4">
          <h2 className="mb-3 text-sm font-medium">Fotos desta unidade</h2>
          <FotosDaPeca
            unitId={unidade.id}
            iniciais={unidade.images.map((imagem) => ({
              id: imagem.id,
              url: `/api/imagens/${imagem.thumbnailKey ?? imagem.storageKey}`,
            }))}
          />
        </section>
      ) : null}

      {unidade.notes ? (
        <section className="bg-card rounded-lg border p-4">
          <h2 className="mb-2 text-sm font-medium">Observações</h2>
          <p className="text-muted-foreground text-sm whitespace-pre-wrap">
            {unidade.notes}
          </p>
        </section>
      ) : null}

      <section className="bg-card rounded-lg border">
        <h2 className="border-b px-4 py-3 text-sm font-medium">
          Histórico de movimentação
        </h2>
        <ol className="divide-y">
          {unidade.movements.map((movimento) => (
            <li key={movimento.id} className="flex gap-3 px-4 py-3">
              <span
                className={cn(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  MOVIMENTO_DE_SAIDA.has(movimento.type)
                    ? "bg-amber-500"
                    : "bg-emerald-500",
                )}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {ROTULO_MOVIMENTO[movimento.type]}
                  {movimento.quantity > 1 ? ` (${movimento.quantity} un.)` : ""}
                </p>
                {movimento.reason ? (
                  <p className="text-muted-foreground text-sm">
                    {movimento.reason}
                  </p>
                ) : null}
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {formatarDataHora(movimento.createdAt)}
                  {movimento.user ? ` · ${movimento.user.name}` : ""}
                  {movimento.amount
                    ? ` · ${formatarMoeda(movimento.amount)}`
                    : ""}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Linha({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm">
      <dt className="text-muted-foreground shrink-0">{rotulo}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}
