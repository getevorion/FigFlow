// Figflow widgets: sliders. See slider.h.
#include "ui/components/slider.h"

#include "ff/anim.h"
#include "ff/draw.h"

namespace ui {

namespace {

// Behaviour and drawing on a 0..1 fraction; the typed overloads convert.
bool slider_ex(const char* label, float* frac, const char* value_text, const ImVec2& size, const SliderStyle& s)
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
    ImGui::ButtonBehavior(bb, id, &hovered, &held, ImGuiButtonFlags_PressedOnClick);
    if (hovered || held)
        ImGui::SetMouseCursor(ImGuiMouseCursor_Hand);

    const ImRect track(pos + s.track_pos, pos + s.track_pos + s.track_size);
    bool changed = false;
    if (held && track.GetWidth() > 0.f)
    {
        const float f = ImSaturate((g.IO.MousePos.x - track.Min.x) / track.GetWidth());
        if (f != *frac)
        {
            *frac = f;
            changed = true;
            ImGui::MarkItemEdited(id);
        }
    }
    // The drawn position follows the value closely, softening jumps from clicks.
    const float shown = ff::anim::approach(id, "value", *frac, held ? 0.03f : s.time);
    const float h = ff::anim::approach(id, "hover", hovered || held ? 1.f : 0.f, s.hover_time);
    const float dim = looks_disabled() ? g.Style.DisabledAlpha : 1.f;
    const float x = track.Min.x + track.GetWidth() * shown;

    ImDrawList* dl = window->DrawList;
    ImGui::RenderNavCursor(bb, id);
    ff::draw::box(dl, track, s.track, dim);
    if (s.has_fill)
        ff::draw::box(dl, ImRect(track.Min, ImVec2(ImMax(x, track.Min.x + s.fill_min), track.Max.y)), s.fill, dim);
    if (s.has_thumb)
    {
        const ImVec2 c(x, track.GetCenter().y);
        const ImRect thumb(c - s.thumb_size * 0.5f, c + s.thumb_size * 0.5f);
        const ff::Box look = held ? s.thumb_active : ff::draw::mix(s.thumb, s.thumb_hovered, h);
        ff::draw::box(dl, thumb, look, dim);
        if (s.has_thumb_mark)
            ff::draw::box(dl, ImRect(c + s.thumb_mark_pos, c + s.thumb_mark_pos + s.thumb_mark_size), s.thumb_mark, dim);
        draw_icon(dl, thumb, s.thumb_icon);
    }
    ImRect value_bb = bb;
    if (s.value_follows)
        value_bb.Translate(ImVec2(x - (track.Min.x + track.GetWidth() * s.value_at), 0.f));
    draw_label(dl, value_bb, s.value, dim < 1.f && s.value.style ? ff::draw::fade(s.value.style->color, dim) : 0, value_text);

    IMGUI_TEST_ENGINE_ITEM_INFO(id, label, g.LastItemData.StatusFlags);
    return changed;
}

} // namespace

bool slider(const char* label, float* v, float min, float max, const ImVec2& size, const SliderStyle& style)
{
    const float range = max - min;
    float frac = range != 0.f ? ImSaturate((*v - min) / range) : 0.f;
    char text[64];
    ImFormatString(text, IM_COUNTOF(text), style.format ? style.format : "%.0f", (double)*v);
    if (!slider_ex(label, &frac, text, size, style))
        return false;
    *v = min + frac * range;
    return true;
}

bool slider(const char* label, int* v, int min, int max, const ImVec2& size, const SliderStyle& style)
{
    const float range = (float)(max - min);
    float frac = range != 0.f ? ImSaturate((float)(*v - min) / range) : 0.f;
    char text[64];
    ImFormatString(text, IM_COUNTOF(text), style.format ? style.format : "%.0f", (double)*v);
    if (!slider_ex(label, &frac, text, size, style))
        return false;
    const int next = min + (int)ImFloor(frac * range + 0.5f);
    if (next == *v)
        return false;
    *v = next;
    return true;
}

} // namespace ui
