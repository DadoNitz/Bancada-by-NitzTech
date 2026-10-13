# Estado Atual do Sistema

Produção: **https://bancada.cloud**

Todas as cinco fases do roadmap têm implementação funcionando. Este documento
registra o que existe, o que ficou de fora e por quê.

## O que está implementado

### Fase 1 — Inventário

| Recurso | Onde |
|---|---|
| Autenticação, três perfis, permissões | `/login`, `lib/auth/permissions.ts` |
| Cadastro de peça em 4 passos, com specs dinâmicas | `/estoque/novo` |
| Listagem com busca e filtros server-side | `/estoque/itens` |
| Detalhe da unidade (destino do QR Code) | `/estoque/itens/[id]` |
| Movimentações pela interface + histórico | `/estoque/movimentacoes` |
| Fotos com câmera do celular | detalhe da unidade |
| Extrato por sócio | `/socios` |
| Marcas, locais e sócios | `/configuracoes` |
| Edição de peça e do modelo | `/estoque/itens/[id]/editar` |
| Notificações push + verificação diária | `/configuracoes`, `/api/cron/alertas` |
| Dashboard | `/dashboard` |
| PWA completo | `manifest.ts`, `public/sw.js` |

### Fase 2 — Montagens

- Motor de compatibilidade com 16 regras determinísticas (`domain/compatibility/`)
- Sugestão de montagens a partir do estoque real (`/montagens`)
- Identificação de gargalos
- Montagens persistidas com **reserva** de peças (`/montagens/minhas`)
- Cancelamento devolve as peças; venda rateia o valor pelo custo

### Fase 3 — IA

- Camada desacoplada `AIProvider`, com Gemini implementado
- Chat com 8 ferramentas de consulta somente leitura (`/inteligencia`)
- Análise de negócio do estoque (`/inteligencia/analise`)
- Geração de anúncio para Marketplace, OLX, WhatsApp e Instagram
- Relatórios com período e exportação CSV (`/relatorios`)

### Fase 4 — Avançado

- Leitura de etiqueta por foto, preenchendo o cadastro
- Geração e impressão de etiquetas com QR Code (`/estoque/etiquetas`)
- Leitura de QR Code pela câmera (`/estoque/ler`)
- Exportação CSV

### Fase 5 — Promoções

- Cadastro de ofertas e histórico de preço (`/promocoes`)
- Avaliação pela IA comparando com o custo real de compra da operação
- **Bot de coleta pelo Telegram**, com pré-filtro determinístico e teto de
  cota (`services/telegram.service.ts`, `/api/cron/promocoes`) — ver seção
  própria abaixo

## Decisões que valem ser lembradas

**A IA nunca decide compatibilidade.** O motor determinístico produz o
veredito; o modelo só o traduz. A instrução do chat proíbe explicitamente
suavizar um "incompatível" ou promover um "precisa verificar".

**Dado ausente nunca vira "compatível".** Vira "precisa verificar", com o nome
do campo que falta preencher.

**Confirmar montagem reserva, não retira.** Cancelar devolve tudo. A saída
definitiva acontece só na venda.

**A saída da IA passa pela validação da entrada humana.** O que a leitura de
etiqueta extrai é validado contra o mesmo catálogo `SpecDefinition`. Spec
recusada é reportada, não descartada em silêncio.

**Nenhuma operação de estoque é otimista.** Sem conexão, a interface recusa e
avisa — nunca mostra como concluído o que o servidor não confirmou.

**O Service Worker não cacheia rota autenticada.** Cache Storage é por origem,
não por usuário: cachear resposta autenticada vazaria dados entre contas na
mesma máquina.

## O que ficou de fora, conscientemente

**Sincronização offline de escrita.** A especificação (seção 33) autoriza
deixar para depois, e a arquitetura não a impede. Enfileirar movimentação de
estoque sem mecanismo de resolução de conflito criaria inconsistência pior que
a ausência da funcionalidade.

