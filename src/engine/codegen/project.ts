/**
 * Generates a complete Dear ImGui C++ project from a Figma frame: the app that
 * frame starts, with every screen, popup and toast connected to it.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BuildResult } from "../fig/build";
import type { FigFile } from "../fig/open";
import type { DesignNode, DesignWarning, RGBA } from "../model/types";
import { analyzeFlow, type FlowToast } from "../semantic/flow";
import type { Widget } from "../semantic/types";
import { AppEmitter, type AppElement, type PopupUnit, type ScreenUnit, type ToastUnit } from "./app";
import { ImageLevels } from "../render/images";
import { bakeRasters } from "./assets";
import { extractControls } from "./controls";
import { pascal } from "./cpp";
import { Theme, emitFonts, emitImages, emitPalette, emitStyles } from "./emit";
import { CLANG_FORMAT, formatCpp } from "./format";
import { planEmbed } from "./embed";
import { stripCmakeComments, stripCppComments } from "./strip";
import { resolveFonts, type FallbackFonts, type FontKey, type FontProvider } from "./fonts";
import { isDark, mainColor, pickAccent } from "./looks";
import { planFrame, type Plan, type PlanOptions, type RasterRequest } from "./plan";
import { sniffImageMime } from "../util/mime";

export type GenerateOptions = {
  fig: FigFile;
  frameId: string;
  /** Project name; defaults to the frame's name. */
  name?: string;
  runtimeDir: string;
  fontProvider: FontProvider | null;
  /** Bake scale for images and vectors (2 = crisp on 200% displays too). */
  rasterScale?: number;
  /** The design's images with copies made for earlier renders, to reuse (made afresh without it). */
  images?: ImageLevels;
};

export type GeneratedFile = { path: string; contents: string | Uint8Array; kind: "design" | "runtime" | "build" | "asset" };

/** A screen, popup or toast of the app, with the build it's drawn from (for previews). */
export type ProjectUnit = {
  kind: "screen" | "popup" | "toast";
  /** Its identifier in the generated code. */
  ident: string;
  name: string;
  /** The frame it's drawn from, and where it sits in that frame (a toast is part of one). */
  built: BuildResult;
  rect: { x: number; y: number; w: number; h: number };
  /** The screen the app starts on; for a popup, the screen it opens over. */
  start?: boolean;
  over?: string;
};

export type GeneratedProject = {
  name: string;
  files: GeneratedFile[];
  warnings: DesignWarning[];
  stats: { layers: number; ops: number; images: number; fonts: number; styles: number; colors: number; screens: number; popups: number; toasts: number; controls: number };
  /** Milliseconds each stage took, in order. */
  timings: Record<string, number>;
  units: ProjectUnit[];
  /** Every control, as drawn by the generated code. */
  elements: AppElement[];
};

const RUNTIME_FILES = [
  "ff/alpha.cpp",
  "ff/alpha.h",
  "ff/anim.h",
  "ff/bytes.h",
  "ff/draw.cpp",
  "ff/draw.h",
  "ff/flow.h",
  "ff/host.h",
  "ff/host_win32_dx11.cpp",
  "ff/image.cpp",
  "ff/image.h",
  "ff/layout.h",
  "ff/style.h",
  "ff/text.cpp",
  "ff/text.h",
  "third_party/imgui/LICENSE.txt",
  "third_party/imgui/imconfig.h",
  "third_party/imgui/imgui.cpp",
  "third_party/imgui/imgui.h",
  "third_party/imgui/imgui_draw.cpp",
  "third_party/imgui/imgui_internal.h",
  "third_party/imgui/imgui_tables.cpp",
  "third_party/imgui/imgui_widgets.cpp",
  "third_party/imgui/imstb_rectpack.h",
  "third_party/imgui/imstb_textedit.h",
  "third_party/imgui/imstb_truetype.h",
  "third_party/imgui/backends/imgui_impl_dx11.cpp",
  "third_party/imgui/backends/imgui_impl_dx11.h",
  "third_party/imgui/backends/imgui_impl_win32.cpp",
  "third_party/imgui/backends/imgui_impl_win32.h",
  "third_party/imgui/misc/imgui.natvis",
  "third_party/stb/stb_image.h",
  "third_party/stb/stb_image_write.h",
];

