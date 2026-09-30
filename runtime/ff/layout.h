// Figflow runtime: placing design frames inside Dear ImGui's layout.
//
// A design frame becomes a group of fixed size at the current cursor. Its
// children are placed at their Figma positions relative to the frame, and the
// frame reports exactly its design size to the parent's layout, so frames can
// sit in normal ImGui flow (after a SameLine, in a child window, in a table).
#pragma once

#include "imgui.h"
#include "imgui_internal.h"

namespace ff {

struct Frame
{
    ImVec2 origin; // screen position of the frame's top-left corner
    ImVec2 size;

    ImRect rect() const { return ImRect(origin, origin + size); }
    ImRect rect(ImVec2 local_pos, ImVec2 local_size) const { return ImRect(origin + local_pos, origin + local_pos + local_size); }
    ImVec2 at(ImVec2 local) const { return origin + local; }
};

// Starts a frame at the current cursor. Reserves its full size as one item
// (so the parent sizes and scrolls correctly) and returns its origin.
inline Frame begin_frame(const char* id, ImVec2 size)
{
    ImGui::PushID(id);
    ImGui::BeginGroup();
    Frame f{ ImGui::GetCursorScreenPos(), size };
    ImGui::Dummy(size);
    ImGui::SetCursorScreenPos(f.origin); // moving back never extends bounds
    return f;
}

inline void end_frame()
{
    ImGui::EndGroup();
    ImGui::PopID();
}

// Moves the cursor to a position local to the frame; the next item goes there.
inline void place(const Frame& f, ImVec2 local) { ImGui::SetCursorScreenPos(f.origin + local); }

// Clips drawing and hit-testing to a frame with "Clip content" on.
inline void push_clip(const Frame& f) { ImGui::PushClipRect(f.origin, f.origin + f.size, true); }
inline void pop_clip() { ImGui::PopClipRect(); }

// An auto-layout stack: items flow with the design's gap between them.
// Vertical stacks use ItemSpacing.y; horizontal ones call SameLine(0, gap).
struct Stack
{
    bool horizontal = false;
    float gap = 0.f;
    int count = 0;
};

inline Stack begin_stack(const Frame& f, ImVec2 local_start, bool horizontal, float gap)
{
    place(f, local_start);
    ImGui::BeginGroup();
    ImGui::PushStyleVar(ImGuiStyleVar_ItemSpacing, horizontal ? ImVec2(gap, 0.f) : ImVec2(0.f, gap));
    return Stack{ horizontal, gap, 0 };
}

// Call before each item of a stack.
inline void next(Stack& s)
{
    if (s.horizontal && s.count > 0)
        ImGui::SameLine(0.f, s.gap);
    s.count++;
}

inline void end_stack(Stack&)
{
    ImGui::PopStyleVar();
    ImGui::EndGroup();
}

} // namespace ff
