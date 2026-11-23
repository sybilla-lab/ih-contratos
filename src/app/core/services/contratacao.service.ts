import { Injectable } from "@angular/core";
import { BehaviorSubject, Observable } from "rxjs";
import { map, tap } from "rxjs/operators";
import { HttpClient } from "@angular/common/http";
import { Contratacao, ContratacaoStats } from "../models/contratacao.model";
import { CsvParserService } from "./csv-parser.service";

@Injectable({ providedIn: "root" })
export class ContratacaoService {
  private contratacoes$ = new BehaviorSubject<Contratacao[]>([]);

  constructor(private csvParser: CsvParserService, private http: HttpClient) {}

  getContratacoes(): Observable<Contratacao[]> {
    return this.contratacoes$.asObservable();
  }

  getContratacao(id: string): Observable<Contratacao | undefined> {
    return this.contratacoes$.pipe(
      map((list) => list.find((c) => c.id === id))
    );
  }

  getStats(): Observable<ContratacaoStats> {
    return this.contratacoes$.pipe(map((list) => this.calcularStats(list)));
  }

  carregarDaPlanilha(id: string, token: string): Observable<Contratacao[]> {
    const aba = encodeURIComponent("'Respostas ao formulário 1'!A:AN");
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${aba}`;
    return this.http.get<{ values?: string[][] }>(url, {
      headers: { Authorization: `Bearer ${token}` },
      params: { valueRenderOption: "FORMATTED_VALUE" },
    }).pipe(
      map(({ values }) => this.csvParser.mapPlanilha(values ?? [])),
      tap((contratacoes) => this.contratacoes$.next(contratacoes))
    );
  }

  loadFromFile(file: File): void {
    this.csvParser.parseFromFile(file).subscribe({
      next: (data) => {
        const current = this.contratacoes$.value;
        this.contratacoes$.next([...current, ...data]);
      },
      error: (err) => console.error("Erro ao parsear arquivo:", err),
    });
  }

  replaceFromFile(file: File): void {
    this.csvParser.parseFromFile(file).subscribe({
      next: (data) => this.contratacoes$.next(data),
      error: (err) => console.error("Erro ao parsear arquivo:", err),
    });
  }

  getCount(): number {
    return this.contratacoes$.value.length;
  }

  /** Prazo usual de renovação: é o que conta como "vencendo em breve". */
  readonly DIAS_ALERTA_VENCIMENTO = 90;

  private calcularStats(list: Contratacao[]): ContratacaoStats {
    const projetoMap = new Map<string, { count: number; valor: number }>();
    const entidadeMap = new Map<string, number>();
    let membros = 0;
    let pontuais = 0;
    let ativos = 0;
    let valorTotal = 0;

    for (const c of list) {
      valorTotal += c.valor;
      if (c.status === "ativo") ativos++;
      if (c.categoria === "membro") membros++;
      else pontuais++;

      const proj = c.projeto || "Sem projeto";
      const pData = projetoMap.get(proj) || { count: 0, valor: 0 };
      pData.count++;
      pData.valor += c.valor;
      projetoMap.set(proj, pData);

      const ent = c.entidade || "Sem entidade";
      entidadeMap.set(ent, (entidadeMap.get(ent) || 0) + 1);
    }

    const comValor = list.filter((c) => c.valor > 0).length;
    const aVencer = this.calcularAVencer(list);

    return {
      total: list.length,
      valorTotal,
      valorMedio: comValor ? valorTotal / comValor : 0,
      ativos,
      projetos: projetoMap.size,
      porProjeto: Array.from(projetoMap.entries())
        .map(([nome, data]) => ({ nome, ...data }))
        .sort((a, b) => b.count - a.count),
      porCategoria: { membro: membros, pontual: pontuais },
      porEntidade: Array.from(entidadeMap.entries())
        .map(([nome, count]) => ({ nome, count }))
        .sort((a, b) => b.count - a.count),
      porStatus: this.contarStatus(list),
      aVencer,
      vencendoEmBreve: aVencer.filter((i) => i.diasRestantes <= this.DIAS_ALERTA_VENCIMENTO).length,
    };
  }

  private contarStatus(list: Contratacao[]): ContratacaoStats["porStatus"] {
    const ordem: Contratacao["status"][] = ["ativo", "futuro", "encerrado", "indefinido"];
    return ordem.map((chave) => ({
      chave,
      count: list.filter((c) => c.status === chave).length,
    }));
  }

  /**
   * Fila de renovação: contratos cuja vigência ainda vai terminar, do mais
   * próximo ao mais distante. É o que exige ação — renovar, aditivar ou
   * encerrar antes da data.
   */
  private calcularAVencer(list: Contratacao[]): ContratacaoStats["aVencer"] {
    const DIA = 86_400_000;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const inicio = hoje.getTime();

    return list
      .filter((c) => c.vigenciaFim !== null && c.status !== "encerrado")
      .map((c) => ({
        contratacao: c,
        diasRestantes: Math.round(((c.vigenciaFim as number) - inicio) / DIA),
      }))
      .filter((i) => i.diasRestantes >= 0)
      .sort((a, b) => a.diasRestantes - b.diasRestantes);
  }
}
