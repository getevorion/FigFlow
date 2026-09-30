// Figflow widgets: buttons. See button.h.
#include "ui/components/button.h"

#include "ff/anim.h"
#include "ff/draw.h"

namespace ui {

namespace {

// `selected`: -1 for a plain button, else 0/1.
bool button_ex(const char* label, const ImVec2& size, const ButtonStyle& s, const Icon& icon, int selected, ImGuiButtonFlags flags)
{
    ImGuiWindow* window = ImGui::GetCurrentWindow();
    if (window->SkipItems)
        return false;

    ImGuiContext& g = *GImGui;
    const ImGuiID id = window->GetID(label);
    const ImVec2 pos = window->DC.CursorPos;
    const ImRect bb(pos, pos + size);
    ImGui::ItemSize(size);
    if (!ImGui::ItemAdd(bb, id))
        return false;

    bool hovered, held;
    const bool pressed = ImGui::ButtonBehavior(bb, id, &hovered, &held, flags);
    if (hovered)
        ImGui::SetMouseCursor(ImGuiMouseCursor_Hand);

    // Blend between the design's looks, frame-rate independent.
    const float h = ff::anim::approach(id, "hover", hovered ? 1.f : 0.f, s.hover_time);
    const float p = ff::anim::approach(id, "press", held && hovered ? 1.f : 0.f, s.press_time);
    Look look = mix(mix(s.idle, s.hovered, h), s.pressed, p);
    if (selected >= 0)
        look = mix(look, s.selected, ff::anim::approach(id, "select", selected ? 1.f : 0.f, s.select_time));
    if (looks_disabled())
        look = s.disabled;

    ImGui::RenderNavCursor(bb, id);
    const ImRect area = s.surface_size.x > 0.f ? ImRect(bb.Min + s.surface_pos, bb.Min + s.surface_pos + s.surface_size) : bb;
    draw(window->DrawList, bb, look, s.label, label, ImGui::FindRenderedTextEnd(label), icon, &area, s.plate.image >= 0 ? &s.plate : nullptr);

    IMGUI_TEST_ENGINE_ITEM_INFO(id, label, g.LastItemData.StatusFlags | (selected > 0 ? ImGuiItemStatusFlags_Checked : 0));
    (void)g;
    return pressed;
}

} // namespace

bool button(const char* label, const ImVec2& size, const ButtonStyle& style, const Icon& icon, int flags)
{
    return button_ex(label, size, style, icon, -1, flags);
}

bool selectable(const char* label, bool selected, const ImVec2& size, const ButtonStyle& style, const Icon& icon)
{
    return button_ex(label, size, style, icon, selected ? 1 : 0, 0);
}

bool hotspot(const char* id, const ImVec2& size)
{
    const bool pressed = ImGui::InvisibleButton(id, size);
    if (ImGui::IsItemHovered())
        ImGui::SetMouseCursor(ImGuiMouseCursor_Hand);
    return pressed;
}

} // namespace ui
