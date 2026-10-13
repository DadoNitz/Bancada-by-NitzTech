"use client";

import { lerCusto } from "@/lib/custo";
import { AlertTriangle, Check, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { SpecField } from "@/components/inventory/spec-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SpecDefinition, SpecValue } from "@/domain/specs/types";
import type { UnitCondition } from "@/generated/prisma/enums";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { CONDICOES_SELECIONAVEIS, ROTULO_CONDICAO } from "@/lib/inventory-labels";
import {
  removerUnidade,
  salvarProduto,
  salvarUnidade,
} from "@/server/actions/edit.actions";
import { cn } from "@/lib/utils";
import { hrefDoEstoque } from "@/lib/retorno-estoque";

interface Opcao {
  id: string;
  name: string;
}

export interface DadosIniciais {
  unitId: string;
  productId: string;
  codigoInterno: string;
  serialNumber: string;
  condition: UnitCondition;
  purchasedById: string;
  purchaseCost: string;
  estimatedSalePrice: string;
  origin: string;
  notes: string;
  podeExcluir: boolean;

  produtoNome: string;
  produtoModelo: string;
  produtoPartNumber: string;
  produtoBrandId: string;
  produtoPrecoPadrao: string;
  produtoEstoqueMinimo: number;
  produtoSpecs: Record<string, SpecValue>;
  unidadesDoProduto: number;
}

/**
 * Edição de uma peça.
 *
 * Dois blocos separados de propósito, e não um formulário só: mudar o
 * **produto** altera a ficha técnica de todas as suas unidades; mudar a
 * **unidade** altera só aquela peça física. Juntar os dois faria alguém
 * corrigir o serial de uma placa e, sem perceber, alterar a especificação de
 * outras onze.
 */
export function FormularioDeEdicao({
  dados,
  marcas,
  socios,
  specs,
}: {
  dados: DadosIniciais;
  marcas: Opcao[];
  socios: Opcao[];
  specs: SpecDefinition[];
}) {
  const router = useRouter();
  const { online } = useOnlineStatus();
  const [salvando, iniciar] = useTransition();

  const [unidade, setUnidade] = useState({
    serialNumber: dados.serialNumber,
    condition: dados.condition,
    purchasedById: dados.purchasedById,
    purchaseCost: dados.purchaseCost,
    estimatedSalePrice: dados.estimatedSalePrice,
    origin: dados.origin,
    notes: dados.notes,
  });

  const [produto, setProduto] = useState({
    name: dados.produtoNome,
    model: dados.produtoModelo,
    partNumber: dados.produtoPartNumber,
    brandId: dados.produtoBrandId,
    defaultSalePrice: dados.produtoPrecoPadrao,
    lowStockThreshold: dados.produtoEstoqueMinimo,
  });

  const [valoresDeSpec, setValoresDeSpec] = useState<
    Record<string, SpecValue | undefined>
  >(dados.produtoSpecs);

  function exigirConexao(): boolean {
    if (online) return true;
    toast.error("Sem conexão", {
      description: "A alteração só é gravada com confirmação do servidor.",
    });
    return false;
  }

  function salvarDadosDaUnidade() {
    if (!exigirConexao()) return;

    iniciar(async () => {
      const custo = lerCusto(unidade.purchaseCost);
      if (!custo.ok) {
        toast.error("Não foi possível salvar", { description: custo.erro });
        return;
      }
      const resultado = await salvarUnidade({
        id: dados.unitId,
        ...unidade,
        purchaseCost: custo.valor ?? undefined,
        purchaseCostNote: custo.nota ?? undefined,
      });

      if (!resultado.ok) {
        toast.error("Não foi possível salvar", { description: resultado.error });
        return;
      }

      toast.success("Peça atualizada");
      router.push(`/estoque/itens/${dados.unitId}`);
    });
  }

  function salvarDadosDoProduto() {
    if (!exigirConexao()) return;

    iniciar(async () => {
      const especificacoes: Record<string, unknown> = {};
      for (const [chave, valor] of Object.entries(valoresDeSpec)) {
        if (valor !== undefined && valor !== "") especificacoes[chave] = valor;
      }

      const resultado = await salvarProduto({
        id: dados.productId,
        ...produto,
        specs: especificacoes,
      });

      if (!resultado.ok) {
        toast.error("Não foi possível salvar", { description: resultado.error });
        return;
      }

      toast.success("Modelo atualizado", {
        description:
          resultado.data.unidadesAfetadas > 1
            ? `A ficha técnica de ${resultado.data.unidadesAfetadas} unidades foi alterada.`
            : undefined,
      });
      router.push(`/estoque/itens/${dados.unitId}`);
    });
  }

  function excluir() {
    if (!exigirConexao()) return;

    iniciar(async () => {
      const resultado = await removerUnidade({ id: dados.unitId });

      if (!resultado.ok) {
        toast.error("Não foi possível excluir", { description: resultado.error });
        return;
      }

      toast.success("Peça excluída do estoque");
      router.push(hrefDoEstoque());
    });
  }

  return (
    <div className="space-y-6">
      <section className="bg-card rounded-lg border">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-medium">
            Esta unidade · {dados.codigoInterno}
          </h2>
          <p className="text-muted-foreground text-xs">
            Vale só para esta peça física.
          </p>
        </header>

        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Campo
            id="ed-serial"
            rotulo="Número de série"
            valor={unidade.serialNumber}
            aoMudar={(v) => setUnidade((a) => ({ ...a, serialNumber: v }))}
            mono
          />

          <div className="space-y-1.5">
            <Label htmlFor="ed-condicao">Estado da peça</Label>
            <select
              id="ed-condicao"
              className="border-input bg-background h-11 w-full rounded-md border px-3 text-sm"
              value={unidade.condition}
              onChange={(evento) =>
                setUnidade((a) => ({
                  ...a,
                  condition: evento.target.value as UnitCondition,
                }))
              }
            >
              {CONDICOES_SELECIONAVEIS.map((condicao) => (
                <option key={condicao} value={condicao}>
                  {ROTULO_CONDICAO[condicao]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ed-comprador">Quem comprou</Label>
            <select
              id="ed-comprador"
              className="border-input bg-background h-11 w-full rounded-md border px-3 text-sm"
              value={unidade.purchasedById}
              onChange={(evento) =>
                setUnidade((a) => ({ ...a, purchasedById: evento.target.value }))
              }
            >
              <option value="">Não informado</option>
              {socios.map((socio) => (
                <option key={socio.id} value={socio.id}>
                  {socio.name}
                </option>
              ))}
            </select>
          </div>

          <Campo
            id="ed-origem"
            rotulo="Origem"
            valor={unidade.origin}
            aoMudar={(v) => setUnidade((a) => ({ ...a, origin: v }))}
          />
          <Campo
            id="ed-custo"
            rotulo="Valor de compra"
            valor={unidade.purchaseCost}
            aoMudar={(v) => setUnidade((a) => ({ ...a, purchaseCost: v }))}
            placeholder="0,00 ou não lembro"
          />
          <Campo
            id="ed-venda"
            rotulo="Valor estimado de venda"
            valor={unidade.estimatedSalePrice}
            aoMudar={(v) => setUnidade((a) => ({ ...a, estimatedSalePrice: v }))}
            numerico
          />

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ed-notas">Observações</Label>
            <Textarea
              id="ed-notas"
              rows={3}
              value={unidade.notes}
              onChange={(evento) =>
                setUnidade((a) => ({ ...a, notes: evento.target.value }))
              }
            />
          </div>

          <p className="text-muted-foreground sm:col-span-2 text-xs">
            Para mudar a localização, registre uma transferência na tela da
            peça — assim fica gravado quem moveu e quando.
          </p>
        </div>

        <footer className="flex flex-wrap gap-2 border-t p-4">
          <Button className="h-11" onClick={salvarDadosDaUnidade} disabled={salvando}>
            {salvando ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Check className="size-4" aria-hidden />
            )}
            Salvar esta unidade
          </Button>

          {dados.podeExcluir ? (
            <Button
              variant="destructive"
              className="h-11"
              onClick={excluir}
              disabled={salvando}
            >
              <Trash2 className="size-4" aria-hidden />
              Excluir
            </Button>
          ) : null}
        </footer>
      </section>

      <section className="bg-card rounded-lg border">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-medium">Modelo da peça</h2>
          {dados.unidadesDoProduto > 1 ? (
            <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Alterar aqui muda a ficha técnica das{" "}
              {dados.unidadesDoProduto} unidades deste modelo.
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Vale para todas as unidades deste modelo.
            </p>
          )}
        </header>

        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Campo
            id="ed-nome"
            rotulo="Nome"
            valor={produto.name}
            aoMudar={(v) => setProduto((a) => ({ ...a, name: v }))}
            largura="sm:col-span-2"
          />

          <div className="space-y-1.5">
            <Label htmlFor="ed-marca">Marca</Label>
            <select
              id="ed-marca"
              className="border-input bg-background h-11 w-full rounded-md border px-3 text-sm"
              value={produto.brandId}
              onChange={(evento) =>
                setProduto((a) => ({ ...a, brandId: evento.target.value }))
              }
            >
              <option value="">Não informada</option>
              {marcas.map((marca) => (
                <option key={marca.id} value={marca.id}>
                  {marca.name}
                </option>
              ))}
            </select>
          </div>

          <Campo
            id="ed-modelo"
            rotulo="Modelo"
            valor={produto.model}
            aoMudar={(v) => setProduto((a) => ({ ...a, model: v }))}
          />
          <Campo
            id="ed-pn"
            rotulo="Part Number"
            valor={produto.partNumber}
            aoMudar={(v) => setProduto((a) => ({ ...a, partNumber: v }))}
          />
          <Campo
            id="ed-preco-padrao"
            rotulo="Preço de venda padrão"
            valor={produto.defaultSalePrice}
            aoMudar={(v) => setProduto((a) => ({ ...a, defaultSalePrice: v }))}
            numerico
          />

          <div className="space-y-1.5">
            <Label htmlFor="ed-minimo">Alertar quando restarem menos de</Label>
            <Input
              id="ed-minimo"
              type="number"
              min={0}
              className="h-11"
              value={produto.lowStockThreshold}
              onChange={(evento) =>
                setProduto((a) => ({
                  ...a,
                  lowStockThreshold: Number(evento.target.value) || 0,
                }))
              }
            />
            <p className="text-muted-foreground text-xs">
              Zero desliga o alerta deste modelo.
            </p>
          </div>
        </div>

        {specs.length > 0 ? (
          <div className="border-t p-4">
            <h3 className="mb-3 text-sm font-medium">Especificações técnicas</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {specs.map((definicao) => (
                <SpecField
                  key={definicao.key}
                  definicao={definicao}
                  valor={valoresDeSpec[definicao.key]}
                  aoMudar={(valor) =>
                    setValoresDeSpec((atual) => ({
                      ...atual,
                      [definicao.key]: valor,
                    }))
                  }
                />
              ))}
            </div>
          </div>
        ) : null}

        <footer className="border-t p-4">
          <Button
            className="h-11"
            onClick={salvarDadosDoProduto}
            disabled={salvando || produto.name.trim().length < 2}
          >
            {salvando ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Check className="size-4" aria-hidden />
            )}
            Salvar o modelo
          </Button>
        </footer>
      </section>
    </div>
  );
}

function Campo({
  id,
  rotulo,
  valor,
  aoMudar,
  numerico,
  mono,
  largura,
  placeholder,
}: {
  id: string;
  rotulo: string;
  valor: string;
  aoMudar: (valor: string) => void;
  numerico?: boolean;
  mono?: boolean;
  largura?: string;
  placeholder?: string;
}) {
  return (
    <div className={cn("space-y-1.5", largura)}>
      <Label htmlFor={id}>{rotulo}</Label>
      <Input
        id={id}
        className={cn("h-11", mono && "font-mono")}
        value={valor}
        inputMode={numerico ? "decimal" : undefined}
        placeholder={placeholder}
        onChange={(evento) => aoMudar(evento.target.value)}
      />
    </div>
  );
}
