"use client";

import { ArrowLeftRight, Loader2 } from "lucide-react";
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
import type { MovementType, UnitStatus } from "@/generated/prisma/enums";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { ROTULO_MOVIMENTO, ROTULO_STATUS } from "@/lib/inventory-labels";
import { movimentar } from "@/server/actions/inventory.actions";
import { cn } from "@/lib/utils";

interface Local {
  id: string;
  name: string;
}

/**
 * Movimentações que a interface oferece, por status atual.
 *
 * Espelha a tabela de transições do domínio. A duplicação é intencional e
 * limitada: aqui ela serve só para não oferecer um botão que o servidor vai
 * recusar. A regra que vale continua sendo a do servidor — se as duas
 * divergirem, o pior que acontece é a interface oferecer algo que falha com
 * mensagem clara, e não o contrário.
 */
const ACOES_POR_STATUS: Record<UnitStatus, MovementType[]> = {
  AVAILABLE: ["RESERVE", "SALE", "TRANSFER", "DEFECT", "OUTBOUND", "DISCARD"],
  RESERVED: ["UNRESERVE", "SALE", "TRANSFER", "DEFECT", "DISCARD"],
  IN_BUILD: ["BUILD_RELEASE", "SALE", "DEFECT"],
  DEFECTIVE: ["DISCARD", "TRANSFER", "ADJUSTMENT"],
  IN_TRANSIT: ["INBOUND", "RETURN", "SALE", "DEFECT", "DISCARD"],
  SOLD: ["RETURN"],
  DISCARDED: [],
};

/** Explica o efeito de cada movimento, para quem opera sem decorar a regra. */
const EFEITO: Partial<Record<MovementType, string>> = {
  RESERVE: "Sai do estoque disponível e fica separada para um cliente.",
  UNRESERVE: "Volta a ficar disponível.",
  SALE: "Sai do estoque em definitivo.",
  RETURN: "Volta ao estoque disponível.",
  TRANSFER: "Muda de lugar, sem mudar a situação.",
  DEFECT: "Marca a peça como defeituosa e a tira do disponível.",
  DISCARD: "Descarte definitivo. Não aceita mais nenhuma movimentação.",
  OUTBOUND: "Saída sem venda: empréstimo, envio para conserto.",
  BUILD_RELEASE: "Solta a peça da montagem e devolve ao estoque.",
  INBOUND: "Entrada no estoque.",
  ADJUSTMENT: "Correção manual, sem mudar a situação.",
};

