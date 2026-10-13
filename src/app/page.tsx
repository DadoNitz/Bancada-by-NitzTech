import { ArrowRight, Cpu, House, Menu, Package, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";

import { BrandMark, BrandWordmark } from "@/components/layout/brand";
import { LandingMotion } from "@/components/landing/landing-motion";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { auth } from "@/lib/auth";

import "@/components/landing/landing.css";

export const metadata: Metadata = {
  title: { absolute: "Bancada · estoque e montagem de PCs" },
};

const TITULO = ["Cada", "peça", "na", "bancada"];
const TITULO_FIM = ["sabe", "quanto", "custou", "e", "pra", "onde", "vai."];

const PECAS = [
  "Ryzen 5 5500",
  "RX 580 2048SP",
  "A520M-A Pro",
  "RTX 2060 EVGA",
  "RX 6600 XT",
  "i7 3770",
  "B450 Pro4",
  "Xeon",
  "WD Green 480GB",
  "Water cooler 240mm",
];

/**
 * Página inicial pública: apresenta o sistema e leva pra dentro.
 *
 * Quem já tem sessão vê "Abrir o sistema" (vai direto ao dashboard); quem não
 * tem vê "Entrar" (login). Nada de dado do estoque aparece aqui: a página é
 * pública, então o mockup e os números são ilustrativos.
 */
export default async function Home() {
  const sessao = await auth();
  const logado = Boolean(sessao?.user);
  const destino = logado ? "/dashboard" : "/login";
  const rotulo = logado ? "Abrir o sistema" : "Entrar no sistema";

  return (
    <div className="lp">
      <header className="nav">
        <div className="wrap">
          <Link className="brand" href="/" aria-label="Bancada, início">
            <BrandMark className="size-9" />
            <BrandWordmark className="text-2xl" />
          </Link>
          <span className="sp" />
          <ThemeToggle />
          <Link className="btn btn-led" href={destino}>
            {logado ? "Abrir" : "Entrar"}
          </Link>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="wrap">
            <div>
              <div className="eyebrow" style={{ marginBottom: 18 }}>
                Estoque e montagem de PCs
              </div>
              <h1>
                {TITULO.map((w) => (
                  <Fragment key={w}>
                    <span className="w-out">
                      <span className="w">{w}</span>
                    </span>{" "}
                  </Fragment>
                ))}
                <span className="tag">EST-00074</span>{" "}
                {TITULO_FIM.map((w) => (
                  <Fragment key={w}>
                    <span className="w-out">
                      <span className="w">{w}</span>
                    </span>{" "}
                  </Fragment>
                ))}
              </h1>
              <p className="lead">
                O sistema do Dado e do Tiago pra cadastrar peça usada, montar
                PC, acompanhar o preço de mercado e ver o lucro de cada venda.
                Feito pra abrir no celular, do lado da peça.
              </p>
              <div className="cta-row">
                <Link className="btn btn-led magnet" href={destino}>
                  {rotulo}
                  <ArrowRight className="size-[18px]" strokeWidth={2.2} aria-hidden />
                </Link>
                <a className="btn btn-ghost" href="#fluxo">
                  Como funciona
                </a>
              </div>
              <div className="hero-meta">
                <span>
                  <b>EST-</b> código automático
                </span>
                <span>
                  <b>2</b> temas
                </span>
                <span>
                  <b>PWA</b> instala no celular
                </span>
              </div>
            </div>

            <div className="phone-stage" aria-label="Prévia ilustrativa da tela inicial do app">
              <div className="phone" id="lp-phone">
                <div className="screen" aria-hidden>
                  <div className="s-top">
                    <div className="s-av">D</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10.5, color: "var(--lp-mut)" }}>sexta, 9 de outubro</div>
                      <div className="s-hi">Boa noite, Dado</div>
                    </div>
                  </div>
                  <div className="s-hero">
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--hero-muted)" }}>
                      <span>Disponível agora</span>
                      <span className="mono">exemplo</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span className="s-num">63</span>
                      <span style={{ fontWeight: 500 }}>peças</span>
                    </div>
                    <div className="s-tiles">
                      <div>
                        <b>3</b>PCs prontos
                      </div>
                      <div>
                        <b>38</b>avulsas
                      </div>
                      <div>
                        <b>1</b>vendido
                      </div>
                    </div>
                  </div>
                  {[
                    ["PC Fan Branca", "R5 5500 · RX 580 · 16GB"],
                    ["PC Branco", "i5 7400 · RX 580 · 16GB"],
                    ["PC Escritório", "i7 3770 · RX 550 · DDR3"],
                  ].map(([nome, spec]) => (
                    <div key={nome} className="s-row">
                      <div className="n">
                        <b>{nome}</b>
                        <span>{spec}</span>
                      </div>
                      <span className="chip">
                        <i />
                        Montado
                      </span>
                    </div>
                  ))}
                  <div className="s-bar">
                    <span className="on">
                      <House className="size-4" />
                    </span>
                    <Package className="size-[18px]" />
                    <span className="fab">
                      <Plus className="size-5" strokeWidth={2.4} />
                    </span>
                    <Cpu className="size-[18px]" />
                    <Menu className="size-[18px]" />
                  </div>
                </div>
              </div>
              <div className="float-card ref" data-float="1">
                <span className="k">RX 560 4GB · ref.</span>
                <span className="v est">média ML + OLX</span>
              </div>
              <div className="float-card code" data-float="-1">
                <span className="k">PC Fan Branca</span>
                <span className="v">8 peças</span>
              </div>
            </div>
          </div>
        </section>

        <div className="marquee" aria-hidden>
          <div className="track" id="lp-track">
            {[...PECAS, ...PECAS].map((p, i) => (
              <span key={i}>{p}</span>
            ))}
          </div>
        </div>

        <section id="fluxo">
          <div className="wrap">
            <div className="sec-head">
              <h2>Do caixote ao anúncio, em quatro passos.</h2>
              <p>
                A mesma peça atravessa o sistema inteiro. O código de etiqueta
                acompanha ela até a venda.
              </p>
            </div>
            <div className="flow" id="lp-flow">
              <div className="flow-line" aria-hidden>
                <i id="lp-flow-fill" />
              </div>
              <div className="step">
                <div className="dot">1</div>
                <h3>Cadastra</h3>
                <p>Foto, categoria e condição. O código sai sozinho e o custo pode vir depois.</p>
                <span className="ex">EST-00074 · GPU · usada</span>
              </div>
              <div className="step">
                <div className="dot">2</div>
                <h3>Precifica</h3>
                <p>
                  Um worker busca anúncios de usado no Mercado Livre e na OLX e
                  guarda a média como referência.
                </p>
                <span className="ex">ref. = média de vários anúncios</span>
              </div>
              <div className="step">
                <div className="dot">3</div>
                <h3>Monta</h3>
                <p>
                  Escolhe as peças da montagem. O custo do PC soma sozinho e
                  avisa o que ainda está sem preço.
                </p>
                <span className="ex">PC Fan Branca · 8 peças</span>
              </div>
              <div className="step">
                <div className="dot">4</div>
                <h3>Vende</h3>
                <p>
                  A IA escreve o anúncio com as specs. Ao vender, o lucro
                  aparece por montagem e por sócio.
                </p>
                <span className="ex">custo → venda → lucro</span>
              </div>
            </div>
          </div>
        </section>

        <section style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="sec-head">
              <h2>Feito pro jeito que vocês trabalham.</h2>
              <p>Nada de planilha no PC. Tudo abre rápido no celular, com o polegar, em qualquer luz.</p>
            </div>
            <div className="bento">
              <article className="cell c-ref">
                <span className="eyebrow">Preço de referência</span>
                <h3>A estimativa parece estimativa.</h3>
                <p>
                  O custo real fica firme. O valor de mercado fica em cinza,
                  com borda tracejada e o rótulo &quot;ref.&quot;, pra ninguém
                  confundir o que foi pago com o que o mercado está pedindo.
                </p>
                <div className="ref-demo">
                  <div className="box">
                    <div className="k">Custo · pago pelo Tiago</div>
                    <div className="v">R$ 350</div>
                  </div>
                  <div className="box est">
                    <div className="k">
                      Referência <span className="pill">ref.</span>
                    </div>
                    <div className="v">calculando…</div>
                  </div>
                </div>
              </article>
              <article className="cell c-code">
                <span className="eyebrow">Etiqueta</span>
                <h3>Um código por peça.</h3>
                <p>Busca pelo código, pelo nome ou pela spec.</p>
                <div className="bigcode">
                  EST-<em>000</em>74
                </div>
              </article>
              <article className="cell c-build">
                <span className="eyebrow">Montagens</span>
                <h3>O PC sabe do que é feito.</h3>
                <p>Cada peça tem papel e custo. Faltou preço, aparece em laranja.</p>
                <div className="parts">
                  <div>
                    <span className="r">CPU</span>
                    <span className="n">Ryzen 5 5500</span>
                    <span className="c">R$ 510</span>
                  </div>
                  <div>
                    <span className="r">GPU</span>
                    <span className="n">RX 580 2048SP</span>
                    <span className="c no">sem custo</span>
                  </div>
                  <div>
                    <span className="r">PLACA</span>
                    <span className="n">A520M-A Pro</span>
                    <span className="c no">sem custo</span>
                  </div>
                </div>
              </article>
              <article className="cell c-socios">
                <span className="eyebrow">Sócios</span>
                <h3>Quem pagou o quê.</h3>
                <p>Cada peça registra quem comprou. Na venda, a conta de cada um já fecha.</p>
                <div className="socios">
                  <div className="socio">
                    <span className="av">D</span>
                    <b>Dado</b>
                    <span>peças compradas por ele</span>
                  </div>
                  <div className="socio">
                    <span className="av">T</span>
                    <b>Tiago</b>
                    <span>peças compradas por ele</span>
                  </div>
                </div>
              </article>
              <article className="cell c-theme">
                <span className="eyebrow">Tema</span>
                <h3>Claro e escuro.</h3>
                <p>Segue o celular ou escolhe na mão.</p>
                <div className="swatch-split">
                  <div className="l">papel</div>
                  <div className="d">grafite</div>
                </div>
              </article>
              <article className="cell c-pwa">
                <span className="eyebrow">No celular</span>
                <h3>Instala como app.</h3>
                <p>
                  Abre da tela inicial, tira foto da peça direto no cadastro e
                  avisa quando chega promoção no Telegram.
                </p>
                <div className="pwa-row">
                  <span>Tela inicial</span>
                  <span>Câmera no cadastro</span>
                  <span>Notificações</span>
                  <span>Barra no polegar</span>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="numbers">
          <div className="wrap">
            <div className="eyebrow" style={{ marginBottom: 40 }}>
              Do jeito da bancada
            </div>
            <div className="grid">
              <div>
                <div className="n" data-count="1">
                  1
                </div>
                <div className="l">código por peça, do caixote até a venda</div>
              </div>
              <div>
                <div className="n" data-count="2">
                  2
                </div>
                <div className="l">sócios, cada um com a sua conta fechada</div>
              </div>
              <div>
                <div className="n" data-count="0">
                  0
                </div>
                <div className="l">planilhas pra manter em dia</div>
              </div>
            </div>
          </div>
        </section>

        <section className="final">
          <div className="wrap">
            <div className="box">
              <div>
                <div className="eyebrow" style={{ marginBottom: 14 }}>
                  Dado &amp; Tiago · Novo Hamburgo, RS
                </div>
                <h2>Próxima peça já tem código esperando.</h2>
              </div>
              <Link className="btn btn-led magnet" href={destino} style={{ height: 60, padding: "0 28px", fontSize: 17 }}>
                {rotulo}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <span>bancada · estoque e montagem de PCs</span>
          <span className="maker">
            um produto <strong>NitzTech</strong>
          </span>
          <span className="mono">estoque-hardware.vercel.app</span>
        </div>
      </footer>

      <LandingMotion />
    </div>
  );
}
