"use client";

import { Loader2, Pencil, Plus, Search, X } from "lucide-react";
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
import { useOnlineStatus } from "@/hooks/use-online-status";
import { formatarMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  adicionarPeca,
  editarMontagem,
  mudarStatus,
  removerPeca,
} from "@/server/actions/build.actions";
import type { PecaParaMontar } from "@/server/services/build.service";

/**
 * Controles de edição da montagem.
 *
 * Toda mudança vai direto ao servidor (sem estado otimista): adicionar ou
 * remover peça altera o estoque, e a tela só deve mostrar a peça fora da
 * prateleira depois que o banco confirmou.
 */

function useAcao() {
  const router = useRouter();
  const [executando, iniciar] = useTransition();
  const { online } = useOnlineStatus();

  function executar<T>(
    acao: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>,
    sucesso: string,
    depois?: () => void,
  ) {
    if (!online) {
      toast.error("Sem conexão", {
        description: "Alterar a montagem precisa de confirmação do servidor.",
      });
      return;
    }
    iniciar(async () => {
      const resultado = await acao();
      if (!resultado.ok) {
        toast.error("Não foi possível salvar", { description: resultado.error });
        return;
      }
      toast.success(sucesso);
      depois?.();
      router.refresh();
    });
  }

  return { executando, executar };
}

interface DadosIniciais {
  name: string;
  customerName: string;
  salePrice: string;
  useCase: string;
  tier: string;
  notes: string;
}

