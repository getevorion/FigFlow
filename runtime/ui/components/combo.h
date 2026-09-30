// Figflow widgets: drop-down lists.
#pragma once

#include "ui/components/look.h"

#include "imgui.h"

namespace ui {

struct ComboStyle
{
    ff::Box idle{};
    ff::Box hovered{};
    ff::Box open{};
    Label value; // the selected item's text
    Icon chevron;

    // The list that opens under the control (above it when there's no room).
    ff::Box panel{};
    float gap = 4.f;
    float padding = 4.f;
    const ff::TextStyle* item = nullptr;
    float item_height = 32.f;
    float item_indent = 12.f;
    ff::Box item_hovered{};
    ff::Box item_selected{};
    ImU32 item_selected_text = 0; // 0 = the item style's colour
    float time = 0.12f;
};

// Returns true when another item was picked.
bool combo(const char* label, int* current, const char* const items[], int count, const ImVec2& size, const ComboStyle& style);

} // namespace ui
