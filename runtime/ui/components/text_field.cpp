// Figflow widgets: single-line text fields. See text_field.h.
#include "ui/components/text_field.h"

#include "ff/alpha.h"
#include "ff/anim.h"
#include "ff/draw.h"
#include "ff/text.h"

namespace ui {

bool text_field(const char* label, char* buf, size_t buf_size, const ImVec2& size, const TextFieldStyle& s, const char* placeholder, ImGuiInputTextFlags flags)
{
    ImGuiWindow* window = ImGui::GetCurrentWindow();
    if (window->SkipItems || !s.text)
        return false;

    ImGuiContext& g = *GImGui;
    ImGui::PushID(label);
    const ImGuiID id = window->GetID("##text"); // the ID InputTextEx computes below
    const ImVec2 pos = window->DC.CursorPos;
    const ImRect bb(pos, pos + size);
    ImDrawList* dl = window->DrawList;

    // The surface goes under the text, so it's drawn before InputText runs:
    // hover comes from the previous frame (stored below), focus from ActiveId.
    ImGuiStorage* storage = ImGui::GetStateStorage();
    const ImGuiID hover_key = ff::anim::key(id, "hovered");
    const float h = ff::anim::approach(id, "hover", storage->GetBool(hover_key, false) ? 1.f : 0.f, s.time);
    const float f = ff::anim::approach(id, "focus", g.ActiveId == id ? 1.f : 0.f, s.time);
    const float dim = looks_disabled() ? g.Style.DisabledAlpha : 1.f;
    ff::draw::box(dl, bb, ff::draw::mix(ff::draw::mix(s.idle, s.hovered, h), s.focused, f), dim);
    draw_icon(dl, bb, s.icon);
    if (buf[0] == 0 && placeholder && placeholder[0] && s.placeholder)
        ff::text(dl, ImVec2(pos.x + s.text_left, pos.y + s.baseline), *s.placeholder, placeholder, nullptr, dim);

    // InputText in the design's font, on the design's baseline: ImGui puts the
    // top of the line at FramePadding.y, and the baseline round(Ascent) below it.
    const ff::TextStyle& ts = *s.text;
    ImGui::PushFont(ts.font && *ts.font ? *ts.font : nullptr, ts.size);
    const float ascent = IM_ROUND(ImGui::GetFontBaked()->Ascent);
    const float alpha = dim * ff::alpha();
    ImGui::PushStyleColor(ImGuiCol_Text, ff::draw::fade(ts.color, alpha));
    ImGui::PushStyleColor(ImGuiCol_FrameBg, IM_COL32(0, 0, 0, 0));
    ImGui::PushStyleColor(ImGuiCol_FrameBgHovered, IM_COL32(0, 0, 0, 0));
    ImGui::PushStyleColor(ImGuiCol_FrameBgActive, IM_COL32(0, 0, 0, 0));
    ImGui::PushStyleColor(ImGuiCol_InputTextCursor, ff::draw::fade(s.caret ? s.caret : ts.color, alpha));
    ImGui::PushStyleColor(ImGuiCol_TextSelectedBg, s.selection ? ff::draw::fade(s.selection, alpha) : ff::draw::fade(ts.color, 0.3f * alpha));
    ImGui::PushStyleVar(ImGuiStyleVar_FramePadding, ImVec2(s.text_left, ImMax(0.f, s.baseline - ascent)));
    ImGui::PushStyleVar(ImGuiStyleVar_FrameBorderSize, 0.f);
    ImGui::PushStyleVar(ImGuiStyleVar_FrameRounding, 0.f);
    const bool changed = ImGui::InputTextEx("##text", nullptr, buf, (int)buf_size, ImVec2(ImMax(1.f, size.x - s.text_right), size.y), flags);
    storage->SetBool(hover_key, ImGui::IsItemHovered());
    ImGui::PopStyleVar(3);
    ImGui::PopStyleColor(6);
    ImGui::PopFont();
    ImGui::PopID();
    return changed;
}

} // namespace ui
