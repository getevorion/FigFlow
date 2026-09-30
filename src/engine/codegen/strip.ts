/**
 * Removes comments from generated C++ and CMake files, keeping everything
 * else exactly: string and character literals (raw strings too), digit
 * separators, preprocessor lines. Lines that held only a comment go away;
 * runs of blank lines left behind collapse to one.
 */

/** C and C++ source without its comments (line endings become \n). */
export function stripCppComments(source: string): string {
  const src = source.replace(/\r\n?/g, "\n");
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    // Line comment; a backslash before the newline continues it (its lines are kept, empty).
    if (c === "/" && next === "/") {
      i += 2;
      while (i < n && src[i] !== "\n") {
        if (src[i] === "\\" && src[i + 1] === "\n") {
          out += "\n";
          i += 2;
        } else i++;
      }
      continue;
    }
    // Block comment: one space keeps tokens on either side apart.
    if (c === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      const body = src.slice(i, end < 0 ? n : end + 2);
      out += body.includes("\n") ? "\n".repeat(body.split("\n").length - 1) : " ";
      i = end < 0 ? n : end + 2;
      continue;
    }
    // Raw string: R"delim( ... )delim", with an optional u8/u/U/L prefix before the R.
    if (c === "R" && next === '"' && /(^|[^A-Za-z0-9_])(u8|u|U|L)?$/.test(src.slice(Math.max(0, i - 3), i))) {
      const open = src.indexOf("(", i + 2);
      const delim = src.slice(i + 2, open);
      const close = src.indexOf(`)${delim}"`, open + 1);
      const end = close < 0 ? n : close + delim.length + 2;
      out += src.slice(i, end);
      i = end;
      continue;
    }
    // String or character literal.
    if (c === '"' || c === "'") {
      // A quote inside a number is a digit separator (1'000'000), not a literal.
      if (c === "'" && /[0-9A-Fa-f]/.test(src[i - 1] ?? "") && /[0-9A-Fa-f]/.test(next ?? "")) {
        let j = i - 1;
        while (j >= 0 && /[0-9A-Za-z_.']/.test(src[j])) j--;
        if (/[0-9]/.test(src[j + 1] ?? "")) {
          out += c;
          i++;
          continue;
        }
      }
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    out += c;
    i++;
  }
  return tidy(src, out);
}

/** CMake without its comments (# to the end of the line, outside quoted arguments). */
export function stripCmakeComments(source: string): string {
  const src = source.replace(/\r\n?/g, "\n");
  const out = src
    .split("\n")
    .map((line) => {
      let inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === "\\") i++;
        else if (c === '"') inQuote = !inQuote;
        else if (c === "#" && !inQuote) return line.slice(0, i);
      }
      return line;
    })
    .join("\n");
  return tidy(src, out);
}

/**
 * Whitespace after the comments are gone: trailing spaces off, lines that
 * only held a comment dropped (blank lines that were blank before stay),
 * and never more than one blank line in a row.
 */
function tidy(before: string, after: string): string {
  const was = before.split("\n");
  const now = after.split("\n");
  const kept: string[] = [];
  for (let i = 0; i < now.length; i++) {
    const line = now[i].replace(/[ \t]+$/, "");
    const wasBlank = (was[i] ?? "").trim() === "";
    if (line === "" && !wasBlank) continue;
    kept.push(line);
  }
  const text = kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "");
  return text.endsWith("\n") ? text : `${text}\n`;
}
