"use client";

import { SlidersHorizontal, X, LoaderCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  CONDICOES_SELECIONAVEIS,
  ROTULO_CONDICAO,
  ROTULO_STATUS,
  STATUS_DO_ESTOQUE,
} from "@/lib/inventory-labels";
import { cn } from "@/lib/utils";

interface Opcao {
  id: string;
  name: string;
}
interface Props {
  categorias: Opcao[];
  marcas: Opcao[];
  locais: Opcao[];
}

export function Filtros(props: Props) {
  const searchParams = useSearchParams();
  return (
    <BarraFiltros
      key={searchParams.toString()}
      {...props}
      paramsIniciais={searchParams.toString()}
    />
  );
}

function BarraFiltros({
  categorias,
  marcas,
  locais,
  paramsIniciais,
}: Props & { paramsIniciais: string }) {
  const router = useRouter();
  const params = new URLSearchParams(paramsIniciais);
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();
  const ativos = [...params.entries()].filter(
    ([chave]) => !["cursor", "ordenacao", "limite"].includes(chave),
  );
  const status = params.getAll("status");
  function navegar(proximos: URLSearchParams) {
    proximos.delete("cursor");
    iniciar(() =>
      router.push(`/estoque/itens?${proximos.toString()}`, { scroll: false }),
    );
  }
  function aplicar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const dados = new FormData(event.currentTarget);
    const proximos = new URLSearchParams(paramsIniciais);
    for (const chave of [
      "status",
      "condition",
      "categoryId",
      "brandId",
      "locationId",
      "precoMin",
      "precoMax",
    ]) {
      proximos.delete(chave);
      for (const valor of dados.getAll(chave))
        if (String(valor).trim()) proximos.append(chave, String(valor));
    }
    navegar(proximos);
    setAberto(false);
  }
  return (
    <section
      aria-label="Filtros do estoque"
      aria-busy={pendente}
      className="bg-card space-y-3 rounded-2xl border p-3 sm:p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Sheet open={aberto} onOpenChange={setAberto}>
            <SheetTrigger render={<Button variant="outline" />}>
              <SlidersHorizontal className="size-4" />
              Filtros
              {ativos.length > 0 && (
                <span className="bg-primary text-primary-foreground flex size-5 items-center justify-center rounded-full text-xs">
                  {ativos.length}
                </span>
              )}
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="mx-auto max-h-[90dvh] max-w-2xl overflow-y-auto rounded-t-3xl"
            >
              <SheetHeader>
                <SheetTitle>Filtrar estoque</SheetTitle>
                <SheetDescription>
                  Combine os filtros e aplique quando estiver pronto.
                </SheetDescription>
              </SheetHeader>
              <form onSubmit={aplicar} className="space-y-5 px-4 pb-5">
                <fieldset disabled={pendente} className="space-y-5">
                  <fieldset>
                    <legend className="mb-2 text-sm font-medium">
                      Situação
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {STATUS_DO_ESTOQUE.map((valor) => (
                        <label
                          key={valor}
                          className="has-checked:border-primary has-checked:bg-primary/8 has-checked:text-primary flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm"
                        >
                          <input
                            type="checkbox"
                            name="status"
                            value={valor}
                            defaultChecked={status.includes(valor)}
                            className="size-4 accent-primary"
                          />
                          {ROTULO_STATUS[valor]}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend className="mb-2 text-sm font-medium">
                      Estado da peça
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {CONDICOES_SELECIONAVEIS.map((valor) => (
                        <label
                          key={valor}
                          className="has-checked:border-primary has-checked:bg-primary/8 has-checked:text-primary flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm"
                        >
                          <input
                            type="checkbox"
                            name="condition"
                            value={valor}
                            defaultChecked={params
                              .getAll("condition")
                              .includes(valor)}
                            className="size-4 accent-primary"
                          />
                          {ROTULO_CONDICAO[valor]}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      {
                        chave: "categoryId",
                        rotulo: "Categoria",
                        opcoes: categorias,
                      },
                      { chave: "brandId", rotulo: "Marca", opcoes: marcas },
                      {
                        chave: "locationId",
                        rotulo: "Localização",
                        opcoes: locais,
                      },
                    ].map(({ chave, rotulo, opcoes }) => (
                      <div key={chave} className="min-w-0 space-y-2">
                        <Label htmlFor={chave}>{rotulo}</Label>
                        <select
                          id={chave}
                          name={chave}
                          defaultValue={params.get(chave) ?? ""}
                          className="border-input bg-background h-11 w-full min-w-0 rounded-lg border px-2 text-sm"
                        >
                          <option value="">Todas</option>
                          {opcoes.map((opcao) => (
                            <option key={opcao.id} value={opcao.id}>
                              {opcao.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { chave: "precoMin", rotulo: "Valor mínimo (R$)" },
                      { chave: "precoMax", rotulo: "Valor máximo (R$)" },
                    ].map(({ chave, rotulo }) => (
                      <div key={chave} className="space-y-2">
                        <Label htmlFor={chave}>{rotulo}</Label>
                        <Input
                          id={chave}
                          name={chave}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.01"
                          placeholder="0,00"
                          defaultValue={params.get(chave) ?? ""}
                        />
                      </div>
                    ))}
                  </div>
                </fieldset>
                <div className="bg-popover sticky bottom-0 flex gap-3 border-t pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pendente}
                    onClick={() => {
                      navegar(new URLSearchParams());
                      setAberto(false);
                    }}
                  >
                    Limpar
                  </Button>
                  <Button type="submit" className="flex-1" disabled={pendente}>
                    {pendente ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : null}
                    {pendente ? "Aplicando…" : "Aplicar filtros"}
                  </Button>
                </div>
              </form>
            </SheetContent>
          </Sheet>
          {pendente ? (
            <span role="status" className="text-muted-foreground text-xs">
              Atualizando…
            </span>
          ) : (
            <span className="text-muted-foreground hidden text-xs sm:inline">
              Encontre a peça certa
            </span>
          )}
        </div>
        <select
          aria-label="Ordenar estoque"
          className="border-input bg-background h-11 max-w-full rounded-lg border px-2 text-sm"
          value={params.get("ordenacao") ?? "recentes"}
          disabled={pendente}
          onChange={(event) => {
            params.set("ordenacao", event.target.value);
            navegar(params);
          }}
        >
          <option value="recentes">Mais recentes</option>
          <option value="antigos">Mais antigos</option>
          <option value="nome">Nome A–Z</option>
          <option value="valor-maior">Maior valor</option>
          <option value="valor-menor">Menor valor</option>
        </select>
      </div>
      <div
        className="flex gap-2 overflow-x-auto pb-1"
        aria-label="Situação da peça"
      >
        {[
          { valor: "", rotulo: "Todas" },
          ...STATUS_DO_ESTOQUE.map((valor) => ({
            valor,
            rotulo: ROTULO_STATUS[valor],
          })),
        ].map(({ valor, rotulo }) => (
          <button
            key={valor}
            type="button"
            disabled={pendente}
            aria-pressed={valor ? status.includes(valor) : status.length === 0}
            className={cn(
              "min-h-11 shrink-0 rounded-xl px-3 text-sm font-medium transition-colors disabled:opacity-50",
              (valor ? status.includes(valor) : status.length === 0)
                ? "bg-primary text-primary-foreground"
                : "bg-muted/60 text-muted-foreground hover:bg-muted",
            )}
            onClick={() => {
              params.delete("status");
              if (valor) params.set("status", valor);
              navegar(params);
            }}
          >
            {rotulo}
          </button>
        ))}
      </div>
      {ativos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-2">
          {ativos.map(([chave, valor], index) => {
            const rotulo =
              chave === "status"
                ? ROTULO_STATUS[valor as keyof typeof ROTULO_STATUS]
                : chave === "condition"
                  ? ROTULO_CONDICAO[valor as keyof typeof ROTULO_CONDICAO]
                  : ([...categorias, ...marcas, ...locais].find(
                      (o) => o.id === valor,
                    )?.name ??
                    (chave === "precoMin"
                      ? `Mín. R$ ${valor}`
                      : chave === "precoMax"
                        ? `Máx. R$ ${valor}`
                        : valor));
            return (
              <button
                type="button"
                key={`${chave}-${index}`}
                disabled={pendente}
                className="bg-muted text-muted-foreground inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg px-2 text-xs"
                aria-label={`Remover filtro ${rotulo}`}
                onClick={() => {
                  params.delete(chave, valor);
                  navegar(params);
                }}
              >
                <span className="truncate">{rotulo}</span>
                <X className="size-3 shrink-0" />
              </button>
            );
          })}
          <Button
            variant="ghost"
            disabled={pendente}
            onClick={() => navegar(new URLSearchParams())}
          >
            Limpar tudo
          </Button>
        </div>
      )}
    </section>
  );
}
