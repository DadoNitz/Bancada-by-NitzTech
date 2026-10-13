"use client";

import { LoaderCircle, Pencil, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lerCusto } from "@/lib/custo";
import { formatarData, formatarMoeda } from "@/lib/format";
import { salvarVenda } from "@/server/actions/edit.actions";

import { Miniatura } from "../itens/lista-estoque";

export interface ItemVenda {
  id: string;
  foto: string | null;
  icone: string | null;
  nome: string;
  marca: string;
  codigo: string;
  custo: number | null;
  custoNota: string | null;
  vendidoPor: number | null;
  vendidoEm: string | null;
  comprador: string | null;
}

export function ListaVendas({
  itens,
  podeEditar,
}: {
  itens: ItemVenda[];
  podeEditar: boolean;
}) {
  const [editando, setEditando] = useState<ItemVenda | null>(null);

  return (
    <>
      <ul className="space-y-3">
        {itens.map((item) => {
          const lucro =
            item.vendidoPor !== null && item.custo !== null
              ? item.vendidoPor - item.custo
              : null;
          return (
            <li
              key={item.id}
              className="bg-card rounded-2xl border p-4 lg:px-5"
            >
              <div className="flex items-start justify-between gap-3">
                <Link
                  href={`/estoque/itens/${item.id}`}
                  className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Miniatura foto={item.foto} icone={item.icone} />
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-sm leading-5 font-semibold [overflow-wrap:anywhere]">
                      {item.nome}
                    </span>
                    <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                      {item.marca} · {item.codigo}
                    </span>
                    <span className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
                      {item.vendidoEm
                        ? `Vendida em ${formatarData(item.vendidoEm)}`
                        : "Data da venda não registrada"}
                      {item.comprador ? (
                        <>
                          {" · "}
                          <User className="size-3 shrink-0" aria-hidden />
                          <span className="truncate">{item.comprador}</span>
                        </>
                      ) : null}
                    </span>
                  </span>
                </Link>
                {podeEditar ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11 shrink-0"
                    aria-label={`Editar venda de ${item.nome}`}
                    onClick={() => setEditando(item)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                ) : null}
              </div>

              <dl className="mt-3 grid grid-cols-3 gap-2 border-t pt-3">
                <div className="min-w-0">
                  <dt className="text-muted-foreground text-[11px]">
                    Vendeu por
                  </dt>
                  <dd className="py-0.5 font-mono text-base font-semibold tabular-nums">
                    {item.vendidoPor === null ? (
                      podeEditar ? (
                        <button
                          type="button"
                          onClick={() => setEditando(item)}
                          className="text-primary font-sans text-sm font-semibold"
                        >
                          definir
                        </button>
                      ) : (
                        <span className="text-muted-foreground font-sans text-sm italic">
                          —
                        </span>
                      )
                    ) : (
                      formatarMoeda(item.vendidoPor)
                    )}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-muted-foreground text-[11px]">Custo</dt>
                  <dd className="truncate py-0.5 text-sm tabular-nums">
                    {item.custo === null ? (
                      <span className="text-muted-foreground italic">
                        {item.custoNota ?? "não informado"}
                      </span>
                    ) : (
                      formatarMoeda(item.custo)
                    )}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-muted-foreground text-[11px]">Lucro</dt>
                  <dd
                    className={
                      lucro === null
                        ? "text-muted-foreground py-0.5 text-sm"
                        : lucro >= 0
                          ? "text-st-ok py-0.5 text-sm font-semibold tabular-nums"
                          : "text-destructive py-0.5 text-sm font-semibold tabular-nums"
                    }
                  >
                    {lucro === null ? "—" : formatarMoeda(lucro)}
                  </dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>
      {editando ? (
        <EditorVenda item={editando} fechar={() => setEditando(null)} />
      ) : null}
    </>
  );
}

function EditorVenda({
  item,
  fechar,
}: {
  item: ItemVenda;
  fechar: () => void;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function salvar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const dados = new FormData(event.currentTarget);
    const valor = lerCusto(String(dados.get("valor") ?? ""));
    if (!valor.ok || valor.nota !== null) {
      setErro("Informe o valor da venda, como 450,00.");
      return;
    }
    setErro(null);
    iniciar(async () => {
      try {
        const resultado = await salvarVenda({
          id: item.id,
          soldPrice: valor.valor,
          soldToName: String(dados.get("comprador") ?? "").trim() || null,
        });
        if (!resultado.ok) {
          setErro(resultado.error);
          return;
        }
        toast.success("Venda atualizada.");
        fechar();
        router.refresh();
      } catch {
        setErro(
          "Não foi possível salvar. Confira sua conexão e tente novamente.",
        );
      }
    });
  }

  return (
    <Dialog
      open
      onOpenChange={(aberto, detalhes) => {
        if (pendente) detalhes.cancel();
        else if (!aberto) fechar();
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={!pendente}>
        <DialogHeader>
          <DialogTitle>Dados da venda</DialogTitle>
          <DialogDescription className="break-words pr-6">
            {item.nome} · {item.codigo}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="venda-valor">Vendeu por (R$)</Label>
              <Input
                id="venda-valor"
                name="valor"
                inputMode="decimal"
                autoFocus
                defaultValue={
                  item.vendidoPor?.toFixed(2).replace(".", ",") ?? ""
                }
                placeholder="0,00"
                disabled={pendente}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="venda-comprador">Para quem</Label>
              <Input
                id="venda-comprador"
                name="comprador"
                maxLength={120}
                defaultValue={item.comprador ?? ""}
                placeholder="Opcional"
                disabled={pendente}
              />
            </div>
          </div>
          {erro ? (
            <p role="alert" className="text-destructive text-sm">
              {erro}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" className="h-11 w-full" disabled={pendente}>
              {pendente ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
              ) : null}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
