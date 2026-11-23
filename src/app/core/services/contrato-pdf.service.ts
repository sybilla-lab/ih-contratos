import { Injectable } from "@angular/core";
import { jsPDF } from "jspdf";
import { Contratacao } from "../models/contratacao.model";
import { ContratoDocumento } from "../models/contrato-documento.model";
import { ContratoTemplateService } from "./contrato-template.service";
import { paraFontePdf } from "../utils/texto";

/** Um trecho contínuo de texto com um estilo só. */
interface Trecho {
  texto: string;
  negrito: boolean;
  italico: boolean;
}

/** Um parágrafo ou item de lista já pronto para ser posicionado na página. */
interface Bloco {
  marcador: string;
  recuo: number;
  trechos: Trecho[];
}

interface Cursor {
  doc: jsPDF;
  y: number;
}

@Injectable({ providedIn: "root" })
export class ContratoPdfService {
  private readonly MARGIN_LEFT = 25;
  private readonly MARGIN_RIGHT = 25;
  private readonly PAGE_WIDTH = 210;
  private readonly CONTENT_WIDTH = 210 - 25 - 25; // 160
  private readonly LIMITE_Y = 272;
  private readonly ALTURA_LINHA = 4.4;

  constructor(private template: ContratoTemplateService) {}

  generateContrato(contratacao: Contratacao): void {
    this.gerar(this.template.criarDocumento(contratacao, "contrato"), contratacao);
  }

  generateAditivo(contratacao: Contratacao): void {
    this.gerar(this.template.criarDocumento(contratacao, "aditivo"), contratacao);
  }

  /** Gera o PDF a partir do documento — editado ou padrão. */
  gerar(documento: ContratoDocumento, contratacao: Contratacao): void {
    const doc = new jsPDF("p", "mm", "a4");
    const cursor: Cursor = { doc, y: 20 };

    this.addHeader(cursor);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    const titulo = doc.splitTextToSize(
      paraFontePdf(this.template.resolver(documento.titulo, contratacao).toUpperCase()),
      this.CONTENT_WIDTH
    );
    doc.text(titulo, this.PAGE_WIDTH / 2, cursor.y, { align: "center" });
    cursor.y += titulo.length * 6 + 8;

    this.escreverHtml(cursor, documento.preambulo, contratacao);
    cursor.y += 4;

    const clausulas = documento.clausulas.filter((cl) => cl.incluida);
    clausulas.forEach((clausula, i) => {
      this.quebrarSePreciso(cursor, 22);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(139, 58, 58);
      const tituloClausula = doc.splitTextToSize(
        paraFontePdf(
          `${i + 1}. ${this.template.resolver(clausula.titulo, contratacao).toUpperCase()}`
        ),
        this.CONTENT_WIDTH
      );
      doc.text(tituloClausula, this.MARGIN_LEFT, cursor.y);
      doc.setTextColor(0, 0, 0);
      cursor.y += tituloClausula.length * 5 + 3;

      this.escreverHtml(cursor, clausula.conteudo, contratacao, i + 1);
      cursor.y += 4;
    });

    cursor.y += 4;
    this.escreverHtml(cursor, documento.fecho, contratacao);

    cursor.y += 16;
    this.quebrarSePreciso(cursor, 30);
    this.addAssinaturas(doc, cursor.y, contratacao);

    this.numerarPaginas(doc);
    doc.save(this.nomeArquivo(documento, contratacao));
  }

  // ===== Renderização de HTML =====

  /**
   * Converte o HTML do editor em blocos e os escreve na página.
   * `numeroClausula` liga a numeração automática: os parágrafos do primeiro
   * nível viram 1.1, 1.2, … de acordo com a posição da cláusula.
   */
  private escreverHtml(
    cursor: Cursor,
    html: string,
    c: Contratacao,
    numeroClausula?: number
  ): void {
    const raiz = new DOMParser().parseFromString(
      this.template.resolverParaHtml(html, c),
      "text/html"
    ).body;

    for (const bloco of this.extrairBlocos(raiz, numeroClausula)) {
      this.escreverBloco(cursor, bloco);
    }
  }

  private extrairBlocos(raiz: HTMLElement, numeroClausula?: number): Bloco[] {
    const blocos: Bloco[] = [];
    let item = 0;

    const percorrer = (no: Element, recuo: number) => {
      for (const filho of Array.from(no.children)) {
        const tag = filho.tagName.toLowerCase();

        if (tag === "ul" || tag === "ol") {
          const ordenada = tag === "ol";
          let indice = 0;
          for (const li of Array.from(filho.children)) {
            if (li.tagName.toLowerCase() !== "li") continue;
            const marcador = ordenada ? `${this.letra(indice)})` : "•";
            indice++;

            // O <li> pode ter um <p> dentro (Tiptap) e ainda aninhar listas.
            const proprio = this.trechosDiretos(li);
            blocos.push({ marcador, recuo: recuo + 6, trechos: proprio });
            percorrer(li, recuo + 6);
          }
          continue;
        }

        if (tag === "p") {
          const trechos = this.trechos(filho);
          if (!trechos.some((t) => t.texto.trim())) continue;
          // Dentro de um <li> o parágrafo já foi absorvido pelo marcador.
          if (no.tagName.toLowerCase() === "li") continue;
          item++;
          blocos.push({
            marcador: numeroClausula ? `${numeroClausula}.${item}` : "",
            recuo,
            trechos,
          });
          continue;
        }

        percorrer(filho, recuo);
      }
    };

    percorrer(raiz, 0);
    return blocos;
  }

