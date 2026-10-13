import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  ImagemInvalidaError,
  montarChave,
  processarImagem,
} from "@/lib/images/process";
import { storage } from "@/lib/storage";
import { prisma } from "@/server/db/client";
import { registrarAuditoria } from "@/server/services/audit.service";
import {
  NaoAutenticadoError,
  requirePermission,
  SemPermissaoError,
} from "@/server/session";

/**
 * Upload de foto de peca.
 *
 * Rota HTTP porque recebe multipart com arquivo grande, que e o que Route
 * Handler faz bem.
 *
 * Duas garantias que a rota precisa dar (secao 21):
 * - o tipo do arquivo e detectado pelos BYTES, nunca pelo Content-Type que o
 *   cliente declarou;
 * - a chave gravada e gerada pelo servidor, nunca vinda do cliente, senao um
 *   nome manipulado poderia sobrescrever a foto de outra peca.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    await requirePermission("inventory:write");

    const formulario = await request.formData();
    const arquivo = formulario.get("foto");
    const productId = formulario.get("productId");
    const unitId = formulario.get("unitId");
    const ehEtiqueta = formulario.get("etiqueta") === "1";

    if (!(arquivo instanceof File)) {
      return NextResponse.json(
        { erro: "Envie a imagem no campo 'foto'." },
        { status: 400 },
      );
    }

    if (typeof productId !== "string" && typeof unitId !== "string") {
      return NextResponse.json(
        { erro: "Informe a peca ou o produto." },
        { status: 400 },
      );
    }

    const bruto = Buffer.from(await arquivo.arrayBuffer());
    const processada = await processarImagem(bruto, arquivo.name);

    const escopo = typeof unitId === "string" ? "unidades" : "produtos";
    const id = randomUUID();

    const chaveOriginal = montarChave(escopo, id, "original");
    const chaveThumb = montarChave(escopo, id, "thumb");

    const driver = storage();
    await Promise.all([
      driver.put(chaveOriginal, processada.original, processada.contentType),
      driver.put(chaveThumb, processada.thumbnail, processada.contentType),
    ]);

    const comum = {
      storageKey: chaveOriginal,
      thumbnailKey: chaveThumb,
      fileName: arquivo.name.slice(0, 200),
      mimeType: processada.contentType,
      sizeBytes: processada.original.byteLength,
      width: processada.largura,
      height: processada.altura,
    };

    if (typeof unitId === "string") {
      // A primeira foto da unidade vira a principal automaticamente: exigir um
      // clique a mais para marcar a unica foto seria burocracia.
      const jaTem = await prisma.unitImage.count({ where: { unitId } });
      const imagem = await prisma.unitImage.create({
        data: {
          ...comum,
          unitId,
          isLabel: ehEtiqueta,
          isPrimary: jaTem === 0,
          sortOrder: jaTem,
        },
        select: { id: true },
      });
      return NextResponse.json({
        id: imagem.id,
        url: `/api/imagens/${chaveThumb}`,
        chave: chaveOriginal,
      });
    }

    const jaTem = await prisma.productImage.count({
      where: { productId: productId as string },
    });
    const imagem = await prisma.productImage.create({
      data: {
        ...comum,
        productId: productId as string,
        isPrimary: jaTem === 0,
        sortOrder: jaTem,
      },
      select: { id: true },
    });

    return NextResponse.json({
      id: imagem.id,
      url: `/api/imagens/${chaveThumb}`,
      chave: chaveOriginal,
    });
  } catch (erro) {
    if (erro instanceof ImagemInvalidaError) {
      return NextResponse.json({ erro: erro.message }, { status: 422 });
    }

    console.error("[api/upload]", erro);
    return NextResponse.json(
      { erro: "Nao foi possivel enviar a foto." },
      { status: 500 },
    );
  }
}

/**
 * Exclui uma foto de unidade ou de produto.
 *
 * Ordem deliberada: primeiro o banco (numa transacao com a auditoria), depois
 * os arquivos. Se apagar o arquivo falhar, sobra so um blob orfao, invisivel;
 * o contrario deixaria uma linha no banco apontando para imagem inexistente,
 * que aparece quebrada na tela.
 *
 * Se a foto removida era a principal, a proxima (pela ordem) assume — senao a
 * peca ficaria sem miniatura na lista mesmo tendo outras fotos.
 */
export async function DELETE(request: Request) {
  try {
    const ctx = await requirePermission("inventory:write");

    const corpo: unknown = await request.json().catch(() => null);
    const imageId =
      corpo && typeof corpo === "object" && "imageId" in corpo
        ? (corpo as { imageId: unknown }).imageId
        : null;

    if (typeof imageId !== "string" || imageId.length === 0) {
      return NextResponse.json(
        { erro: "Informe o id da foto." },
        { status: 400 },
      );
    }

    const campos = {
      id: true,
      storageKey: true,
      thumbnailKey: true,
      cutoutKey: true,
      fileName: true,
      isPrimary: true,
    } as const;

    const daUnidade = await prisma.unitImage.findUnique({
      where: { id: imageId },
      select: { ...campos, unitId: true },
    });
    const doProduto = daUnidade
      ? null
      : await prisma.productImage.findUnique({
          where: { id: imageId },
          select: { ...campos, productId: true },
        });

    const foto = daUnidade ?? doProduto;
    if (!foto) {
      // Ja nao existe: para quem pediu a exclusao, e o estado desejado.
      return NextResponse.json({ ok: true });
    }

    await prisma.$transaction(async (tx) => {
      if (daUnidade) {
        await tx.unitImage.delete({ where: { id: imageId } });
        if (daUnidade.isPrimary) {
          const proxima = await tx.unitImage.findFirst({
            where: { unitId: daUnidade.unitId },
            orderBy: { sortOrder: "asc" },
            select: { id: true },
          });
          if (proxima) {
            await tx.unitImage.update({
              where: { id: proxima.id },
              data: { isPrimary: true },
            });
          }
        }
      } else if (doProduto) {
        await tx.productImage.delete({ where: { id: imageId } });
        if (doProduto.isPrimary) {
          const proxima = await tx.productImage.findFirst({
            where: { productId: doProduto.productId },
            orderBy: { sortOrder: "asc" },
            select: { id: true },
          });
          if (proxima) {
            await tx.productImage.update({
              where: { id: proxima.id },
              data: { isPrimary: true },
            });
          }
        }
      }

      await registrarAuditoria(
        {
          action: "delete",
          entity: daUnidade ? "UnitImage" : "ProductImage",
          entityId: imageId,
          before: {
            fileName: foto.fileName,
            storageKey: foto.storageKey,
            isPrimary: foto.isPrimary,
            ...(daUnidade
              ? { unitId: daUnidade.unitId }
              : { productId: doProduto!.productId }),
          },
        },
        ctx,
        tx,
      );
    });

    const driver = storage();
    await Promise.all(
      [foto.storageKey, foto.thumbnailKey, foto.cutoutKey]
        .filter((chave): chave is string => Boolean(chave))
        .map((chave) => driver.remove(chave)),
    );

    return NextResponse.json({ ok: true });
  } catch (erro) {
    if (erro instanceof NaoAutenticadoError) {
      return NextResponse.json({ erro: erro.message }, { status: 401 });
    }
    if (erro instanceof SemPermissaoError) {
      return NextResponse.json({ erro: erro.message }, { status: 403 });
    }

    console.error("[api/upload DELETE]", erro);
    return NextResponse.json(
      { erro: "Nao foi possivel excluir a foto." },
      { status: 500 },
    );
  }
}
