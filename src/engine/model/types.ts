/**
 * The normalized design model: every Figma layer the converter can see, with
 * instances already expanded, overrides applied and geometry resolved.
 *
 * It is plain JSON (no Maps, classes or functions) so the same model feeds
 * the C++ code generator on the server and the layer preview in the browser.
 * Coordinates are pixels. `transform` is relative to the parent layer; `box`
 * is the axis-aligned bounds relative to the converted root frame.
 */

export type Vec2 = { x: number; y: number };
/** Affine 2×3 matrix, Figma's layout: [m00 m01 m02; m10 m11 m12]. */
export type Mat = { m00: number; m01: number; m02: number; m10: number; m11: number; m12: number };
export type Rect = { x: number; y: number; w: number; h: number };
/** sRGB-encoded RGBA in 0..1 with straight (not premultiplied) alpha, as Figma stores it. */
export type RGBA = { r: number; g: number; b: number; a: number };

export type BlendMode =
  | "PASS_THROUGH"
  | "NORMAL"
  | "DARKEN"
  | "MULTIPLY"
  | "LINEAR_BURN"
  | "COLOR_BURN"
  | "LIGHTEN"
  | "SCREEN"
  | "LINEAR_DODGE"
  | "COLOR_DODGE"
  | "OVERLAY"
  | "SOFT_LIGHT"
  | "HARD_LIGHT"
  | "DIFFERENCE"
  | "EXCLUSION"
  | "HUE"
  | "SATURATION"
  | "COLOR"
  | "LUMINOSITY";

export type NodeKind =
  | "FRAME"
  | "GROUP"
  | "SECTION"
  | "COMPONENT"
  | "COMPONENT_SET"
  | "INSTANCE"
  | "RECTANGLE"
  | "ELLIPSE"
  | "LINE"
  | "STAR"
  | "POLYGON"
  | "VECTOR"
  | "BOOLEAN"
  | "TEXT"
  | "SLICE";

// --- Paint ---------------------------------------------------------------

export type GradientStop = { position: number; color: RGBA };

export type SolidPaint = { type: "SOLID"; color: RGBA; opacity: number; visible: boolean; blendMode: BlendMode; styleRef?: string; variableRef?: string };

/**
 * Gradient geometry as Figma's three handles in the layer's local pixel space:
 * `from` (stop 0), `to` (stop 1) and `width` (the perpendicular extent, used
 * by radial/diamond gradients for the second radius).
 */
export type GradientPaint = {
  type: "GRADIENT_LINEAR" | "GRADIENT_RADIAL" | "GRADIENT_ANGULAR" | "GRADIENT_DIAMOND";
  stops: GradientStop[];
  from: Vec2;
  to: Vec2;
  width: Vec2;
  opacity: number;
  visible: boolean;
  blendMode: BlendMode;
  styleRef?: string;
};

export type ImagePaint = {
  type: "IMAGE";
  /** SHA-1 hex of the image bytes (the ZIP's images/<hash> entry). */
  hash: string;
  scaleMode: "FILL" | "FIT" | "TILE" | "STRETCH";
  /** For STRETCH (crop): maps the layer's unit square onto the image's unit square. */
  transform?: Mat;
  /** TILE scale factor. */
  scale?: number;
  rotation?: number;
  opacity: number;
  visible: boolean;
  blendMode: BlendMode;
  imageSize?: Vec2;
  filters?: { exposure?: number; contrast?: number; saturation?: number; temperature?: number; tint?: number; highlights?: number; shadows?: number };
};

export type Paint = SolidPaint | GradientPaint | ImagePaint;

// --- Stroke --------------------------------------------------------------

export type StrokeAlign = "INSIDE" | "OUTSIDE" | "CENTER";
export type Stroke = {
  weight: number;
  /** Independent side weights (frames/rectangles only). */
  sides?: { top: number; right: number; bottom: number; left: number };
  align: StrokeAlign;
  cap: "NONE" | "ROUND" | "SQUARE" | "ARROW_LINES" | "ARROW_EQUILATERAL" | string;
  join: "MITER" | "BEVEL" | "ROUND";
  miterLimit: number;
  dashes?: number[];
};

