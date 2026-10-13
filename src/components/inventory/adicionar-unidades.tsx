"use client";

import { lerCusto } from "@/lib/custo";
import { CopyPlus, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { UnitCondition } from "@/generated/prisma/enums";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { CONDICOES_SELECIONAVEIS, ROTULO_CONDICAO } from "@/lib/inventory-labels";
import { adicionarUnidadesAoProduto } from "@/server/actions/inventory.actions";

interface Opcao {
  id: string;
  name: string;
}

/**
 * "Comprei mais dessas" (seção 23).
 *
 * Reaproveita o modelo já cadastrado: nenhuma especificação técnica é
 * redigitada, porque ela mora no produto e não na unidade. O que se informa
 * aqui é só o que muda de peça para peça — serial, quem pagou, quanto custou.
 *
 * É o caminho oposto ao do cadastro completo, e o mais frequente no dia a dia
 * de quem compra lote.
 */
export function AdicionarUnidades({
  productId,
  nomeDoProduto,
  porQuantidade,
  locais,
  socios,
  localAtual,
  custoSugerido,
}: {
  productId: string;
  nomeDoProduto: string;
  /** Quando o produto é controlado por saldo, some a lista de seriais. */
  porQuantidade: boolean;
  locais: Opcao[];
  socios: Opcao[];
  localAtual?: string | undefined;
  custoSugerido?: string | undefined;
}) {
  const router = useRouter();
  const { online } = useOnlineStatus();
  const [salvando, iniciar] = useTransition();
  const [aberto, setAberto] = useState(false);

  const [quantidade, setQuantidade] = useState(1);
  const [seriaisTexto, setSeriaisTexto] = useState("");
  const [condicao, setCondicao] = useState<UnitCondition>("USED");
  const [locationId, setLocationId] = useState(localAtual ?? "");
  const [purchasedById, setPurchasedById] = useState("");
  const [custo, setCusto] = useState(custoSugerido ?? "");
  const [origem, setOrigem] = useState("");

  const seriais = useMemo(
    () =>
      seriaisTexto
        .split(/\r?\n/)
        .map((linha) => linha.trim())
        .filter(Boolean),
    [seriaisTexto],
  );

  function enviar() {
    if (!online) {
      toast.error("Sem conexão", {
        description: "O cadastro só é gravado com confirmação do servidor.",
      });
      return;
    }

    const custoLido = lerCusto(custo);
    if (!custoLido.ok) {
      toast.error("Confira o custo", { description: custoLido.erro });
      return;
    }

    iniciar(async () => {
      const resultado = await adicionarUnidadesAoProduto({
        productId,
        quantidade,
        seriais,
        condition: condicao,
        locationId: locationId || undefined,
        purchasedById: purchasedById || undefined,
        purchaseCost: custoLido.valor ?? undefined,
        purchaseCostNote: custoLido.nota ?? undefined,
        origin: origem,
      });

      if (!resultado.ok) {
        toast.error("Não foi possível adicionar", {
          description: resultado.error,
        });
        return;
      }

      const { codigos } = resultado.data;
      toast.success(
        codigos.length === 1
          ? `Unidade adicionada: ${codigos[0]}`
          : `${codigos.length} unidades adicionadas`,
        {
          description:
            codigos.length > 1
              ? `Códigos ${codigos[0]} a ${codigos.at(-1)}`
              : undefined,
        },
      );

      setAberto(false);
      setQuantidade(1);
      setSeriaisTexto("");
      router.refresh();
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={
          <Button variant="outline" className="h-11" />
        }
      >
        <CopyPlus className="size-4" aria-hidden />
        Comprei mais
      </DialogTrigger>

      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar unidades</DialogTitle>
          <DialogDescription>
            Novas peças de {nomeDoProduto}. A ficha técnica já está cadastrada e
            não precisa ser preenchida de novo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-4 pb-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="add-qtd">Quantas</Label>
              <Input
                id="add-qtd"
                type="number"
                inputMode="numeric"
                min={1}
                max={200}
                className="h-11"
                value={quantidade}
                onChange={(evento) =>
                  setQuantidade(Math.max(1, Number(evento.target.value) || 1))
                }
              />
              <p className="text-muted-foreground text-xs">
                {porQuantidade
                  ? "Soma ao saldo deste item."
                  : `Cria ${quantidade} unidade(s), cada uma com seu código.`}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-condicao">Estado</Label>
              <select
                id="add-condicao"
                className="border-input bg-background h-11 w-full rounded-md border px-3 text-sm"
                value={condicao}
                onChange={(evento) =>
                  setCondicao(evento.target.value as UnitCondition)
                }
              >
                {CONDICOES_SELECIONAVEIS.map((item) => (
                  <option key={item} value={item}>
                    {ROTULO_CONDICAO[item]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!porQuantidade ? (
            <div className="space-y-1.5">
              <Label htmlFor="add-seriais">Números de série</Label>
              <Textarea
                id="add-seriais"
                rows={Math.min(5, Math.max(2, quantidade))}
                className="font-mono text-sm"
                value={seriaisTexto}
                onChange={(evento) => setSeriaisTexto(evento.target.value)}
                placeholder={"Um por linha.\nDeixe em branco se não tiver."}
              />
              <p className="text-muted-foreground text-xs">
                {seriais.length} de {quantidade} informados.
              </p>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="add-local">Onde vai ficar</Label>
              <select
                id="add-local"
                className="border-input bg-background h-11 w-full rounded-md border px-3 text-sm"
                value={locationId}
                onChange={(evento) => setLocationId(evento.target.value)}
              >
                <option value="">Não informado</option>
                {locais.map((local) => (
                  <option key={local.id} value={local.id}>
                    {local.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-comprador">Quem comprou</Label>
              <select
                id="add-comprador"
                className="border-input bg-background h-11 w-full rounded-md border px-3 text-sm"
                value={purchasedById}
                onChange={(evento) => setPurchasedById(evento.target.value)}
              >
                <option value="">Não informado</option>
                {socios.map((socio) => (
                  <option key={socio.id} value={socio.id}>
                    {socio.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-custo">Valor pago por unidade</Label>
              <Input
                id="add-custo"
                className="h-11"
                maxLength={80}
                value={custo}
                onChange={(evento) => setCusto(evento.target.value)}
                placeholder="0,00 ou não lembro"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-origem">Origem</Label>
              <Input
                id="add-origem"
                className="h-11"
                value={origem}
                onChange={(evento) => setOrigem(evento.target.value)}
                placeholder="Fornecedor, lote, troca…"
              />
            </div>
          </div>

          <Button className="h-11 w-full" onClick={enviar} disabled={salvando}>
            {salvando ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Adicionando…
              </>
            ) : (
              <>
                <CopyPlus className="size-4" aria-hidden />
                Adicionar {quantidade > 1 ? `${quantidade} unidades` : "unidade"}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
