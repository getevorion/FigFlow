// Figflow widgets: on/off switches.
#pragma once

#include "ui/components/look.h"

#include "imgui.h"

namespace ui {

// Positions are relative to the control's top-left corner. The control's
// size covers the track and its label, and all of it toggles when clicked.
struct ToggleStyle
{
    ImVec2 track_pos{};
    ImVec2 track_size{};
    ff::Box track_off{};
    ff::Box track_on{};
    ff::Box track_off_hovered{};
    ff::Box track_on_hovered{};

    ImVec2 knob_size{};
    ImVec2 knob_off{}; // knob top-left when off
    ImVec2 knob_on{};  // and when on
    ff::Box knob_look_off{};
    ff::Box knob_look_on{};
    // A knob drawn as artwork (a vector circle, a knob with an icon) instead of a box:
    // the image, baked white, tinted per state.
    int knob_image = -1;
    ImU32 knob_tint_off = IM_COL32_WHITE;
    ImU32 knob_tint_on = IM_COL32_WHITE;

    Label label;
    ImU32 label_off = 0; // 0 = the label style's colour
    ImU32 label_on = 0;

    float time = 0.16f;
    float hover_time = 0.12f;
};

// Returns true when clicked (and *v changed).
bool toggle(const char* label, bool* v, const ImVec2& size, const ToggleStyle& style);

} // namespace ui
