/**
 * Os dados chegam de um formulário do Google onde as pessoas colam texto do
 * Word. Vem junto um bocado de caractere que só existe dentro do Word: os
 * marcadores de lista das fontes Symbol/Wingdings (área de uso privado do
 * Unicode), separadores de linha invisíveis e espaços especiais.
 *
 * Na tela eles viram quadradinhos. No PDF o estrago é maior: basta um único
 * caractere fora do WinAnsi para o jsPDF gravar a linha inteira em UTF-16
 * mantendo uma fonte de 1 byte — cada letra ganha um byte nulo que o leitor
 * desenha como glifo vazio. É isso que espalha as letras e joga o texto para
 * fora da margem.
 *
 * Os padrões abaixo usam escapes em vez dos caracteres literais: são todos
 * invisíveis, e literais somem numa cópia ou num salvamento com outra
 * codificação.
 */

/** Uso privado do Unicode: onde caem os marcadores de lista do Word. */
const MARCADORES_WORD = new RegExp("[\uE000-\uF8FF]", "g");

/** Separadores de linha e de parágrafo invisíveis. */
const QUEBRAS_INVISIVEIS = new RegExp("[\u2028\u2029]", "g");

/** Zero-width e marcas de direção. */
const INVISIVEIS = new RegExp("[\u200B-\u200F\u2060\uFEFF]", "g");

/** Espaços que não são o espaço comum. */
const ESPACOS_ESTRANHOS = new RegExp("[\u00A0\u2000-\u200A\u202F\u205F\u3000]", "g");

/**
 * Limpa o texto vindo da planilha. As quebras de linha são preservadas — é
 * nelas que a lista de entregas do objeto se apoia.
 */
export function normalizarTexto(texto: string): string {
  if (!texto) return "";

  return texto
    .replace(MARCADORES_WORD, "•")
    .replace(QUEBRAS_INVISIVEIS, "\n")
    .replace(/\r\n?/g, "\n")
    .replace(INVISIVEIS, "")
    .replace(ESPACOS_ESTRANHOS, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Repertório que as fontes padrão do jsPDF sabem escrever: Latin-1 mais a
 * pontuação do CP1252 (travessões, aspas curvas, bullet, reticências…).
 */
const FORA_DO_WINANSI = new RegExp(
  "[^" +
    "\\n\\x20-\\x7E\\xA0-\\xFF" +
    "\\u20AC\\u201A\\u0192\\u201E\\u2026\\u2020\\u2021\\u02C6\\u2030\\u0160" +
    "\\u2039\\u0152\\u017D\\u2018\\u2019\\u201C\\u201D\\u2022\\u2013\\u2014" +
    "\\u02DC\\u2122\\u0161\\u203A\\u0153\\u017E\\u0178" +
    "]",
  "g"
);

/** Caracteres frequentes em texto colado que não têm lugar no WinAnsi. */
const EQUIVALENTES: Record<string, string> = {
  "−": "-", // menos matemático
  "‐": "-",
  "‑": "-",
  "\u00AD": "", // hifen opcional (invisivel)
  "′": "'",
  "″": '"',
  "≤": "<=",
  "≥": ">=",
  "≠": "!=",
  "×": "x",
  "→": "->",
};

/** Acentos combinantes, para reduzir "ń" à letra base. */
const COMBINANTES = new RegExp("[\u0300-\u036F]", "g");

/**
 * Última barreira antes do `doc.text`: troca o que o jsPDF não codifica pelo
 * equivalente mais próximo, para que nenhuma linha caia no modo 2 bytes.
 */
export function paraFontePdf(texto: string): string {
  return texto.replace(FORA_DO_WINANSI, (ch) => {
    const conhecido = EQUIVALENTES[ch];
    if (conhecido !== undefined) return conhecido;

    const semAcento = ch.normalize("NFD").replace(COMBINANTES, "");
    return /^[\x20-\x7E]+$/.test(semAcento) ? semAcento : "";
  });
}
