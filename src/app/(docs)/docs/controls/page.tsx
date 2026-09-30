import { A, C, Code, DocHeader, H2, Note, P, Pager, Table, Ul } from "@/components/docs/prose";

export const metadata = { title: "Controls" };

const call = `
// "Remember me" (switch)
ff::place(f, { 40.f, 312.f });
ui::toggle("Remember me##remember_me", &s.remember_me, { 220.f, 24.f }, styles::remember_me_switch);
`;

export default function ControlsDocs() {
  return (
    <article>
      <DocHeader section="Your project" title="Controls">
        Figflow recognizes controls by how they look, not by what their layers are called, and each one becomes a real Dear ImGui widget.
      </DocHeader>

      <H2>What becomes a control</H2>
      <Table
        head={["Control", "Recognized from"]}
        rows={[
          ["Button", "A surface with a label or an icon, or anything a prototype link starts from."],
          ["Nav item", "A row or column of look-alike items with one shown selected: sidebars and tab bars. The selected item is state; switching can change the screen."],
          ["Switch", "A pill-shaped track with a round knob at one end."],
          ["Checkbox and radio button", "A small square or circle box, with a check mark or dot when it's on, usually beside a label."],
          ["Slider", "A thin track with a filled part and a thumb."],
          ["Text field", "A box with placeholder text, such as \"Enter your key\". It's a password field when its placeholder or layer name says password."],
          ["Dropdown", "A box with a value and a chevron."],
          ["Keybind", "A small box holding a key name, such as F1 or Shift."],
          ["Clickable artwork", "A control whose art is too complex for its widget to draw: the art stays exactly as designed, with an invisible button on top."],
        ]}
      />

      <H2>States</H2>
      <Ul>
        <li>Hover and pressed looks come from the design&apos;s own colors: a little lighter on dark designs, a little darker on light ones, and animated.</li>
        <li>
          When the design has both states of a control (a switch on and one off, checked and unchecked), each state uses its own design. Otherwise the other
          state is derived from the accent color of your design.
        </li>
        <li>
          A control the design shows disabled (named <C>Disabled</C>, or a variant with <C>State=Disabled</C>) is drawn as designed and wrapped in{" "}
          <C>BeginDisabled</C>.
        </li>
      </Ul>

      <H2>In the code</H2>
      <P>
        A control is one widget call in its screen&apos;s file, at the design&apos;s position, with its looks in <C>styles.cpp</C>. Its value is a field of{" "}
        <C>app::state()</C>, and what it does is a function in <C>actions.cpp</C>.
      </P>
      <Code file="src/ui/screens/login.cpp" code={call} />
      <P>
        The converter&apos;s Elements tab lists every control with its variable and function; click one in the Preview tab to jump to its line.
      </P>

      <Note>
        <p>
          If something isn&apos;t recognized, name its layer with a tag such as <C>button: Save</C> or <C>switch: Sound</C>; if something that looks like a
          control should stay a picture, name it <C>static</C>. See <A href="/docs/tags">Layer name tags</A>.
        </p>
      </Note>

      <Pager href="/docs/controls" />
    </article>
  );
}
