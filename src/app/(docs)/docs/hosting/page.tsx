import { A, DocHeader, H2, P, Pager } from "@/components/docs/prose";

export const metadata = { title: "Hosting on Vercel" };

export default function HostingDocsPage() {
  return (
    <article>
      <DocHeader section="Start here" title="Hosting on Vercel">
        Deploy Figflow to Vercel or run it yourself with the same Next.js app.
      </DocHeader>
      <P>
        Use the included <code>vercel.json</code>, or run <code>vercel</code> from the repository root. See <A href="https://vercel.com/new">Vercel</A> for new
        projects.
      </P>
      <H2>Environment variables</H2>
      <ul className="list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-foreground/80">
        <li>
          <code>APP_URL</code> — production URL for metadata.
        </li>
        <li>
          <code>BLOB_READ_WRITE_TOKEN</code> — <A href="https://vercel.com/docs/storage/vercel-blob">Vercel Blob</A> for uploads across serverless instances.
        </li>
        <li>
          <code>CRON_SECRET</code> — protects <code>/api/cron/retention</code>.
        </li>
      </ul>
      <H2>Production behavior</H2>
      <P>
        On Vercel the engine runs in-process. Large designs may need higher function duration (upload route allows up to 300s). The{" "}
        <A href="/dashboard">dashboard</A> uses the same browser cookie as self-hosting.
      </P>
      <H2>Self-hosting</H2>
      <P>
        Without Blob, files live under <code>.data/</code>. Set <code>FIGFLOW_ENGINE=worker</code> to use isolated worker processes instead of the default inline
        engine in development.
      </P>
      <Pager href="/docs/hosting" />
    </article>
  );
}
