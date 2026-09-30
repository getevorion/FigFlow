import { C, DocHeader, H2, Note, P, Pager, Steps, Step, Ul } from "@/components/docs/prose";

export const metadata = { title: "Export your .fig file" };

export default function ExportDocs() {
  return (
    <article>
      <DocHeader section="Getting started" title="Export your .fig file">
        Figflow reads Figma&apos;s own file format. A local copy of your design has everything it needs.
      </DocHeader>

      <Steps>
        <Step title="Open the design in Figma">In the desktop app or in the browser.</Step>
        <Step title="Choose File → Save local copy…">
          <p>Figma saves the whole file as one <C>.fig</C>: every page, frame and component.</p>
        </Step>
        <Step title="Upload it to the converter">Drop it on the converter, up to 512 MB.</Step>
      </Steps>

      <H2>What the file holds</H2>
      <P>A local copy is more than a picture of the design. Figflow uses:</P>
      <Ul>
        <li>Every layer with its exact values: positions, per-corner radii, strokes, fills, effects, masks and blend modes.</li>
        <li>
          Your text as Figma laid it out, with the outline of every glyph. Text is drawn from those glyphs, so it matches even when the font on Google Fonts is a
          different version, and fonts nobody can download still work.
        </li>
        <li>Images at their full resolution, and your variables and styles, which name the colors and styles in the generated theme.</li>
        <li>Prototype links, which become the buttons that move between screens and open popups.</li>
      </Ul>

      <H2>Tips</H2>
      <Ul>
        <li>Keep the screens of one app on one page: the frames a start frame leads to are found on its page.</li>
        <li>
          Name frames the way you&apos;d name screens (&quot;Login&quot;, &quot;Settings&quot;). Buttons whose label matches a frame&apos;s name lead to it.
        </li>
        <li>Components and variants are expanded as Figma draws them; there&apos;s nothing to detach.</li>
      </Ul>

      <Note>Design files only: FigJam boards and Slides decks aren&apos;t converted.</Note>

      <Pager href="/docs/export" />
    </article>
  );
}
