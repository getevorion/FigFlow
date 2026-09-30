import { A, C, DocHeader, H2, P, Ul } from "@/components/docs/prose";
import { owner, site } from "@/lib/site";

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <article>
      <DocHeader section="Legal" title="Privacy">
        Figflow has no accounts and no tracking. This is what it keeps of what you upload, and for how long. Last updated 30 September 2026.
      </DocHeader>

      <H2>What Figflow stores</H2>
      <P>
        The .fig file you upload, and what is made from it: frame thumbnails, previews, and the generated project with its ZIP. They are stored on
        Figflow&apos;s server under a random id, only to make and show your project.
      </P>

      <H2>For how long</H2>
      <P>
        Everything is deleted {site.retentionHours} hours after the upload, automatically. You can delete an upload sooner from the Convert page, and
        everything made from it goes with it.
      </P>

      <H2>Who can see it</H2>
      <P>
        Only the browser that uploaded it. Figflow sets one cookie, <C>ff_owner</C>: a random token that marks your uploads as yours. Scripts can&apos;t read it,
        and the server keeps only its SHA-256 hash, not the token. Figflow never asks for a name, an email address or a Figma login.
      </P>

      <H2>What Figflow doesn&apos;t do</H2>
      <Ul>
        <li>No analytics, advertising cookies or third-party trackers.</li>
        <li>Your files aren&apos;t used for training, shared or sold.</li>
      </Ul>

      <H2>Fonts</H2>
      <P>
        When your design uses a font from Google Fonts, Figflow&apos;s server downloads that font from Google to build your project. Only the family and
        weight are sent; your browser doesn&apos;t contact Google, and nothing about you or your file goes with the request.
      </P>

      <H2>Questions</H2>
      <P>
        Figflow is made by <A href={owner.org.href}>{owner.org.name}</A>. Ask there about anything on this page.
      </P>
    </article>
  );
}
