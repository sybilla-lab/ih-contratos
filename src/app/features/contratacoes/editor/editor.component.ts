import { Component, OnDestroy, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { Editor } from "@tiptap/core";
import { Subject, debounceTime, takeUntil } from "rxjs";
import { Contratacao } from "../../../core/models/contratacao.model";
import {
  Clausula,
  ContratoDocumento,
  Pendencia,
  TipoDocumento,
} from "../../../core/models/contrato-documento.model";
import { ContratacaoService } from "../../../core/services/contratacao.service";
import { ContratoPdfService } from "../../../core/services/contrato-pdf.service";
import { ContratoRascunhoService } from "../../../core/services/contrato-rascunho.service";
import { ContratoTemplateService } from "../../../core/services/contrato-template.service";
import { RichEditorComponent } from "../../../shared/components/rich-editor/rich-editor.component";

@Component({
  selector: "app-editor",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RichEditorComponent],
  templateUrl: "./editor.component.html",
  styleUrl: "./editor.component.css",
})
export class EditorComponent implements OnInit, OnDestroy {
  contratacao: Contratacao | null = null;
  documento: ContratoDocumento | null = null;
  tipo: TipoDocumento = "contrato";

  /** Alvo da barra de ferramentas: o último editor que recebeu o cursor. */
  editorAtivo: Editor | null = null;
  /** Alterna entre ver o modelo com as variáveis e o texto já preenchido. */
  preenchido = false;
  salvando = false;
  pendencias: Pendencia[] = [];
  mostrarVariaveis = false;

  private alteracoes$ = new Subject<void>();
  private destruir$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private contratacaoService: ContratacaoService,
    private rascunhos: ContratoRascunhoService,
    private pdf: ContratoPdfService,
    public template: ContratoTemplateService
  ) {}

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get("id"));
    const tipoParam = this.route.snapshot.queryParamMap.get("tipo");
    if (tipoParam === "aditivo") this.tipo = "aditivo";

    this.contratacaoService
      .getContratacao(id)
      .pipe(takeUntil(this.destruir$))
      .subscribe((c) => {
        if (!c || this.contratacao) return;
        this.contratacao = c;
        this.carregarDocumento();
      });

    this.alteracoes$
      .pipe(debounceTime(700), takeUntil(this.destruir$))
      .subscribe(() => this.persistir());
  }

  ngOnDestroy(): void {
    if (this.salvando) this.persistir();
    this.destruir$.next();
    this.destruir$.complete();
  }

  // ===== Documento =====

  trocarTipo(tipo: TipoDocumento): void {
    if (this.tipo === tipo) return;
    this.persistir();
    this.tipo = tipo;
    this.editorAtivo = null;
    this.carregarDocumento();
  }

  private carregarDocumento(): void {
    if (!this.contratacao) return;
    this.documento = this.rascunhos.obter(this.contratacao, this.tipo);
    this.revalidar();
  }

  aoEditar(): void {
    this.salvando = true;
    this.revalidar();
    this.alteracoes$.next();
  }

  private persistir(): void {
    if (!this.documento) return;
    this.rascunhos.salvar(this.documento);
    this.salvando = false;
  }

  private revalidar(): void {
    this.pendencias =
      this.documento && this.contratacao
        ? this.template.detectarPendencias(this.documento, this.contratacao)
        : [];
  }

  // ===== Cláusulas =====

  get clausulasIncluidas(): Clausula[] {
    return this.documento?.clausulas.filter((c) => c.incluida) ?? [];
  }

  numeroDe(clausula: Clausula): number {
    return this.clausulasIncluidas.indexOf(clausula) + 1;
  }

  /** O número vira uma string CSS para o `content:` da numeração automática. */
  numeroCss(clausula: Clausula): string {
    return `"${this.numeroDe(clausula)}"`;
  }

  foiEditada(clausula: Clausula): boolean {
    return clausula.conteudo !== clausula.padrao || clausula.titulo !== clausula.padraoTitulo;
  }

  ehPersonalizada(clausula: Clausula): boolean {
    return !clausula.padrao;
  }

  alternarInclusao(clausula: Clausula): void {
    clausula.incluida = !clausula.incluida;
    this.aoEditar();
  }

  mover(clausula: Clausula, direcao: -1 | 1): void {
    if (!this.documento) return;
    const lista = this.documento.clausulas;
    const de = lista.indexOf(clausula);
    const para = de + direcao;
    if (para < 0 || para >= lista.length) return;
    lista.splice(para, 0, lista.splice(de, 1)[0]);
    this.aoEditar();
  }

  restaurar(clausula: Clausula): void {
    clausula.conteudo = clausula.padrao;
    clausula.titulo = clausula.padraoTitulo;
    this.aoEditar();
  }

  remover(clausula: Clausula): void {
    if (!this.documento) return;
    this.documento.clausulas = this.documento.clausulas.filter((c) => c !== clausula);
    this.aoEditar();
  }

  adicionarClausula(): void {
    if (!this.documento) return;
    const nova: Clausula = {
      id: `custom-${Date.now()}`,
      titulo: "NOVA CLÁUSULA",
      conteudo: "<p></p>",
      incluida: true,
      padrao: "",
      padraoTitulo: "",
    };
    this.documento.clausulas.push(nova);
    this.aoEditar();
    setTimeout(() => this.irPara(nova.id));
  }

  restaurarTudo(): void {
    if (!this.contratacao) return;
    if (!confirm("Descartar todas as edições e voltar ao modelo padrão?")) return;
    this.rascunhos.descartar(this.contratacao.id, this.tipo);
    this.documento = this.template.criarDocumento(this.contratacao, this.tipo);
    this.editorAtivo = null;
    this.salvando = false;
    this.revalidar();
  }

  // ===== Barra de ferramentas =====

  definirEditorAtivo(editor: Editor): void {
    this.editorAtivo = editor;
  }

  comandoAtivo(nome: string): boolean {
    return this.editorAtivo?.isActive(nome) ?? false;
  }

  negrito(): void {
    this.editorAtivo?.chain().focus().toggleBold().run();
  }

  italico(): void {
    this.editorAtivo?.chain().focus().toggleItalic().run();
  }

  sublinhado(): void {
    this.editorAtivo?.chain().focus().toggleUnderline().run();
  }

  listaSimples(): void {
    this.editorAtivo?.chain().focus().toggleBulletList().run();
  }

  listaNumerada(): void {
    this.editorAtivo?.chain().focus().toggleOrderedList().run();
  }

  desfazer(): void {
    this.editorAtivo?.chain().focus().undo().run();
  }

  refazer(): void {
    this.editorAtivo?.chain().focus().redo().run();
  }

  /** Insere `{{chave}}` na posição do cursor do editor ativo. */
  inserirVariavel(chave: string): void {
    if (!this.editorAtivo) return;
    this.editorAtivo.chain().focus().insertContent(`{{${chave}}}`).run();
    this.mostrarVariaveis = false;
  }

  // ===== Saída =====

  resolvido(html: string): string {
    return this.contratacao ? this.template.resolverParaHtml(html, this.contratacao) : html;
  }

  resolvidoTexto(texto: string): string {
    return this.contratacao ? this.template.resolver(texto, this.contratacao) : texto;
  }

  gerarPdf(): void {
    if (!this.documento || !this.contratacao) return;
    this.persistir();
    this.pdf.gerar(this.documento, this.contratacao);
  }

  irPara(origem: string): void {
    document.getElementById(`bloco-${origem}`)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }

  trackClausula(_i: number, c: Clausula): string {
    return c.id;
  }
}
