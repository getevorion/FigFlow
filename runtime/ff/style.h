// Figflow runtime: the value types generated styles are written in.
//
// Everything here is a plain aggregate with default member initializers, so
// generated code can use C++20 designated initializers:
//
//     inline const ff::Box panel{ .fills = { ff::solid(palette::surface) }, .radii = { 12.f } };
//
// Colors are ImU32 (IM_COL32 packing, straight alpha). Positions inside a
// style are local to the rectangle the style is drawn into.
#pragma once

#include "imgui.h"

#include <initializer_list>

namespace ff {

// Corner radii in pixels, clockwise from top-left (Figma's order).
struct Radii
{
    float tl = 0.f, tr = 0.f, br = 0.f, bl = 0.f;

    constexpr Radii() = default;
    constexpr Radii(float all) : tl(all), tr(all), br(all), bl(all) {}
    constexpr Radii(float tl_, float tr_, float br_, float bl_) : tl(tl_), tr(tr_), br(br_), bl(bl_) {}

    constexpr bool is_zero() const { return tl <= 0.f && tr <= 0.f && br <= 0.f && bl <= 0.f; }
};

struct GradientStop
{
    float position = 0.f; // 0..1 along the gradient
    ImU32 color = 0;
};

// A linear gradient from `from` (position 0) to `to` (position 1), in pixels
// local to the shape's rectangle. Up to 8 stops; radial, angular and diamond
// gradients are baked into textures by the converter.
struct Gradient
{
    static constexpr int max_stops = 8;
    ImVec2 from{ 0.f, 0.f };
    ImVec2 to{ 0.f, 1.f };
    GradientStop stops[max_stops]{};
    int stop_count = 0;
};

enum class FillKind : unsigned char
{
    none,
    solid,
    linear,
    image,
};

// One paint layer. A Box stacks up to three, bottom to top, like Figma's fill list.
struct Fill
{
    FillKind kind = FillKind::none;
    ImU32 color = 0;             // solid color, or the tint for images
    Gradient gradient{};         // linear
    int image = -1;              // image: index into the generated asset table
    ImVec2 uv0{ 0.f, 0.f };      // image: sub-rectangle of the texture
    ImVec2 uv1{ 1.f, 1.f };
    float opacity = 1.f;         // layer opacity, multiplied into every color
    bool additive = false;       // Figma "Linear dodge"
};

constexpr Fill solid(ImU32 color, float opacity = 1.f)
{
    Fill f{};
    f.kind = FillKind::solid;
    f.color = color;
    f.opacity = opacity;
    return f;
}

// A linear gradient fill: `from`/`to` are local to the drawn rectangle.
constexpr Fill linear(ImVec2 from, ImVec2 to, std::initializer_list<GradientStop> stops, float opacity = 1.f)
{
    Fill f{};
    f.kind = FillKind::linear;
    f.gradient.from = from;
    f.gradient.to = to;
    for (const GradientStop& s : stops)
        if (f.gradient.stop_count < Gradient::max_stops)
            f.gradient.stops[f.gradient.stop_count++] = s;
    f.opacity = opacity;
    return f;
}

constexpr Fill image(int asset, ImU32 tint = IM_COL32_WHITE, float opacity = 1.f)
{
    Fill f{};
    f.kind = FillKind::image;
    f.image = asset;
    f.color = tint;
    f.opacity = opacity;
    return f;
}

enum class StrokeAlign : unsigned char
{
    inside,
    center,
    outside,
};

struct Stroke
{
    ImU32 color = 0;
    float weight = 0.f;                     // uniform weight
    StrokeAlign align = StrokeAlign::inside;
    float top = -1.f, right = -1.f, bottom = -1.f, left = -1.f; // independent sides; -1 = use `weight`
    float opacity = 1.f;

    constexpr bool visible() const
    {
        return (color >> IM_COL32_A_SHIFT) != 0 && (weight > 0.f || top > 0.f || right > 0.f || bottom > 0.f || left > 0.f);
    }
    constexpr bool independent() const { return top >= 0.f || right >= 0.f || bottom >= 0.f || left >= 0.f; }
};

// Figma drop / inner shadow. `blur` is Figma's radius (the Gaussian's sigma is blur / 2).
struct Shadow
{
    ImU32 color = 0;
    ImVec2 offset{ 0.f, 0.f };
    float blur = 0.f;
    float spread = 0.f;
    bool inner = false;
    bool show_behind = false; // drop shadows only: also draw under translucent fills

    constexpr bool visible() const { return (color >> IM_COL32_A_SHIFT) != 0; }
};

// The look of one rectangle-like layer: fills, stroke, shadows, radii.
struct Box
{
    static constexpr int max_fills = 3;
    static constexpr int max_shadows = 4;

    Fill fills[max_fills]{};
    Radii radii{};
    Stroke stroke{};
    Shadow shadows[max_shadows]{};
    float opacity = 1.f;
    float backdrop_blur = 0.f; // Figma background blur radius (needs a backend that supports it)
};

// A text style: size is Figma's em size in pixels (fonts are loaded so the
// two match exactly, see text.h). `font` points at the font handle variable
// (e.g. &fonts::inter_medium) because styles are constants created before the
// fonts are loaded; null means the current ImGui font.
struct TextStyle
{
    ImFont* const* font = nullptr;
    float size = 14.f;
    ImU32 color = IM_COL32_WHITE;
    float letter_spacing = 0.f; // pixels added after every character
    float line_height = 0.f;    // pixels; 0 = the font's own line height
};

enum class Align : unsigned char
{
    start,
    center,
    end,
};

} // namespace ff
