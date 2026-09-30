// Figflow widgets: drop-down lists. See combo.h.
#include "ui/components/combo.h"

#include "ff/alpha.h"
#include "ff/anim.h"
#include "ff/draw.h"
#include "ff/text.h"

namespace ui {

bool combo(const char* label, int* current, const char* const items[], int count, const ImVec2& size, const ComboStyle& s)
{
    ImGuiWindow* window = ImGui::GetCurrentWindow();
    if (window->SkipItems)
        return false;

    const ImGuiID id = window->GetID(label);
    const ImVec2 pos = window->DC.CursorPos;
    const ImRect bb(pos, pos + size);
    ImGui::ItemSize(size);
    if (!ImGui::ItemAdd(bb, id))
        return false;

    bool hovered, held;
    const bool pressed = ImGui::ButtonBehavior(bb, id, &hovered, &held);
    const ImGuiID popup_id = ImHashStr("##ComboPopup", 0, id);
    bool open = ImGui::IsPopupOpen(popup_id, ImGuiPopupFlags_None);
    if (pressed && !open)
    {
        ImGui::OpenPopupEx(popup_id, ImGuiPopupFlags_None);
        open = true;
    }
    if (hovered)
        ImGui::SetMouseCursor(ImGuiMouseCursor_Hand);

    const float h = ff::anim::approach(id, "hover", hovered ? 1.f : 0.f, s.time);
    const float o = ff::anim::approach(id, "open", open ? 1.f : 0.f, s.time);
    const float dim = looks_disabled() ? GImGui->Style.DisabledAlpha : 1.f;
    ImDrawList* dl = window->DrawList;
    ImGui::RenderNavCursor(bb, id);
    ff::draw::box(dl, bb, ff::draw::mix(ff::draw::mix(s.idle, s.hovered, h), s.open, o), dim);
    draw_icon(dl, bb, s.chevron);
    const char* preview = *current >= 0 && *current < count ? items[*current] : "";
    draw_label(dl, bb, s.value, dim < 1.f && s.value.style ? ff::draw::fade(s.value.style->color, dim) : 0, preview);
    if (!open)
        return false;

    // The list, in a popup window: ImGui closes it on a click outside or Esc.
    const float list_h = s.padding * 2.f + s.item_height * (float)count;
    ImVec2 list_pos(bb.Min.x, bb.Max.y + s.gap);
    const ImGuiViewport* vp = ImGui::GetMainViewport();
    if (list_pos.y + list_h > vp->Pos.y + vp->Size.y && bb.Min.y - s.gap - list_h >= vp->Pos.y)
        list_pos.y = bb.Min.y - s.gap - list_h;
    ImGui::SetNextWindowPos(list_pos);
    ImGui::SetNextWindowSize(ImVec2(size.x, list_h));
    ImGui::PushStyleVar(ImGuiStyleVar_WindowPadding, ImVec2(0.f, 0.f));
    ImGui::PushStyleVar(ImGuiStyleVar_PopupBorderSize, 0.f);
    ImGui::PushStyleVar(ImGuiStyleVar_WindowMinSize, ImVec2(1.f, 1.f));
    const bool visible = ImGui::BeginPopupEx(popup_id, ImGuiWindowFlags_NoTitleBar | ImGuiWindowFlags_NoResize | ImGuiWindowFlags_NoMove |
                                                            ImGuiWindowFlags_NoSavedSettings | ImGuiWindowFlags_NoBackground | ImGuiWindowFlags_NoScrollbar);
    ImGui::PopStyleVar(3);
    if (!visible)
        return false;

    bool changed = false;
    {
        ff::Fade fade(o);
        ImDrawList* pdl = ImGui::GetWindowDrawList();
        ff::draw::box(pdl, ImRect(list_pos, list_pos + ImVec2(size.x, list_h)), s.panel);
        for (int i = 0; i < count; i++)
        {
            ImGui::PushID(i);
            const ImVec2 ip = list_pos + ImVec2(s.padding, s.padding + s.item_height * (float)i);
            const ImRect ib(ip, ip + ImVec2(size.x - s.padding * 2.f, s.item_height));
            const ImGuiID iid = ImGui::GetID("##item");
            ImGui::ItemSize(ib);
            if (ImGui::ItemAdd(ib, iid))
            {
                bool ih, iheld;
                if (ImGui::ButtonBehavior(ib, iid, &ih, &iheld))
                {
                    changed = *current != i;
                    *current = i;
                    ImGui::CloseCurrentPopup();
                }
                if (ih)
                    ImGui::SetMouseCursor(ImGuiMouseCursor_Hand);
                const bool selected = *current == i;
                if (selected)
                    ff::draw::box(pdl, ib, s.item_selected);
                ff::draw::box(pdl, ib, s.item_hovered, ff::anim::approach(iid, "hover", ih && !selected ? 1.f : 0.f, s.time));
                if (s.item)
                {
                    ff::TextStyle ts = *s.item;
                    if (selected && s.item_selected_text)
                        ts.color = s.item_selected_text;
                    // Centre the text's cap-to-descender span in the row.
                    ImFont* font = ts.font && *ts.font ? *ts.font : ImGui::GetFont();
                    const ImFontBaked* baked = font->GetFontBaked(ts.size);
                    const float baseline = (s.item_height + baked->Ascent + baked->Descent) * 0.5f;
                    ff::text_in(pdl, ImRect(ib.Min + ImVec2(s.item_indent, 0.f), ib.Max - ImVec2(s.item_indent, 0.f)), baseline, ff::Align::start, ts, items[i], nullptr, 1.f, true);
                }
            }
            ImGui::PopID();
        }
    }
    ImGui::EndPopup();
    if (changed)
        ImGui::MarkItemEdited(id);
    return changed;
}

} // namespace ui
