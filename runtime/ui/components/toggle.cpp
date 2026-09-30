// Figflow widgets: on/off switches. See toggle.h.
#include "ui/components/toggle.h"

#include "ff/anim.h"
#include "ff/draw.h"

namespace ui {

bool toggle(const char* label, bool* v, const ImVec2& size, const ToggleStyle& s)
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
    bool pressed = ImGui::ButtonBehavior(bb, id, &hovered, &held);
    if (pressed)
    {
        *v = !*v;
        ImGui::MarkItemEdited(id);
    }
    if (hovered)
        ImGui::SetMouseCursor(ImGuiMouseCursor_Hand);

    const float t = ff::anim::approach(id, "on", *v ? 1.f : 0.f, s.time);
    const float h = ff::anim::approach(id, "hover", hovered ? 1.f : 0.f, s.hover_time);
    const float e = ff::anim::smooth(t);
    const float dim = looks_disabled() ? g.Style.DisabledAlpha : 1.f;

    ImDrawList* dl = window->DrawList;
    ImGui::RenderNavCursor(bb, id);
    const ff::Box track = ff::draw::mix(ff::draw::mix(s.track_off, s.track_on, t), ff::draw::mix(s.track_off_hovered, s.track_on_hovered, t), h);
    ff::draw::box(dl, ImRect(pos + s.track_pos, pos + s.track_pos + s.track_size), track, dim);
    const ImVec2 knob = pos + ImLerp(s.knob_off, s.knob_on, e);
    if (s.knob_image >= 0)
        ff::draw::image(dl, ImRect(knob, knob + s.knob_size), s.knob_image, ff::draw::mix(s.knob_tint_off, s.knob_tint_on, t), dim);
    else
        ff::draw::box(dl, ImRect(knob, knob + s.knob_size), ff::draw::mix(s.knob_look_off, s.knob_look_on, t), dim);

    const ImU32 col = s.label_off && s.label_on ? ff::draw::mix(s.label_off, s.label_on, t) : (*v ? s.label_on : s.label_off);
    draw_label(dl, bb, s.label, col ? ff::draw::fade(col, dim) : (dim < 1.f && s.label.style ? ff::draw::fade(s.label.style->color, dim) : 0), label, ImGui::FindRenderedTextEnd(label));

    IMGUI_TEST_ENGINE_ITEM_INFO(id, label, g.LastItemData.StatusFlags | ImGuiItemStatusFlags_Checkable | (*v ? ImGuiItemStatusFlags_Checked : 0));
    return pressed;
}

} // namespace ui
