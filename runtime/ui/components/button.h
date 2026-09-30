// Figflow widgets: buttons, icon buttons, nav items and hotspots.
//
// These follow Dear ImGui's own widget pattern (ItemSize, ItemAdd,
// ButtonBehavior), so they take part in layout, keyboard navigation, disabled
// blocks and ID scopes like any ImGui widget. Place one with
// ImGui::SetCursorScreenPos (ff::place) or let it flow in normal layout.
#pragma once

#include "ui/components/look.h"

#include "imgui.h"

namespace ui {

struct ButtonStyle
{
    Look idle;
    Look hovered;
    Look pressed;
    Look selected; // selectable(): the look of the selected item
    Look disabled; // inside ImGui::BeginDisabled()
    Label label;
    // Where the surface sits in the control, when it doesn't fill it (a sidebar item's
    // plate with its caption underneath). A zero size fills the control.
    ImVec2 surface_pos{};
    ImVec2 surface_size{};
    // A surface Dear ImGui can't draw natively (a hexagon, a custom shape) of one colour:
    // its image, baked white and tinted with each look's plate colour.
    Icon plate;
    float hover_time = 0.12f;
    float press_time = 0.06f;
    float select_time = 0.18f;
};

// A push button. Returns true when clicked. As in ImGui, text after "##" only
// makes the ID unique ("Play##main"), and "##id" alone draws no label.
// `icon` is the button's own icon (its placement and tint come from the design).
bool button(const char* label, const ImVec2& size, const ButtonStyle& style, const Icon& icon = {}, int flags = 0);

// A button that shows whether it's the selected one: nav items, tabs,
// segmented controls. Returns true when clicked.
bool selectable(const char* label, bool selected, const ImVec2& size, const ButtonStyle& style, const Icon& icon = {});

// An invisible clickable area over artwork the screen draws itself (a logo,
// a picture that links somewhere). Shows the hand cursor when hovered.
bool hotspot(const char* id, const ImVec2& size);

} // namespace ui
