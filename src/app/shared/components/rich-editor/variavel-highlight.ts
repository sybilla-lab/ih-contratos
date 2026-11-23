import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const PADRAO_VARIAVEL = /\{\{\s*\w+\s*\}\}/g;

/**
 * Pinta as variáveis `{{...}}` como chips dentro do editor usando decorações.
 * Decoração não entra no documento, então o HTML salvo continua sendo texto
 * puro — o que mantém o gerador de PDF simples.
 */
export const VariavelHighlight = Extension.create({
  name: "variavelHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("variavelHighlight"),
        props: {
          decorations(state) {
            const decoracoes: Decoration[] = [];

            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return;
              for (const m of node.text.matchAll(PADRAO_VARIAVEL)) {
                const inicio = pos + (m.index ?? 0);
                decoracoes.push(
                  Decoration.inline(inicio, inicio + m[0].length, { class: "var-chip" })
                );
              }
            });

            return DecorationSet.create(state.doc, decoracoes);
          },
        },
      }),
    ];
  },
});
