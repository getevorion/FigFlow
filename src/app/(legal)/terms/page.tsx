import { A, C, DocHeader, H2, P } from "@/components/docs/prose";
import { owner, site } from "@/lib/site";

export const metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <article>
      <DocHeader section="Legal" title="Terms of Service">
        Figflow is a free tool by {owner.org.name}. By using it you agree to these terms. Last updated 30 September 2026.
      </DocHeader>

      <H2>Your designs</H2>
      <P>
        Upload only files you have the right to use. They stay yours: Figflow processes them only to make your project, and deletes them{" "}
        {site.retentionHours} hours after upload (see <A href="/privacy">Privacy</A>).
      </P>

      <H2>Your code</H2>
      <P>
        The project Figflow makes from your design is yours to use, change, ship and sell. Its runtime (<C>ff/</C> and the widgets) is under MIT-0, and Dear
        ImGui and the other libraries in <C>third_party/</C> keep their own licenses, which are included in the project.
      </P>
      <P>
        Fonts are licensed by their makers. The project draws your design&apos;s text with the fonts the design uses, so make sure their licenses allow
        embedding them in an app you ship.
      </P>

      <H2>Fair use</H2>
      <P>
        Don&apos;t upload anything harmful, and don&apos;t try to overload or break the service. Files can be up to {site.maxUploadMb} MB, with up to 10 at a
        time per browser.
      </P>

      <H2>No warranty</H2>
      <P>
        Figflow is provided as is, without warranty of any kind. Check the generated code before you ship it. To the extent the law allows,{" "}
        {owner.org.name} isn&apos;t liable for damages that come from using Figflow or the code it makes.
      </P>

      <H2>Changes</H2>
      <P>These terms may change. The version on this page is the one that applies.</P>
    </article>
  );
}
