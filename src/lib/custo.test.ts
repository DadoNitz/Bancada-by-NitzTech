import { describe, expect, it } from "vitest";

import { custoParaCampo, lerCusto } from "./custo";

describe("lerCusto", () => {
  it("vazio não tem valor nem anotação", () => {
    expect(lerCusto("  ")).toEqual({ ok: true, valor: null, nota: null });
  });

  it.each([
    ["300", 300],
    ["300,50", 300.5],
    ["1.234,56", 1234.56],
    ["1234.56", 1234.56],
    ["R$ 300,00", 300],
  ])("%s vira valor", (entrada, valor) => {
    expect(lerCusto(entrada)).toEqual({ ok: true, valor, nota: null });
  });

  it("texto vira anotação", () => {
    expect(lerCusto("não lembro")).toEqual({
      ok: true,
      valor: null,
      nota: "não lembro",
    });
    expect(lerCusto("veio no lote de 2x RX 580")).toMatchObject({
      nota: "veio no lote de 2x RX 580",
    });
  });

  it("recusa anotação longa demais", () => {
    expect(lerCusto("a".repeat(81)).ok).toBe(false);
  });
});

describe("custoParaCampo", () => {
  it("prefere o valor e cai na anotação", () => {
    expect(custoParaCampo(300, null)).toBe("300,00");
    expect(custoParaCampo(null, "não lembro")).toBe("não lembro");
    expect(custoParaCampo(null, null)).toBe("");
  });
});
