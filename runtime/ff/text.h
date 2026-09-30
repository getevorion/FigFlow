// Figflow runtime: fonts and text placed on Figma's baselines.
//
// Figma sizes text by the font's em square; Dear ImGui's stb_truetype loader
// sizes it by ascent - descent (stbtt_ScaleForPixelHeight). Fonts are loaded
// with ImFontConfig::ExtraSizeScale = (ascent - descent) / unitsPerEm, so an
// ImGui size of 14 draws exactly Figma's 14 px text. Text is anchored on its
// baseline (Figma's layout data), not on the line box's top edge.
//
// Dear ImGui lays text out without kerning. A font can carry a kerning table
// (the generated fonts.cpp gives each face the kerning Figma applied), and the
// functions here add it between letters.
#pragma once

#include "style.h"

struct ImRect;

namespace ff {

// Kerning between two characters (code points), in em: added to the left
// character's advance when the right one follows it.
struct KernPair
{
    unsigned int left = 0;
    unsigned int right = 0;
    float em = 0.f;
};

// A font file embedded by the generated fonts.cpp.
struct FontSource
{
    const unsigned char* data = nullptr;
    unsigned int size = 0;
    float em_scale = 0.f;      // (hhea ascender - descender) / unitsPerEm; 0 = read it from the font
    const char* name = "";
    const ImWchar* exclude = nullptr; // glyph ranges this source must not provide when merged
    const KernPair* kerning = nullptr; // sorted by left, then right; must stay alive
    int kerning_count = 0;
};

// Loads a font (the atlas keeps using `src.data`, which must stay alive).
// With `merge_into`, the glyphs are added to an existing font as a fallback.
// A source's kerning applies to the font it's loaded as (or merged into).
ImFont* add_font(const FontSource& src, ImFont* merge_into = nullptr);

// The kerning between two characters of `font` at `size` pixels (0 without a table).
float kerning(ImFont* font, float size, unsigned int left, unsigned int right);

// Width of a single line of text, including letter spacing and kerning.
float text_width(const TextStyle& style, const char* text, const char* text_end = nullptr);

// Draws one line of text with its baseline starting at `baseline_left`.
void text(ImDrawList* dl, ImVec2 baseline_left, const TextStyle& style, const char* text, const char* text_end = nullptr, float alpha = 1.f);

// Draws one line inside `box` on the given baseline (relative to box.Min.y),
// aligned horizontally; ellipsizes with "…" when `clip` and the text is too wide.
void text_in(ImDrawList* dl, const ImRect& box, float baseline, Align align, const TextStyle& style, const char* text, float alpha = 1.f, bool clip = false);

// The same for text that ends at `text_end` (e.g. before an ImGui "##id" suffix).
void text_in(ImDrawList* dl, const ImRect& box, float baseline, Align align, const TextStyle& style, const char* text, const char* text_end, float alpha, bool clip);

// Draws an icon glyph whose em square is the `size`×`size` box at `top_left`
// (icon fonts are generated that way: one icon per glyph, filling the em).
void icon(ImDrawList* dl, ImFont* icons, ImVec2 top_left, float size, ImWchar glyph, ImU32 color, float alpha = 1.f);

} // namespace ff
