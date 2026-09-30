import { A, C, DocHeader, H2, P, Pager, Table, Ul } from "@/components/docs/prose";

export const metadata = { title: "Introduction" };

export default function DocsIntroduction() {
  return (
    <article>
      <DocHeader section="Getting started" title="Introduction">
        Figflow turns a Figma frame into a Dear ImGui project in C++ that looks like the design and already works: its buttons, switches and fields respond, its
        screens and popups open, and the code reads like code you&apos;d write yourself.
      </DocHeader>

      <P>
        Upload the <C>.fig</C> file of a design and download a project you can build in Visual Studio. Figflow reads the file itself, finds the frame your app
        starts on and everything it leads to, so there is no Figma account to connect, nothing to pick and no layers to rename for most designs.
      </P>

      <H2>What you get</H2>
      <Ul>
        <li>
          A C++20 project for Dear ImGui 1.92 on Windows and DirectX 11, with a Visual Studio solution and a <C>CMakeLists.txt</C>. Every dependency is included.
        </li>
        <li>One file per screen, popup and toast, and one file per kind of widget, written the way Dear ImGui&apos;s own widgets are.</li>
        <li>A theme named after your Figma variables and styles: colors, text styles, and the looks of every control.</li>
        <li>
          <C>actions.cpp</C>, with a function per control, already filled in where the design says what a control does. That&apos;s where your logic goes.
        </li>
      </Ul>

      <H2>How it works</H2>
      <Table
        head={["Step", "What happens"]}
        rows={[
          [<A key="1" href="/docs/export">Save a local copy</A>, "In Figma, File → Save local copy… gives you the .fig with every layer, image and glyph."],
          [<A key="2" href="/docs/convert">Upload it</A>, "Figflow finds the frame your app starts on, and the screens, popups and toasts its buttons lead to, and converts them."],
          [<A key="3" href="/docs/generated-code">Download and build</A>, "Open the solution, build Release, run. The app looks like the design and already works."],
        ]}
      />

      <H2>Where your files go</H2>
      <P>
        Your <C>.fig</C> is uploaded to Figflow and converted on its servers. Uploads belong to the browser that made them (a private cookie, no account), and
        they&apos;re deleted, with every project made from them, two hours after the upload. You can delete one sooner from the converter. Nothing is used for
        training.
      </P>

      <Pager href="/docs" />
    </article>
  );
}
