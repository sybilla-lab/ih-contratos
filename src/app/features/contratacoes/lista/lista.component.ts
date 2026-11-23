import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { ContratacaoService } from "../../../core/services/contratacao.service";
import { ContratoPdfService } from "../../../core/services/contrato-pdf.service";
import { Contratacao } from "../../../core/models/contratacao.model";

export type ColunaOrdenavel =
  | "fornecedor"
  | "projeto"
  | "tipo"
  | "valor"
  | "vigencia"
  | "status";

/** Do mais relevante para o menos: ordem alfabética aqui não diria nada. */
const ORDEM_STATUS: Record<Contratacao["status"], number> = {
  ativo: 0,
  futuro: 1,
  encerrado: 2,
  indefinido: 3,
};

@Component({
  selector: "app-lista",
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: "./lista.component.html",
  styleUrl: "./lista.component.css",
})
export class ListaComponent implements OnInit {
  contratacoes: Contratacao[] = [];
  filtered: Contratacao[] = [];
  searchTerm = "";
  filterProjeto = "";
  filterCategoria = "";
  filterStatus = "";
  projetos: string[] = [];

  /** Vazio = ordem do arquivo importado. */
  ordenarPor: ColunaOrdenavel | "" = "";
  direcao: "asc" | "desc" = "asc";

  private readonly comparadorTexto = new Intl.Collator("pt-BR", { sensitivity: "base" });

  constructor(
    private contratacaoService: ContratacaoService,
    private pdfService: ContratoPdfService
  ) {}

  ngOnInit(): void {
    this.contratacaoService.getContratacoes().subscribe((data) => {
      this.contratacoes = data;
      this.projetos = [...new Set(data.map((c) => c.projeto).filter(Boolean))].sort();
      this.applyFilters();
    });
  }

  applyFilters(): void {
    let result = [...this.contratacoes];

    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      result = result.filter(
        (c) =>
          c.fornecedorNome.toLowerCase().includes(term) ||
          c.objetoContratacao.toLowerCase().includes(term) ||
          c.projeto.toLowerCase().includes(term) ||
          c.entidade.toLowerCase().includes(term)
      );
    }

    if (this.filterProjeto) {
      result = result.filter((c) => c.projeto === this.filterProjeto);
    }

    if (this.filterCategoria) {
      result = result.filter((c) => c.categoria === this.filterCategoria);
    }

    if (this.filterStatus) {
      result = result.filter((c) => c.status === this.filterStatus);
    }

    this.filtered = this.ordenar(result);
  }

  clearFilters(): void {
    this.searchTerm = "";
    this.filterProjeto = "";
    this.filterCategoria = "";
    this.filterStatus = "";
    this.applyFilters();
  }

  // ===== Ordenação =====

  /**
   * Primeiro clique numa coluna já ordena do jeito mais útil para ela: texto
   * de A a Z, número e data do maior/mais recente para o menor. Clicar de novo
   * inverte; um terceiro clique volta para a ordem do arquivo.
   */
  ordenarColuna(coluna: ColunaOrdenavel): void {
    const inicial = this.direcaoInicial(coluna);

    if (this.ordenarPor !== coluna) {
      this.ordenarPor = coluna;
      this.direcao = inicial;
    } else if (this.direcao === inicial) {
      this.direcao = inicial === "asc" ? "desc" : "asc";
    } else {
      this.ordenarPor = "";
    }
    this.applyFilters();
  }

  /** Número e data começam do maior; texto começa de A. */
  private direcaoInicial(coluna: ColunaOrdenavel): "asc" | "desc" {
    return coluna === "valor" || coluna === "vigencia" ? "desc" : "asc";
  }

  iconeOrdem(coluna: ColunaOrdenavel): string {
    if (this.ordenarPor !== coluna) return "unfold_more";
    return this.direcao === "asc" ? "arrow_upward" : "arrow_downward";
  }

  ariaOrdem(coluna: ColunaOrdenavel): "ascending" | "descending" | "none" {
    if (this.ordenarPor !== coluna) return "none";
    return this.direcao === "asc" ? "ascending" : "descending";
  }

  private ordenar(lista: Contratacao[]): Contratacao[] {
    if (!this.ordenarPor) return lista;

    const coluna = this.ordenarPor;
    const sinal = this.direcao === "asc" ? 1 : -1;

    return lista.sort((a, b) => sinal * this.comparar(a, b, coluna));
  }

  private comparar(a: Contratacao, b: Contratacao, coluna: ColunaOrdenavel): number {
    switch (coluna) {
      case "fornecedor":
        return this.compararTexto(a.fornecedorNome, b.fornecedorNome);
      case "projeto":
        return this.compararTexto(a.projeto, b.projeto);
      case "tipo":
        return this.compararTexto(a.categoria, b.categoria);
      case "valor":
        return this.compararNumero(a.valor || null, b.valor || null);
      case "vigencia":
        return this.compararNumero(a.vigenciaInicio, b.vigenciaInicio);
      case "status":
        return ORDEM_STATUS[a.status] - ORDEM_STATUS[b.status];
    }
  }

  private compararTexto(a: string, b: string): number {
    const vazio = this.desempatarVazios(a, b);
    return vazio ?? this.comparadorTexto.compare(a, b);
  }

  private compararNumero(a: number | null, b: number | null): number {
    const vazio = this.desempatarVazios(a, b);
    return vazio ?? (a as number) - (b as number);
  }

  /**
   * Registro sem o dado vai para o fim nos dois sentidos — inverter a ordem
   * não deveria encher o topo da lista de linhas em branco. O `sinal` é
   * aplicado depois, então aqui o resultado já vem invertido para se anular.
   */
  private desempatarVazios(a: unknown, b: unknown): number | null {
    const aVazio = a === null || a === undefined || a === "";
    const bVazio = b === null || b === undefined || b === "";
    if (aVazio && bVazio) return 0;
    if (aVazio) return this.direcao === "asc" ? 1 : -1;
    if (bVazio) return this.direcao === "asc" ? -1 : 1;
    return null;
  }

  gerarPdf(contratacao: Contratacao, event: Event): void {
    event.stopPropagation();
    this.pdfService.generateContrato(contratacao);
  }

  formatCurrency(value: number): string {
    if (!value) return "—";
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  }

  hasActiveFilters(): boolean {
    return !!(this.searchTerm || this.filterProjeto || this.filterCategoria || this.filterStatus);
  }
}