**Remoção de fundo das fotos.** O campo `cutoutKey` existe no banco. Falta
escolher o provedor — a análise das duas opções está em `04-ROADMAP.md`.

**Busca com trigram (`pg_trgm`).** A busca atual usa `ILIKE`, adequada para a
ordem de grandeza real do estoque. O motivo de não ter entrado está em
`02-MODELAGEM.md`.

**Criação de categorias pela interface.** Categoria sem especificações
definidas produz formulário vazio e uma categoria que o motor de
compatibilidade não conhece. Elas nascem do catálogo versionado em código,
aplicado pelo seed.

## Notificações push

Web Push com VAPID. A chave pública vai ao navegador de propósito — é pública
por definição; a privada nunca sai do servidor. O conteúdo é cifrado com as
chaves da própria inscrição, então nem o serviço de push do navegador o lê.
Ainda assim, nada de sensível vai no corpo: a notificação diz o que aconteceu e
leva à tela, e o detalhe fica atrás do login.

A permissão só é pedida quando a pessoa clica. Pedir na abertura da página é o
caminho mais curto para o "Bloquear" — e depois de bloqueado não há como pedir
de novo.

Uma verificação por dia, às 8h de São Paulo, disparada pelo agendamento da
Vercel: estoque baixo, peças com defeito e reservas paradas há mais de 15 dias.
Só notifica quando há algo a dizer.

A rota do agendamento é pública no proxy (o agendador não tem sessão) mas tem
autorização própria por segredo. Verificável com `npm run cron:check`, que
confere as três situações: sem autorização, com segredo errado e com o certo.

## Bot de promoções (Telegram)

Ofertas entram por um grupo de Telegram seu, não por raspagem de site — a
seção 26 proíbe, e com razão: raspador viola termos de uso, quebra a cada
mudança de layout e rende bloqueio de IP.

Um bot só lê grupos onde foi adicionado. Essa limitação virou o desenho: você
encaminha para o grupo do bot as ofertas dos grupos que já acompanha, e o
sistema faz o resto — extrai, compara com o que você **realmente pagou** na
peça, e avisa só quando vale a pena.

### Como ligar

1. No Telegram, fale com **@BotFather** e envie `/newbot`.
2. Copie o token e coloque no `.env`:
   `TELEGRAM_BOT_TOKEN=123456:ABC-DEF...`
3. **Desligue o modo privacidade** — este é o passo que quase todo mundo
   esquece, e sem ele o bot não lê nada:
   `@BotFather → /mybots → o bot → Bot Settings → Group Privacy → Turn off`
4. Crie um grupo, adicione o bot. Se já tinha adicionado antes do passo 3,
   **remova e adicione de novo** — a mudança só vale a partir da nova entrada.
5. Confira: `npm run telegram`. O script diz exatamente em qual passo parou.
6. Em produção, defina `TELEGRAM_BOT_TOKEN` também na Vercel.

### Como roda

Uma vez ao dia pelo agendamento (`0 12 * * *` UTC = 9h em São Paulo), e sob
demanda pelo botão **Buscar ofertas** na tela de promoções.

O `offset` de leitura fica no banco (`AppSetting`), então as duas vias
convivem: o que uma processou, a outra não relê. E o offset só avança sobre o
que foi de fato processado — se um ciclo para no meio, as mensagens restantes
voltam na próxima, em vez de sumirem.

A coleta é registrada na auditoria como ação **do sistema**, com autor nulo.
Atribuí-la a um administrador diria que uma pessoa fez o que a máquina fez.

### Coletor automático de canais (opcional, roda fora da Vercel)

Um bot **não** consegue ler canal de terceiro: só recebe mensagens de chats
onde foi adicionado (e num canal, só um admin adiciona), e a API de bots nem
tem método para ler histórico. Para acompanhar PC do Fafa, Fraguas e afins o
único caminho é a API de cliente (MTProto), com a **sua conta**.

