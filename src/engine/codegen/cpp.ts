/**
 * Small helpers for emitting readable C++: literals, identifiers, colors.
 */
import type { RGBA } from "../model/types";

const RESERVED = new Set(
  (
    "alignas alignof and and_eq asm auto bitand bitor bool break case catch char char8_t char16_t char32_t class compl concept const consteval constexpr constinit const_cast continue co_await co_return co_yield decltype default delete do double dynamic_cast else enum explicit export extern false float for friend goto if inline int long mutable namespace new noexcept not not_eq nullptr operator or or_eq private protected public register reinterpret_cast requires return short signed sizeof static static_assert static_cast struct switch template this thread_local throw true try typedef typeid typename union unsigned using virtual void volatile wchar_t while xor xor_eq " +
    // names that collide with common macros or our own namespaces
    "min max near far small interface main errno assert NULL TRUE FALSE ff ui app theme styles palette metrics fonts icons assets screens components widgets draw text anim layout std ImGui"
  ).split(/\s+/),
);

// Letters NFKD can't reduce to ASCII: Turkish, Nordic, Polish, German, Cyrillic, Greek.
const TRANSLIT: Record<string, string> = {
  ı: "i", İ: "I", ł: "l", Ł: "L", ø: "o", Ø: "O", æ: "ae", Æ: "Ae", œ: "oe", Œ: "Oe", ß: "ss", đ: "d", Đ: "D", ð: "d", Ð: "D", þ: "th", Þ: "Th",
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
  р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  і: "i", ї: "yi", є: "ye", ґ: "g",
  α: "a", β: "b", γ: "g", δ: "d", ε: "e", ζ: "z", η: "e", θ: "th", ι: "i", κ: "k", λ: "l", μ: "m", ν: "n", ξ: "x", ο: "o", π: "p", ρ: "r",
  σ: "s", ς: "s", τ: "t", υ: "y", φ: "f", χ: "ch", ψ: "ps", ω: "o",
};

function transliterate(s: string): string {
  let out = "";
  for (const ch of s) {
    const lower = ch.toLowerCase();
    const t = TRANSLIT[ch] ?? TRANSLIT[lower];
    out += t === undefined ? ch : ch !== lower && t ? t[0].toUpperCase() + t.slice(1) : t;
  }
  return out;
}

