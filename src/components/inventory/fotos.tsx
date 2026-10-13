"use client";

import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { RemoverFundoDaFoto } from "@/components/inventory/remover-fundo";
import { Button } from "@/components/ui/button";

interface Foto {
  id: string;
  url: string;
  /** Versão sem fundo, quando já foi gerada. Fica ao lado da original. */
  urlRecorte?: string | undefined;
}

/**
 * Fotos de uma peça, com captura pela câmera (seção 33).
 *
 * Dois botões separados de propósito: "Câmera" usa `capture="environment"`, que
 * abre direto a câmera traseira do celular; "Galeria" abre o seletor de
 * arquivos. Um único botão obrigaria o usuário a passar pelo menu do sistema
 * toda vez, e fotografar peça na bancada é o caso mais frequente.
 *
 * As fotos são enviadas uma a uma, com o resultado aparecendo conforme chega —
 * numa conexão de depósito, esperar o lote inteiro para ver qualquer coisa
 * parece travamento.
 */
export function FotosDaPeca({
  unitId,
  productId,
  iniciais = [],
}: {
  unitId?: string;
  productId?: string;
  iniciais?: Foto[];
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);
  const [fotos, setFotos] = useState<Foto[]>(iniciais);
  const [enviando, setEnviando] = useState(0);
  const [excluindo, setExcluindo] = useState<Set<string>>(() => new Set());
  const router = useRouter();

  async function enviar(arquivos: FileList) {
    setEnviando((atual) => atual + arquivos.length);

    for (const arquivo of Array.from(arquivos)) {
      try {
        const corpo = new FormData();
        corpo.append("foto", arquivo);
        if (unitId) corpo.append("unitId", unitId);
        if (productId) corpo.append("productId", productId);

        const resposta = await fetch("/api/upload", {
          method: "POST",
          body: corpo,
        });
        const dados: { id?: string; url?: string; erro?: string } =
          await resposta.json();

        if (!resposta.ok || !dados.id || !dados.url) {
          toast.error("Foto recusada", {
            description: dados.erro ?? arquivo.name,
          });
          continue;
        }

        setFotos((atual) => [...atual, { id: dados.id!, url: dados.url! }]);
      } catch {
        toast.error("Falha ao enviar", { description: arquivo.name });
      } finally {
        setEnviando((atual) => atual - 1);
      }
    }
  }

  /**
   * Exclui no servidor, não só da tela. Antes o X apenas tirava a foto da
   * lista local — ao recarregar a página, ela voltava.
   */
  async function excluir(foto: Foto) {
    if (!window.confirm("Excluir esta foto? Não dá para desfazer.")) return;

    setExcluindo((atual) => new Set(atual).add(foto.id));
    try {
      const resposta = await fetch("/api/upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId: foto.id }),
      });
      const dados: { erro?: string } = await resposta
        .json()
        .catch(() => ({}));

      if (!resposta.ok) {
        toast.error("Não foi possível excluir", { description: dados.erro });
        return;
      }

      setFotos((atual) => atual.filter((f) => f.id !== foto.id));
      toast.success("Foto excluída");
      // Atualiza a miniatura do cabeçalho, que vem do servidor.
      router.refresh();
    } catch {
      toast.error("Falha ao excluir", { description: "Verifique a conexão." });
    } finally {
      setExcluindo((atual) => {
        const proximo = new Set(atual);
        proximo.delete(foto.id);
        return proximo;
      });
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(evento) => {
          if (evento.target.files?.length) void enviar(evento.target.files);
          evento.target.value = "";
        }}
      />
      <input
        ref={galeriaRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(evento) => {
          if (evento.target.files?.length) void enviar(evento.target.files);
          evento.target.value = "";
        }}
      />

      {fotos.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {fotos.map((foto) => (
            <li key={foto.id} className="space-y-1.5">
              <div className="bg-muted relative aspect-square overflow-hidden rounded-md border">
                <Image
                  src={foto.urlRecorte ?? foto.url}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 33vw, 25vw"
                  className="object-cover"
                  // Miniatura, nunca a original: carregar imagem em resolução
                  // máxima numa grade é o que a seção 33 proíbe.
                  unoptimized
                />
                <button
                  type="button"
                  aria-label="Excluir foto"
                  onClick={() => void excluir(foto)}
                  disabled={excluindo.has(foto.id)}
                  // Alvo de toque de 32px: o X de 12px antes era fácil de errar
                  // no celular.
                  className="bg-background/90 absolute top-1 right-1 flex size-8 items-center justify-center rounded-full disabled:opacity-60"
                >
                  {excluindo.has(foto.id) ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <X className="size-4" aria-hidden />
                  )}
                </button>
                {foto.urlRecorte ? (
                  <span className="bg-background/90 absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-[10px]">
                    sem fundo
                  </span>
                ) : null}
              </div>

              {!foto.urlRecorte ? (
                <RemoverFundoDaFoto
                  imageId={foto.id}
                  urlOriginal={foto.url}
                  aoConcluir={(urlRecorte) =>
                    setFotos((atual) =>
                      atual.map((f) =>
                        f.id === foto.id ? { ...f, urlRecorte } : f,
                      ),
                    )
                  }
                />
              ) : null}
            </li>
          ))}

          {enviando > 0 ? (
            <li className="bg-muted flex aspect-square items-center justify-center rounded-md border">
              <Loader2
                className="text-muted-foreground size-5 animate-spin"
                aria-hidden
              />
            </li>
          ) : null}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={() => cameraRef.current?.click()}
          disabled={enviando > 0}
        >
          <Camera className="size-4" aria-hidden />
          Câmera
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={() => galeriaRef.current?.click()}
          disabled={enviando > 0}
        >
          <ImagePlus className="size-4" aria-hidden />
          Galeria
        </Button>
        {enviando > 0 ? (
          <span className="text-muted-foreground self-center text-sm">
            enviando {enviando}…
          </span>
        ) : null}
      </div>
    </div>
  );
}
