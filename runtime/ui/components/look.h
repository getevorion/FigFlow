// Figflow widgets: the parts every control is drawn from.
//
// A control's look comes straight from the design: a surface (an ff::Box), a
// label on the design's baseline and an icon. Each state (idle, hovered,
// pressed, selected, disabled) is a complete Look, and controls blend between
// them over time, so they animate between exactly the looks the converter
// derived from the design.
#pragma once

#include "ff/style.h"

struct ImRect;

namespace ui {

// Text placed the way the design places it: aligned inside the area at
// `pos`/`size` (relative to the control), on `baseline` (from that area's top).
struct Label
{
    const ff::TextStyle* style = nullptr; // null: no label
    ImVec2 pos{};
    ImVec2 size{};
    float baseline = 0.f;
    ff::Align align = ff::Align::start;
    bool clip = false; // ellipsize text that doesn't fit
};

// An image asset placed relative to the control. Single-colour icons are baked
// white, so `tint` is their colour.
struct Icon
{
    int image = -1; // images:: id, -1 = none
    ImVec2 pos{};
    ImVec2 size{};
    ImU32 tint = IM_COL32_WHITE;
};

// One state of a control.
struct Look
{
    ff::Box surface{};
    ImU32 label = 0; // label colour, 0 = the label style's own
    ImU32 icon = 0;  // icon tint, 0 = the icon's own
    ImU32 plate = 0; // plate image tint (a shape baked white), 0 = the plate's own
};

// Blends two looks (0 = a, 1 = b).
Look mix(const Look& a, const Look& b, float t);

// Draws a label inside the control `bb`; `color` 0 keeps the style's colour.
void draw_label(ImDrawList* dl, const ImRect& bb, const Label& label, ImU32 color, const char* text, const char* text_end = nullptr);

// Draws an icon inside the control `bb`; `tint` 0 keeps the icon's own.
void draw_icon(ImDrawList* dl, const ImRect& bb, const Icon& icon, ImU32 tint = 0);

// Draws a whole button-like control: surface (over `surface`, else the whole
// control), plate (an image tinted with the look's plate colour), icon, label.
void draw(ImDrawList* dl, const ImRect& bb, const Look& look, const Label& label, const char* text, const char* text_end, const Icon& icon, const ImRect* surface = nullptr,
          const Icon* plate = nullptr);

// True when the current item is disabled by BeginDisabled() (not by a popup
// covering it, which blocks input but keeps the look).
bool looks_disabled();

} // namespace ui
