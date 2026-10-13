import { beforeEach, describe, expect, it, vi } from "vitest";
import { atualizarResumoDaUnidade } from "./unit-write.service";
import { prisma } from "@/server/db/client";
import { registrarAuditoria } from "./audit.service";

vi.mock("@/server/db/client", () => ({
  prisma: { inventoryUnit: { findUnique: vi.fn(), update: vi.fn() } },
}));
vi.mock("./audit.service", () => ({ registrarAuditoria: vi.fn() }));
vi.mock("./catalog.service", () => ({ definicoesDeSpec: vi.fn() }));
const ctx = {
  userId: "admin",
  name: "Admin",
  role: "ADMIN" as const,
  ip: null,
  userAgent: null,
};
beforeEach(() => vi.clearAllMocks());

describe("edição rápida preserva a ficha", () => {
  it("altera apenas custo, venda e condição, sem apagar serial, origem, sócio ou datas", async () => {
    vi.mocked(prisma.inventoryUnit.findUnique).mockResolvedValue({
      status: "AVAILABLE",
      condition: "USED",
      purchaseCost: 80,
      estimatedSalePrice: 120,
    } as never);
    const dados = {
      condition: "LIKE_NEW" as const,
      purchaseCost: 0,
      purchaseCostNote: null,
      estimatedSalePrice: null,
    };
    await atualizarResumoDaUnidade("peca", dados, ctx);
    expect(prisma.inventoryUnit.update).toHaveBeenCalledWith({
      where: { id: "peca" },
      data: dados,
    });
    expect(registrarAuditoria).toHaveBeenCalledWith(
      expect.objectContaining({
        before: {
          condition: "USED",
          purchaseCost: 80,
          estimatedSalePrice: 120,
        },
        after: dados,
      }),
      ctx,
    );
  });
  it("bloqueia peças descartadas e inexistentes", async () => {
    const dados = {
      condition: "USED" as const,
      purchaseCost: null,
      purchaseCostNote: "não lembro",
      estimatedSalePrice: 10,
    };
    vi.mocked(prisma.inventoryUnit.findUnique).mockResolvedValue({
      status: "DISCARDED",
    } as never);
    await expect(atualizarResumoDaUnidade("peca", dados, ctx)).rejects.toThrow(
      "descartada",
    );
    vi.mocked(prisma.inventoryUnit.findUnique).mockResolvedValue(null);
    await expect(
      atualizarResumoDaUnidade("peca", dados, ctx),
    ).rejects.toThrow();
    expect(prisma.inventoryUnit.update).not.toHaveBeenCalled();
  });
});
