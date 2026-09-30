// Figflow widgets: single-line text fields.
//
// Editing is Dear ImGui's InputText (selection, clipboard, undo, IME), drawn
// with the design's font, colours and baseline over the design's surface.
#pragma once

#include "ui/components/look.h"

#include "imgui.h"

#include <cstddef>

namespace ui {

struct TextFieldStyle
{
    ff::Box idle{};
    ff::Box hovered{};
    ff::Box focused{};
    const ff::TextStyle* text = nullptr;        // what's typed
    const ff::TextStyle* placeholder = nullptr; // the hint shown while empty
    float text_left = 0.f;  // where text starts, from the control's left edge
    float text_right = 0.f; // where it ends, from the right edge (room for an icon)
    float baseline = 0.f;   // from the control's top edge
    ImU32 caret = 0;        // 0 = the text colour
    ImU32 selection = 0;    // 0 = the text colour at 30%
    Icon icon;
    float time = 0.12f;
};

// Returns true when the text changed (or, with ImGuiInputTextFlags_EnterReturnsTrue,
// when Enter is pressed). `label` is an ID: its visible part isn't drawn.
bool text_field(const char* label, char* buf, size_t buf_size, const ImVec2& size, const TextFieldStyle& style, const char* placeholder = nullptr, ImGuiInputTextFlags flags = 0);

} // namespace ui