  /** Texto de um <li>, incluindo o <p> que o Tiptap coloca dentro dele. */
  private trechosDiretos(li: Element): Trecho[] {
    const clone = li.cloneNode(true) as Element;
    clone.querySelectorAll("ul, ol").forEach((lista) => lista.remove());
    return this.trechos(clone);
  }

  private trechos(no: Node): Trecho[] {
    const saida: Trecho[] = [];

    const percorrer = (atual: Node, negrito: boolean, italico: boolean) => {
      for (const filho of Array.from(atual.childNodes)) {
        if (filho.nodeType === Node.TEXT_NODE) {
          // `paraFontePdf` aqui e não na hora de desenhar: a largura precisa
          // ser medida sobre exatamente o texto que vai ser escrito.
          const texto = paraFontePdf(filho.textContent || "").replace(/\s+/g, " ");
          if (texto) saida.push({ texto, negrito, italico });
          continue;
        }
        if (filho.nodeType !== Node.ELEMENT_NODE) continue;

        const tag = (filho as Element).tagName.toLowerCase();
        if (tag === "br") {
          saida.push({ texto: "\n", negrito, italico });
          continue;
        }
        percorrer(
          filho,
          negrito || tag === "strong" || tag === "b",
          italico || tag === "em" || tag === "i"
        );
      }
    };

    percorrer(no, false, false);
    return saida;
  }

  /**
   * Quebra os trechos em linhas medindo palavra a palavra, para que negrito e
   * itálico no meio do parágrafo não estourem a margem.
   */
  private escreverBloco(cursor: Cursor, bloco: Bloco): void {
    const { doc } = cursor;
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);

    const xMarcador = this.MARGIN_LEFT + bloco.recuo;
    doc.setFont("helvetica", "bold");
    const larguraMarcador = bloco.marcador ? doc.getTextWidth(bloco.marcador) + 2 : 0;
    const xTexto = xMarcador + larguraMarcador;
    const larguraDisponivel = this.PAGE_WIDTH - this.MARGIN_RIGHT - xTexto;

    const linhas = this.quebrarEmLinhas(doc, bloco.trechos, larguraDisponivel);
    if (!linhas.length) return;

    this.quebrarSePreciso(cursor, this.ALTURA_LINHA * Math.min(linhas.length, 2) + 2);

