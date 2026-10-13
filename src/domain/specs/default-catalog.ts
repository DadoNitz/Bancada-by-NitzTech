import type { CategoryDefinition } from "./types";

/**
 * Catálogo padrão de categorias e especificações.
 *
 * É a semente do sistema: o seed grava estas definições no banco, e a partir
 * daí elas viram dado editável — categorias novas passam a ser cadastro, não
 * migration (seção 3 da especificação).
 *
 * Vocabulários controlados existem por um motivo específico: as regras de
 * compatibilidade comparam valores por igualdade. Se "AM4", "am4" e
 * "Socket AM4" convivessem, a regra falharia em silêncio e o sistema
 * afirmaria incompatibilidade onde não há — ou pior, o contrário.
 */

/**
 * Inclui plataformas antigas e HEDT porque o estoque é de usado: X99 chinesa
 * (LGA2011-3) e Xeon de servidor aparecem toda semana.
 */
export const SOCKETS = [
  "AM5",
  "AM4",
  "AM3+",
  "AM3",
  "AM2+",
  "FM2+",
  "FM2",
  "FM1",
  "TR4",
  "sTRX4",
  "LGA1851",
  "LGA1700",
  "LGA1200",
  "LGA1151",
  "LGA1150",
  "LGA1155",
  "LGA1156",
  "LGA775",
  "LGA1366",
  "LGA2011",
  "LGA2011-3",
  "LGA2066",
] as const;

const AJUDA_SOCKET =
  "Precisa ser idêntico ao socket da placa-mãe. X99 = LGA2011-3, X79 = LGA2011, X299 = LGA2066.";

export const TIPOS_MEMORIA = ["DDR3", "DDR4", "DDR5"] as const;

/**
 * Formatos de placa-mãe, do menor para o maior.
 *
 * A ordem importa: um gabinete que aceita ATX também aceita Micro-ATX e
 * Mini-ITX. O motor de compatibilidade compara os índices desta lista em vez
 * de exigir que o usuário marque todos os formatos suportados.
 */
export const FORMATOS_PLACA_MAE = [
  "Mini-ITX",
  "Micro-ATX",
  "ATX",
  "E-ATX",
] as const;

export const CONECTORES_PCIE = [
  "Nenhum",
  "1x 6 pinos",
  "1x 8 pinos",
  "1x 6+2 pinos",
  "2x 8 pinos",
  "3x 8 pinos",
  "1x 12VHPWR",
] as const;

export const INTERFACES_ARMAZENAMENTO = [
  "SATA III",
  "NVMe PCIe 3.0",
  "NVMe PCIe 4.0",
  "NVMe PCIe 5.0",
  "IDE/PATA",
  "USB",
] as const;

