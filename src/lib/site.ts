/** Site-wide content shared by the landing page, docs and account screens. */

export const site = {
  name: "Figflow",
  tagline: "Figma to Dear ImGui",
  description: "Figma designs in, readable Dear ImGui C++ out.",
  retentionHours: 2,
  maxUploadMb: 512,
  /** Figflow is open source: the repository. */
  sourceUrl: "https://github.com/getevorion/FigFlow",
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
    q: "How much does Figflow cost?",
    a: "Nothing. It's free and open source: no plans, no license keys, and the code you generate is yours to change, ship and sell.",
  },
  {
    q: "Can I run Figflow myself?",
    a: "Yes. It's a Next.js app with a small C++ runtime. Clone the repository, run npm install and npm run dev, and convert on your own machine.",
  },
  {
    q: "Where does the .fig come from?",
    a: "Figma's File menu: Save local copy… writes the whole design to one file, layers, fonts and images included. No Figma login or API token is involved.",
  },
  {
    q: "Which platform does the project target?",
    a: "Windows. You get a C++20 project on Dear ImGui 1.92 with Win32 and DirectX 11, a Visual Studio 2022 solution and a CMakeLists.txt. Everything it needs is in the ZIP.",
  },
  {
    q: "How is the code organised?",
    a: "Widgets in ui/components, one file per screen, popup and toast, a single State struct for the app's data, and a theme generated from your Figma styles and variables.",
  },
  {
    q: "What turns into a widget?",
    a: "Buttons, nav items, tab bars, toggles, checkboxes, radios, sliders, text fields, dropdowns and key binds, found by how they look. Their hover, pressed and disabled variants become their states.",
  },
  {
    q: "Does it handle apps with several screens?",
    a: "Yes. Every frame the size of your app's window becomes a screen, prototype links become navigation, dialogs become popups and notifications become toasts.",
  },
  {
    q: "How close does the result get?",
    a: "Text is drawn from the design's own glyphs, and radii, strokes, gradients, shadows and masks keep their exact values. On the designs we test against, 98.9% to 99.9% of pixels match.",
  },
  {
    q: "How long do you keep uploads?",
    a: "Two hours. Then the upload and everything made from it is deleted. Nothing is used for training.",
  },
];
