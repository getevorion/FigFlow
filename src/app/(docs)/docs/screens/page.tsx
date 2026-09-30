import { A, C, DocHeader, H2, H3, Note, P, Pager, Ul } from "@/components/docs/prose";

export const metadata = { title: "Screens, popups and toasts" };

export default function ScreensDocs() {
  return (
    <article>
      <DocHeader section="Your project" title="Screens, popups and toasts">
        One project is one app: every screen on the page of the frame you pick, starting on that frame.
      </DocHeader>

      <H2>Screens</H2>
      <P>
        The app starts on the frame you picked. For each button, Figflow works out where it leads, trying the strongest signal first and noting in the
        converter which one it used:
      </P>
      <Ul>
        <li>Prototype links: Navigate to, Swap with and Open overlay, with Back.</li>
        <li>
          Layer name tags, such as <C>go: Settings</C> or <C>open: Login</C>; see <A href="/docs/tags">Layer name tags</A>.
        </li>
        <li>Navs: the same sidebar or tab bar in another frame with another item selected makes that frame the item&apos;s page.</li>
        <li>Words: Back, Close, Cancel and OK, in English and in Turkish, Russian, German, French and Spanish (and Back in Italian and Portuguese).</li>
        <li>
          Names: a button whose label matches a frame&apos;s name leads to it, and one that matches a popup&apos;s title opens it. A button on a card
          (&quot;View&quot;, &quot;Open&quot;) leads to the frame the card&apos;s title names.
        </li>
      </Ul>
      <P>
        Frames the size of the app&apos;s window are its screens even when nothing leads to them, like a loading screen, an error state or a page the
        prototype never linked: <C>app::go()</C> opens them from your code. Identical copies of a frame share one screen, and a Figma overlay that fills the
        window is a screen rather than a popup. Frames of other sizes, components and groups are left out unless a button leads to them.
      </P>
      <P>
        In the code, <C>app::go(Screen::settings)</C> shows a screen and <C>app::back()</C> returns to the previous one. A nav&apos;s pages switch with{" "}
        <C>app::switch_to</C>, which <C>back()</C> skips.
      </P>

      <H2>Popups</H2>
      <P>A popup is drawn over its screen and closes with Esc or a click outside it. Figflow finds them three ways:</P>
      <Ul>
        <li>Figma overlays, placed and dimmed the way their overlay settings say, and closing on an outside click when Figma&apos;s setting does.</li>
        <li>A dialog designed in a frame: a panel over a layer that dims the screen.</li>
        <li>
          A copy of a screen with a dialog open (a frame that is &quot;Home&quot; plus a dialog): it becomes a popup of that screen rather than a screen of its
          own.
        </li>
      </Ul>
      <P>
        Buttons open popups when a prototype link or a tag says so, or when their label matches the popup&apos;s title. A popup the picked frame shows open
        is open when the app starts.
      </P>

      <H2>Toasts</H2>
      <P>
        A toast is a short, wide notification designed over a screen, like &quot;Saved&quot; or &quot;Your license is active&quot;. It&apos;s drawn on its own
        and shown from code, with its designed text or yours:
      </P>
      <P>
        <C>app::notify(app::Toast::saved, &quot;Settings saved&quot;, 3.f);</C>
      </P>
      <P>When a dialog&apos;s main button leads to a frame that shows a toast, the button closes the dialog and shows the toast.</P>

      <H3>Check what was found</H3>
      <P>
        Before converting, the converter lists the screens, popups and toasts a frame brings along, and how frames were matched. If a button doesn&apos;t lead
        where it should, give it a prototype link or a <C>go:</C> tag.
      </P>

      <Note>Frames are matched within the page of the frame you pick, so keep one app&apos;s screens on one page.</Note>

      <Pager href="/docs/screens" />
    </article>
  );
}
