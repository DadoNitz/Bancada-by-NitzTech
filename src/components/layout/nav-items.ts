import type { Permission } from "@/lib/auth/permissions";

/**
 * Estrutura de navegação (seção 12 da especificação).
 *
 * `disponivel: false` marca o que ainda não existe. Esses itens aparecem
 * apagados e sem link, com a fase a que pertencem — em vez de sumirem do menu
 * ou, pior, levarem a uma página vazia que parece defeito.
 */
export interface ItemDeNavegacao {
  titulo: string;
  href: string;
  /** Nome do ícone no lucide-react. */
  icone: string;
  permissao?: Permission;
  disponivel: boolean;
  fase?: string;
  filhos?: ItemDeNavegacao[];
}

export const NAVEGACAO: ItemDeNavegacao[] = [
  {
    titulo: "Dashboard",
    href: "/dashboard",
    icone: "LayoutDashboard",
    disponivel: true,
  },
  {
    titulo: "Estoque",
    href: "/estoque/itens",
    icone: "Package",
    disponivel: true,
    filhos: [
      { titulo: "Todos os itens", href: "/estoque/itens", icone: "List", disponivel: true },
      { titulo: "Vendas", href: "/estoque/vendas", icone: "ShoppingCart", disponivel: true },
      {
        titulo: "Adicionar peça",
        href: "/estoque/novo",
        icone: "Plus",
        permissao: "inventory:write",
        disponivel: true,
      },
      {
        titulo: "Movimentações",
        href: "/estoque/movimentacoes",
        icone: "ArrowLeftRight",
        disponivel: true,
      },
      {
        titulo: "Ler QR Code",
        href: "/estoque/ler",
        icone: "ScanLine",
        disponivel: true,
      },
      {
        titulo: "Etiquetas e QR Code",
        href: "/estoque/etiquetas",
        icone: "QrCode",
        permissao: "inventory:write",
        disponivel: true,
      },
      {
        titulo: "Marcas, locais e sócios",
        href: "/configuracoes",
        icone: "Tags",
        permissao: "catalog:write",
        disponivel: true,
      },
    ],
  },
  {
    titulo: "Sócios",
    href: "/socios",
    icone: "Users",
    disponivel: true,
  },
  {
    titulo: "Montagens",
    href: "/montagens",
    icone: "Cpu",
    disponivel: true,
    filhos: [
      {
        titulo: "Montar com meu estoque",
        href: "/montagens",
        icone: "Cpu",
        disponivel: true,
      },
      {
        titulo: "Minhas montagens",
        href: "/montagens/minhas",
        icone: "List",
        disponivel: true,
      },
    ],
  },
  {
    titulo: "Inteligência",
    href: "/inteligencia",
    icone: "Sparkles",
    permissao: "ai:use",
    disponivel: true,
    filhos: [
      {
        titulo: "Perguntar à IA",
        href: "/inteligencia",
        icone: "Sparkles",
        disponivel: true,
      },
      {
        titulo: "Análise do estoque",
        href: "/inteligencia/analise",
        icone: "FileBarChart",
        disponivel: true,
      },
    ],
  },
  {
    titulo: "Relatórios",
    href: "/relatorios",
    icone: "FileBarChart",
    permissao: "report:read",
    disponivel: true,
  },
  {
    titulo: "Promoções",
    href: "/promocoes",
    icone: "Tag",
    disponivel: true,
  },
  {
    titulo: "Configurações",
    href: "/configuracoes",
    icone: "Settings",
    permissao: "catalog:write",
    disponivel: true,
  },
  {
    titulo: "Usuários",
    href: "/configuracoes/usuarios",
    icone: "Users",
    permissao: "user:manage",
    disponivel: true,
  },
  {
    titulo: "Auditoria",
    href: "/auditoria",
    icone: "ScrollText",
    // So o administrador. Funcionario ve o proprio trabalho pelo historico da
    // peca; a trilha completa e ferramenta de conferencia, nao de operacao.
    permissao: "audit:read",
    disponivel: true,
  },
];

/**
 * Navegação inferior do celular (seção 33).
 *
 * Cinco itens no máximo: mais que isso reduz demais o alvo de toque. O botão
 * central de adicionar tem destaque por ser a ação mais frequente.
 */
export const NAVEGACAO_MOBILE: ItemDeNavegacao[] = [
  { titulo: "Início", href: "/dashboard", icone: "Home", disponivel: true },
  { titulo: "Estoque", href: "/estoque/itens", icone: "Package", disponivel: true },
  {
    titulo: "Adicionar",
    href: "/estoque/novo",
    icone: "Plus",
    permissao: "inventory:write",
    disponivel: true,
  },
  { titulo: "Montagens", href: "/montagens", icone: "Cpu", disponivel: true },
  { titulo: "Mais", href: "/mais", icone: "Menu", disponivel: true },
];
