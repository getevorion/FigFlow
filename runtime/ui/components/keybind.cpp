// Figflow widgets: key binding buttons. See keybind.h.
#include "ui/components/keybind.h"

#include "ff/anim.h"
#include "ff/draw.h"

#include <cctype>
#include <cstring>

namespace ui {

bool keybind(const char* label, ImGuiKey* key, const ImVec2& size, const KeybindStyle& s)
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
    const bool pressed = ImGui::ButtonBehavior(bb, id, &hovered, &held);
    if (hovered)
        ImGui::SetMouseCursor(ImGuiMouseCursor_Hand);

    ImGuiStorage* storage = ImGui::GetStateStorage();
    const ImGuiID waiting_key = ff::anim::key(id, "waiting");
    bool waiting = storage->GetBool(waiting_key, false);
    bool changed = false;
    const auto bind = [&](ImGuiKey k) {
        waiting = false;
        if (*key != k)
        {
            *key = k;
            changed = true;
            ImGui::MarkItemEdited(id);
        }
    };
    if (!waiting)
        waiting = pressed; // listen from the next frame: this click isn't the binding
    else if (ImGui::IsKeyPressed(ImGuiKey_Escape, false))
        waiting = false;
    else if (ImGui::IsKeyPressed(ImGuiKey_Backspace, false) || ImGui::IsKeyPressed(ImGuiKey_Delete, false))
        bind(ImGuiKey_None);
    else if (ImGui::IsMouseClicked(ImGuiMouseButton_Left) && !hovered)
        waiting = false; // clicked somewhere else
    else
    {
        for (int k = ImGuiKey_NamedKey_BEGIN; k < ImGuiKey_NamedKey_END; k++)
        {
            const ImGuiKey kk = (ImGuiKey)k;
            if (kk == ImGuiKey_MouseWheelX || kk == ImGuiKey_MouseWheelY || (kk >= ImGuiKey_ReservedForModCtrl && kk <= ImGuiKey_ReservedForModSuper))
                continue;
            if (ImGui::IsKeyPressed(kk, false))
            {
                bind(kk);
                break;
            }
        }
    }
    storage->SetBool(waiting_key, waiting);

    const float h = ff::anim::approach(id, "hover", hovered ? 1.f : 0.f, s.time);
    const float w = ff::anim::approach(id, "wait", waiting ? 1.f : 0.f, s.time);
    const float dim = looks_disabled() ? g.Style.DisabledAlpha : 1.f;
    ImDrawList* dl = window->DrawList;
    ImGui::RenderNavCursor(bb, id);
    ff::draw::box(dl, bb, ff::draw::mix(ff::draw::mix(s.idle, s.hovered, h), s.waiting, w), dim);
    const char* text = waiting ? s.waiting_text : *key == ImGuiKey_None ? s.none_text : *key == s.design_key && s.design_text ? s.design_text : key_name(*key);
    ImU32 col = waiting && s.waiting_color ? s.waiting_color : 0;
    if (dim < 1.f && s.text.style)
        col = ff::draw::fade(col ? col : s.text.style->color, dim);
    draw_label(dl, bb, s.text, col, text);

    IMGUI_TEST_ENGINE_ITEM_INFO(id, label, g.LastItemData.StatusFlags);
    return changed;
}

const char* key_name(ImGuiKey key)
{
    switch (key)
    {
    case ImGuiKey_None: return "NONE";
    case ImGuiKey_MouseLeft: return "LMB";
    case ImGuiKey_MouseRight: return "RMB";
    case ImGuiKey_MouseMiddle: return "MMB";
    case ImGuiKey_MouseX1: return "MOUSE4";
    case ImGuiKey_MouseX2: return "MOUSE5";
    case ImGuiKey_LeftShift: return "LSHIFT";
    case ImGuiKey_RightShift: return "RSHIFT";
    case ImGuiKey_LeftCtrl: return "LCTRL";
    case ImGuiKey_RightCtrl: return "RCTRL";
    case ImGuiKey_LeftAlt: return "LALT";
    case ImGuiKey_RightAlt: return "RALT";
    case ImGuiKey_LeftSuper: return "LWIN";
    case ImGuiKey_RightSuper: return "RWIN";
    case ImGuiKey_Escape: return "ESC";
    case ImGuiKey_PageUp: return "PGUP";
    case ImGuiKey_PageDown: return "PGDN";
    case ImGuiKey_CapsLock: return "CAPS";
    default: break;
    }
    // Everything else: ImGui's name in capitals ("Insert" -> "INSERT", "Keypad1" -> "NUM1").
    static char buf[32];
    const char* name = ImGui::GetKeyName(key);
    const char* rest = std::strncmp(name, "Keypad", 6) == 0 ? name + 6 : name;
    int n = 0;
    if (rest != name)
        for (const char* p = "NUM"; *p; p++)
            buf[n++] = *p;
    for (const char* p = rest; *p && n < (int)sizeof(buf) - 1; p++)
        if (*p != ' ')
            buf[n++] = (char)std::toupper((unsigned char)*p);
    buf[n] = 0;
    return buf;
}

} // namespace ui
