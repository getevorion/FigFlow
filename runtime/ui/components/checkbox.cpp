// Figflow widgets: checkboxes and radio buttons. See checkbox.h.
#include "ui/components/checkbox.h"

#include "ff/alpha.h"
#include "ff/anim.h"
#include "ff/draw.h"

namespace ui {

namespace {

// `toggles`: a checkbox shows its new state at once; a radio waits for the caller.
bool check_ex(const char* label, bool checked, bool toggles, bool* pressed_out, const ImVec2& size, const CheckboxStyle& s)
{
    ImGuiWindow* window = ImGui::GetCurrentWindow();
    *pressed_out = false;
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
    const bool pressed = ImGui::ButtonBehavior(bb, id, &hovered, &held);
    *pressed_out = pressed;
    if (hovered)
        ImGui::SetMouseCursor(ImGuiMouseCursor_Hand);
    const bool on = toggles && pressed ? !checked : checked;

    const float t = ff::anim::approach(id, "on", on ? 1.f : 0.f, s.time);
    const float h = ff::anim::approach(id, "hover", hovered ? 1.f : 0.f, s.hover_time);
    const float dim = looks_disabled() ? g.Style.DisabledAlpha : 1.f;

    ImDrawList* dl = window->DrawList;
    ImGui::RenderNavCursor(bb, id);
    const ImRect box(pos + s.box_pos, pos + s.box_pos + s.box_size);
    const ff::Box look = ff::draw::mix(ff::draw::mix(s.off, s.on, t), ff::draw::mix(s.off_hovered, s.on_hovered, t), h);
    ff::draw::box(dl, box, look, dim);

    // The mark grows in as it fades in.
    if (t > 0.001f)
    {
        const float k = 0.6f + 0.4f * ff::anim::smooth(t);
        const float a = t * dim;
        if (s.mark.image >= 0)
        {
            const ImVec2 c = bb.Min + s.mark.pos + s.mark.size * 0.5f;
            const ImVec2 half = s.mark.size * 0.5f * k;
            ff::draw::image(dl, ImRect(c - half, c + half), s.mark.image, s.mark.tint, a);
        }
        else
        {
            const ImU32 col = ff::draw::fade(s.mark_color, a * ff::alpha());
            const float side = ImMin(box.GetWidth(), box.GetHeight());
            if (s.round)
                dl->AddCircleFilled(box.GetCenter(), side * (s.dot > 0.f ? s.dot : 0.22f) * k, col);
            else
            {
                const float pad = ImMax(1.f, side / 5.f);
                const float sz = (side - pad * 2.f) * k;
                ImGui::RenderCheckMark(dl, box.GetCenter() - ImVec2(sz, sz) * 0.5f, col, sz);
            }
        }
    }

    ImU32 label_col = s.label_on && s.label_off ? ff::draw::mix(s.label_off, s.label_on, t) : 0;
    if (dim < 1.f && s.label.style)
        label_col = ff::draw::fade(label_col ? label_col : s.label.style->color, dim);
    draw_label(dl, bb, s.label, label_col, label, ImGui::FindRenderedTextEnd(label));
    IMGUI_TEST_ENGINE_ITEM_INFO(id, label, g.LastItemData.StatusFlags | ImGuiItemStatusFlags_Checkable | (on ? ImGuiItemStatusFlags_Checked : 0));
    return true;
}

} // namespace

bool checkbox(const char* label, bool* v, const ImVec2& size, const CheckboxStyle& style)
{
    bool pressed = false;
    check_ex(label, *v, true, &pressed, size, style);
    if (pressed)
    {
        *v = !*v;
        ImGui::MarkItemEdited(ImGui::GetItemID());
    }
    return pressed;
}

bool radio(const char* label, bool active, const ImVec2& size, const CheckboxStyle& style)
{
    bool pressed = false;
    check_ex(label, active, false, &pressed, size, style);
    if (pressed && !active)
        ImGui::MarkItemEdited(ImGui::GetItemID());
    return pressed;
}

} // namespace ui
