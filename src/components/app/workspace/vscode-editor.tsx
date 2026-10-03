"use client";

import { useCallback, useEffect, useRef } from "react";
import Editor, { loader, type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { setupMonacoIntelliSense } from "./monaco-intellisense";

loader.config({
  paths: {
    vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.57.0/min/vs",
  },
});

function monacoLang(path: string, lang: string): string {
  if (/CMakeLists\.txt$/i.test(path)) return "cmake";
  switch (lang) {
    case "cpp":
    case "c":
      return "cpp";
    case "json":
      return "json";
    default:
      return "plaintext";
  }
}

export function VscodeEditor({
  path,
  lang,
  value,
  target,
  getSources,
  loadedFiles,
}: {
  path: string;
  lang: string;
  value: string;
  target: string | null;
  getSources: () => string[];
  loadedFiles: Array<{ path: string; lang: string; text: string }>;
}) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Awaited<ReturnType<typeof loader.init>> | null>(null);
  const decoRef = useRef<string[]>([]);
  const sourcesRef = useRef(getSources);
  useEffect(() => {
    sourcesRef.current = getSources;
  }, [getSources]);

  const jumpToTarget = useCallback(() => {
    const ed = editorRef.current;
    const monaco = monacoRef.current;
    if (!ed || !monaco || !target || !value) return;
    const lines = value.split("\n");
    const idx = lines.findIndex((l) => l.includes(target));
    if (idx < 0) return;
    const line = idx + 1;
    ed.revealLineInCenter(line);
    ed.setSelection(new monaco.Selection(line, 1, line, 1));
    decoRef.current = ed.deltaDecorations(decoRef.current, [
      {
        range: new monaco.Range(line, 1, line, lines[idx].length + 1),
        options: {
          isWholeLine: true,
          className: "vscode-target-line",
          overviewRuler: { color: "#0077e6", position: monaco.editor.OverviewRulerLane.Center },
        },
      },
    ]);
  }, [target, value]);

  const applyModel = useCallback(() => {
    const monaco = monacoRef.current;
    const ed = editorRef.current;
    if (!monaco || !ed) return;
    const language = monacoLang(path, lang);
    const uri = monaco.Uri.parse(`inmemory://figflow/${path}`);
    let model = monaco.editor.getModel(uri);
    if (!model) model = monaco.editor.createModel(value, language, uri);
    else if (model.getValue() !== value) model.setValue(value);
    if (model.getLanguageId() !== language) monaco.editor.setModelLanguage(model, language);
    if (ed.getModel() !== model) ed.setModel(model);
    jumpToTarget();
  }, [path, lang, value, jumpToTarget]);

  const onMount: OnMount = (ed, monaco) => {
    editorRef.current = ed;
    monacoRef.current = monaco;
    setupMonacoIntelliSense(monaco, () => sourcesRef.current());
    monaco.editor.setTheme("vs");
    applyModel();
  };

  useEffect(() => {
    applyModel();
  }, [applyModel]);

  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco) return;
    for (const f of loadedFiles) {
      const language = monacoLang(f.path, f.lang);
      const uri = monaco.Uri.parse(`inmemory://figflow/${f.path}`);
      const model = monaco.editor.getModel(uri);
      if (!model) monaco.editor.createModel(f.text, language, uri);
      else if (model.getValue() !== f.text) model.setValue(f.text);
    }
  }, [loadedFiles]);

  useEffect(() => {
    jumpToTarget();
  }, [jumpToTarget, path]);

  return (
    <Editor
      height="100%"
      defaultLanguage="cpp"
      theme="vs"
      loading={null}
      onMount={onMount}
      options={{
        readOnly: true,
        domReadOnly: true,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 13,
        lineHeight: 20,
        minimap: { enabled: true, scale: 1 },
        scrollBeyondLastLine: false,
        padding: { top: 8, bottom: 8 },
        renderLineHighlight: "all",
        colorDecorators: true,
        bracketPairColorization: { enabled: true },
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
        overviewRulerLanes: 2,
        folding: true,
        links: true,
        wordWrap: "off",
        automaticLayout: true,
        contextmenu: true,
        find: { addExtraSpaceOnTop: false },
        quickSuggestions: { other: true, strings: true, comments: false },
        wordBasedSuggestions: "allDocuments",
        suggestOnTriggerCharacters: true,
        acceptSuggestionOnEnter: "smart",
        tabCompletion: "on",
        parameterHints: { enabled: true },
      }}
    />
  );
}
