import { Injectable } from "@angular/core";
import { Contratacao } from "../models/contratacao.model";
import {
  Clausula,
  ContratoDocumento,
  Pendencia,
  TipoDocumento,
  VariavelContrato,
} from "../models/contrato-documento.model";

/**
 * Monta o documento padrão a partir da contratação e resolve as variáveis
 * `{{...}}` que ficam no texto. As variáveis existem para que o texto continue
 * ligado ao cadastro: mudou o valor ou a vigência no CSV, o contrato acompanha.
 */
@Injectable({ providedIn: "root" })
export class ContratoTemplateService {
  readonly variaveis: VariavelContrato[] = [
    { chave: "contratada", rotulo: "Contratada", descricao: "Nome / razão social do fornecedor" },
    { chave: "contato", rotulo: "Contato", descricao: "Contato do fornecedor" },
    { chave: "contratante", rotulo: "Contratante", descricao: "Entidade contratante" },
    { chave: "cnpj", rotulo: "CNPJ", descricao: "CNPJ da contratante" },
    { chave: "endereco", rotulo: "Endereço", descricao: "Endereço da contratante" },
    { chave: "objeto", rotulo: "Objeto", descricao: "Descrição do serviço contratado" },
    { chave: "valor", rotulo: "Valor", descricao: "Valor formatado em reais" },
    { chave: "vigencia", rotulo: "Vigência", descricao: "Período de vigência" },
    { chave: "projeto", rotulo: "Projeto", descricao: "Projeto vinculado" },
    { chave: "dadosBancarios", rotulo: "Dados bancários", descricao: "Conta para pagamento" },
    { chave: "cidade", rotulo: "Cidade", descricao: "Praça da prestação e do foro" },
    { chave: "hoje", rotulo: "Data de hoje", descricao: "Data por extenso" },
  ];

  private readonly CONTRATANTE_PADRAO = "ASSOCIAÇÃO IMPACT HUB BRASIL";
  private readonly CNPJ_PADRAO = "18.702.797/0001-34";
  private readonly ENDERECO_PADRAO =
    "ROD JOSÉ CARLOS DAUX S/N SALA 01 E 02, FLORIANÓPOLIS-SC, CEP 88.032-005";

  criarDocumento(c: Contratacao, tipo: TipoDocumento): ContratoDocumento {
    const clausulas = tipo === "aditivo" ? this.clausulasAditivo() : this.clausulasContrato(c);

    return {
      contratacaoId: c.id,
      assinatura: this.assinatura(c),
      tipo,
      titulo:
        tipo === "aditivo"
          ? "TERMO ADITIVO AO INSTRUMENTO PARTICULAR"
          : c.categoria === "membro"
            ? "CONTRATO DE PRESTAÇÃO DE SERVIÇOS"
            : "CONTRATO DE PRESTAÇÃO DE SERVIÇOS PONTUAIS",
      preambulo: tipo === "aditivo" ? this.preambuloAditivo() : this.preambuloContrato(),
      clausulas: clausulas.map((cl) => ({
        ...cl,
        padrao: cl.conteudo,
        padraoTitulo: cl.titulo,
      })),
      fecho:
        "<p>Por estarem assim, justas e acordadas, as Partes firmam eletronicamente o presente instrumento contratual, sendo este título executivo extrajudicial.</p>",
      atualizadoEm: new Date().toISOString(),
    };
  }

  /** Chave estável mesmo se os ids forem reatribuídos num novo import de CSV. */
  assinatura(c: Contratacao): string {
    return `${(c.fornecedorNome || "sem-nome").toLowerCase().replace(/\s+/g, "-")}|${c.projeto || ""}`;
  }

