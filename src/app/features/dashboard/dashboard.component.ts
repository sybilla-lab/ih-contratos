import { Component, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { ContratacaoService } from "../../core/services/contratacao.service";
import { Contratacao, ContratacaoStats } from "../../core/models/contratacao.model";

/**
 * As barras são desenhadas em HTML/CSS, não em canvas. Os nomes de projeto são
 * longos ("Estratégia Alimenta Cidades +10…"), e num eixo de canvas eles saem
 * truncados e girados; em barras horizontais de HTML o rótulo fica na
 * horizontal, legível, selecionável e acessível a leitor de tela — a própria
 * marcação já é a versão em tabela do gráfico.
 */
@Component({
  selector: "app-dashboard",
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: "./dashboard.component.html",
  styleUrl: "./dashboard.component.css",
})
export class DashboardComponent implements OnInit {
  stats: ContratacaoStats | null = null;

  readonly rotuloStatus: Record<Contratacao["status"], string> = {
    ativo: "Vigentes",
    futuro: "A iniciar",
    encerrado: "Encerrados",
    indefinido: "Sem data",
  };

  /** Status nunca vai só na cor: cada um carrega ícone e rótulo. */
  readonly iconeStatus: Record<Contratacao["status"], string> = {
    ativo: "play_circle",
    futuro: "schedule",
    encerrado: "check_circle",
    indefinido: "help",
  };

  constructor(public contratacaoService: ContratacaoService) {}

  ngOnInit(): void {
    this.contratacaoService.getStats().subscribe((stats) => (this.stats = stats));
  }

  // ===== Formatação =====

  moeda(valor: number): string {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    }).format(valor);
  }

  /** Rótulo curto para o topo da lista: "hoje", "amanhã", "em 12 dias". */
  prazo(dias: number): string {
    if (dias === 0) return "vence hoje";
    if (dias === 1) return "vence amanhã";
    if (dias < 60) return `em ${dias} dias`;
    return `em ${Math.round(dias / 30)} meses`;
  }

  /** Faixa de urgência do vencimento — vira cor e é dita no texto também. */
  urgencia(dias: number): "alta" | "media" | "baixa" {
    if (dias <= 30) return "alta";
    if (dias <= this.contratacaoService.DIAS_ALERTA_VENCIMENTO) return "media";
    return "baixa";
  }

  percentual(parte: number, total: number): number {
    return total > 0 ? (parte / total) * 100 : 0;
  }

  // ===== Escalas das barras =====

  get projetosVisiveis(): ContratacaoStats["porProjeto"] {
    return this.stats?.porProjeto.slice(0, 8) ?? [];
  }

  get entidadesVisiveis(): ContratacaoStats["porEntidade"] {
    return this.stats?.porEntidade.slice(0, 5) ?? [];
  }

  /**
   * A barra é proporcional ao maior valor da própria lista, não ao total: com
   * um projeto concentrando metade dos contratos, escalar pelo total deixaria
   * todo o resto rente a zero e ilegível.
   */
  larguraBarra(valor: number, maximo: number): number {
    return maximo > 0 ? Math.max((valor / maximo) * 100, 1.5) : 0;
  }

  get maxProjeto(): number {
    return this.projetosVisiveis[0]?.count ?? 0;
  }

  get maxEntidade(): number {
    return this.entidadesVisiveis[0]?.count ?? 0;
  }

  trackProjeto(_i: number, p: { nome: string }): string {
    return p.nome;
  }

  trackVencimento(_i: number, item: { contratacao: Contratacao }): number {
    return item.contratacao.id;
  }
}
