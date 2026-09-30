import "server-only";
import { createHighlighter, type Highlighter, type ThemeRegistration } from "shiki";

/**
 * Code theme shared by the landing page, docs and the app's code viewer:
 * violet keywords and blue calls on black, in the spirit of Tokyo Night.
 */
export const brandTheme: ThemeRegistration = {
  name: "figflow",
  type: "dark",
  colors: { "editor.background": "#00000000", "editor.foreground": "#d4d6e4" },
  tokenColors: [
    { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: "#5c6080", fontStyle: "italic" } },
    { scope: ["keyword", "storage", "storage.type", "storage.modifier", "keyword.control"], settings: { foreground: "#bb9af7" } },
    { scope: ["keyword.control.directive", "meta.preprocessor", "keyword.other.directive"], settings: { foreground: "#9aa0c7" } },
    { scope: ["entity.name.function", "support.function", "meta.function-call"], settings: { foreground: "#7aa2f7" } },
    { scope: ["entity.name.type", "support.type", "entity.name.namespace", "entity.name.scope-resolution", "storage.type.built-in"], settings: { foreground: "#7dcfff" } },
    { scope: ["string", "string.quoted", "meta.preprocessor.include string"], settings: { foreground: "#e0af68" } },
    { scope: ["constant.numeric", "constant.language", "constant.character"], settings: { foreground: "#ff9e64" } },
    { scope: ["variable", "variable.other", "variable.parameter"], settings: { foreground: "#d4d6e4" } },
    { scope: ["keyword.operator", "punctuation"], settings: { foreground: "#8f93ad" } },
  ],
};

let highlighter: Promise<Highlighter> | null = null;

function get(): Promise<Highlighter> {
  highlighter ??= createHighlighter({ themes: [brandTheme], langs: ["cpp", "c", "cmake", "json", "bash", "typescript", "tsx", "powershell"] });
  return highlighter;
}

export async function highlight(code: string, lang: string = "cpp"): Promise<string> {
  const h = await get();
  const known = h.getLoadedLanguages().includes(lang) ? lang : "text";
  return h.codeToHtml(code, { lang: known, theme: "figflow" });
}