export function MovimentarUnidade({
  unitId,
  statusAtual,
  nomeDaPeca,
  porQuantidade,
  saldoAtual,
  locais,
  valorSugerido,
}: {
  unitId: string;
  statusAtual: UnitStatus;
  nomeDaPeca: string;
  porQuantidade: boolean;
  saldoAtual: number;
  locais: Local[];
  /** Venda estimada da peça, para já vir preenchida no valor da venda. */
  valorSugerido?: number | null;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<MovementType | "">("");
  const [quantidade, setQuantidade] = useState(1);
  const [motivo, setMotivo] = useState("");
  const [observacao, setObservacao] = useState("");
  const [destino, setDestino] = useState("");
  const [valorVenda, setValorVenda] = useState(
    valorSugerido ? valorSugerido.toFixed(2).replace(".", ",") : "",
  );
  const [comprador, setComprador] = useState("");
  const [executando, iniciar] = useTransition();
  const { online } = useOnlineStatus();

  const acoes = useMemo(() => {
    const disponiveis = ACOES_POR_STATUS[statusAtual];
    // Item fungível não é reservado nem alocado individualmente: não há
    // unidade física distinguível para prender.
    return porQuantidade
      ? disponiveis.filter(
          (acao) => !["RESERVE", "UNRESERVE", "BUILD_RELEASE"].includes(acao),
        )
      : disponiveis;
  }, [statusAtual, porQuantidade]);

  function confirmar() {
    if (!tipo) return;

    if (!online) {
      toast.error("Sem conexão", {
        description:
          "Movimentação de estoque só é gravada com confirmação do servidor. Nada foi alterado.",
      });
      return;
    }

    iniciar(async () => {
      const resultado = await movimentar({
        unitId,
        type: tipo,
        quantity: porQuantidade ? quantidade : 1,
        reason: motivo || undefined,
        notes: observacao || undefined,
        toLocationId: destino || undefined,
        ...(tipo === "SALE"
          ? {
              soldPrice: valorVenda.trim() || undefined,
              soldToName: comprador.trim() || undefined,
            }
          : {}),
      });

      if (!resultado.ok) {
        toast.error("Movimentação recusada", { description: resultado.error });
        return;
      }

      toast.success(`${ROTULO_MOVIMENTO[tipo]} registrada`, {
        description: nomeDaPeca,
      });
      setAberto(false);
      setTipo("");
      setMotivo("");
      setObservacao("");
      router.refresh();
    });
  }

  if (acoes.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Esta unidade está {ROTULO_STATUS[statusAtual].toLowerCase()} e não aceita
        novas movimentações.
      </p>
    );
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button className="h-11" />}>
        <ArrowLeftRight className="size-4" aria-hidden />
        Movimentar
      </DialogTrigger>

      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Movimentar peça</DialogTitle>
          <DialogDescription>
            {nomeDaPeca} · atualmente {ROTULO_STATUS[statusAtual].toLowerCase()}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-4 pb-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">O que aconteceu</legend>
            <div className="grid gap-2">
              {acoes.map((acao) => (
                <button
                  key={acao}
                  type="button"
                  onClick={() => setTipo(acao)}
                  aria-pressed={tipo === acao}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    tipo === acao
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted",
                  )}
                >
                  <span className="block text-sm font-medium">
                    {ROTULO_MOVIMENTO[acao]}
                  </span>
                  {EFEITO[acao] ? (
                    <span className="text-muted-foreground block text-xs">
                      {EFEITO[acao]}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </fieldset>

          {porQuantidade && tipo ? (
            <div className="space-y-1.5">
              <Label htmlFor="mov-quantidade">Quantidade</Label>
              <Input
                id="mov-quantidade"
                type="number"
                inputMode="numeric"
                min={1}
                max={saldoAtual}
                className="h-11"
                value={quantidade}
                onChange={(evento) =>
                  setQuantidade(Math.max(1, Number(evento.target.value) || 1))
                }
              />
              <p className="text-muted-foreground text-xs">
                Saldo atual: {saldoAtual}.
              </p>
            </div>
          ) : null}

          {tipo === "SALE" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="mov-valor-venda">Vendeu por (R$)</Label>
                <Input
                  id="mov-valor-venda"
                  inputMode="decimal"
                  className="h-11"
                  value={valorVenda}
                  onChange={(evento) => setValorVenda(evento.target.value)}
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mov-comprador">Para quem</Label>
                <Input
                  id="mov-comprador"
                  className="h-11"
                  maxLength={120}
                  value={comprador}
                  onChange={(evento) => setComprador(evento.target.value)}
                  placeholder="Opcional"
                />
              </div>
            </div>
          ) : null}

          {tipo === "TRANSFER" ? (
            <div className="space-y-1.5">
              <Label htmlFor="mov-destino">Novo local</Label>
              <select
                id="mov-destino"
                className="border-input bg-background h-11 w-full rounded-md border px-3 text-sm"
                value={destino}
                onChange={(evento) => setDestino(evento.target.value)}
              >
                <option value="">Selecione…</option>
                {locais.map((local) => (
                  <option key={local.id} value={local.id}>
                    {local.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {tipo ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="mov-motivo">Motivo</Label>
                <Input
                  id="mov-motivo"
                  className="h-11"
                  value={motivo}
                  onChange={(evento) => setMotivo(evento.target.value)}
                  placeholder="Cliente João, teste na bancada…"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="mov-obs">Observação</Label>
                <Textarea
                  id="mov-obs"
                  rows={2}
                  value={observacao}
                  onChange={(evento) => setObservacao(evento.target.value)}
                />
              </div>

              <Button
                className="h-11 w-full"
                onClick={confirmar}
                disabled={
                  executando || (tipo === "TRANSFER" && destino === "")
                }
              >
                {executando ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Registrando…
                  </>
                ) : (
                  `Confirmar ${ROTULO_MOVIMENTO[tipo].toLowerCase()}`
                )}
              </Button>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
