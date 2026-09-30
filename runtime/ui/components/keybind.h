// Figflow widgets: key binding buttons.
#pragma once

#include "ui/components/look.h"

#include "imgui.h"

namespace ui {

struct KeybindStyle
{
    ff::Box idle{};
    ff::Box hovered{};
    ff::Box waiting{};
    Label text;
    ImU32 waiting_color = 0; // text colour while waiting for a key, 0 = the label style's
    const char* waiting_text = "...";
    const char* none_text = "NONE";
    // The key the design shows, in the design's own words ("Mouse 1"): shown that way while
    // it's the bound key; any other key shows its short name.
    ImGuiKey design_key = ImGuiKey_None;
    const char* design_text = nullptr;
    float time = 0.12f;
};

// Click, then press a key or mouse button to bind it. Esc cancels,
// Backspace / Delete clear the binding. Returns true when *key changed.
bool keybind(const char* label, ImGuiKey* key, const ImVec2& size, const KeybindStyle& style);

// Short upper-case key names for display: "F1", "LSHIFT", "MOUSE4", "NUM1".
const char* key_name(ImGuiKey key);

} // namespace ui
