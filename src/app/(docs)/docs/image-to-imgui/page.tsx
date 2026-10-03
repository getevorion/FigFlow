import { C, DocHeader, H2, Note, P, Pager, Step, Steps, Table } from "@/components/docs/prose";

export const metadata = { title: "Image vs .fig → ImGui" };

export default function ImageToImGuiDocs() {
  return (
    <article>
      <DocHeader section="Fidelity" title="Image vs .fig → ImGui">
        Two ways to get a Dear ImGui menu from a design — one guesses from pixels, one reads the file.
      </DocHeader>

      <Note>
        <strong>The rule:</strong> never go image → C++ in one step. Go image → measured spec → C++. Skipping the spec is how you get a menu that looks 70% right and wrong everywhere.
      </Note>

      <H2>When you only have a screenshot</H2>
      <P>
        Treat the PNG as the whole specification. Analyse it into <C>spec.md</C> (regions, control bounds, radii, spacing). Sample colours with a script — do not pick hex values by eye. Show the spec to someone who knows the design, fix it, then write theme + layout + widgets. Build, capture a render, and compare with{" "}
        <strong>magnified crops</strong> of toggles, sliders, tabs, and combos — not a single full-screen diff.
      </P>
      <Steps>
        <Step title="Analyse">
          <p>Image → spec.md. Colours from pixel probes and region samples, not from looking at the picture.</p>
        </Step>
        <Step title="Checkpoint">
          <p>Confirm inferred hover states, fonts, and icons. A still image cannot prove those.</p>
        </Step>
        <Step title="Generate">
          <p>Theme table first, then layout, then only the widgets that do not already exist in your project.</p>
        </Step>
        <Step title="Compare">
          <p>Rebuild in a loop until zoomed regions match a detail checklist.</p>
        </Step>
      </Steps>

      <H2>When you have a .fig file</H2>
      <P>
        Use Figflow. The Figma export <em>is</em> the measured spec: layer geometry, fills, typography, and controls come from the file, not from inference. Conversion writes C++ that uses Figflow&apos;s runtime widgets and per-control <C>Look</C> states derived from the design. You still validate visually — same discipline as Phase 4 — but you are diffing against a render of the same source, not a hand-measured screenshot clone.
      </P>
      <Table
        head={["", "Screenshot clone", "Figflow (.fig)"]}
        rows={[
          ["Spec source", "Ruler + palette script on PNG", "Figma layer tree + styles in file"],
          ["Colours", "Sampled pixels (exact in crop)", "Design tokens from nodes"],
          ["Text", "Inferred font/size", "Baselines and glyphs from file"],
          ["Controls", "Counted and boxed by hand", "Detected from structure + tags"],
          ["Hover / disabled", "Always inferred", "From component variants where present"],
          ["Best for", "No Figma access, reference shots", "Production export from Figma"],
        ]}
      />

      <H2>Hard rules (both paths)</H2>
      <P>
        Keep colours in a theme table — not scattered <C>IM_COL32</C> in widget bodies. Key animation by <C>ImGuiID</C>, not function-static floats. Hit-test with <C>ItemAdd</C> and <C>ButtonBehavior</C>. Do not patch upstream <C>imgui_widgets.cpp</C> unless the project already does. Pin your Dear ImGui version and say which one you used.
      </P>

      <Pager href="/docs/image-to-imgui" />
    </article>
  );
}
