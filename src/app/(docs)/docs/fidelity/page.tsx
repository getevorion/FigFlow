import { C, DocHeader, H2, Note, P, Pager, Table, Ul } from "@/components/docs/prose";

export const metadata = { title: "What Figflow reproduces" };

export default function FidelityDocs() {
  return (
    <article>
      <DocHeader section="Fidelity" title="What Figflow reproduces">
        The design&apos;s own values, drawn by Dear ImGui at runtime wherever it can draw them, and baked into images only where it can&apos;t.
      </DocHeader>

      <H2>Drawn live</H2>
      <P>These stay sharp at any scale and change when your code changes them:</P>
      <Table
        head={["What", "How"]}
        rows={[
          ["Shapes", "Rectangles and frames with each corner's own radius, and ellipses."],
          ["Fills", "Solid colors and linear gradients (up to eight stops), with the design's opacity."],
          ["Strokes", "Inside, centered or outside, and a different weight on each side where the design has one."],
          ["Shadows", "Drop and inner shadows with their offset, blur and spread, computed exactly for rounded rectangles. Up to four per layer."],
          ["Background blur", "A real blur of what's behind the layer, on the GPU: a downsampled Gaussian with mirrored edges, the way Figma blurs."],
          ["Text", "See below."],
          ["Controls", "Every control's look in each of its states."],
        ]}
      />

      <H2>Text</H2>
      <Ul>
        <li>
          Each character sits on Figma&apos;s own baseline and position: Figma saves its layout in the file, and Figflow uses it rather than laying text out
          again.
        </li>
        <li>
          The glyphs come from the file too, so text looks like Figma drew it even when a downloadable font is a different version (Google Fonts serves Inter
          4, for example, while many designs were laid out with Inter 3). The complete font is loaded behind them, for text your app shows at runtime.
        </li>
        <li>
          Dear ImGui has no kerning, so Figflow adds it: the generated <C>fonts.cpp</C> carries the kerning Figma applied, and the runtime spaces letters by it.
        </li>
        <li>Letter spacing, alignment, and truncation with an ellipsis, as designed.</li>
      </Ul>

      <H2>Baked into images</H2>
      <P>
        What Dear ImGui can&apos;t draw is rendered once, when you convert, and embedded as an image: vectors and icons (single-color ones stay tintable),
        layer blur, masks, radial and angular gradients, and images with their crop. They&apos;re exact at the design&apos;s size.
      </P>

      <H2>How close it is</H2>
      <P>
        Figflow checks itself against a reference rendering of the design: on the designs it&apos;s tested with, 99.3% to 100% of the built app&apos;s pixels
        match. Its reference rendering is in turn compared with Figma&apos;s own render of a community file, cell by cell.
      </P>

      <Note>
        <p>
          The converter&apos;s Warnings tab lists anything that may not come out exactly as designed, such as a font that isn&apos;t downloadable (its characters
          are drawn from the outlines in the file) or more than four shadows on one layer.
        </p>
      </Note>

      <Pager href="/docs/fidelity" />
    </article>
  );
}
