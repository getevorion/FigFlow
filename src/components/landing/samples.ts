/**
 * Code shown on the landing page: real output, generated from the "Form Log In" frame of Figma's
 * Simple Design System (CC BY 4.0) with scripts/generate.ts. Regenerate it when the output changes.
 */
export const samples: Array<{ path: string; note: string; code: string }> = [
  {
    path: "src/ui/components/button.cpp",
    note: "One file per widget kind, written like Dear ImGui's own widgets: ItemAdd, ButtonBehavior, and the design's looks blended by state.",
    code: `#include "ui/components/button.h"

#include "ff/anim.h"
#include "ff/draw.h"

namespace ui {

namespace {

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

}

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

}`,
  },
  {
    path: "src/ui/screens/form_log_in.cpp",
    note: "Each frame is a screen function, and each of its layer groups a function. Controls read and write plain state.",
    code: `#include "ui/screens/form_log_in.h"

#include "app/actions.h"
#include "app/state.h"
#include "ff/draw.h"
#include "ff/layout.h"
#include "ff/text.h"
#include "ui/components/button.h"
#include "ui/components/text_field.h"
#include "ui/theme/styles.h"

namespace screens {

namespace {

void input_field(ImDrawList* dl, const ff::Frame& f)
{
    app::State& s = app::state();
    ff::text_in(dl, f.rect({ 24.f, 24.f }, { 272.f, 22.f }), 16.818f, ff::Align::start, styles::body_base, "Email");
    ff::place(f, { 24.f, 54.f });
    ui::text_field("##email", s.email, sizeof(s.email), { 272.f, 40.f }, styles::input_field, "Value");
}

void input_field_2(ImDrawList* dl, const ff::Frame& f)
{
    app::State& s = app::state();
    ff::text_in(dl, f.rect({ 24.f, 118.f }, { 272.f, 22.f }), 16.818f, ff::Align::start, styles::body_base, "Password");
    ff::place(f, { 24.f, 148.f });
    ui::text_field("##password", s.password, sizeof(s.password), { 272.f, 40.f }, styles::input_field, "Value",
                   ImGuiInputTextFlags_Password);
}

void button_group(ImDrawList* dl, const ff::Frame& f)
{
    ff::place(f, { 24.f, 212.f });
    if (ui::button("Sign In##sign_in", { 272.f, 40.f }, styles::sign_in))
        actions::sign_in();
}

void text_link(ImDrawList* dl, const ff::Frame& f)
{
    ff::text_in(dl, f.rect({ 24.f, 276.f }, { 136.f, 22.f }), 16.818f, ff::Align::start, styles::body_base,
                "Forgot password?");
}

}

void form_log_in()
{
    const ff::Frame f = ff::begin_frame("form_log_in", form_log_in_size);
    ImDrawList* dl = ImGui::GetWindowDrawList();
    ff::draw::box(dl, f.rect({ 0.f, 0.f }, { 320.f, 322.f }), styles::form_log_in);
    input_field(dl, f);
    input_field_2(dl, f);
    button_group(dl, f);
    text_link(dl, f);
    ff::end_frame();
}

}`,
  },
  {
    path: "src/app/state.h",
    note: "The app's state is one plain struct, its fields named after the design's labels.",
    code: `#pragma once

#include "imgui.h"

namespace app {

struct State
{
    char email[256] = "";
    char password[256] = "";
};

State& state();

}`,
  },
  {
    path: "src/ui/theme/palette.h",
    note: "Colors named after your Figma variables. Change one and every use follows.",
    code: `#pragma once

#include "imgui.h"

namespace palette {

inline constexpr ImU32 background_brand_default = IM_COL32(44, 44, 44, 255);
inline constexpr ImU32 background_default_default = IM_COL32(255, 255, 255, 255);
inline constexpr ImU32 border_default_default = IM_COL32(217, 217, 217, 255);
inline constexpr ImU32 text_default_default = IM_COL32(30, 30, 30, 255);
inline constexpr ImU32 text_default_tertiary = IM_COL32(179, 179, 179, 255);
inline constexpr ImU32 text_brand_on_brand = IM_COL32(245, 245, 245, 255);
inline constexpr ImU32 fill_f7f7f7 = IM_COL32(247, 247, 247, 255);
inline constexpr ImU32 stroke_1f1f1f = IM_COL32(31, 31, 31, 255);
inline constexpr ImU32 text_474747 = IM_COL32(71, 71, 71, 255);
inline constexpr ImU32 selection_1f1f1f_a35 = IM_COL32(31, 31, 31, 89);
inline constexpr ImU32 fill_414141 = IM_COL32(65, 65, 65, 255);
inline constexpr ImU32 fill_282828 = IM_COL32(40, 40, 40, 255);

}`,
  },
  {
    path: "src/main.cpp",
    note: "The window and the DirectX 11 device live in ff/host. Your app is app::init and app::frame.",
    code: `#include <windows.h>

#include "app/app.h"
#include "ff/host.h"
#include "ui/screens/form_log_in.h"

int WINAPI wWinMain(HINSTANCE, HINSTANCE, PWSTR, int)
{
    ff::HostConfig config;
    config.title = L"FormLogIn";
    config.size = screens::form_log_in_size;
    config.style = ff::HostStyle::loader;
    if (!ff::host_create(config))
        return 1;

    app::init();
    while (ff::host_begin_frame())
    {
        app::frame();
        ff::host_end_frame();
    }
    ff::host_destroy();
    return 0;
}`,
  },
];
