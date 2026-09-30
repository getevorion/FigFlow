export type DocPage = { href: string; title: string };

/** The docs, in reading order. */
export const docsNav: Array<{ title: string; pages: DocPage[] }> = [
  {
    title: "Getting started",
    pages: [
      { href: "/docs", title: "Introduction" },
      { href: "/docs/export", title: "Export your .fig file" },
      { href: "/docs/convert", title: "Convert and download" },
    ],
  },
  {
    title: "Your project",
    pages: [
      { href: "/docs/generated-code", title: "The generated code" },
      { href: "/docs/controls", title: "Controls" },
      { href: "/docs/screens", title: "Screens, popups and toasts" },
      { href: "/docs/tags", title: "Layer name tags" },
    ],
  },
  {
    title: "Fidelity",
    pages: [{ href: "/docs/fidelity", title: "What Figflow reproduces" }],
  },
  {
    title: "Help",
    pages: [{ href: "/docs/troubleshooting", title: "Troubleshooting" }],
  },
];

export const docsPages: DocPage[] = docsNav.flatMap((s) => s.pages);
