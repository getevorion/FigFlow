// Figflow widgets: checkboxes and radio buttons.
#pragma once

#include "ui/components/look.h"

#include "imgui.h"

namespace ui {

// Positions are relative to the control's top-left corner; the control's
// size covers the box and its label, and all of it is clickable.
struct CheckboxStyle
{
    ImVec2 box_pos{};
    ImVec2 box_size{};
    ff::Box off{};
    ff::Box on{};
    ff::Box off_hovered{};
    ff::Box on_hovered{};

    // The design's check mark (image -1: a check, or a dot for radios, drawn in mark_color).
    Icon mark;
    ImU32 mark_color = IM_COL32_WHITE;
    bool round = false; // radio: a dot instead of a check
    float dot = 0.f;    // the dot's radius as a share of the box's side (0: 0.22)

    Label label;
    // The label's colour checked and unchecked, when the design shows both (0: the style's own).
    ImU32 label_on = 0;
    ImU32 label_off = 0;
    float time = 0.12f;
    float hover_time = 0.12f;
};

// Returns true when clicked (and *v changed).
bool checkbox(const char* label, bool* v, const ImVec2& size, const CheckboxStyle& style);

// Returns true when clicked; the caller selects this option then.
bool radio(const char* label, bool active, const ImVec2& size, const CheckboxStyle& style);

} // namespace ui
