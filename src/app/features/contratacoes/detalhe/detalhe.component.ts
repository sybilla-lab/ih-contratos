import { Component, OnInit, inject } from "@angular/core";
import { CommonModule, DOCUMENT } from "@angular/common";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { ContratacaoService } from "../../../core/services/contratacao.service";
import { ContratoPdfService } from "../../../core/services/contrato-pdf.service";
import { ContratoRascunhoService } from "../../../core/services/contrato-rascunho.service";
import { Contratacao } from "../../../core/models/contratacao.model";

@Component({
  selector: "app-detalhe",
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: "./detalhe.component.html",
  styleUrl: "./detalhe.component.css",
})
export class DetalheComponent implements OnInit {
  contratacao: Contratacao | null = null;
  activeTab = "geral";
  private readonly document = inject(DOCUMENT);

  get urlMinutaEnap(): string | null {
    const id = this.contratacao?.solicitacaoId;
    const endpoint = this.document.querySelector<HTMLMetaElement>(
      'meta[name="ih-minutas-webapp"]'
    )?.content.trim();
    if (!id || !endpoint || !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(endpoint)) {
      return null;
    }
    const url = new URL(endpoint);
    url.searchParams.set("solicitacao", id);
    return url.href;
  }
  /** Há edições salvas para este contrato aguardando no navegador. */
  temRascunho = false;

  constructor(
    private route: ActivatedRoute,
    private contratacaoService: ContratacaoService,
    private pdfService: ContratoPdfService,
    private rascunhos: ContratoRascunhoService
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get("id") ?? "";
    this.contratacaoService.getContratacao(id).subscribe((c) => {
      this.contratacao = c || null;
      this.temRascunho = !!c && !!this.rascunhos.carregar(c, "contrato");
    });
  }

  setTab(tab: string): void {
    this.activeTab = tab;
  }

  gerarContratoPdf(): void {
    if (this.contratacao) {
      this.pdfService.generateContrato(this.contratacao);
    }
  }

  gerarAditivoPdf(): void {
    if (this.contratacao) {
      this.pdfService.generateAditivo(this.contratacao);
    }
  }

  formatCurrency(value: number): string {
    if (!value) return "—";
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  }
}