/** "Settings / Nav Item 2" → "settings_nav_item_2"; never empty, never reserved, never starts with a digit. */
export function snake(name: string, fallback = "item"): string {
  // All-caps words are one word ("ДОБЫЧА" → "dobycha", not "DOBYCh_A" split like camelCase).
  const ascii = transliterate(name.replace(/\p{Lu}{2,}(?!\p{Ll})/gu, (m) => m.toLowerCase()))
    .normalize("NFKD")
    .replace(/\p{Mn}/gu, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  let id = ascii || fallback;
  if (/^[0-9]/.test(id)) id = `${fallback}_${id}`;
  id = id.slice(0, 48).replace(/_+$/, "");
  // After trimming, so the word that keeps it off C++ keywords and our namespaces survives. A word,
  // not a trailing underscore: "main_" would become "main__size", and C++ reserves every
  // identifier with a double underscore.
  if (!RESERVED.has(id)) return id;
  const word = snakeWord(fallback);
  return word && word !== id && !RESERVED.has(word) ? `${id}_${word}` : `${id}_item`;
}

function snakeWord(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/** Words designers' tools put in names of layers nobody named: "Untitled", "New project", "Copy"… */
const UNTITLED = ["untitled", "без имени", "без названия", "новый проект", "new project", "unbenannt", "sans titre", "sin título", "sin titulo", "senza titolo", "adsız", "isimsiz", "копия"];

/** Tokens of downloaded-image file names: stock sites and file types. */
const FILE_WORDS = new Set(["seeklogo", "citypng", "pngwing", "pngtree", "kisspng", "freepik", "clipart", "png", "jpg", "jpeg", "webp", "svg", "gif"]);

/**
 * A layer name as a basis for a C++ name: without the parts that aren't names
 * (timestamps, hash-like ids, stock-image file tags, brackets), or "" when
 * nothing meaningful is left or the layer was never named ("Untitled-2").
 */
export function cleanLayerName(name: string, opts: { keepCounter?: boolean } = {}): string {
  const lower = name.toLowerCase();
  if (UNTITLED.some((w) => lower.includes(w))) return "";
  const kept = name
    .split(/[\s_\-.,:;()[\]{}]+/u)
    .filter((t) => t && !FILE_WORDS.has(t.toLowerCase()))
    // Six or more digits, or a mix of 8+ letters and digits: an id, not a word.
    .filter((t) => !/\d{6,}/.test(t) && !(t.length >= 8 && /\d/.test(t) && /[A-Za-z]/.test(t)));
  // A trailing "1", "2"… is Figma's copy counter, not part of a name.
  while (!opts.keepCounter && kept.length > 1 && /^\d{1,3}$/.test(kept[kept.length - 1])) kept.pop();
  const out = kept.join(" ").trim();
  return /[\p{L}]/u.test(out) ? out : "";
}

/** "settings menu" → "SettingsMenu" */
export function pascal(name: string, fallback = "Design"): string {
  const s = snake(name, fallback)
    .split("_")
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join("");
  return /^[0-9]/.test(s) ? `${fallback}${s}` : s || fallback;
}

/** Hands out unique identifiers within one C++ scope. */
export class NameScope {
  private used = new Map<string, number>();

  constructor(reserved: Iterable<string> = []) {
    for (const r of reserved) this.used.set(r, 1);
  }

  has(name: string): boolean {
    return this.used.has(name);
  }

  take(base: string): string {
    if (!this.used.has(base)) {
      this.used.set(base, 1);
      return base;
    }
    // Next free numbered name: "name_2", "name_3"… skipping ones taken directly.
    let n = this.used.get(base)!;
    let candidate: string;
    do candidate = `${base}_${++n}`;
    while (this.used.has(candidate));
    this.used.set(base, n);
    this.used.set(candidate, 1);
    return candidate;
  }
}

/** Float literal with an f suffix and no noise: 12.f, 0.5f, -3.25f. */
export function f(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return "0.f";
  const r = Math.round(v * 10 ** digits) / 10 ** digits;
  const s = Object.is(r, -0) ? "0" : String(r);
  return s.includes(".") || s.includes("e") ? `${s}f` : `${s}.f`;
}

export function vec2(x: number, y: number): string {
  return `ImVec2(${f(x)}, ${f(y)})`;
}

export function byte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

/** IM_COL32 literal (works with either color packing, unlike raw hex). */
export function col32(c: RGBA, alpha = 1): string {
  const pad = (n: number) => String(n).padStart(3, " ");
  return `IM_COL32(${pad(byte(c.r))}, ${pad(byte(c.g))}, ${pad(byte(c.b))}, ${pad(byte(c.a * alpha))})`;
}

/** C++ string literal (UTF-8, with escapes for control characters and non-ASCII as \x.. sequences split safely). */
export function str(s: string): string {
  let out = '"';
  let prevHex = false;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) {
      out += `\\x${cp.toString(16).padStart(2, "0")}`;
      prevHex = true;
      continue;
    } else if (cp === 0x2028 || cp === 0x2029 || cp === 0xfeff || (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069)) {
      // Line separators, a byte-order mark and bidirectional overrides: visible as escapes, never as invisible text.
      out += `\\u${cp.toString(16).padStart(4, "0")}`;
    } else {
      // A hex escape swallows following hex digits; break the literal to stop it.
      if (prevHex && /[0-9a-fA-F]/.test(ch)) out += '""';
      // Everything else as itself: the project compiles as UTF-8 (/utf-8).
      out += ch;
    }
    prevHex = false;
  }
  return out + '"';
}

/** A C++ comment line, safe from comment terminators and newlines. */
export function comment(s: string): string {
  return s.replace(/\*\//g, "* /").replace(/[\r\n]+/g, " ").trim();
}

/** Emits a byte array as `static const unsigned char name[] = { ... };` in compact rows. */
export function byteArray(name: string, data: Uint8Array, perLine = 24): string {
  const lines: string[] = [];
  for (let i = 0; i < data.length; i += perLine) {
    const row: string[] = [];
    for (let j = i; j < Math.min(i + perLine, data.length); j++) row.push(String(data[j]));
    lines.push("    " + row.join(","));
  }
  return `alignas(4) const unsigned char ${name}[${data.length}] = {\n${lines.join(",\n")}\n};\n`;
}

/** Indentation-aware source builder. */
export class Writer {
  private lines: string[] = [];
  private depth = 0;

  line(s = ""): this {
    this.lines.push(s ? "    ".repeat(this.depth) + s : "");
    return this;
  }
  lines_(...ls: string[]): this {
    for (const l of ls) this.line(l);
    return this;
  }
  open(s: string): this {
    this.line(s);
    this.line("{");
    this.depth++;
    return this;
  }
  close(suffix = ""): this {
    this.depth--;
    this.line("}" + suffix);
    return this;
  }
  indent(): this {
    this.depth++;
    return this;
  }
  dedent(): this {
    this.depth = Math.max(0, this.depth - 1);
    return this;
  }
  raw(block: string): this {
    for (const l of block.split("\n")) this.line(l);
    return this;
  }
  /** Lines written so far: a mark for since(). */
  get size(): number {
    return this.lines.length;
  }
  /** The lines written after `mark` (a size read earlier). */
  since(mark: number): string[] {
    return this.lines.slice(mark);
  }
  toString(): string {
    return this.lines.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
  }
}