// --- Effects -------------------------------------------------------------

export type ShadowEffect = {
  type: "DROP_SHADOW" | "INNER_SHADOW";
  color: RGBA;
  offset: Vec2;
  /** Figma "blur" radius; the Gaussian's standard deviation is radius / 2. */
  radius: number;
  spread: number;
  visible: boolean;
  blendMode: BlendMode;
  /** Drop shadows only: draw the shadow even under translucent fills. */
  showBehindNode: boolean;
};
export type BlurEffect = { type: "LAYER_BLUR" | "BACKGROUND_BLUR"; radius: number; visible: boolean };
export type Effect = ShadowEffect | BlurEffect;

// --- Geometry ------------------------------------------------------------

export type WindingRule = "NONZERO" | "EVENODD";
/** One path: SVG path data in the layer's local pixel space. */
export type GeometryPath = { d: string; winding: WindingRule };

/** Corner radii in pixels. `smoothing` is Figma's corner smoothing (0..1). */
export type Corners = { tl: number; tr: number; br: number; bl: number; smoothing: number };

// --- Layout --------------------------------------------------------------

export type AutoLayout = {
  mode: "HORIZONTAL" | "VERTICAL" | "GRID";
  wrap: boolean;
  gap: number;
  /** Cross-axis gap between wrapped lines. */
  counterGap: number;
  padding: { top: number; right: number; bottom: number; left: number };
  /** Primary axis distribution. */
  justify: "START" | "CENTER" | "END" | "SPACE_BETWEEN";
  /** Counter axis alignment of children. */
  align: "START" | "CENTER" | "END" | "BASELINE" | "STRETCH";
  primarySizing: "FIXED" | "HUG";
  counterSizing: "FIXED" | "HUG";
  /** Later children paint below earlier ones ("canvas stacking"). */
  reverseZ: boolean;
  strokesIncludedInLayout: boolean;
};

export type LayoutChild = {
  /** Absolute-positioned inside an auto-layout parent. */
  absolute: boolean;
  /** 1 = "Fill container" along the parent's primary axis. */
  grow: number;
  /** STRETCH = "Fill container" along the parent's counter axis. */
  alignSelf: "AUTO" | "STRETCH" | "START" | "CENTER" | "END";
};

export type Constraint = "MIN" | "MAX" | "CENTER" | "STRETCH" | "SCALE";

// --- Text ----------------------------------------------------------------

export type FontRef = {
  family: string;
  style: string;
  postscript: string;
  weight: number;
  italic: boolean;
  /** (ascender - descender) / unitsPerEm of the font file Figma laid the text out with, when saved. */
  lineHeightEm?: number;
};

/** A run of characters sharing one style. */
export type TextRun = {
  start: number;
  end: number;
  font: FontRef;
  fontSize: number;
  /** Pixels. */
  letterSpacing: number;
  /** Pixels, or null for "auto" (the font's own line height). */
  lineHeight: number | null;
  fills: Paint[];
  decoration: "NONE" | "UNDERLINE" | "STRIKETHROUGH";
  textCase: "ORIGINAL" | "UPPER" | "LOWER" | "TITLE" | "SMALL_CAPS" | "SMALL_CAPS_FORCED";
  hyperlink?: string;
};

/** Figma's own layout of one line (from derivedTextData). */
export type TextLine = {
  /** Baseline origin, local to the text layer. */
  baseline: Vec2;
  width: number;
  top: number;
  height: number;
  ascent: number;
  firstChar: number;
  endChar: number;
};

/** One positioned glyph, from Figma's saved layout. */
export type Glyph = {
  /** Index into `DesignDocument.glyphs` (deduplicated outlines), or -1 for no outline (spaces). */
  outline: number;
  /** Baseline position, local to the text layer. */
  x: number;
  y: number;
  fontSize: number;
  /** Index of the first character this glyph renders (ligatures cover several). */
  char: number;
  /** Advance in pixels. */
  advance: number;
  rotation: number;
};

