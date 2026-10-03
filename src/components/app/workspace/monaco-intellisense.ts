import type { languages, Position, editor } from "monaco-editor";

const IMGUI_SNIPPETS = [
  "ui::button",
  "ui::slider",
  "ui::checkbox",
  "ui::combo",
  "ui::ToggleStyle",
  "ui::SelectableStyle",
  "ff::place",
  "ff::draw::box",
  "ff::draw::image",
  "ff::text_in",
  "app::state",
  "app::go",
  "app::back",
  "app::switch_to",
  "actions::",
  "IM_COL32",
  "ImVec2",
  "ImGui::",
];

function symbolsFromSources(sources: string[]): string[] {
  const set = new Set<string>(IMGUI_SNIPPETS);
  const patterns = [
    /\b(?:void|bool|int|float|double|auto|static)\s+(\w+)\s*\(/g,
    /\b(?:struct|class|enum|namespace)\s+(\w+)/g,
    /\b(?:using)\s+(\w+)\s*=/g,
    /#include\s+"([^"]+)"/g,
    /\bui::(\w+)/g,
    /\bff::(\w+)/g,
    /\bapp::(\w+)/g,
  ];
  for (const src of sources) {
    for (const re of patterns) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const sym = m[1];
        if (sym && sym.length > 1 && sym.length < 64) set.add(sym);
      }
    }
  }
  return [...set];
}

let registered = false;

export function setupMonacoIntelliSense(monaco: typeof import("monaco-editor"), getSources: () => string[]) {
  if (registered) return;
  registered = true;

  monaco.languages.register({ id: "cmake" });
  monaco.languages.setMonarchTokensProvider("cmake", {
    defaultToken: "",
    ignoreCase: true,
    tokenizer: {
      root: [
        [/#.*/, "comment"],
        [/\b(project|cmake_minimum_required|add_executable|target_link_libraries|set|include|find_package|if|else|endif)\b/, "keyword"],
        [/"[^"]*"/, "string"],
        [/\b\d+\b/, "number"],
      ],
    },
  });

  const complete = (lang: string) => {
    monaco.languages.registerCompletionItemProvider(lang, {
      triggerCharacters: [".", ":", "<", "/", '"'],
      provideCompletionItems(model: editor.ITextModel, position: Position) {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const syms = symbolsFromSources(getSources());
        const suggestions: languages.CompletionItem[] = syms.map((label) => ({
          label,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: label,
          range,
        }));
        return { suggestions };
      },
    });
  };

  complete("cpp");
  complete("cmake");
}
