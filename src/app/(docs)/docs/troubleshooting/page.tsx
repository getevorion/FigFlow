import { A, C, DocHeader, H3, P, Pager } from "@/components/docs/prose";

export const metadata = { title: "Troubleshooting" };

const items: Array<{ q: string; a: React.ReactNode }> = [
  {
    q: "The upload says it isn't a .fig file",
    a: (
      <>
        Figflow reads design files saved with <C>File → Save local copy…</C>. FigJam boards, Slides decks and exports (PNG, SVG, PDF) can&apos;t be converted.
      </>
    ),
  },
  {
    q: "A frame I need isn't in the picker",
    a: <>The picker lists the frames at the top level of each page (frames inside sections too). A frame nested inside another frame is part of that frame.</>,
  },
  {
    q: "A screen is missing from the app",
    a: (
      <>
        Screens come from where the start frame&apos;s buttons lead. Give the button a prototype link in Figma, or name it with a tag such as{" "}
        <C>go: Settings</C>, and keep the screens on the same page. The converter lists what it found under &quot;How frames were matched&quot;. See{" "}
        <A href="/docs/screens">Screens, popups and toasts</A>.
      </>
    ),
  },
  {
    q: "A control isn't recognized, or something is a control that shouldn't be",
    a: (
      <>
        Name the layer <C>button: Save</C>, <C>switch: Sound</C> and so on to make it a control, or <C>static</C> to keep it a picture. See{" "}
        <A href="/docs/tags">Layer name tags</A>.
      </>
    ),
  },
  {
    q: "A font looks different",
    a: (
      <>
        Characters the design shows are drawn from the glyphs saved in the file, so they match. Characters it never shows (text typed at runtime) come from the
        font itself, from Google Fonts when it&apos;s there, and otherwise from Inter; the Warnings tab says which.
      </>
    ),
  },
  {
    q: "The project doesn't build",
    a: (
      <>
        Use Visual Studio 2022 with the &quot;Desktop development with C++&quot; workload, which brings the Windows SDK and DirectX 11. Build{" "}
        <C>Release | x64</C>. With CMake, use version 3.20 or later.
      </>
    ),
  },
  {
    q: "My upload or project is gone",
    a: <>Uploads and everything made from them are deleted two hours after the upload. Upload the file again to convert it again.</>,
  },
];

export default function TroubleshootingDocs() {
  return (
    <article>
      <DocHeader section="Help" title="Troubleshooting">
        The usual questions, and what to do about them.
      </DocHeader>
      {items.map((it) => (
        <section key={it.q}>
          <H3>{it.q}</H3>
          <P className="mt-2">{it.a}</P>
        </section>
      ))}
      <Pager href="/docs/troubleshooting" />
    </article>
  );
}
