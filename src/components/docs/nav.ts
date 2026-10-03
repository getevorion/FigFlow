export type DocPage = { href: string; title: string };

/** The docs, in reading order. */
export const docsNav: Array<{ title: string; pages: DocPage[] }> = [
  {
    title: "Start here",
    pages: [
      { href: "/docs", title: "Overview" },
      { href: "/docs/export", title: "Getting your .fig" },
      { href: "/docs/convert", title: "Using the converter" },
      { href: "/docs/hosting", title: "Hosting on Vercel" },
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
    pages: [
      { href: "/docs/fidelity", title: "What Figflow reproduces" },
      { href: "/docs/image-to-imgui", title: "Image vs .fig → ImGui" },
    ],
  },
  {
    title: "Help",
    pages: [{ href: "/docs/troubleshooting", title: "Troubleshooting" }],
  },
];

export const docsPages: DocPage[] = docsNav.flatMap((s) => s.pages);
