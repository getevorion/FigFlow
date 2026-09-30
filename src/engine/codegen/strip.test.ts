import { describe, expect, it } from "vitest";
import { stripCmakeComments, stripCppComments } from "./strip";

describe("stripCppComments", () => {
  it("removes line and block comments and the lines they held", () => {
    const src = [
      "// Screen, generated.",
      '#include "a.h" // why',
      "",
      "/* block",
      "   comment */",
      "void f()",
      "{",
      "    // a note",
      "    int x = 1; /* inline */ int y = 2;",
      "}",
      "",
    ].join("\n");
    expect(stripCppComments(src)).toBe(['#include "a.h"', "", "void f()", "{", "    int x = 1;   int y = 2;", "}", ""].join("\n"));
  });

  it("keeps comment markers inside string and character literals", () => {
    const src = 'const char* url = "http://x.y/*z*/"; char c = \'/\'; const char* q = "a\\"//b"; // gone\n';
    expect(stripCppComments(src)).toBe('const char* url = "http://x.y/*z*/"; char c = \'/\'; const char* q = "a\\"//b";\n');
  });

  it("keeps raw strings whole, with or without a prefix", () => {
    const src = 'auto a = R"x(// not a comment )" still )x"; auto b = u8R"(/* no */)"; // yes\n';
    expect(stripCppComments(src)).toBe('auto a = R"x(// not a comment )" still )x"; auto b = u8R"(/* no */)";\n');
  });

  it("treats a quote inside a number as a digit separator", () => {
    const src = "int big = 1'000'000; // count\nchar c = 'a'; // letter\n";
    expect(stripCppComments(src)).toBe("int big = 1'000'000;\nchar c = 'a';\n");
  });

  it("follows backslash line continuations in line comments", () => {
    const src = "int a; // one \\\n still comment\nint b;\n";
    expect(stripCppComments(src)).toBe("int a;\nint b;\n");
  });

  it("keeps a space where a block comment separated tokens", () => {
    expect(stripCppComments("int/**/x;\n")).toBe("int x;\n");
  });

  it("normalizes CRLF and collapses the blank lines left behind", () => {
    const src = "namespace a {\r\n\r\n// x\r\n\r\n\r\nint b;\r\n\r\n}\r\n";
    expect(stripCppComments(src)).toBe("namespace a {\n\nint b;\n\n}\n");
  });
});

describe("stripCmakeComments", () => {
  it("removes # comments outside quotes", () => {
    const src = '# Built by Figflow.\ncmake_minimum_required(VERSION 3.20) # min\nmessage("# not a comment")\n';
    expect(stripCmakeComments(src)).toBe('cmake_minimum_required(VERSION 3.20)\nmessage("# not a comment")\n');
  });
});
