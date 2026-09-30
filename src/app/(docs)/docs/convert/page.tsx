import { A, C, DocHeader, H2, Note, P, Pager, Steps, Step, Table } from "@/components/docs/prose";

export const metadata = { title: "Convert and download" };

export default function ConvertDocs() {
  return (
    <article>
      <DocHeader section="Getting started" title="Convert and download">
        From an uploaded file to a project on your disk, in the converter at <A href="/convert">/convert</A>.
      </DocHeader>

      <Steps>
        <Step title="Upload the file">
          <p>Drop the .fig on the converter or choose it. That&apos;s the only step: the rest happens on its own.</p>
        </Step>
        <Step title="Figflow converts it">
          <p>
            It finds the frame your app starts on (where the prototype starts, or the frame its links lead away from), and the screens, popups and toasts that
            frame leads to, then writes the project. It takes a few seconds, and the project is named after your file.
          </p>
        </Step>
        <Step title="Check it, then download the ZIP">
          <p>Four tabs show what you&apos;re getting, and the ZIP holds the whole project in one folder.</p>
        </Step>
      </Steps>

      <H2>The tabs</H2>
      <Table
        head={["Tab", "What it shows"]}
        rows={[
          ["Preview", "Every screen, popup and toast as the design draws it, with the controls Figflow found outlined. Hover one to see what it is; click it for its variable, the function it calls, and its code."],
          ["Code", "Every file of the project, highlighted: your screens, the actions, the theme, the widgets and the runtime."],
          ["Elements", "Every control on every screen and popup, with the variable that holds its value and the function it calls."],
          ["Warnings", "Anything that may not look or behave exactly like the design, such as a font that had to be rebuilt from the file."],
        ]}
      />

      <H2>Starting somewhere else</H2>
      <P>
        If the app should start on another frame, choose <C>Change start frame</C> above the tabs: the frames are shown page by page, with the one Figflow picked
        marked and what each would bring along, and one click converts from the one you choose.
      </P>

      <Note>
        Projects and uploads are deleted two hours after the upload. Download the ZIP you want to keep; you can convert the same file again, from any frame, until
        then.
      </Note>

      <P>
        Next: what&apos;s in the project, and where your code goes, in <A href="/docs/generated-code">The generated code</A>.
      </P>

      <Pager href="/docs/convert" />
    </article>
  );
}