function guid(seed: string): string {
  const h = createHash("sha1").update(seed).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`.toUpperCase();
}

const DEFINES = ["IMGUI_DEFINE_MATH_OPERATORS", "IMGUI_DISABLE_OBSOLETE_FUNCTIONS", "_CRT_SECURE_NO_WARNINGS", "UNICODE", "_UNICODE"];
const INCLUDES = [".", "src", "third_party/imgui", "third_party/imgui/backends", "third_party/stb"];

function cmakeLists(name: string, sources: string[]): string {
  return `cmake_minimum_required(VERSION 3.20)
project(${name} LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(${name} WIN32
${sources.map((s) => `    ${s}`).join("\n")}
)
target_include_directories(${name} PRIVATE
${INCLUDES.map((i) => `    \${CMAKE_CURRENT_SOURCE_DIR}/${i}`.replace("/.", "")).join("\n")}
)
target_compile_definitions(${name} PRIVATE ${DEFINES.join(" ")})
target_link_libraries(${name} PRIVATE d3d11 dxgi dwmapi)
if(MSVC)
    target_compile_options(${name} PRIVATE /utf-8 /MP)
    set_property(DIRECTORY PROPERTY VS_STARTUP_PROJECT ${name})
endif()
`;
}

function vcxproj(name: string, projectGuid: string, sources: string[], headers: string[]): string {
  const win = (p: string) => p.replace(/\//g, "\\");
  const cfg = (c: "Debug" | "Release") => `  <ItemDefinitionGroup Condition="'$(Configuration)|$(Platform)'=='${c}|x64'">
    <ClCompile>
      <WarningLevel>Level3</WarningLevel>
      <SDLCheck>true</SDLCheck>
      <ConformanceMode>true</ConformanceMode>
      <LanguageStandard>stdcpp20</LanguageStandard>
      <PreprocessorDefinitions>${DEFINES.join(";")};${c === "Debug" ? "_DEBUG" : "NDEBUG"};%(PreprocessorDefinitions)</PreprocessorDefinitions>
      <AdditionalIncludeDirectories>${INCLUDES.map((i) => (i === "." ? "$(ProjectDir)" : `$(ProjectDir)${win(i)}`)).join(";")};%(AdditionalIncludeDirectories)</AdditionalIncludeDirectories>
      <AdditionalOptions>/utf-8 %(AdditionalOptions)</AdditionalOptions>
      <MultiProcessorCompilation>true</MultiProcessorCompilation>
      <ObjectFileName>$(IntDir)%(RelativeDir)</ObjectFileName>${c === "Release" ? "\n      <FunctionLevelLinking>true</FunctionLevelLinking>\n      <IntrinsicFunctions>true</IntrinsicFunctions>" : ""}
    </ClCompile>
    <Link>
      <SubSystem>Windows</SubSystem>
      <AdditionalDependencies>d3d11.lib;dxgi.lib;dwmapi.lib;%(AdditionalDependencies)</AdditionalDependencies>${c === "Release" ? "\n      <EnableCOMDATFolding>true</EnableCOMDATFolding>\n      <OptimizeReferences>true</OptimizeReferences>" : ""}
    </Link>
  </ItemDefinitionGroup>`;
  return `<?xml version="1.0" encoding="utf-8"?>
<Project DefaultTargets="Build" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">
  <ItemGroup Label="ProjectConfigurations">
    <ProjectConfiguration Include="Debug|x64">
      <Configuration>Debug</Configuration>
      <Platform>x64</Platform>
    </ProjectConfiguration>
    <ProjectConfiguration Include="Release|x64">
      <Configuration>Release</Configuration>
      <Platform>x64</Platform>
    </ProjectConfiguration>
  </ItemGroup>
  <PropertyGroup Label="Globals">
    <VCProjectVersion>17.0</VCProjectVersion>
    <ProjectGuid>{${projectGuid}}</ProjectGuid>
    <RootNamespace>${name}</RootNamespace>
    <WindowsTargetPlatformVersion>10.0</WindowsTargetPlatformVersion>
  </PropertyGroup>
  <Import Project="$(VCTargetsPath)\\Microsoft.Cpp.Default.props" />
  <PropertyGroup Condition="'$(Configuration)|$(Platform)'=='Debug|x64'" Label="Configuration">
    <ConfigurationType>Application</ConfigurationType>
    <UseDebugLibraries>true</UseDebugLibraries>
    <PlatformToolset>v143</PlatformToolset>
    <CharacterSet>Unicode</CharacterSet>
  </PropertyGroup>
  <PropertyGroup Condition="'$(Configuration)|$(Platform)'=='Release|x64'" Label="Configuration">
    <ConfigurationType>Application</ConfigurationType>
    <UseDebugLibraries>false</UseDebugLibraries>
    <PlatformToolset>v143</PlatformToolset>
    <WholeProgramOptimization>true</WholeProgramOptimization>
    <CharacterSet>Unicode</CharacterSet>
  </PropertyGroup>
  <Import Project="$(VCTargetsPath)\\Microsoft.Cpp.props" />
  <PropertyGroup>
    <OutDir>$(ProjectDir)bin\\$(Configuration)\\</OutDir>
    <IntDir>$(ProjectDir)obj\\$(Configuration)\\</IntDir>
  </PropertyGroup>
${cfg("Debug")}
${cfg("Release")}
  <ItemGroup>
${sources.map((s) => `    <ClCompile Include="${win(s)}" />`).join("\n")}
  </ItemGroup>
  <ItemGroup>
${headers.map((h) => `    <ClInclude Include="${win(h)}" />`).join("\n")}
  </ItemGroup>
  <ItemGroup>
    <Natvis Include="third_party\\imgui\\misc\\imgui.natvis" />
  </ItemGroup>
  <Import Project="$(VCTargetsPath)\\Microsoft.Cpp.targets" />
</Project>
`;
}

function vcxprojFilters(sources: string[], headers: string[]): string {
  const win = (p: string) => p.replace(/\//g, "\\");
  const dir = (p: string) => win(p.split("/").slice(0, -1).join("/"));
  const folders = new Set<string>();
  for (const p of [...sources, ...headers]) {
    const parts = p.split("/").slice(0, -1);
    for (let i = 1; i <= parts.length; i++) folders.add(win(parts.slice(0, i).join("/")));
  }
  const item = (tag: string, p: string) => {
    const d = dir(p);
    return d ? `    <${tag} Include="${win(p)}">\n      <Filter>${d}</Filter>\n    </${tag}>` : `    <${tag} Include="${win(p)}" />`;
  };
  return `<?xml version="1.0" encoding="utf-8"?>
<Project ToolsVersion="4.0" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">
  <ItemGroup>
${[...folders].sort().map((f) => `    <Filter Include="${f}">\n      <UniqueIdentifier>{${guid("filter:" + f)}}</UniqueIdentifier>\n    </Filter>`).join("\n")}
  </ItemGroup>
  <ItemGroup>
${sources.map((s) => item("ClCompile", s)).join("\n")}
  </ItemGroup>
  <ItemGroup>
${headers.map((h) => item("ClInclude", h)).join("\n")}
  </ItemGroup>
</Project>
`;
}

function sln(name: string, projectGuid: string): string {
  const solutionGuid = guid(`solution:${name}`);
  return `
Microsoft Visual Studio Solution File, Format Version 12.00
# Visual Studio Version 17
VisualStudioVersion = 17.0.31903.59
MinimumVisualStudioVersion = 10.0.40219.1
Project("{8BC9CEB8-8B4A-11D0-8D11-00A0C91BC942}") = "${name}", "${name}.vcxproj", "{${projectGuid}}"
EndProject
Global
	GlobalSection(SolutionConfigurationPlatforms) = preSolution
		Debug|x64 = Debug|x64
		Release|x64 = Release|x64
	EndGlobalSection
	GlobalSection(ProjectConfigurationPlatforms) = postSolution
		{${projectGuid}}.Debug|x64.ActiveCfg = Debug|x64
		{${projectGuid}}.Debug|x64.Build.0 = Debug|x64
		{${projectGuid}}.Release|x64.ActiveCfg = Release|x64
		{${projectGuid}}.Release|x64.Build.0 = Release|x64
	EndGlobalSection
	GlobalSection(SolutionProperties) = preSolution
		HideSolutionNode = FALSE
	EndGlobalSection
	GlobalSection(ExtensibilityGlobals) = postSolution
		SolutionGuid = {${solutionGuid}}
	EndGlobalSection
EndGlobal
`;
}

function readme(name: string, start: string, counts: { screens: number; popups: number; toasts: number; controls: number; components: number }): string {
  return `# ${name}

Generated by [Figflow](https://evora.cx) from the Figma frame **${start}**: ${counts.screens} screen${counts.screens === 1 ? "" : "s"}, ${counts.popups} popup${counts.popups === 1 ? "" : "s"}, ${counts.toasts} toast${counts.toasts === 1 ? "" : "s"} and ${counts.controls} control${counts.controls === 1 ? "" : "s"}.

## Build

- **Visual Studio 2022:** open \`${name}.sln\`, pick **Release | x64**, build, run.
- **CMake:** \`cmake -S . -B build\` then \`cmake --build build --config Release\`.

Dear ImGui and every other dependency are in \`third_party/\`. Nothing else to install.

## Where things are

| Path | What it holds |
| --- | --- |
| \`src/app/actions.cpp\` | **What every control does.** Filled in from the design (prototype links, layer names, matching labels): this is where your logic goes. |
| \`src/app/state.h\` | Every control's value (switches, sliders, text fields, selected nav items), starting as the design shows them. |
| \`src/app/navigation.h\` | The screens, popups and toasts, and \`go\`, \`back\`, \`open_popup\`, \`notify\` to move between them. |
| \`src/ui/screens/\` | One file per screen: one function per top-level layer, drawn in Figma's layer order, with a widget call per control. |
| \`src/ui/components/\` | The reusable pieces: the widgets, one file per kind (\`button.cpp\`, \`slider.cpp\`, …), written like Dear ImGui's own (ItemSize, ItemAdd, ButtonBehavior)${
    counts.components ? ", and your Figma components and the parts several screens share, each a call with what it changes as arguments" : ""
  }. |
| \`src/ui/popups/\`, \`src/ui/toasts/\` | Popups (drawn over a screen, closed by Esc or a click outside) and toasts. |
| \`src/ui/theme/palette.h\` | Every colour, named after the design's variables and styles. |
| \`src/ui/theme/styles.cpp\` | Layer, text and control styles, shared by everything that looks the same. Hover and pressed looks are derived from the design. |
| \`src/ui/theme/fonts.cpp\` | Font loading: each face draws the design's characters from the glyphs saved in the Figma file, with Figma's kerning. Sizes in the styles are Figma's pixel sizes. |
| \`src/ui/assets/\` | The fonts and images, compiled in as byte arrays: \`fonts.cpp\`, \`icons.cpp\`, \`images.cpp\` (with the table of \`images::\` ids). Nothing to ship next to the program. |
| \`ff/\` | The Figflow runtime: drawing, text, animation, screens and the window. Plain C++, yours to change. |

## Test without a window

Set \`FIGFLOW_CAPTURE=out.png\` and run the app: it renders the start screen off screen, saves the PNG and exits. \`FIGFLOW_SCREEN=2\` starts on another screen (its index in \`app::Screen\`).
Add \`FIGFLOW_SCRIPT="click 120 340; wait 20; type hello; shot after.png"\` to drive it: \`move x y\`, \`click x y\`, \`down\`, \`up\`, \`type text\`, \`key Enter\`, \`wait frames\`, \`shot file.png\`.
`;
}

const WIDGET_FILES: Record<string, string[]> = {
  "ui::ButtonStyle": ["button"],
  "ui::ToggleStyle": ["toggle"],
  "ui::CheckboxStyle": ["checkbox"],
  "ui::SliderStyle": ["slider"],
  "ui::TextFieldStyle": ["text_field"],
  "ui::ComboStyle": ["combo"],
  "ui::KeybindStyle": ["keybind"],
};

function subtreeIds(n: DesignNode, out = new Set<string>()): Set<string> {
  out.add(n.id);
  for (const c of n.children) subtreeIds(c, out);
  return out;
}

/** Where a Figma overlay frame sits on the screen, from its overlay settings. */
function overlayOffset(position: string, screen: { x: number; y: number }, size: { x: number; y: number }, manual?: { x: number; y: number }): { x: number; y: number } {
  const cx = (screen.x - size.x) / 2;
  const cy = (screen.y - size.y) / 2;
  switch (position) {
    case "TOP_LEFT":
      return { x: 0, y: 0 };
    case "TOP_CENTER":
      return { x: cx, y: 0 };
    case "TOP_RIGHT":
      return { x: screen.x - size.x, y: 0 };
    case "BOTTOM_LEFT":
      return { x: 0, y: screen.y - size.y };
    case "BOTTOM_CENTER":
      return { x: cx, y: screen.y - size.y };
    case "BOTTOM_RIGHT":
      return { x: screen.x - size.x, y: screen.y - size.y };
    case "MANUAL":
      return manual ?? { x: cx, y: cy };
    default:
      return { x: cx, y: cy };
  }
}

/**
 * The last pass over every file: no comments in the code the project ships
 * (Dear ImGui and stb stay as their authors wrote them), and the generated
 * C++ laid out by clang-format in the project's style.
 */
function finish(file: GeneratedFile): GeneratedFile {
  if (file.path.startsWith("third_party/")) return file;
  const text = () => (typeof file.contents === "string" ? file.contents : Buffer.from(file.contents).toString("utf8"));
  // Byte arrays are written without comments and ready to read (megabytes: not worth a pass).
  if (file.kind === "asset") return file;
  if (/\.(h|cpp)$/.test(file.path)) {
    const stripped = stripCppComments(text());
    return { ...file, contents: file.kind === "runtime" ? stripped : formatCpp(stripped, file.path) };
  }
  if (file.path === "CMakeLists.txt") return { ...file, contents: stripCmakeComments(text()) };
  return file;
}

/** The layers controls draw themselves (see PlanOptions.keepApart). */
function partIds(widgets: Widget[]): Set<string> {
  const ids = new Set<string>();
  for (const w of widgets) {
    if (w.surface) ids.add(w.surface.id);
    for (const p of Object.values(w.parts)) if (p) ids.add(p.id);
  }
  return ids;
}

export async function generateProject(opts: GenerateOptions): Promise<GeneratedProject> {
  const { fig, frameId } = opts;
  const timings: Record<string, number> = {};
  let lap = performance.now();
  const stage = (name: string) => {
    const now = performance.now();
    timings[name] = Math.round(now - lap);
    lap = now;
  };
  const flow = analyzeFlow(fig, frameId);
  stage("flow");
  const start = flow.screens.find((s) => s.id === flow.start)!;
  const name = pascal(opts.name ?? start.name, "Design");
  const warnings: DesignWarning[] = [];
  const seenBuilds = new Set<BuildResult>();
  const noteBuild = (b: BuildResult) => {
    if (seenBuilds.has(b)) return;
    seenBuilds.add(b);
    warnings.push(...b.warnings);
  };
  for (const n of flow.notes) warnings.push({ code: "flow", message: n });

  const isOpaqueImage = (hash: string) => {
    const b = fig.images.get(hash);
    return !!b && sniffImageMime(b) === "image/jpeg";
  };
  // Raster requests are baked per build: each build has its own glyph table.
  const jobs = new Map<BuildResult, RasterRequest[]>();
  let planSeq = 0;
  const planFor = (built: BuildResult, root: DesignNode, options: Omit<PlanOptions, "isOpaqueImage" | "prefix">): Plan => {
    noteBuild(built);
    const plan = planFrame(root, { ...options, isOpaqueImage, prefix: `p${planSeq++}_` });
    for (const w of plan.warnings) warnings.push(w);
    const list = jobs.get(built);
    if (list) list.push(...plan.rasters);
    else jobs.set(built, [...plan.rasters]);
    return plan;
  };

  // The same toast designed in several frames is one toast.
  const toastKey = (t: FlowToast) => `${t.toast.name}|${Math.round(t.toast.rect.w)}x${Math.round(t.toast.rect.h)}`;
  const toastsByKey = new Map<string, FlowToast>();
  for (const t of flow.toasts) if (!toastsByKey.has(toastKey(t))) toastsByKey.set(toastKey(t), t);
  const canonicalToast = new Map(flow.toasts.map((t) => [t.toast.id, toastsByKey.get(toastKey(t))!.toast.id]));
  const retarget = (w: Widget) => {
    if (w.onPress) w.onPress = w.onPress.map((a) => (a.kind === "show-toast" ? { ...a, toast: canonicalToast.get(a.toast) ?? a.toast } : a));
  };

  const screens: ScreenUnit[] = [];
  for (const s of flow.screens) {
    // Popups and toasts designed in the screen's frame are drawn on their own.
    const overlays = [...flow.popups.filter((p) => p.source === s.id && !p.popup.overlay).map((p) => p.popup.root), ...flow.toasts.filter((t) => t.source === s.id).flatMap((t) => t.toast.members)];
    const skip = new Set(overlays.map((n) => n.id));
    const inOverlay = new Set(overlays.flatMap((n) => [...subtreeIds(n)]));
    const plan = planFor(s.built, s.built.root, { sections: true, skip, keepApart: partIds(s.analysis.widgets) });
    const widgets = s.analysis.widgets.filter((w) => !w.nodes.some((n) => inOverlay.has(n.id)));
    widgets.forEach(retarget);
    const ex = extractControls(plan, widgets, s.analysis.navs);
    for (const n of ex.notes) warnings.push({ code: "control", message: `${s.name}: ${n}` });
    screens.push({ screen: s, ops: ex.ops, size: { x: s.built.root.size.x, y: s.built.root.size.y } });
  }

  const popups: PopupUnit[] = [];
  for (const p of flow.popups) {
    const screen = screens.find((u) => u.screen.id === p.screen) ?? screens[0];
    p.widgets.forEach(retarget);
    if (p.popup.overlay) {
      const o = p.popup.overlay;
      const plan = planFor(p.built, p.built.root, { sections: false, keepApart: partIds(p.widgets) });
      const ex = extractControls(plan, p.widgets, []);
      for (const n of ex.notes) warnings.push({ code: "control", message: `${p.popup.name}: ${n}` });
      const size = { x: p.built.root.size.x, y: p.built.root.size.y };
      popups.push({
        popup: p,
        ops: ex.ops,
        offset: overlayOffset(o.position, screen.size, size, o.offset),
        size: screen.size,
        panel: { x: 0, y: 0, w: size.x, h: size.y },
        backdrop: new Set(),
        dim: o.dim ? { fills: [{ kind: "solid", color: o.dim, opacity: 1 }], radii: [0, 0, 0, 0], stroke: null, shadows: [], opacity: 1, backdropBlur: 0 } : null,
        closeOnOutside: o.closeOnOutside,
      });
      continue;
    }
    const skip = new Set(flow.toasts.filter((t) => t.source === p.source).flatMap((t) => t.toast.members.map((m) => m.id)));
    const plan = planFor(p.built, p.built.root, { sections: false, only: [p.popup.root], skip, keepApart: partIds(p.widgets) });
    const ex = extractControls(plan, p.widgets, []);
    for (const n of ex.notes) warnings.push({ code: "control", message: `${p.popup.name}: ${n}` });
    popups.push({
      popup: p,
      ops: ex.ops,
      offset: { x: 0, y: 0 },
      size: { x: p.built.root.size.x, y: p.built.root.size.y },
      panel: p.popup.panel?.box ?? p.popup.rect,
      backdrop: p.popup.backdrop ? subtreeIds(p.popup.backdrop) : new Set(),
      dim: null,
      closeOnOutside: true,
    });
  }

  const toasts: ToastUnit[] = [];
  for (const t of toastsByKey.values()) {
    const plan = planFor(t.built, t.built.root, { sections: false, only: t.toast.members });
    toasts.push({ toast: t, ops: plan.ops, rect: t.toast.rect });
  }

  stage("plan");
  // Fonts from every frame the app draws.
  const fontKeys = new Map<string, FontKey>();
  for (const b of seenBuilds) for (const x of b.fonts.values()) fontKeys.set(`${x.family}|${x.weight}|${x.italic}`, { family: x.family, weight: x.weight, italic: x.italic });
  const fallback: FallbackFonts = {};
  for (const [w, file] of [
    [400, "Inter-Regular.ttf"],
    [500, "Inter-Medium.ttf"],
    [600, "Inter-SemiBold.ttf"],
    [700, "Inter-Bold.ttf"],
  ] as const)
    fallback[w] = new Uint8Array(readFileSync(join(opts.runtimeDir, "fonts", file)));
  // Rasters bake on the thread pool meanwhile: both are timed on their own, overlapping.
  const timed = async <T>(name: string, work: () => Promise<T>): Promise<T> => {
    const t = performance.now();
    const result = await work();
    timings[name] = Math.round(performance.now() - t);
    return result;
  };
  const [baked, faces] = await Promise.all([
    timed("bake", () => bakeRasters([...jobs].map(([built, requests]) => ({ requests, glyphs: built.glyphs })), opts.images ?? new ImageLevels(fig.images), opts.rasterScale ?? 1)),
    timed("fonts", () =>
      resolveFonts(
        [...fontKeys.values()],
        [...seenBuilds].map((b) => ({ root: b.root, glyphs: b.glyphs })),
        opts.fontProvider,
        fallback,
        (message) => warnings.push({ code: "font", message }),
      ),
    ),
  ]);
  lap = performance.now();
  const assets = baked.assets;
  const assetOfRequest = baked.byRequest;

  // The screen's tone and the design's accent, for looks it doesn't draw.
  const frameArea = start.built.root.size.x * start.built.root.size.y;
  const backdrop = start.scene.all.filter((e) => e.role === "surface" && e.box.w * e.box.h >= frameArea * 0.6 && e.fill && e.fill.a > 0.5).sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h)[0];
  const dark = isDark(backdrop?.fill ?? start.scene.root.fill ?? null);
  const accentColors: RGBA[] = [];
  for (const u of [...screens, ...popups])
    for (const op of u.ops) {
      if (op.kind !== "control") continue;
      const c = op.control;
      const surface = c.kind === "button" ? c.surface?.box : c.kind === "toggle" && c.on ? c.track.box : c.kind === "slider" ? c.fill?.box : undefined;
      const main = surface ? mainColor(surface) : null;
      if (main) accentColors.push(main);
    }
  const accent = pickAccent(accentColors, dark);

  const theme = new Theme(faces);
  const emitter = new AppEmitter({
    name,
    flow,
    screens,
    popups,
    toasts,
    theme,
    assetIdent: (id) => assets[assetOfRequest.get(id) ?? 0]?.ident ?? "count",
    assetIsMask: (id) => assets[assetOfRequest.get(id) ?? 0]?.mask ?? false,
    dark,
    accent,
  });
  const appFiles = emitter.emit();
  const palette = emitPalette(theme, start.name);
  const styles = emitStyles(theme);
  const embed = planEmbed(assets, faces, fallback[400]);
  const fontsSrc = emitFonts(faces, "fallback", (ident) => `assets::${embed.font.get(ident)!}`);
  const images = emitImages(assets, (ident) => embed.image.get(ident)!, embed.imagesBlock);

  const files: GeneratedFile[] = [
    ...appFiles.map((x) => ({ path: x.path, contents: x.contents, kind: "design" as const })),
    { path: "src/ui/theme/palette.h", contents: palette, kind: "design" },
    { path: "src/ui/theme/styles.h", contents: styles.header, kind: "design" },
    { path: "src/ui/theme/styles.cpp", contents: styles.source, kind: "design" },
    { path: "src/ui/theme/fonts.h", contents: fontsSrc.header, kind: "design" },
    { path: "src/ui/theme/fonts.cpp", contents: fontsSrc.source, kind: "design" },
    { path: "src/ui/assets/images.h", contents: images.header, kind: "design" },
    // Byte arrays: written ready to read, so they skip the formatter.
    { path: "src/ui/assets/assets.h", contents: embed.header, kind: "asset" },
    { path: "src/ui/assets/images.cpp", contents: images.source, kind: "asset" },
    ...embed.files.map((x) => ({ path: x.path, contents: x.contents, kind: "asset" as const })),
  ];
  for (const rel of RUNTIME_FILES) files.push({ path: rel, contents: new Uint8Array(readFileSync(join(opts.runtimeDir, rel))), kind: "runtime" });
  // Widgets the design uses, plus their shared parts.
  const widgetTypes = new Set([...emitter.widgetTypes, ...[...theme.controls.values()].map((c) => c.type)]);
  if (widgetTypes.size) {
    const kinds = ["look", ...[...widgetTypes].flatMap((t) => WIDGET_FILES[t] ?? [])];
    for (const k of new Set(kinds))
      for (const ext of [".h", ".cpp"]) files.push({ path: `src/ui/components/${k}${ext}`, contents: new Uint8Array(readFileSync(join(opts.runtimeDir, "ui", "components", `${k}${ext}`))), kind: "runtime" });
  }
  files.push({ path: "third_party/fonts/OFL-Inter.txt", contents: new Uint8Array(readFileSync(join(opts.runtimeDir, "fonts", "OFL-Inter.txt"))), kind: "runtime" });
  // The runtime (ff/ and the widgets) is MIT-0: the license travels with it so it's clearly yours to ship.
  files.push({ path: "ff/LICENSE.txt", contents: new Uint8Array(readFileSync(join(opts.runtimeDir, "LICENSE.txt"))), kind: "runtime" });

  const sources = files.filter((x) => x.path.endsWith(".cpp")).map((x) => x.path).sort();
  const headers = files.filter((x) => x.path.endsWith(".h")).map((x) => x.path).sort();
  const projectGuid = guid(`project:${name}`);
  const controls = [...screens, ...popups].reduce((n, u) => n + u.ops.filter((o) => o.kind === "control").length, 0);
  files.push({ path: "CMakeLists.txt", contents: cmakeLists(name, sources), kind: "build" });
  files.push({ path: `${name}.vcxproj`, contents: vcxproj(name, projectGuid, sources, headers), kind: "build" });
  files.push({ path: `${name}.vcxproj.filters`, contents: vcxprojFilters(sources, headers), kind: "build" });
  files.push({ path: `${name}.sln`, contents: sln(name, projectGuid), kind: "build" });
  files.push({ path: "README.md", contents: readme(name, start.name, { screens: screens.length, popups: popups.length, toasts: toasts.length, controls, components: emitter.componentFiles + emitter.sharedParts }), kind: "build" });
  files.push({ path: ".gitignore", contents: "build/\nbin/\nobj/\n.vs/\n*.user\n", kind: "build" });
  files.push({ path: ".clang-format", contents: CLANG_FORMAT, kind: "build" });

  const count = (n: DesignNode): number => 1 + n.children.reduce((s, c) => s + count(c), 0);
  const whole = (b: BuildResult) => ({ x: 0, y: 0, w: b.root.size.x, h: b.root.size.y });
  const units: ProjectUnit[] = [
    ...screens.map((u) => ({ kind: "screen" as const, ident: emitter.identOf("screen", u.screen.id)!, name: u.screen.name, built: u.screen.built, rect: whole(u.screen.built), start: u.screen.id === flow.start })),
    ...popups.map((u) => ({ kind: "popup" as const, ident: emitter.identOf("popup", u.popup.popup.id)!, name: u.popup.popup.name, built: u.popup.built, rect: whole(u.popup.built), over: emitter.identOf("screen", u.popup.screen) })),
    ...toasts.map((u) => ({ kind: "toast" as const, ident: emitter.identOf("toast", u.toast.toast.id)!, name: u.toast.toast.name, built: u.toast.built, rect: u.rect })),
  ];
  stage("emit");
  const finished = files.map(finish);
  stage("finish");
  return {
    name,
    timings,
    files: finished,
    warnings,
    units,
    elements: emitter.elements,
    stats: {
      layers: screens.reduce((n, u) => n + count(u.screen.built.root), 0),
      ops: [...screens, ...popups, ...toasts].reduce((n, u) => n + u.ops.length, 0),
      images: assets.length,
      fonts: faces.length,
      styles: theme.boxes.size + theme.texts.size + theme.controls.size,
      colors: theme.palette.size,
      screens: screens.length,
      popups: popups.length,
      toasts: toasts.length,
      controls,
    },
  };
}
