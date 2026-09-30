import { describe, expect, it } from "vitest";
import { NameScope, cleanLayerName, f, snake, str } from "./cpp";

describe("cleanLayerName", () => {
  it("drops ids, timestamps, stock-image tags and Figma's copy counters", () => {
    expect(cleanLayerName("1634377961923_valorant_logo_aislado 1")).toBe("valorant logo aislado");
    expect(cleanLayerName("apex-logo-C3478A4601-seeklogo 1")).toBe("apex logo");
    expect(cleanLayerName("[CITYPNG 1")).toBe("");
    expect(cleanLayerName("Gamepad")).toBe("Gamepad");
    expect(cleanLayerName("Button 2")).toBe("Button");
  });

  it("treats never-named layers as unnamed, in several languages", () => {
    expect(cleanLayerName("Без имени-2 1")).toBe("");
    expect(cleanLayerName("Novy_proekt 1")).toBe("Novy proekt");
    expect(cleanLayerName("Новый проект 3")).toBe("");
    expect(cleanLayerName("Untitled-1")).toBe("");
  });
});

describe("NameScope", () => {
  it("numbers repeats and skips names taken directly", () => {
    const s = new NameScope();
    const got = ["x", "x", "x_3", "x_4", "x", "x", "x_2"].map((b) => s.take(b));
    expect(got).toEqual(["x", "x_2", "x_3", "x_4", "x_5", "x_6", "x_2_2"]);
    expect(new Set(got).size).toBe(got.length);
  });

  it("never hands out a reserved name", () => {
    const s = new NameScope(["screen"]);
    expect(s.take("screen")).toBe("screen_2");
  });

  it("terminates when many numbered names are taken (regression: infinite loop)", () => {
    const s = new NameScope();
    for (let i = 2; i < 50; i++) s.take(`box_${i}`);
    s.take("box");
    expect(s.take("box")).toBe("box_50");
  });
});

describe("snake", () => {
  it("transliterates letters NFKD can't reduce", () => {
    expect(snake("Anahtarı etkinleştir")).toBe("anahtari_etkinlestir");
    expect(snake("АНОНС WARFACE")).toBe("anons_warface");
    expect(snake("Größe")).toBe("grosse");
    // An all-caps word stays one word through a two-letter transliteration.
    expect(snake('СОБЫТИЕ "ЛЕГКАЯ ДОБЫЧА"')).toBe("sobytie_legkaya_dobycha");
    expect(snake("HTTPServer")).toBe("http_server");
  });

  it("stays a valid, non-reserved identifier", () => {
    expect(snake("2nd page", "screen")).toBe("screen_2nd_page");
    expect(snake("", "item")).toBe("item");
    expect(snake("Nav Item / Selected")).toBe("nav_item_selected");
  });

  it("keeps reserved words off with a word, never a trailing underscore", () => {
    // "main_" would make "main__size": C++ reserves identifiers containing "__".
    expect(snake("main", "screen")).toBe("main_screen");
    expect(snake("Default", "value")).toBe("default_value");
    expect(snake("ui")).toBe("ui_item");
    const scope = new NameScope();
    for (const n of ["main", "default", "ui", "main"].map((x) => scope.take(snake(x, "screen")))) expect(n).not.toMatch(/__|_$/);
  });
});

describe("literals", () => {
  it("formats floats with an f suffix", () => {
    expect(f(12)).toBe("12.f");
    expect(f(0.5)).toBe("0.5f");
    expect(f(-0)).toBe("0.f");
  });

  it("writes text as itself, escaping only what must be", () => {
    expect(str("Anahtarı etkinleştir")).toBe('"Anahtarı etkinleştir"');
    expect(str('a"b\\c\n')).toBe('"a\\"b\\\\c\\n"');
    // Control characters as hex escapes, which mustn't swallow a following hex digit.
    expect(str("\u00011")).toBe('"\\x01""1"');
    // Invisible separators and bidirectional overrides show as escapes.
    expect(str(`a${String.fromCharCode(0x202e)}b`)).toBe('"a\\u202eb"');
  });
});
