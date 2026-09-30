// Figflow runtime: drawing Figma layers with ImDrawList.
//
// Everything draws into an ImDrawList at absolute (screen) coordinates, the
// way Dear ImGui's own widgets render. Shapes support four independent corner
// radii, stacked fills (solid, multi-stop linear gradients, images), aligned
// or per-side strokes, and drop/inner shadows computed analytically (a
// Gaussian of Figma's radius, not a texture), so they stay sharp at any DPI
// and can animate.
#pragma once

#include "style.h"
#include "imgui_internal.h"

namespace ff::draw {

// Appends a clockwise rounded-rectangle outline to the draw list's path.
// Radii that don't fit are scaled down together (the CSS/SVG rule).
void path_rect(ImDrawList* dl, const ImRect& r, const Radii& radii);

// Appends a clockwise ellipse outline to the draw list's path.
void path_ellipse(ImDrawList* dl, const ImRect& r);

// Fills a rounded rectangle with one paint layer.
void fill(ImDrawList* dl, const ImRect& r, const Radii& radii, const Fill& f, float alpha = 1.f);

// Strokes a rounded rectangle, honoring Figma's inside/center/outside alignment
// and independent side weights (a bottom-only divider draws only that side).
void stroke(ImDrawList* dl, const ImRect& r, const Radii& radii, const Stroke& s, float alpha = 1.f);

// A drop shadow (inner == false) or inner shadow (inner == true) of a rounded
// rectangle. `knockout` keeps a drop shadow out of the shape's interior, which
// Figma does unless "Show behind transparent areas" is on.
void shadow(ImDrawList* dl, const ImRect& r, const Radii& radii, const Shadow& s, float alpha = 1.f, bool knockout = false);

// Draws a complete layer: drop shadows, fills, inner shadows, then stroke.
void box(ImDrawList* dl, const ImRect& r, const Box& b, float alpha = 1.f);

// The same layer drawn as an ellipse inscribed in `r` (radii are ignored).
void ellipse(ImDrawList* dl, const ImRect& r, const Box& b, float alpha = 1.f);

// Draws a baked image asset stretched over `r`. Single-color artwork is baked
// white, so `tint` sets its color (icons can change color with state).
void image(ImDrawList* dl, const ImRect& r, int asset, ImU32 tint = IM_COL32_WHITE, float alpha = 1.f);

// Convex polygon with a per-vertex linear gradient and an anti-aliased edge.
void convex_gradient(ImDrawList* dl, const ImVec2* points, int count, const Gradient& g, ImVec2 origin, float alpha = 1.f);

// Blends two looks, for animated state changes (0 = a, 1 = b).
Box mix(const Box& a, const Box& b, float t);
Fill mix(const Fill& a, const Fill& b, float t);
Shadow mix(const Shadow& a, const Shadow& b, float t);
Stroke mix(const Stroke& a, const Stroke& b, float t);
Radii mix(const Radii& a, const Radii& b, float t);

// Blends colors in premultiplied space, so fading to a transparent color
// doesn't pass through a darker tint.
ImU32 mix(ImU32 a, ImU32 b, float t);

// Multiplies a color's alpha.
inline ImU32 fade(ImU32 col, float alpha)
{
    if (alpha >= 1.f)
        return col;
    const ImU32 a = (ImU32)((float)((col >> IM_COL32_A_SHIFT) & 0xFF) * ImSaturate(alpha) + 0.5f);
    return (col & ~IM_COL32_A_MASK) | (a << IM_COL32_A_SHIFT);
}

} // namespace ff::draw
