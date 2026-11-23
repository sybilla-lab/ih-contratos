export type TipoDocumento = "contrato" | "aditivo";

/**
 * Uma cláusula do contrato. O número NÃO faz parte do título nem do conteúdo:
 * ele é calculado na renderização a partir da posição, para que remover ou
 * reordenar cláusulas não deixe a numeração furada.
 */
export interface Clausula {
  id: string;
  /** Título sem numeração. Ex: "OBJETO" */
  titulo: string;
  /** HTML produzido pelo editor. Cada <p> vira um item numerado (N.M). */
  conteudo: string;
  incluida: boolean;
  /** Conteúdo original do template, usado para detectar edição e restaurar. */
  padrao: string;
  padraoTitulo: string;
}

export interface ContratoDocumento {
  contratacaoId: number;
  /** Identifica a contratação mesmo se os ids forem reatribuídos num novo import. */
  assinatura: string;
  tipo: TipoDocumento;
  titulo: string;
  /** Blocos de abertura (partes e considerandos). Não numerados. */
  preambulo: string;
  clausulas: Clausula[];
  /** Parágrafo de fechamento acima das assinaturas. */
  fecho: string;
  atualizadoEm: string;
}

/** Uma variável que o editor resolve na hora de pré-visualizar e gerar o PDF. */
export interface VariavelContrato {
  chave: string;
  rotulo: string;
  descricao: string;
}

/** Um ponto do documento que ainda precisa de atenção antes de assinar. */
export interface Pendencia {
  /** id da cláusula, ou "preambulo" / "fecho" / "titulo". */
  origem: string;
  rotuloOrigem: string;
  tipo: "variavel-vazia" | "placeholder";
  trecho: string;
}
