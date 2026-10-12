// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ListaEstoque,
  type ItemEstoque,
} from "@/app/(app)/estoque/itens/lista-estoque";
import {
  removerUnidade,
  salvarResumoUnidade,
} from "@/server/actions/edit.actions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/server/actions/edit.actions", () => ({
  removerUnidade: vi.fn(),
  salvarResumoUnidade: vi.fn(),
}));
vi.mock("@/server/actions/reference-price.actions", () => ({
  atualizarPrecosDeMercadoDoEstoque: vi.fn(),
  buscarPrecoDeMercadoDaPeca: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
const item: ItemEstoque = {
  id: "peca-1",
  foto: null,
  nome: "Memória DDR4",
  marca: "Kingston",
  codigo: "RAM-001",
  icone: "MemoryStick",
  local: "Prateleira A",
  condition: "USED",
  status: "AVAILABLE",
  quantidade: 1,
  custo: 80,
  valor: 125,
  referencia: {
    valor: 110,
    tipo: "USADO",
    status: "OK",
    em: "2026-10-09T19:00:00.000Z",
    dados: {
      consulta: "kingston ddr4",
      rigor: "estrito",
      condicao: "USADO",
      encontrados: 12,
      resumo: { media: 110, mediana: 110, minimo: 100, maximo: 120, amostras: 3 },
      anuncios: [
        { fonte: "Mercado Livre", titulo: "Kingston DDR4 8GB", preco: 15, url: "https://x/1", entrou: false },
        { fonte: "Mercado Livre", titulo: "Kingston DDR4 8GB usada", preco: 100, url: "https://x/2", entrou: true },
        { fonte: "Buscapé", titulo: "Memória Kingston DDR4", preco: 110, url: "https://x/3", entrou: true },
        { fonte: "Buscapé", titulo: "Kingston Fury DDR4", preco: 120, url: "https://x/4", entrou: true },
      ],
      falhas: [],
    },
  },
  buscandoPreco: false,
};
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(salvarResumoUnidade).mockResolvedValue({ ok: true, data: null });
  vi.mocked(removerUnidade).mockResolvedValue({ ok: true, data: null });
});

describe("valores na lista de estoque", () => {
  it("mostra o custo cadastrado e o preço de mercado como estimativa", () => {
    render(<ListaEstoque itens={[item]} podeEditar podeExcluir />);
    expect(screen.getByText(/80,00/)).toBeTruthy();
    const mercado = screen.getByTitle(/estimativa buscada na internet/i);
    expect(mercado.textContent).toContain("110,00");
    expect(mercado.textContent).toContain("usado");
  });

  it("clicar no preço de mercado mostra os anúncios e a conta", async () => {
    const user = userEvent.setup();
    render(<ListaEstoque itens={[item]} podeEditar podeExcluir />);
    await user.click(
      screen.getByRole("button", { name: /ver como o preço de mercado/i }),
    );
    expect(screen.getByText("Como a conta foi feita")).toBeTruthy();
    expect(screen.getByText(/3 entraram na média/)).toBeTruthy();
    expect(screen.getByText(/descartado \(extremo\)/)).toBeTruthy();
    expect(screen.getByText("Kingston DDR4 8GB usada")).toBeTruthy();
  });

  it("avisa quando o custo não foi informado e quando a busca está rodando", () => {
    render(
      <ListaEstoque
        itens={[{ ...item, custo: null, buscandoPreco: true }]}
        podeEditar
        podeExcluir
      />,
    );
    expect(screen.getByText("não informado")).toBeTruthy();
    expect(screen.getByText(/buscando preço de mercado/i)).toBeTruthy();
  });
});

describe("ações da lista de estoque", () => {
  it("abre pelo valor e salva valores em reais e condição", async () => {
    const user = userEvent.setup();
    render(<ListaEstoque itens={[item]} podeEditar podeExcluir />);
    await user.click(
      screen.getByRole("button", { name: "Editar valor de venda de Memória DDR4" }),
    );
    const venda = screen.getByLabelText("Venda (R$)");
    await user.clear(venda);
    await user.type(venda, "149,90");
    await user.selectOptions(
      screen.getByLabelText("Estado da peça"),
      "LIKE_NEW",
    );
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() =>
      expect(salvarResumoUnidade).toHaveBeenCalledWith({
        id: "peca-1",
        condition: "LIKE_NEW",
        purchaseCost: 80,
        estimatedSalePrice: 149.9,
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
  it("exige confirmação e mostra bloqueio de histórico sem remover o item", async () => {
    vi.mocked(removerUnidade).mockResolvedValue({
      ok: false,
      error: "Esta peça já foi movimentada. Use descarte.",
    });
    const user = userEvent.setup();
    render(<ListaEstoque itens={[item]} podeEditar podeExcluir />);
    await user.click(
      screen.getByRole("button", { name: "Excluir Memória DDR4" }),
    );
    expect(removerUnidade).not.toHaveBeenCalled();
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Excluir peça",
      }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Use descarte",
    );
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("link", { name: /Memória DDR4/ })).toBeDefined();
  });
  it("cancelar a exclusão não chama o servidor", async () => {
    const user = userEvent.setup();
    render(<ListaEstoque itens={[item]} podeEditar podeExcluir />);
    await user.click(
      screen.getByRole("button", { name: "Excluir Memória DDR4" }),
    );
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(removerUnidade).not.toHaveBeenCalled();
  });
  it("oferece edição no menu de opções e no botão direito", async () => {
    const user = userEvent.setup();
    render(<ListaEstoque itens={[item]} podeEditar podeExcluir />);
    await user.click(
      screen.getByRole("button", { name: "Opções de Memória DDR4" }),
    );
    expect(
      await screen.findByRole("menuitem", { name: "Edição rápida" }),
    ).toBeDefined();
    await user.keyboard("{Escape}");
    fireEvent.contextMenu(screen.getByText("Memória DDR4"), {
      button: 2,
      clientX: 100,
      clientY: 100,
    });
    expect(
      await screen.findByRole("menuitem", { name: "Editar ficha completa" }),
    ).toBeDefined();
    await user.click(screen.getByRole("menuitem", { name: "Edição rápida" }));
    expect(await screen.findByRole("dialog")).toBeDefined();
  });
  it("consulta não recebe edição nem exclusão e descartada não recebe edição", () => {
    const { rerender } = render(
      <ListaEstoque itens={[item]} podeEditar={false} podeExcluir={false} />,
    );
    expect(screen.queryByRole("button", { name: /^Editar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Excluir/ })).toBeNull();
    rerender(
      <ListaEstoque
        itens={[{ ...item, status: "DISCARDED" }]}
        podeEditar
        podeExcluir
      />,
    );
    expect(screen.queryByRole("button", { name: /^Editar/ })).toBeNull();
  });
});
