import { DOCUMENT } from "@angular/common";
import { Component, inject } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { SidebarComponent } from "./shared/components/sidebar/sidebar.component";
import { ContratacaoService } from "./core/services/contratacao.service";

const ESCOPO_PLANILHAS = "https://www.googleapis.com/auth/spreadsheets.readonly";
type IdentidadeGoogle = {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (resposta: { access_token?: string; error?: string }) => void;
        error_callback: () => void;
      }): { requestAccessToken(config: { prompt: string }): void };
    };
  };
};

@Component({
  selector: "app-root",
  standalone: true,
  imports: [RouterOutlet, SidebarComponent],
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.css",
})
export class AppComponent {
  private readonly documento = inject(DOCUMENT);
  private readonly contratacoes = inject(ContratacaoService);
  private readonly clienteGoogle = this.configuracao("ih-google-client-id");
  private readonly planilha = this.configuracao("ih-planilha-contratos");

  readonly planilhaConfigurada = Boolean(this.clienteGoogle && this.planilha);
  conectado = false;
  carregando = false;
  erro = "";

  conectarPlanilha(): void {
    const google = (this.documento.defaultView as (Window & { google?: IdentidadeGoogle }) | null)?.google;
    if (!google) {
      this.erro = "O login Google ainda não carregou. Tente novamente.";
      return;
    }

    this.erro = "";
    this.carregando = true;
    const cliente = google.accounts.oauth2.initTokenClient({
      client_id: this.clienteGoogle,
      scope: ESCOPO_PLANILHAS,
      callback: ({ access_token, error }) => {
        if (error || !access_token) {
          this.falhar("O Google não autorizou a leitura da planilha.");
          return;
        }

        this.contratacoes.carregarDaPlanilha(this.planilha, access_token).subscribe({
          next: () => {
            this.conectado = true;
            this.carregando = false;
          },
          error: (falha) => this.falhar(falha.status === 403 || falha.status === 404
            ? "Confira se sua conta Google tem acesso à planilha Gestão de Contratos."
            : "Não foi possível carregar as solicitações da planilha."),
        });
      },
      error_callback: () => this.falhar("O login Google foi interrompido. Tente novamente."),
    });
    try {
      cliente.requestAccessToken({ prompt: "" });
    } catch {
      this.falhar("Não foi possível abrir o login Google.");
    }
  }

  private configuracao(nome: string): string {
    return this.documento.querySelector<HTMLMetaElement>(`meta[name="${nome}"]`)?.content.trim() ?? "";
  }

  private falhar(mensagem: string): void {
    this.carregando = false;
    this.erro = mensagem;
  }
}
