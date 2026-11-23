import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnDestroy,
  Output,
  ViewChild,
  AfterViewInit,
} from "@angular/core";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { VariavelHighlight } from "./variavel-highlight";

/**
 * Superfície editável. A barra de ferramentas mora na página e age sobre o
 * editor que estiver em foco — assim cada cláusula não carrega sua própria
 * barra repetida na tela.
 */
@Component({
  selector: "app-rich-editor",
  standalone: true,
  template: `<div #host></div>`,
  styles: [":host { display: block; }"],
})
export class RichEditorComponent implements AfterViewInit, OnDestroy {
  @ViewChild("host", { static: true }) host!: ElementRef<HTMLDivElement>;

  @Input() placeholder = "Escreva aqui…";

  @Input()
  set value(html: string) {
    this._value = html ?? "";
    if (this.editor && this.editor.getHTML() !== this._value) {
      this.editor.commands.setContent(this._value, { emitUpdate: false });
    }
  }
  private _value = "";

  @Output() valueChange = new EventEmitter<string>();
  /** Este editor passou a ser o alvo da barra de ferramentas. */
  @Output() ativado = new EventEmitter<Editor>();

  editor?: Editor;

  constructor(private zone: NgZone) {}

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      this.editor = new Editor({
        element: this.host.nativeElement,
        content: this._value,
        extensions: [
          StarterKit.configure({
            heading: false,
            codeBlock: false,
            code: false,
            horizontalRule: false,
            blockquote: false,
            strike: false,
            link: false,
          }),
          // `includeChildren` marca todo parágrafo vazio com `is-empty`, o que
          // permite à numeração da tela pular os mesmos parágrafos que o PDF pula.
          Placeholder.configure({
            placeholder: () => this.placeholder,
            showOnlyCurrent: false,
            includeChildren: true,
          }),
          VariavelHighlight,
        ],
        editorProps: {
          attributes: { class: "doc-texto" },
        },
        onUpdate: ({ editor }) => {
          this._value = editor.getHTML();
          this.zone.run(() => this.valueChange.emit(this._value));
        },
        onFocus: ({ editor }) => this.zone.run(() => this.ativado.emit(editor)),
        // Reemitido a cada movimento do cursor para a barra refletir o que
        // está ativo na posição atual (negrito, lista, …).
        onSelectionUpdate: ({ editor }) => this.zone.run(() => this.ativado.emit(editor)),
      });
    });
  }

  focar(): void {
    this.editor?.commands.focus("end");
  }

  ngOnDestroy(): void {
    this.editor?.destroy();
  }
}