    if (bloco.marcador) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(bloco.marcador, xMarcador, cursor.y);
    }

    for (const linha of linhas) {
      this.quebrarSePreciso(cursor, this.ALTURA_LINHA);
      let x = xTexto;
      for (const trecho of linha) {
        doc.setFont("helvetica", this.estilo(trecho));
        doc.setFontSize(9);
        doc.text(trecho.texto, x, cursor.y);
        x += doc.getTextWidth(trecho.texto);
      }
      cursor.y += this.ALTURA_LINHA;
    }

    cursor.y += 2;
  }

  private quebrarEmLinhas(doc: jsPDF, trechos: Trecho[], largura: number): Trecho[][] {
    const linhas: Trecho[][] = [];
    let linha: Trecho[] = [];
    let usado = 0;

    const fecharLinha = () => {
      if (linha.length) linhas.push(linha);
      linha = [];
      usado = 0;
    };

    const acrescentar = (palavra: string, trecho: Trecho, largPalavra: number) => {
      const ultimo = linha[linha.length - 1];
      if (ultimo && ultimo.negrito === trecho.negrito && ultimo.italico === trecho.italico) {
        ultimo.texto += palavra;
      } else {
        linha.push({ ...trecho, texto: palavra });
      }
      usado += largPalavra;
    };

    for (const trecho of trechos) {
      doc.setFont("helvetica", this.estilo(trecho));
      doc.setFontSize(9);

      for (const palavra of trecho.texto.split(/(\s+)/)) {
        if (!palavra) continue;
        if (palavra === "\n") {
          fecharLinha();
          continue;
        }

        const ehEspaco = /^\s+$/.test(palavra);
        if (ehEspaco && !linha.length) continue;

        const largPalavra = doc.getTextWidth(palavra);
        if (!ehEspaco && usado + largPalavra > largura && linha.length) {
          // A palavra não cabe: tira o espaço pendente no fim da linha.
          const ultimo = linha[linha.length - 1];
          ultimo.texto = ultimo.texto.replace(/\s+$/, "");
          fecharLinha();
        }

        // Um token maior que a linha inteira (URL comprida, por exemplo) não
        // tem onde quebrar sozinho — quebra no caractere para não vazar a margem.
        if (!ehEspaco && largPalavra > largura) {
          for (const pedaco of palavra) {
            const largPedaco = doc.getTextWidth(pedaco);
            if (usado + largPedaco > largura && linha.length) fecharLinha();
            acrescentar(pedaco, trecho, largPedaco);
          }
          continue;
        }

        acrescentar(palavra, trecho, largPalavra);
      }
    }

    fecharLinha();
    return linhas.filter((l) => l.some((t) => t.texto.trim()));
  }

  private estilo(t: Trecho): string {
    if (t.negrito && t.italico) return "bolditalic";
    if (t.negrito) return "bold";
    if (t.italico) return "italic";
    return "normal";
  }

  private letra(indice: number): string {
    return String.fromCharCode(97 + (indice % 26));
  }

  // ===== Elementos fixos da página =====

  private addHeader(cursor: Cursor): void {
    const { doc } = cursor;
    let y = cursor.y;

    doc.setDrawColor(139, 58, 58); // bordô IH
    doc.setLineWidth(1.5);
    doc.line(this.MARGIN_LEFT, y, this.PAGE_WIDTH - this.MARGIN_RIGHT, y);
    y += 8;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(139, 58, 58);
    doc.text("IMPACT HUB BRASÍLIA", this.PAGE_WIDTH / 2, y, { align: "center" });
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text("ASSOCIAÇÃO IMPACT HUB BRASIL — CNPJ: 18.702.797/0001-34", this.PAGE_WIDTH / 2, y, {
      align: "center",
    });
    y += 3;
    doc.text(
      "ROD JOSÉ CARLOS DAUX S/N SALA 01 E 02, FLORIANÓPOLIS-SC, CEP 88.032-005",
      this.PAGE_WIDTH / 2,
      y,
      { align: "center" }
    );

    y += 5;
    doc.setDrawColor(139, 58, 58);
    doc.setLineWidth(0.5);
    doc.line(this.MARGIN_LEFT, y, this.PAGE_WIDTH - this.MARGIN_RIGHT, y);

    doc.setTextColor(0, 0, 0);
    cursor.y = y + 10;
  }

  private addAssinaturas(doc: jsPDF, y: number, c: Contratacao): number {
    const col1X = this.MARGIN_LEFT;
    const col2X = this.PAGE_WIDTH / 2 + 10;
    const lineW = 65;
    const colWidth = lineW + 5;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);

    // Preparar textos com quebra de linha
    const nomeContratante = paraFontePdf(c.entidade || "ASSOCIAÇÃO IMPACT HUB BRASIL");
    const nomeContratada = paraFontePdf(c.fornecedorNome || "[CONTRATADA]");
    const linhasContratante = doc.splitTextToSize(nomeContratante, colWidth);
    const linhasContratada = doc.splitTextToSize(nomeContratada, colWidth);

    // Linhas de assinatura
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.line(col1X, y, col1X + lineW, y);
    doc.line(col2X, y, col2X + lineW, y);
    y += 5;

    // Nomes (com quebra automática)
    doc.text(linhasContratante, col1X, y);
    doc.text(linhasContratada, col2X, y);

    // Avançar Y pelo maior bloco de texto
    const maxLinhas = Math.max(linhasContratante.length, linhasContratada.length);
    y += maxLinhas * 3.5 + 2;

    // Labels
    doc.setFont("helvetica", "normal");
    doc.text("Contratante", col1X, y);
    doc.text("Contratada", col2X, y);

    return y + 10;
  }

  private quebrarSePreciso(cursor: Cursor, alturaNecessaria: number): void {
    if (cursor.y + alturaNecessaria > this.LIMITE_Y) {
      cursor.doc.addPage();
      cursor.y = 22;
    }
  }

  /** Rodapé "Página X de Y" só no fim, quando o total já é conhecido. */
  private numerarPaginas(doc: jsPDF): void {
    const total = doc.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text(`Página ${p} de ${total}`, this.PAGE_WIDTH / 2, 287, { align: "center" });
    }
    doc.setTextColor(0, 0, 0);
  }

  private nomeArquivo(documento: ContratoDocumento, c: Contratacao): string {
    const prefixo = documento.tipo === "aditivo" ? "Aditivo" : "Contrato";
    return `${prefixo}_${c.fornecedorNome || "Contratado"}_${c.projeto || "Projeto"}.pdf`
      .replace(/[^a-zA-Z0-9_.\-\s]/g, "")
      .replace(/\s+/g, "_");
  }
}