export const CATALOGO_PADRAO: readonly CategoryDefinition[] = [
  {
    slug: "cpu",
    name: "Processadores",
    icon: "Cpu",
    sortOrder: 10,
    specs: [
      {
        key: "socket",
        label: "Socket",
        type: "ENUM",
        options: SOCKETS,
        required: true,
        usedInCompatibility: true,
        helpText: AJUDA_SOCKET,
      },
      { key: "cores", label: "Núcleos", type: "NUMBER", min: 1, max: 128 },
      { key: "threads", label: "Threads", type: "NUMBER", min: 1, max: 256 },
      {
        key: "baseClockGhz",
        label: "Clock base",
        type: "NUMBER",
        unit: "GHz",
        min: 0.5,
        max: 7,
      },
      {
        key: "boostClockGhz",
        label: "Clock turbo",
        type: "NUMBER",
        unit: "GHz",
        min: 0.5,
        max: 7,
      },
      {
        key: "tdpWatts",
        label: "TDP",
        type: "NUMBER",
        unit: "W",
        min: 1,
        max: 500,
        usedInCompatibility: true,
        helpText: "Usado para estimar o consumo e a fonte recomendada.",
      },
      { key: "generation", label: "Geração", type: "STRING" },
      {
        key: "integratedGraphics",
        label: "Vídeo integrado",
        type: "BOOLEAN",
        usedInCompatibility: true,
        helpText: "Sem vídeo integrado, a montagem exige placa de vídeo.",
      },
      { key: "includesCooler", label: "Acompanha cooler", type: "BOOLEAN" },
    ],
  },
  {
    slug: "motherboard",
    name: "Placas-mãe",
    icon: "CircuitBoard",
    sortOrder: 20,
    specs: [
      {
        key: "socket",
        label: "Socket",
        type: "ENUM",
        options: SOCKETS,
        required: true,
        usedInCompatibility: true,
        helpText: AJUDA_SOCKET,
      },
      { key: "chipset", label: "Chipset", type: "STRING" },
      {
        key: "formFactor",
        label: "Formato",
        type: "ENUM",
        options: FORMATOS_PLACA_MAE,
        required: true,
        usedInCompatibility: true,
      },
      {
        key: "memoryType",
        label: "Tipo de memória",
        type: "ENUM",
        options: TIPOS_MEMORIA,
        required: true,
        usedInCompatibility: true,
      },
      {
        key: "ramSlots",
        label: "Slots de RAM",
        type: "NUMBER",
        min: 1,
        max: 8,
        usedInCompatibility: true,
      },
      {
        key: "maxRamGb",
        label: "RAM máxima",
        type: "NUMBER",
        unit: "GB",
        min: 1,
        max: 4096,
        usedInCompatibility: true,
      },
      {
        key: "maxMemorySpeedMhz",
        label: "Frequência máxima de memória",
        type: "NUMBER",
        unit: "MHz",
        min: 800,
        max: 12000,
      },
      { key: "pcieSlots", label: "Slots PCIe", type: "NUMBER", min: 0, max: 8 },
      {
        key: "m2Slots",
        label: "Slots M.2",
        type: "NUMBER",
        min: 0,
        max: 8,
        usedInCompatibility: true,
      },
      {
        key: "sataPorts",
        label: "Portas SATA",
        type: "NUMBER",
        min: 0,
        max: 12,
        usedInCompatibility: true,
      },
      {
        key: "biosUpdateNeededFor",
        label: "Exige BIOS atualizada para",
        type: "STRING",
        helpText:
          "Ex.: 'Ryzen 5000'. Faz a compatibilidade cair para 'precisa verificar'.",
        usedInCompatibility: true,
      },
    ],
  },
  {
    slug: "ram",
    name: "Memórias RAM",
    icon: "MemoryStick",
    sortOrder: 30,
    specs: [
      {
        key: "memoryType",
        label: "Tipo",
        type: "ENUM",
        options: TIPOS_MEMORIA,
        required: true,
        usedInCompatibility: true,
      },
      {
        key: "capacityGb",
        label: "Capacidade por módulo",
        type: "NUMBER",
        unit: "GB",
        required: true,
        min: 1,
        max: 256,
        usedInCompatibility: true,
      },
      {
        key: "modules",
        label: "Módulos no kit",
        type: "NUMBER",
        min: 1,
        max: 8,
        usedInCompatibility: true,
        helpText: "Um kit 2x8 GB ocupa 2 slots.",
      },
      {
        key: "speedMhz",
        label: "Frequência",
        type: "NUMBER",
        unit: "MHz",
        min: 800,
        max: 12000,
      },
      { key: "casLatency", label: "Latência CAS", type: "NUMBER", min: 5, max: 60 },
      {
        key: "formFactor",
        label: "Formato",
        type: "ENUM",
        options: ["DIMM", "SO-DIMM"],
        usedInCompatibility: true,
        helpText: "SO-DIMM é de notebook e não entra em placa de desktop.",
      },
      { key: "eccSupport", label: "ECC", type: "BOOLEAN" },
    ],
  },
  {
    slug: "gpu",
    name: "Placas de vídeo",
    icon: "MonitorPlay",
    sortOrder: 40,
    specs: [
      { key: "gpuChip", label: "GPU", type: "STRING" },
      {
        key: "vramGb",
        label: "VRAM",
        type: "NUMBER",
        unit: "GB",
        min: 1,
        max: 128,
      },
      { key: "vramType", label: "Tipo de memória", type: "STRING" },
      {
        key: "tdpWatts",
        label: "Consumo aproximado",
        type: "NUMBER",
        unit: "W",
        min: 5,
        max: 900,
        usedInCompatibility: true,
      },
      {
        key: "powerConnectors",
        label: "Conectores de alimentação",
        type: "MULTI_ENUM",
        options: CONECTORES_PCIE,
        usedInCompatibility: true,
        helpText: "A fonte precisa ter estes conectores disponíveis.",
      },
      {
        key: "lengthMm",
        label: "Comprimento",
        type: "NUMBER",
        unit: "mm",
        min: 100,
        max: 500,
        usedInCompatibility: true,
      },
      { key: "slotWidth", label: "Largura em slots", type: "NUMBER", min: 1, max: 4 },
      { key: "interface", label: "Interface", type: "STRING" },
    ],
  },
  {
    slug: "storage",
    name: "Armazenamento",
    icon: "HardDrive",
    sortOrder: 50,
    specs: [
      {
        key: "driveType",
        label: "Tipo",
        type: "ENUM",
        options: ["SSD", "HDD"],
        required: true,
        usedInCompatibility: true,
      },
      {
        key: "capacityGb",
        label: "Capacidade",
        type: "NUMBER",
        unit: "GB",
        required: true,
        min: 1,
        max: 262144,
      },
      {
        key: "interface",
        label: "Interface",
        type: "ENUM",
        options: INTERFACES_ARMAZENAMENTO,
        required: true,
        usedInCompatibility: true,
        helpText: "Define se ocupa porta SATA ou slot M.2.",
      },
      {
        key: "formFactor",
        label: "Formato",
        type: "ENUM",
        options: ['2.5"', '3.5"', "M.2 2280", "M.2 2242", "M.2 2230", "mSATA"],
        usedInCompatibility: true,
      },
      {
        key: "healthPct",
        label: "Saúde do disco",
        type: "NUMBER",
        unit: "%",
        min: 0,
        max: 100,
        helpText: "Quando disponível (SMART). Vazio significa não verificado.",
      },
      { key: "powerOnHours", label: "Horas ligado", type: "NUMBER", min: 0 },
    ],
  },
  {
    slug: "psu",
    name: "Fontes",
    icon: "Plug",
    sortOrder: 60,
    specs: [
      {
        key: "wattage",
        label: "Potência",
        type: "NUMBER",
        unit: "W",
        required: true,
        min: 100,
        max: 2000,
        usedInCompatibility: true,
      },
      {
        key: "certification",
        label: "Certificação",
        type: "ENUM",
        options: [
          "Sem certificação",
          "80 Plus White",
          "80 Plus Bronze",
          "80 Plus Silver",
          "80 Plus Gold",
          "80 Plus Platinum",
          "80 Plus Titanium",
        ],
      },
      {
        key: "modularity",
        label: "Modularidade",
        type: "ENUM",
        options: ["Não modular", "Semi-modular", "Modular"],
      },
      {
        key: "pcieConnectors",
        label: "Conectores PCIe disponíveis",
        type: "MULTI_ENUM",
        options: CONECTORES_PCIE,
        usedInCompatibility: true,
      },
      {
        key: "sataConnectors",
        label: "Conectores SATA",
        type: "NUMBER",
        min: 0,
        max: 16,
        usedInCompatibility: true,
      },
      {
        key: "formFactor",
        label: "Formato",
        type: "ENUM",
        options: ["ATX", "SFX", "SFX-L", "TFX"],
        usedInCompatibility: true,
      },
    ],
  },
  {
    slug: "case",
    name: "Gabinetes",
    icon: "Box",
    sortOrder: 70,
    specs: [
      {
        key: "maxMotherboardFormFactor",
        label: "Maior placa-mãe suportada",
        type: "ENUM",
        options: FORMATOS_PLACA_MAE,
        required: true,
        usedInCompatibility: true,
        helpText:
          "Aceitar ATX implica aceitar Micro-ATX e Mini-ITX — não é preciso marcar todos.",
      },
      {
        key: "maxGpuLengthMm",
        label: "Comprimento máximo da GPU",
        type: "NUMBER",
        unit: "mm",
        min: 100,
        max: 600,
        usedInCompatibility: true,
      },
      {
        key: "maxCoolerHeightMm",
        label: "Altura máxima do cooler",
        type: "NUMBER",
        unit: "mm",
        min: 20,
        max: 250,
        usedInCompatibility: true,
      },
      {
        key: "psuFormFactor",
        label: "Formato de fonte",
        type: "ENUM",
        options: ["ATX", "SFX", "SFX-L", "TFX"],
        usedInCompatibility: true,
      },
      { key: "fanSlots", label: "Ventoinhas suportadas", type: "NUMBER", min: 0, max: 16 },
      { key: "includedFans", label: "Ventoinhas inclusas", type: "NUMBER", min: 0, max: 16 },
      {
        key: "radiatorSupportMm",
        label: "Radiadores suportados",
        type: "MULTI_ENUM",
        options: ["120 mm", "140 mm", "240 mm", "280 mm", "360 mm"],
        usedInCompatibility: true,
      },
      { key: "bays25", label: 'Baias 2.5"', type: "NUMBER", min: 0, max: 12 },
      { key: "bays35", label: 'Baias 3.5"', type: "NUMBER", min: 0, max: 12 },
    ],
  },
  {
    slug: "cooler",
    name: "Coolers e Water Coolers",
    icon: "Fan",
    sortOrder: 80,
    specs: [
      {
        key: "coolerType",
        label: "Tipo",
        type: "ENUM",
        options: ["Air cooler", "Water cooler (AIO)", "Cooler stock"],
        required: true,
        usedInCompatibility: true,
      },
      {
        key: "socketSupport",
        label: "Sockets suportados",
        type: "MULTI_ENUM",
        options: SOCKETS,
        required: true,
        usedInCompatibility: true,
        helpText: "Um cooler costuma servir a vários sockets.",
      },
      {
        key: "heightMm",
        label: "Altura",
        type: "NUMBER",
        unit: "mm",
        min: 20,
        max: 250,
        usedInCompatibility: true,
        helpText: "Air cooler: precisa caber na altura interna do gabinete.",
      },
      {
        key: "radiatorSizeMm",
        label: "Tamanho do radiador",
        type: "ENUM",
        options: ["120 mm", "140 mm", "240 mm", "280 mm", "360 mm"],
        usedInCompatibility: true,
      },
      {
        key: "tdpRatingWatts",
        label: "TDP suportado",
        type: "NUMBER",
        unit: "W",
        min: 10,
        max: 500,
        usedInCompatibility: true,
      },
    ],
  },
  {
    slug: "fan",
    name: "Ventoinhas",
    icon: "Fan",
    sortOrder: 90,
    specs: [
      {
        key: "sizeMm",
        label: "Tamanho",
        type: "ENUM",
        options: ["80 mm", "92 mm", "120 mm", "140 mm", "200 mm"],
        required: true,
      },
      {
        key: "connector",
        label: "Conector",
        type: "ENUM",
        options: ["3 pinos", "4 pinos (PWM)", "Molex", "ARGB 3 pinos"],
      },
      { key: "rpm", label: "Rotação máxima", type: "NUMBER", unit: "RPM", min: 200, max: 6000 },
      { key: "rgb", label: "RGB", type: "BOOLEAN" },
    ],
  },
  {
    slug: "notebook",
    name: "Notebooks",
    icon: "Laptop",
    sortOrder: 100,
    specs: [
      { key: "cpuModel", label: "Processador", type: "STRING" },
      { key: "ramGb", label: "Memória RAM", type: "NUMBER", unit: "GB", min: 1, max: 256 },
      { key: "memoryType", label: "Tipo de memória", type: "ENUM", options: TIPOS_MEMORIA },
      { key: "storageGb", label: "Armazenamento", type: "NUMBER", unit: "GB", min: 1 },
      { key: "gpuModel", label: "Placa de vídeo", type: "STRING" },
      { key: "screenInches", label: "Tela", type: "NUMBER", unit: '"', min: 7, max: 22 },
      { key: "batteryHealthPct", label: "Saúde da bateria", type: "NUMBER", unit: "%", min: 0, max: 100 },
      { key: "operatingSystem", label: "Sistema operacional", type: "STRING" },
    ],
  },
  {
    slug: "desktop",
    name: "Computadores completos",
    icon: "Computer",
    sortOrder: 110,
    specs: [
      { key: "cpuModel", label: "Processador", type: "STRING" },
      { key: "ramGb", label: "Memória RAM", type: "NUMBER", unit: "GB", min: 1, max: 1024 },
      { key: "storageGb", label: "Armazenamento", type: "NUMBER", unit: "GB", min: 1 },
      { key: "gpuModel", label: "Placa de vídeo", type: "STRING" },
      { key: "operatingSystem", label: "Sistema operacional", type: "STRING" },
    ],
  },
  {
    slug: "monitor",
    name: "Monitores",
    icon: "Monitor",
    sortOrder: 120,
    specs: [
      { key: "sizeInches", label: "Tamanho", type: "NUMBER", unit: '"', min: 10, max: 90 },
      {
        key: "resolution",
        label: "Resolução",
        type: "ENUM",
        options: ["1366x768", "1600x900", "1920x1080", "2560x1080", "2560x1440", "3440x1440", "3840x2160"],
      },
      { key: "refreshRateHz", label: "Taxa de atualização", type: "NUMBER", unit: "Hz", min: 24, max: 540 },
      { key: "panelType", label: "Painel", type: "ENUM", options: ["TN", "IPS", "VA", "OLED"] },
      {
        key: "inputs",
        label: "Entradas",
        type: "MULTI_ENUM",
        options: ["VGA", "DVI", "HDMI", "DisplayPort", "USB-C"],
      },
    ],
  },
  {
    slug: "peripheral",
    name: "Periféricos",
    icon: "Keyboard",
    sortOrder: 130,
    specs: [
      {
        key: "peripheralType",
        label: "Tipo",
        type: "ENUM",
        options: ["Teclado", "Mouse", "Headset", "Webcam", "Caixa de som", "Microfone", "Mousepad", "Outro"],
        required: true,
      },
      { key: "connection", label: "Conexão", type: "ENUM", options: ["USB", "PS/2", "Bluetooth", "Wireless 2.4 GHz", "P2"] },
      { key: "rgb", label: "RGB", type: "BOOLEAN" },
    ],
  },
  {
    slug: "cable",
    name: "Cabos e Adaptadores",
    icon: "Cable",
    sortOrder: 140,
    specs: [
      {
        key: "cableType",
        label: "Tipo",
        type: "ENUM",
        options: ["SATA", "Molex", "PCIe", "HDMI", "DisplayPort", "VGA", "DVI", "USB", "Rede", "Energia", "Adaptador", "Outro"],
        required: true,
      },
      { key: "lengthCm", label: "Comprimento", type: "NUMBER", unit: "cm", min: 1, max: 3000 },
    ],
  },
  {
    slug: "network",
    name: "Rede",
    icon: "Network",
    sortOrder: 150,
    specs: [
      {
        key: "deviceType",
        label: "Tipo",
        type: "ENUM",
        options: ["Roteador", "Switch", "Placa de rede", "Adaptador Wi-Fi", "Repetidor", "Outro"],
        required: true,
      },
      { key: "speedMbps", label: "Velocidade", type: "NUMBER", unit: "Mbps", min: 10, max: 100000 },
      { key: "ports", label: "Portas", type: "NUMBER", min: 0, max: 64 },
      { key: "wifi", label: "Wi-Fi", type: "BOOLEAN" },
    ],
  },
  {
    slug: "misc",
    name: "Diversos",
    icon: "Package",
    sortOrder: 200,
    specs: [],
  },
] as const;

/** Slugs usados pelo motor de compatibilidade ao montar um computador. */
export const SLUGS_DE_MONTAGEM = [
  "cpu",
  "motherboard",
  "ram",
  "gpu",
  "storage",
  "psu",
  "case",
  "cooler",
] as const;

export type SlugDeMontagem = (typeof SLUGS_DE_MONTAGEM)[number];
