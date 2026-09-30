/** Site-wide content shared by the landing page, docs and account screens. */

export const site = {
  name: "Figflow",
  tagline: "Figma to Dear ImGui",
  description: "Your Figma frame, as a working Dear ImGui app.",
  retentionHours: 2,
  maxUploadMb: 512,
  /** Figflow is open source: the repository. */
  sourceUrl: "https://github.com/getevorion/figflow",
} as const;

/** The project's owner and maintainer. */
export const owner = {
  name: "Shadow",
  role: "Owner and maintainer",
  avatar: "/team/shadow.jpg",
  org: { name: "Evorion Labs", href: "https://evora.cx", badge: "/team/evorion.png" },
  body: [
    "Shadow started Figflow at Evorion Labs and maintains it: the .fig reader, the Dear ImGui runtime and generator, and this site.",
    "Figflow is a community project. Bug reports, designs that convert badly and pull requests decide what it learns to recognise next.",
  ],
} as const;

export const nav = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/#open-source", label: "Open source" },
  { href: "/#team", label: "Team" },
  { href: "/docs", label: "Docs" },
] as const;

export const faq: Array<{ q: string; a: string }> = [
  {
    q: "Is Figflow free?",
    a: "Yes. Figflow is an open-source community project: no plans, no license keys, and the code it generates is yours.",
  },
  {
    q: "What file do I upload?",
    a: "The .fig from File → Save local copy in Figma. It holds every layer, font and image, so no Figma login or API token is needed.",
  },
  {
    q: "What do I get back?",
    a: "A C++20 project for Dear ImGui 1.92 with a Visual Studio solution and a CMakeLists.txt, for Win32 and DirectX 11, with every dependency included.",
  },
  {
    q: "Is the code really readable?",
    a: "Yes. One file per widget kind, your components as C++ components, one file per screen, and a theme named after your Figma styles and variables.",
  },
  {
    q: "Will it look like my design?",
    a: "It uses the design's own values: glyph positions, per-corner radii, strokes, gradients, shadows, masks and images, drawn by Dear ImGui itself.",
  },
  {
    q: "Which parts become working controls?",
    a: "Buttons, sidebar items, toggles, checkboxes, radio buttons, sliders, text fields, dropdowns and keybinds, recognized by how they look. Hover, pressed and disabled states come from your variants.",
  },
  {
    q: "Can one project have several screens?",
    a: "Yes. Prototype links, and buttons labelled Login or Continue, become screens with transitions. Dialogs become popups and notifications become toasts.",
  },
  {
    q: "What happens to my files?",
    a: "They are deleted, with everything made from them, two hours after upload. Nothing is used for training.",
  },
  {
    q: "Can I change the generated code?",
    a: "It is plain C++ you own, with no license checks or calls home. Change it, ship it, sell what you build with it.",
  },
];
