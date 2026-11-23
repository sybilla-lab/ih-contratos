export interface Contratacao {
  id: number;
  timestamp: string;
  email: string;
  entidade: string;
  projeto: string;
  demandante: string;
  gestorAprovador: string;
  evidenciaAprovacao: string;
  tipoContratacao: "Membro da equipe IH" | "Serviço pontual" | string;
  fornecedorNome: string;
  perfilProfissional: string;
  fornecedorContato: string;
  objetoContratacao: string;
  valor: number;
  valorOriginal: string;
  vigencia: string;
  observacoes: string;
  planoTrabalho: string;
  cotacoes: string;
  cartaoCnpj: string;
  certidaoFiscal: string;
  certidaoFgts: string;
  dadosBancarios: string;
  circulo: string;
  emailOrganizacional: string;
  notebook: string;
  celular: string;
  plataformas: string;
  // Campos derivados
  status: "ativo" | "encerrado" | "futuro" | "indefinido";
  categoria: "membro" | "pontual";
  /**
   * Início e fim da vigência em milissegundos, quando dá para extrair as datas
   * do texto livre. Servem para ordenar a lista — "12 meses renovável" e
   * "05/02/2026 até 05/02/2027" não se comparam como string — e para avisar
   * dos contratos que estão perto de vencer.
   */
  vigenciaInicio: number | null;
  vigenciaFim: number | null;
}

export interface ContratacaoStats {
  total: number;
  valorTotal: number;
  valorMedio: number;
  ativos: number;
  projetos: number;
  porProjeto: { nome: string; count: number; valor: number }[];
  porCategoria: { membro: number; pontual: number };
  porEntidade: { nome: string; count: number }[];
  porStatus: { chave: Contratacao["status"]; count: number }[];
  /**
   * Contratos que ainda vão vencer, do mais próximo ao mais distante. A lista
   * não é recortada por janela: uma janela fixa deixa o painel vazio sempre que
   * a carteira não tem nada expirando por perto, e a fila de renovação é útil
   * de qualquer forma.
   */
  aVencer: { contratacao: Contratacao; diasRestantes: number }[];
  /** Quantos desses caem dentro da janela de alerta de renovação. */
  vencendoEmBreve: number;
}
