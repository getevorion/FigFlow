import { A, C, Code, DocHeader, H2, Note, P, Pager, Table } from "@/components/docs/prose";

export const metadata = { title: "The generated code" };

const actions = `
// The "Anahtarı etkinleştir" button on "Warface - Lite [Activation Product]".
void anahtari_etkinlestir()
{
    // From the design: "Anahtarı etkinleştir" matches "ETKİNLEŞTİR" in the popup.
    app::open_popup(app::Popup::urun_aktivasyonu);
}

// The "Gamepad" icon button on "Warface - Lite [Activation Product]".
void gamepad()
{
    // Nothing in the design says what this does: add your logic here.
}
`;

const state = `
struct State
{
    // Screen "Warface - Lite [Activation Product]"
    int sidebar = 0; // 5-item sidebar: the selected item (0 = first)

    // Popup "Ürün aktivasyonu"
    char anahtari_girin[256] = ""; // text field "Anahtarı girin."
};

State& state();
`;

const navigation = `
// Shows a screen; back() returns to the one before.
void go(Screen screen);
// Shows another page of the same nav (sidebar, tab bar): back() skips it.
void switch_to(Screen screen);
void back();

void open_popup(Popup popup);
void close_popup();
bool is_open(Popup popup);

// Shows a toast for \`seconds\`; \`text\` replaces its designed message.
void notify(Toast toast, const char* text = nullptr, float seconds = 3.f);
`;

const component = `
// A Figma component: what its instances change are its parameters.
inline constexpr ImVec2 profile_card_size{ 280.f, 160.f };

void profile_card(ImDrawList* dl, ImVec2 at, const char* name, const char* role, const ff::Box& avatar);
`;

const componentCalls = `
components::profile_card(dl, f.at({ 40.f, 120.f }), "Ada", "Designer", styles::avatar);
components::profile_card(dl, f.at({ 340.f, 120.f }), "Linus", "Engineer", styles::avatar_2);
`;

const example = `
void etkinlestir()
{
    const char* key = app::state().anahtari_girin;
    if (license::activate(key)) {        // your code
        app::close_popup();
        app::notify(app::Toast::aboneliginizi_basariyla_etkinlestirdiniz);
    } else {
        app::notify(app::Toast::aboneliginizi_basariyla_etkinlestirdiniz, "That key didn't work.");
    }
}
`;

export default function GeneratedCodeDocs() {
  return (
    <article>
      <DocHeader section="Your project" title="The generated code">
        A plain Dear ImGui project, organized the way you&apos;d organize it by hand: the design in one place, your logic in another.
      </DocHeader>

      <H2>Build it</H2>
      <Table
        head={["With", "Do"]}
        rows={[
          ["Visual Studio 2022", <>Open the <C>.sln</C>, pick <C>Release | x64</C>, build and run.</>],
          ["CMake", <><C>cmake -S . -B build</C>, then <C>cmake --build build --config Release</C>.</>],
        ]}
      />
      <P>Dear ImGui, stb and the fonts are in <C>third_party/</C>; there is nothing else to install.</P>

      <H2>Where things are</H2>
      <Table
        head={["Path", "What it holds"]}
        rows={[
          [<C key="a">src/app/actions.cpp</C>, "What every control does, filled in from the design. This is where your logic goes."],
          [<C key="s">src/app/state.h</C>, "Every control's value: switches, sliders, text fields, the selected nav item. They start the way the design shows them."],
          [<C key="n">src/app/navigation.h</C>, "The screens, popups and toasts, and the functions that move between them."],
          [<C key="sc">src/ui/screens/</C>, "One file per screen: a function per top-level layer, drawn in Figma's layer order, with a widget call per control."],
          [
            <C key="c">src/ui/components/</C>,
            "The reusable pieces: the widgets, one file per kind (button.cpp, slider.cpp, …) written like Dear ImGui's own (ItemSize, ItemAdd, ButtonBehavior); your Figma components; and the parts several screens draw, like a sidebar, written once.",
          ],
          [<C key="p">src/ui/popups/, src/ui/toasts/</C>, "Popups (drawn over a screen, closed by Esc or a click outside) and toasts."],
          [<C key="t">src/ui/theme/</C>, "The palette (colors named after your variables and styles), the styles, and the fonts."],
          [<C key="as">src/ui/assets/</C>, "The fonts and images compiled in as byte arrays: fonts.cpp, icons.cpp, images.cpp. Nothing to ship next to the program."],
          [<C key="ff">ff/</C>, "The Figflow runtime: drawing, text, animation, screens and the window. Plain C++."],
        ]}
      />

      <H2>Your components</H2>
      <P>
        Each component the design uses becomes a function, named after the component (and, in a set, after the variant). Texts, text styles, looks and
        images that differ between instances are its parameters; everything the instances share stays inside. Instances holding controls stay in their
        screen, because each control has its own state and action.
      </P>
      <Code file="src/ui/components/profile_card.h" code={component} />
      <Code file="src/ui/screens/team.cpp" code={componentCalls} />
      <P>
        A top-level layer several screens draw the same way, like a sidebar, a header or the window buttons, is written once in the same folder and called
        by each screen. Its controls share their state across those screens, so the sidebar remembers its item wherever you are.
      </P>

      <H2>Adding your logic</H2>
      <P>
        Each control calls a function in <C>actions.cpp</C>. Where the design says what a control does (a prototype link, a label that matches a frame or a
        popup), the function already does it; otherwise it&apos;s empty, waiting for you.
      </P>
      <Code file="src/app/actions.cpp" code={actions} />
      <P>
        Values live in one struct, read and written anywhere through <C>app::state()</C>:
      </P>
      <Code file="src/app/state.h" code={state} />
      <P>Moving between screens, popups and toasts takes one call; changes apply from the next frame.</P>
      <Code file="src/app/navigation.h" code={navigation} />
      <P>So a license check behind an activation button might read:</P>
      <Code file="src/app/actions.cpp" code={example} />

      <H2>Styles and fonts</H2>
      <P>
        <C>palette.h</C> names every color after the design&apos;s variables and styles, and <C>styles.cpp</C> holds each look once, shared by everything that
        looks the same. Hover and pressed looks are derived from the design&apos;s own colors. Fonts draw the glyphs saved in your file, with Figma&apos;s
        kerning, at Figma&apos;s pixel sizes; see <A href="/docs/fidelity">What Figflow reproduces</A>.
      </P>

      <H2>Test without a window</H2>
      <P>
        Set <C>FIGFLOW_CAPTURE=out.png</C> and run the app: it draws the start screen off screen, saves the PNG and exits. Add{" "}
        <C>FIGFLOW_SCRIPT</C> to drive it first, for example <C>click 120 340; wait 20; type hello; shot after.png</C>. The steps are <C>move x y</C>,{" "}
        <C>click x y</C>, <C>down</C>, <C>up</C>, <C>type text</C>, <C>key Enter</C>, <C>wait frames</C> and <C>shot file.png</C>.
      </P>

      <Note>
        The runtime in <C>ff/</C> and the widgets are under MIT-0, and the code made from your design is yours: change it, ship it, sell what you build with it.
      </Note>

      <Pager href="/docs/generated-code" />
    </article>
  );
}