export type TextData = {
  characters: string;
  runs: TextRun[];
  alignH: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED";
  alignV: "TOP" | "CENTER" | "BOTTOM";
  autoResize: "NONE" | "WIDTH_AND_HEIGHT" | "HEIGHT" | "TRUNCATE";
  paragraphSpacing: number;
  maxLines?: number;
  truncated: boolean;
  lines: TextLine[];
  glyphs: Glyph[];
  /** True when Figma's saved layout (lines + glyphs) is present. */
  hasLayout: boolean;
};

// --- Prototype -----------------------------------------------------------

export type Reaction = {
  trigger: "ON_CLICK" | "ON_HOVER" | "ON_PRESS" | "ON_DRAG" | "AFTER_TIMEOUT" | "MOUSE_ENTER" | "MOUSE_LEAVE" | "ON_KEY_DOWN" | string;
  timeout?: number;
  action:
    | { kind: "NAVIGATE"; target: string }
    | { kind: "OVERLAY"; target: string }
    | { kind: "SWAP"; target: string }
    | { kind: "SCROLL_TO"; target: string }
    | { kind: "BACK" }
    | { kind: "CLOSE" }
    | { kind: "URL"; url: string }
    | { kind: "CHANGE_TO"; target: string }
    | { kind: "OTHER"; raw: string };
};

// --- Node ----------------------------------------------------------------

export type DesignNode = {
  /** Unique within the document. Instance clones get "instanceId;sourceKey…" paths. */
  id: string;
  /** GUID of the underlying Figma node ("session:local"), the master's for clones. */
  guid: string;
  kind: NodeKind;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;

  transform: Mat;
  size: Vec2;
  /** Axis-aligned bounds relative to the converted root; filled by `resolveBoxes`. */
  box: Rect;

  fills: Paint[];
  strokes: Paint[];
  stroke: Stroke | null;
  effects: Effect[];
  corners: Corners;
  clipsContent: boolean;

  mask: null | { type: "ALPHA" | "VECTOR" | "LUMINANCE"; outline: boolean };

  /** Resolved outline geometry (vectors, booleans, stars, text-free shapes). */
  fillGeometry: GeometryPath[];
  strokeGeometry: GeometryPath[];

  layout: AutoLayout | null;
  layoutChild: LayoutChild;
  constraints: { h: Constraint; v: Constraint };
  minSize?: Vec2;
  maxSize?: Vec2;
  scroll?: "NONE" | "HORIZONTAL" | "VERTICAL" | "BOTH";

  text: TextData | null;

  /** Components: this node's key in its component set ("State=On, Size=Small" → map). */
  variant?: Record<string, string>;
  /** Instances: the main component this was expanded from. */
  component?: { id: string; name: string; set?: { id: string; name: string } };
  /** Instances: resolved component properties (variant + text/boolean/swap props). */
  props?: Record<string, string | boolean>;

  reactions: Reaction[];

  /** Shared style names ("Primary/Button"), keyed by what they style. */
  styleNames?: { fill?: string; stroke?: string; text?: string; effect?: string };

  children: DesignNode[];
};

export type DesignPage = {
  id: string;
  name: string;
  /** Top-level layers on the page, in paint order (first = bottom). */
  children: DesignNode[];
  backgroundColor: RGBA;
};

export type DesignDocument = {
  name: string;
  archiveVersion: number;
  pages: DesignPage[];
  /** Deduplicated glyph outlines, em-space SVG path data (y down), referenced by Glyph.outline. */
  glyphs: string[];
  /** Image hashes the document references, with their pixel sizes when known. */
  images: Record<string, { width: number; height: number; mime: string; bytes: number }>;
  /** Font families and styles text layers use, with how many layers use each. */
  fonts: Array<{ family: string; style: string; postscript: string; weight: number; italic: boolean; layers: number }>;
  warnings: DesignWarning[];
};

export type DesignWarning = {
  code: string;
  message: string;
  nodeId?: string;
  nodeName?: string;
};