```
npm run telegram:login     # uma vez; grava a sessão no .env
npm run telegram:canais    # lista canais e ids, para configurar sem errar
npm run telegram:coletar   # uma passada
npm run telegram:coletar -- --continuo
```

**O que ele faz:** lê os canais, aplica o mesmo `valeChamarIA` do bot, e
reencaminha o que sobra para o grupo. Só isso. Não fala com IA, não escreve
no banco, não avalia preço — o `@notztech_bot` continua fazendo tudo isso a
partir do grupo, com o código que já existia.

A separação é o ponto: este é o componente que roda com a conta pessoal, e
componente arriscado tem que ser pequeno. Parar de rodá-lo não quebra nada —
volta-se a encaminhar na mão.

**O risco, dito claramente:** a `TELEGRAM_SESSION` **é** a conta. Quem tiver
ela lê conversas privadas e envia mensagem no seu nome, e ela não expira
sozinha. Fica no `.env` (coberto pelo `.gitignore`) e nunca é impressa no
terminal. Revogar: Telegram → Ajustes → Dispositivos → encerrar sessão.

Automação de conta pessoal é zona cinzenta no ToS do Telegram. Por isso o
coletor só lê e reencaminha, com teto de 25 reencaminhos por passada, 2,5s
entre cada um, e parada imediata quando o Telegram pede `FloodWait`.

## Restrições operacionais conhecidas

**A cota gratuita do Gemini varia MUITO por modelo.** Medido na chave em uso:
`gemini-3.6-flash` (interativo) parou em **20 requisições/dia**;
`gemini-3.5-flash-lite` (lote) passou de 24 seguidas sem reclamar, e a
documentação aponta para a casa do milhar. Consequências no sistema:

- Um **pré-filtro determinístico** (`src/domain/promotions/pre-filtro.ts`)
  descarta ~9 de 12 mensagens típicas de grupo antes de gastar chamada. Ele
  erra de propósito para o lado de deixar passar: um falso positivo custa uma
  chamada, um falso negativo perde uma oferta em silêncio.
- **Modelos separados por finalidade.** `AI_MODEL` atende quem está esperando
  na tela (etiqueta, chat, descrição); `AI_MODEL_LOTE` atende o bot de
  promoções. A cota é contada por modelo, então um dia agitado no grupo não
  pode derrubar a leitura de etiqueta.
- Os testes que chamam o modelo são **opt-in** (`TESTAR_IA=1`). Sem isso eles
  queimavam a cota do dia na suíte normal e falhavam por 429 — uma falha que
  não diz nada sobre o código.
- O teto da coleta **não** é um número de mensagens, e sim um orçamento de
  tempo (`ORCAMENTO_DE_TEMPO_MS`): a função da Vercel morre em 300s, e ser
  morto no meio é pior que parar sozinho — o offset não é gravado e o ciclo
  inteiro é refeito, pagando de novo por tudo.

Ao estourar, o sistema mostra "limite de requisições atingido" em vez de um
erro genérico.

**O plano Hobby da Vercel permite dois agendamentos, uma execução diária
cada.** Os dois estão em uso: alertas de estoque e coleta de promoções.

**O Neon suspende o compute quando ocioso.** A primeira consulta depois de um
tempo parado falha; o sistema repete automaticamente até 3 vezes.

**`vercel.app` pode não resolver em alguns DNS.** Aconteceu na máquina de
desenvolvimento. O script de fumaça tem fallback para DNS público.

## Verificação

```
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # 209 testes (11 de IA e integração são opt-in)
npm run build       # build de produção
npm run smoke       # login real + rotas em produção
npm run cron:check  # autorização e execução do agendamento diário
npm run telegram    # diagnóstico do bot de promoções
npm run extrato     # extrato por sócio
npm run db:check    # DNS, autenticação e permissões do banco
```