export function EditarDados({
  buildId,
  inicial,
}: {
  buildId: string;
  inicial: DadosIniciais;
}) {
  const [aberto, setAberto] = useState(false);
  const [dados, setDados] = useState(inicial);
  const { executando, executar } = useAcao();

  const set = (campo: keyof DadosIniciais) =>
    (evento: { target: { value: string } }) =>
      setDados((atual) => ({ ...atual, [campo]: evento.target.value }));

  return (
    <Dialog
      open={aberto}
      onOpenChange={(abrir) => {
        // Reabrir parte do que está salvo, não do rascunho abandonado.
        if (abrir) setDados(inicial);
        setAberto(abrir);
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" className="h-9" />}>
        <Pencil className="size-3.5" aria-hidden />
        Editar
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar montagem</DialogTitle>
          <DialogDescription>
            Nome, cliente e preço. As peças são trocadas na lista de configuração.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-3 px-4"
          onSubmit={(evento) => {
            evento.preventDefault();
            executar(
              () => editarMontagem({ buildId, ...dados }),
              "Montagem atualizada",
              () => setAberto(false),
            );
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="ed-nome">Nome</Label>
            <Input id="ed-nome" className="h-11" value={dados.name} onChange={set("name")} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ed-preco">Preço de venda</Label>
              <Input
                id="ed-preco"
                className="h-11"
                inputMode="decimal"
                placeholder="0,00"
                value={dados.salePrice}
                onChange={set("salePrice")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ed-cliente">Cliente</Label>
              <Input id="ed-cliente" className="h-11" value={dados.customerName} onChange={set("customerName")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ed-uso">Uso</Label>
              <Input id="ed-uso" className="h-11" placeholder="Jogos, escritório…" value={dados.useCase} onChange={set("useCase")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ed-faixa">Faixa</Label>
              <Input id="ed-faixa" className="h-11" placeholder="Entrada, médio…" value={dados.tier} onChange={set("tier")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ed-notas">Observações</Label>
            <Textarea id="ed-notas" rows={3} value={dados.notes} onChange={set("notes")} />
          </div>

          <Button type="submit" className="h-11 w-full" disabled={executando}>
            {executando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Salvar
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const OPCOES_STATUS = [
  { valor: "RESERVED", rotulo: "Reservada" },
  { valor: "ASSEMBLING", rotulo: "Montando" },
  { valor: "ASSEMBLED", rotulo: "Montada" },
] as const;

export function TrocarStatus({
  buildId,
  atual,
}: {
  buildId: string;
  atual: "PLANNED" | "RESERVED" | "ASSEMBLING" | "ASSEMBLED";
}) {
  const { executando, executar } = useAcao();

  return (
    <div className="bg-muted inline-flex rounded-lg p-1" role="radiogroup" aria-label="Situação">
      {OPCOES_STATUS.map((opcao) => {
        const ativo = opcao.valor === atual;
        return (
          <button
            key={opcao.valor}
            type="button"
            role="radio"
            aria-checked={ativo}
            disabled={executando || ativo}
            onClick={() =>
              executar(
                () => mudarStatus({ buildId, status: opcao.valor }),
                `Situação: ${opcao.rotulo.toLowerCase()}`,
              )
            }
            className={cn(
              "h-9 rounded-md px-3 text-sm font-medium transition-colors",
              ativo
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opcao.rotulo}
          </button>
        );
      })}
    </div>
  );
}

export function RemoverPeca({
  buildId,
  unitId,
  nome,
  ultima,
}: {
  buildId: string;
  unitId: string;
  nome: string;
  ultima: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const { executando, executar } = useAcao();

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="size-10 shrink-0"
            aria-label={`Remover ${nome}`}
            disabled={ultima}
          />
        }
      >
        <X className="size-4" aria-hidden />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remover peça</DialogTitle>
          <DialogDescription>
            {nome} sai da montagem e volta para o estoque disponível. O custo
            da montagem é recalculado.
          </DialogDescription>
        </DialogHeader>
        <div className="px-4">
          <Button
            variant="destructive"
            className="h-11 w-full"
            disabled={executando}
            onClick={() =>
              executar(
                () => removerPeca({ buildId, unitId }),
                "Peça devolvida ao estoque",
                () => setAberto(false),
              )
            }
          >
            {executando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Remover e devolver ao estoque
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AdicionarPeca({
  buildId,
  pecas,
}: {
  buildId: string;
  pecas: PecaParaMontar[];
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const { executando, executar } = useAcao();

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return pecas;
    return pecas.filter(
      (peca) =>
        peca.nome.toLowerCase().includes(termo) ||
        peca.codigo.toLowerCase().includes(termo),
    );
  }, [busca, pecas]);

  return (
    <Dialog
      open={aberto}
      onOpenChange={(abrir) => {
        setAberto(abrir);
        if (!abrir) {
          setBusca("");
          setEscolhida(null);
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" className="h-10 w-full" />}>
        <Plus className="size-4" aria-hidden />
        Adicionar peça
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar peça</DialogTitle>
          <DialogDescription>
            Só aparecem peças disponíveis. Para trocar, adicione a nova e remova
            a antiga.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-4">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden />
            <Input
              className="h-11 pl-9"
              placeholder="Buscar por nome ou código"
              value={busca}
              onChange={(evento) => setBusca(evento.target.value)}
              aria-label="Buscar peça"
            />
          </div>

          <ul className="max-h-[45vh] divide-y overflow-y-auto rounded-md border">
            {filtradas.length === 0 ? (
              <li className="text-muted-foreground p-4 text-center text-sm">
                Nenhuma peça disponível encontrada.
              </li>
            ) : (
              filtradas.map((peca) => (
                <li key={peca.id}>
                  <button
                    type="button"
                    onClick={() => setEscolhida(peca.id)}
                    aria-pressed={escolhida === peca.id}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors",
                      escolhida === peca.id ? "bg-primary/15" : "hover:bg-muted/60",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{peca.nome}</span>
                      <span className="text-muted-foreground block font-mono text-xs">
                        {peca.codigo}
                        {peca.local ? ` · ${peca.local}` : ""}
                      </span>
                    </span>
                    <span className="font-mono text-xs tabular-nums">
                      {formatarMoeda(peca.custo)}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>

          <Button
            className="h-11 w-full"
            disabled={!escolhida || executando}
            onClick={() =>
              escolhida &&
              executar(
                () => adicionarPeca({ buildId, unitId: escolhida }),
                "Peça adicionada à montagem",
                () => {
                  setAberto(false);
                  setEscolhida(null);
                  setBusca("");
                },
              )
            }
          >
            {executando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Adicionar à montagem
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
