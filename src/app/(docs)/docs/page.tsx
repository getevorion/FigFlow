import { A, C, DocHeader, H2, P, Pager, Table, Ul } from "@/components/docs/prose";

export const metadata = { title: "Overview" };

export default function DocsIntroduction() {
  return (
    <article>
      <DocHeader section="Start here" title="Overview">
        Figflow reads a Figma design file and writes a Dear ImGui app in C++ from it: the screens, the widgets on them, the popups and toasts they open, and a
        theme built from your styles.
      </DocHeader>

      <P>
        You give it the <C>.fig</C>; it decides which frame the app opens on, follows everything reachable from there, and hands back a project to build. For most
        designs there is nothing to configure: no Figma account to link, no frame to pick, no layers to rename.
      </P>

      <H2>The project you get</H2>
      <Ul>
        <li>
          C++20 on Dear ImGui 1.92, for Windows with DirectX 11. It comes with a Visual Studio solution and a <C>CMakeLists.txt</C>, and carries every dependency.
        </li>
        <li>A file for each screen, popup and toast, and a file for each kind of widget, built the way Dear ImGui builds its own.</li>
        <li>A theme generated from your Figma variables and styles: colours, text styles and the look of each control.</li>
        <li>
          <C>actions.cpp</C>, with one function per control. Where the design already says what a control does, the function does it; the rest is where your logic
          goes.
        </li>
      </Ul>

      <H2>The steps</H2>
      <Table
        head={["Step", "What happens"]}
        rows={[
          [<A key="1" href="/docs/export">Grab the .fig</A>, "Figma's File → Save local copy… writes one file with every layer, image and glyph."],
          [<A key="2" href="/docs/convert">Drop it in</A>, "Figflow picks the frame your app opens on, finds the other screens, popups and toasts, and converts them."],
          [<A key="3" href="/docs/generated-code">Build and run</A>, "Open the solution and build Release. What runs is your design, with its controls wired up."],
        ]}
      />

      <H2>Your files</H2>
      <P>
        Conversion happens on the server that hosts Figflow. An upload is tied to the browser that sent it through a private cookie (there are no accounts), and it
        is removed two hours later together with every project made from it. You can remove it sooner from the converter, and nothing is used for training. Running
        Figflow yourself keeps everything on your own machine.
      </P>

      <Pager href="/docs" />
    </article>
  );
}
