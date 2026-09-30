// Figflow widgets: sliders.
#pragma once

#include "ui/components/look.h"

#include "imgui.h"

namespace ui {

// Positions are relative to the control's top-left corner. The value maps
// along the track: min at its left edge, max at its right edge, and the
// thumb's centre (or the fill's end) sits on the value, as in the design.
struct SliderStyle
{
    ImVec2 track_pos{};
    ImVec2 track_size{};
    ff::Box track{};

    bool has_fill = false;
    ff::Box fill{};
    float fill_min = 0.f; // shortest fill drawn (keeps rounded ends round)

    bool has_thumb = false;
    ImVec2 thumb_size{};
    ff::Box thumb{};
    ff::Box thumb_hovered{};
    ff::Box thumb_active{};
    // A mark on the thumb (a grip, a dot) that moves with it: a shape placed from the
    // thumb's centre, or an image placed from its top-left corner.
    bool has_thumb_mark = false;
    ff::Box thumb_mark{};
    ImVec2 thumb_mark_pos{};
    ImVec2 thumb_mark_size{};
    Icon thumb_icon;

    // The number next to the slider, if the design shows one.
    Label value;
    const char* format = "%.0f"; // printf format for the value as a double, e.g. "%.0f%%"
    // The number rides under (or over) the thumb: `value` is placed for the thumb at
    // `value_at` (0..1 along the track) and moves with it.
    bool value_follows = false;
    float value_at = 0.f;

    float time = 0.08f;
    float hover_time = 0.12f;
};

// Returns true while the value changes.
bool slider(const char* label, float* v, float min, float max, const ImVec2& size, const SliderStyle& style);
bool slider(const char* label, int* v, int min, int max, const ImVec2& size, const SliderStyle& style);

} // namespace ui
