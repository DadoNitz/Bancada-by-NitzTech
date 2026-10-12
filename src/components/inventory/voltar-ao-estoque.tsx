"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { hrefDoEstoque } from "@/lib/retorno-estoque";

/**
 * "Voltar ao estoque" que lembra os filtros. O href puro (sem filtros) fica
 * para abrir em nova aba e para quem chegou direto pelo QR Code; o clique
 * normal leva à lista como ela estava — e a lista cuida de voltar à rolagem e
 * animar a chegada.
 */
export function VoltarAoEstoque() {
  const router = useRouter();
  return (
    <Link
      href="/estoque/itens"
      scroll={false}
      onClick={(evento) => {
        if (evento.metaKey || evento.ctrlKey || evento.shiftKey) return;
        evento.preventDefault();
        router.push(hrefDoEstoque(), { scroll: false });
      }}
      className="text-muted-foreground hover:text-foreground group inline-flex min-h-9 items-center gap-1.5 text-sm"
    >
      <ArrowLeft
        className="size-4 transition-transform group-hover:-translate-x-0.5"
        aria-hidden
      />
      Voltar ao estoque
    </Link>
  );
}
