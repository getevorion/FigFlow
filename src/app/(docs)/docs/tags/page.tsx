import { C, DocHeader, H2, Note, P, Pager, Table, Ul } from "@/components/docs/prose";

export const metadata = { title: "Layer name tags" };

export default function TagsDocs() {
  return (
    <article>
      <DocHeader section="Your project" title="Layer name tags">
        Most designs convert as they are. When a design can&apos;t show what something does, a word in a layer&apos;s name can.
      </DocHeader>

      <H2>Where controls lead</H2>
      <Table
        head={["Layer name", "What it does"]}
        rows={[
          [<C key="go">go: Settings</C>, "Goes to the screen, the frame named Settings."],
          [<C key="back">back</C>, "Goes back to the previous screen; in a popup, closes it."],
          [<C key="open">open: Login</C>, "Opens the popup named Login."],
          [<C key="close">close</C>, "Closes the popup it's in."],
          [<C key="show">show: Saved</C>, "Shows the toast named Saved."],
          [<C key="win">close window, minimize window, maximize window</C>, "Your own window buttons, working."],
        ]}
      />

      <H2>What a layer is</H2>
      <Table
        head={["Layer name", "What it does"]}
        rows={[
          [<C key="popup">popup: Login</C>, "This layer is a popup, named Login."],
          [<C key="notify">notify: Saved</C>, "This layer is a toast, named Saved."],
          [<C key="kind">button:, switch:, checkbox:, radio:, slider:, input:, dropdown:, keybind:</C>, "This layer is that kind of control, whatever it looks like."],
          [<C key="static">static</C>, "Keep this layer and everything in it as artwork, even where it looks like a control."],
        ]}
      />

      <H2>How names are read</H2>
      <Ul>
        <li>Case doesn&apos;t matter, and a dash works in place of the colon.</li>
        <li>
          Names are matched loosely: <C>go: settings page</C> finds a frame called &quot;Settings&quot;, and accents are ignored.
        </li>
        <li>
          <C>modal:</C> and <C>dialog:</C> work like <C>popup:</C>; <C>toast:</C> and <C>notification:</C> like <C>notify:</C>; <C>goto:</C>,{" "}
          <C>screen:</C> and <C>navigate:</C> like <C>go:</C>.
        </li>
        <li>
          Component variants and layer names also carry states: <C>Hover</C>, <C>Pressed</C> and <C>Disabled</C>, and <C>(selected)</C> on the current item of a
          nav.
        </li>
      </Ul>

      <Note>
        <p>Prototype links come first: a tag only decides where a control leads when the design has no link for it.</p>
      </Note>

      <P>Tags are plain text, so they stay readable for anyone else working on the design.</P>

      <Pager href="/docs/tags" />
    </article>
  );
}