  /** Substitui as variáveis em texto puro (título, nome de arquivo). */
  resolver(texto: string, c: Contratacao): string {
    return texto.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, chave: string) => this.valorDe(chave, c));
  }

  /**
   * Substitui as variáveis dentro de HTML. Os valores vêm do CSV, então são
   * escapados para não quebrarem a marcação do documento. As quebras de linha
   * viram `<br>`: o objeto da contratação costuma trazer a lista de entregas
   * uma por linha, e sem isso tudo desaba num parágrafo corrido.
   */
  resolverParaHtml(html: string, c: Contratacao): string {
    return html.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, chave: string) =>
      this.escaparHtml(this.valorDe(chave, c)).replace(/\n/g, "<br>")
    );
  }

  private escaparHtml(valor: string): string {
    return valor
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  valorDe(chave: string, c: Contratacao): string {
    switch (chave) {
      case "contratada":
        return c.fornecedorNome || "";
      case "contato":
        return c.fornecedorContato || "";
      case "contratante":
        return c.entidade || this.CONTRATANTE_PADRAO;
      case "cnpj":
        return this.CNPJ_PADRAO;
      case "endereco":
        return this.ENDERECO_PADRAO;
      case "objeto":
        return c.objetoContratacao || "";
      case "valor":
        return c.valor > 0
          ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c.valor)
          : "";
      case "vigencia":
        return c.vigencia || "";
      case "projeto":
        return c.projeto || "";
      case "dadosBancarios":
        return c.dadosBancarios || "";
      case "cidade":
        return "Brasília – DF";
      case "hoje":
        return new Date().toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        });
      default:
        return "";
    }
  }

  /**
   * Varre o documento atrás do que impede enviar para assinatura: variáveis que
   * o cadastro não preencheu e placeholders `[ASSIM]` deixados no texto.
   */
  detectarPendencias(doc: ContratoDocumento, c: Contratacao): Pendencia[] {
    const pendencias: Pendencia[] = [];

    const analisar = (origem: string, rotuloOrigem: string, html: string) => {
      for (const [, chave] of html.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) {
        if (!this.valorDe(chave, c).trim()) {
          const rotulo = this.variaveis.find((v) => v.chave === chave)?.rotulo ?? chave;
          pendencias.push({ origem, rotuloOrigem, tipo: "variavel-vazia", trecho: rotulo });
        }
      }
      const texto = this.textoPuro(html);
      for (const [trecho] of texto.matchAll(/\[[^\]]{2,80}\]/g)) {
        pendencias.push({ origem, rotuloOrigem, tipo: "placeholder", trecho });
      }
    };

    analisar("titulo", "Título", doc.titulo);
    analisar("preambulo", "Preâmbulo", doc.preambulo);
    doc.clausulas
      .filter((cl) => cl.incluida)
      .forEach((cl, i) => analisar(cl.id, `${i + 1}. ${cl.titulo}`, cl.titulo + " " + cl.conteudo));
    analisar("fecho", "Fechamento", doc.fecho);

    return pendencias;
  }

  private textoPuro(html: string): string {
    const el = document.createElement("div");
    el.innerHTML = html;
    return el.textContent || "";
  }

  private preambuloContrato(): string {
    return [
      "<p><strong>CONTRATANTE:</strong> {{contratante}}, pessoa jurídica inscrita no CNPJ sob o nº {{cnpj}}, com endereço na {{endereco}}, com endereço de e-mail associacao.brasil&#64;impacthub.net, doravante denominada simplesmente Contratante.</p>",
      "<p><strong>CONTRATADA:</strong> {{contratada}}, com contato {{contato}}, doravante denominada Contratada.</p>",
      "<p>Têm entre si o presente contrato de prestação de serviços, considerando que:</p>",
      "<ul>",
      "<li>A Contratante firmou junto a FUNDAÇÃO ESCOLA NACIONAL DE ADMINISTRAÇÃO PÚBLICA — ENAP (CNPJ nº 00.627.612/0001-09) termo de colaboração, que tem por objeto a execução da Estratégia de Inovação Aberta da Enap;</li>",
      "<li>O termo de colaboração tem finalidade de interesse público e recíproco, envolvendo a transferência de recursos públicos à Contratante;</li>",
      "<li>Os recursos oriundos do termo de colaboração têm natureza pública, de modo que a sua utilização está sujeita a prestação de contas.</li>",
      "</ul>",
    ].join("");
  }

  private preambuloAditivo(): string {
    return (
      "<p>Pelo presente instrumento particular, as partes <strong>{{contratante}}</strong> (CNPJ: {{cnpj}}), doravante CONTRATANTE, e <strong>{{contratada}}</strong>, doravante CONTRATADA, resolvem celebrar o presente Termo Aditivo ao contrato de prestação de serviços firmado entre si.</p>"
    );
  }

  private clausulasAditivo(): Omit<Clausula, "padrao" | "padraoTitulo">[] {
    return [
      {
        id: "adt-alteracao",
        titulo: "DA ALTERAÇÃO",
        incluida: true,
        conteudo:
          "<p>As Partes resolvem alterar o Contrato Originário nos seguintes termos: [descreva aqui a alteração].</p>",
      },
      {
        id: "adt-vigencia",
        titulo: "DA VIGÊNCIA",
        incluida: true,
        conteudo: "<p>A presente alteração produz efeitos a partir de {{hoje}}.</p>",
      },
      {
        id: "adt-ratificacao",
        titulo: "DA RATIFICAÇÃO",
        incluida: true,
        conteudo:
          "<p>No mais, as Partes ratificam todas as demais disposições do Contrato Originário não alteradas por este Termo Aditivo.</p>",
      },
    ];
  }

  private clausulasContrato(c: Contratacao): Omit<Clausula, "padrao" | "padraoTitulo">[] {
    const pagamento =
      c.categoria === "membro"
        ? [
            "<p>Pela prestação dos serviços contratados, o Contratante pagará à Contratada o valor mensal de <strong>{{valor}}</strong>.</p>",
            "<p>A Contratada deverá apresentar, até o 5º dia útil do mês subsequente, relatório de atividades desempenhadas no mês com o registro das horas trabalhadas, bem como a nota fiscal referente ao seu pagamento.</p>",
            "<p>O pagamento mensal será realizado em até 30 (trinta) dias da apresentação da nota fiscal e do relatório de atividades.</p>",
          ]
        : [
            "<p>Pela prestação dos serviços contratados, o Contratante pagará à Contratada o valor total de <strong>{{valor}}</strong>.</p>",
            "<p>O pagamento será realizado em até 30 (trinta) dias da apresentação da nota fiscal e do relatório de atividades.</p>",
          ];

    if (c.dadosBancarios) {
      pagamento.push("<p>Dados bancários para pagamento: {{dadosBancarios}}</p>");
    }

    return [
      {
        id: "cl-requisitos",
        titulo: "DECLARAÇÃO DE PREENCHIMENTO DOS REQUISITOS DE CONTRATAÇÃO",
        incluida: true,
        conteudo: [
          "<p>A Contratada garante que não está sob qualquer impedimento, restrição ou proibição com respeito à sua capacidade de executar este acordo e atender a todos os seus termos e condições.</p>",
          "<p>A Contratada garante ainda e assegura que nenhum de seus atos — comissivos ou omissivos — irá violar qualquer direito de terceiros.</p>",
          "<p>A Contratada se compromete a indenizar a Contratante por quaisquer danos, custas, despesas, taxas, incluindo custas processuais e honorários nos quais incorra em razão de qualquer queixa, reclamação, ação penal, litígio ou processo instituído contra a Contratante em face do objeto do presente contrato.</p>",
          "<p>A Contratada se compromete a exercer seus melhores e maiores esforços para executar o presente contrato na estrita observância dos prazos aqui previstos.</p>",
          "<p>A Contratada reconhece que o resultado final do serviço objeto do presente Contrato somente poderá ser utilizado ou divulgado com a devida autorização da Contratante.</p>",
        ].join(""),
      },
      {
        id: "cl-objeto",
        titulo: "OBJETO",
        incluida: true,
        conteudo: [
          "<p>O presente instrumento contratual privado tem por objeto a prestação de serviço técnico especializado.</p>",
          "<p>Os serviços a serem prestados pela Contratada à Contratante têm a seguinte descrição: {{objeto}}</p>",
        ].join(""),
      },
      {
        id: "cl-obrig-contratada",
        titulo: "OBRIGAÇÕES DA CONTRATADA",
        incluida: true,
        conteudo: [
          "<p>São obrigações da Contratada:</p>",
          "<ul>",
          "<li>Manter as declarações e compromissos previstos na cláusula 1ª do presente instrumento ao longo da vigência do presente contrato;</li>",
          "<li>Cumprir e fazer cumprir o contido no Anexo I do presente instrumento (Diretrizes de Combate à Corrupção);</li>",
          "<li>Adotar todas as medidas necessárias ao cabal cumprimento do objeto deste contrato, segundo sua independência técnica;</li>",
          "<li>Guardar sigilo a respeito de todas as informações recebidas da Contratante;</li>",
          "<li>Prestar os serviços com pessoal adequadamente qualificado e capacitado;</li>",
          "<li>Prestar à Contratante os esclarecimentos necessários à perfeita compreensão dos serviços.</li>",
          "</ul>",
        ].join(""),
      },
      {
        id: "cl-obrig-contratante",
        titulo: "OBRIGAÇÕES DA CONTRATANTE",
        incluida: true,
        conteudo: [
          "<p>São obrigações da Contratante:</p>",
          "<ul>",
          "<li>Fornecer, tempestivamente, as informações necessárias à adequada execução dos serviços contratados;</li>",
          "<li>Observar a independência técnica da Contratada;</li>",
          "<li>Pagar pontualmente os valores pactuados, na forma e prazo definidos neste instrumento contratual.</li>",
          "</ul>",
        ].join(""),
      },
      {
        id: "cl-pagamento",
        titulo: "PAGAMENTO",
        incluida: true,
        conteudo: pagamento.join(""),
      },
      {
        id: "cl-vigencia",
        titulo: "VIGÊNCIA E RESCISÃO",
        incluida: true,
        conteudo: [
          "<p>Este Contrato terá vigência de {{vigencia}}.</p>",
          "<p>O presente instrumento poderá ser rescindido mediante aviso prévio de 30 (trinta) dias, sem ônus para as Partes.</p>",
          "<p>A rescisão deverá ser formalizada por meio da assinatura de termo de distrato e extinção do contrato.</p>",
        ].join(""),
      },
      {
        id: "cl-confidencialidade",
        titulo: "CONFIDENCIALIDADE",
        incluida: true,
        conteudo: [
          "<p>As Partes estabelecem o pacto do mais absoluto sigilo, relativamente às informações confidenciais fornecidas por qualquer das Partes à outra, inclusive qualquer tipo de propriedade intelectual.</p>",
          "<p>Todas as regras de confidencialidade e sigilo previstas neste termo terão validade durante e após a vigência deste instrumento.</p>",
        ].join(""),
      },
      {
        id: "cl-nao-competicao",
        titulo: "NÃO SOLICITAÇÃO E NÃO COMPETIÇÃO",
        incluida: true,
        conteudo: [
          "<p>A Contratada se compromete a, durante a vigência deste instrumento, não exercer atividades que impliquem conflito de interesses com as atividades da Contratante.</p>",
          "<p>A Contratada se compromete a não solicitar ou encorajar, direta ou indiretamente, qualquer colaborador da Contratante a deixar de trabalhar ou prestar serviços.</p>",
        ].join(""),
      },
      {
        id: "cl-propriedade",
        titulo: "PROPRIEDADE INTELECTUAL",
        incluida: true,
        conteudo:
          "<p>A Contratada garante à Contratante o direito irrestrito de utilização de todos os conhecimentos técnicos e produtos desenvolvidos ou obtidos na execução do objeto deste Acordo.</p>",
      },
      {
        id: "cl-dados",
        titulo: "DO TRATAMENTO ADEQUADO DE DADOS",
        incluida: true,
        conteudo: [
          "<p>A Contratada se compromete a tratar e usar os dados da Contratante nos termos legalmente permitidos, em especial em conformidade com a Lei nº 13.709/2018 (LGPD).</p>",
          "<p>O descumprimento poderá ensejar a imediata rescisão do presente Contrato com justa causa.</p>",
        ].join(""),
      },
      {
        id: "cl-desvinculacao",
        titulo: "DA DESVINCULAÇÃO ENTRE AS PARTES",
        incluida: true,
        conteudo: [
          "<p>O presente Contrato não estabelece qualquer vínculo trabalhista, societário, associativo, de representação ou de responsabilidade entre a Contratante e a Contratada.</p>",
          "<p>A Contratada terá flexibilidade quanto ao local, dias, horários e condições para a execução dos serviços, ficando estabelecido que o local da prestação dos serviços será em {{cidade}}.</p>",
        ].join(""),
      },
      {
        id: "cl-processual",
        titulo: "DO NEGÓCIO JURÍDICO PROCESSUAL",
        incluida: true,
        conteudo: [
          "<p>Fica eleito o Foro da Circunscrição Judiciária de {{cidade}} para dirimir todas e quaisquer dúvidas decorrentes deste contrato de prestação de serviços.</p>",
          "<p>As Partes acordam que eventual procedimento judicial que verse sobre a relação aqui entabulada não irá comportar recurso para os tribunais superiores.</p>",
        ].join(""),
      },
      {
        id: "cl-finais",
        titulo: "DISPOSIÇÕES FINAIS",
        incluida: true,
        conteudo: [
          "<p>Qualquer aditamento e/ou alteração somente terá validade se realizado por escrito, mediante Termo Aditivo firmado por ambas as Partes.</p>",
          "<p>O presente Contrato obriga as Partes e seus sucessores a qualquer título.</p>",
        ].join(""),
      },
    ];
  }
}
