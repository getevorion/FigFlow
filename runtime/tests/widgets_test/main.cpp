// Interaction test for the Figflow widgets, router, popups and toasts.
// Run headless with a script, e.g.
//   FIGFLOW_CAPTURE=1 FIGFLOW_SCRIPT="wait 10; shot a.png; click 60 70; wait 30; shot b.png"
#include "ff/alpha.h"
#include "ff/draw.h"
#include "ff/flow.h"
#include "ff/host.h"
#include "ff/layout.h"
#include "ff/text.h"
#include "ui/components/button.h"
#include "ui/components/checkbox.h"
#include "ui/components/combo.h"
#include "ui/components/keybind.h"
#include "ui/components/slider.h"
#include "ui/components/text_field.h"
#include "ui/components/toggle.h"

#include <windows.h>

#include <cstdio>
#include <vector>

static std::vector<unsigned char> read_file(const char* path)
{
    std::vector<unsigned char> out;
    FILE* f = nullptr;
    if (fopen_s(&f, path, "rb") != 0 || !f)
        return out;
    fseek(f, 0, SEEK_END);
    out.resize((size_t)ftell(f));
    fseek(f, 0, SEEK_SET);
    fread(out.data(), 1, out.size(), f);
    fclose(f);
    return out;
}

namespace {

ImFont* g_font = nullptr;
constexpr ImU32 lime = IM_COL32(190, 242, 100, 255);
constexpr ImU32 ink = IM_COL32(236, 240, 230, 255);
constexpr ImU32 muted = IM_COL32(140, 150, 130, 255);
constexpr ImU32 panel = IM_COL32(24, 29, 19, 255);
constexpr ImU32 raised = IM_COL32(36, 43, 29, 255);

const ff::TextStyle text_ink{ .font = &g_font, .size = 15.f, .color = ink };
const ff::TextStyle text_dark{ .font = &g_font, .size = 15.f, .color = IM_COL32(16, 20, 10, 255) };
const ff::TextStyle text_muted{ .font = &g_font, .size = 15.f, .color = muted };

ui::ButtonStyle primary_button()
{
    ui::ButtonStyle s;
    s.idle.surface = { .fills = { ff::solid(lime) }, .radii = { 10.f } };
    s.hovered.surface = { .fills = { ff::solid(IM_COL32(206, 250, 130, 255)) }, .radii = { 10.f } };
    s.pressed.surface = { .fills = { ff::solid(IM_COL32(160, 212, 80, 255)) }, .radii = { 10.f } };
    s.disabled = s.idle;
    s.disabled.surface.opacity = 0.45f;
    s.selected = s.idle;
    s.label = { .style = &text_dark, .pos = { 0.f, 0.f }, .size = { 160.f, 40.f }, .baseline = 25.f, .align = ff::Align::center };
    return s;
}

ui::ButtonStyle nav_item()
{
    ui::ButtonStyle s;
    s.idle.surface = { .radii = { 8.f } };
    s.idle.label = muted;
    s.hovered.surface = { .fills = { ff::solid(IM_COL32(255, 255, 255, 12)) }, .radii = { 8.f } };
    s.hovered.label = ink;
    s.pressed = s.hovered;
    s.selected.surface = { .fills = { ff::solid(raised) }, .radii = { 8.f }, .stroke = { .color = IM_COL32(190, 242, 100, 90), .weight = 1.f } };
    s.selected.label = lime;
    s.disabled = s.idle;
    s.label = { .style = &text_ink, .pos = { 14.f, 0.f }, .size = { 120.f, 36.f }, .baseline = 23.f };
    return s;
}

ui::ToggleStyle toggle_style()
{
    ui::ToggleStyle s;
    s.track_pos = { 0.f, 0.f };
    s.track_size = { 40.f, 22.f };
    s.track_off = { .fills = { ff::solid(IM_COL32(60, 68, 52, 255)) }, .radii = { 11.f } };
    s.track_on = { .fills = { ff::solid(lime) }, .radii = { 11.f } };
    s.track_off_hovered = { .fills = { ff::solid(IM_COL32(72, 80, 62, 255)) }, .radii = { 11.f } };
    s.track_on_hovered = { .fills = { ff::solid(IM_COL32(206, 250, 130, 255)) }, .radii = { 11.f } };
    s.knob_size = { 16.f, 16.f };
    s.knob_off = { 3.f, 3.f };
    s.knob_on = { 21.f, 3.f };
    s.knob_look_off = { .fills = { ff::solid(ink) }, .radii = { 8.f } };
    s.knob_look_on = { .fills = { ff::solid(IM_COL32(16, 20, 10, 255)) }, .radii = { 8.f } };
    s.label = { .style = &text_ink, .pos = { 52.f, 0.f }, .size = { 150.f, 22.f }, .baseline = 16.f };
    return s;
}

ui::CheckboxStyle checkbox_style(bool round)
{
    ui::CheckboxStyle s;
    s.box_size = { 20.f, 20.f };
    const float r = round ? 10.f : 5.f;
    s.off = { .radii = { r }, .stroke = { .color = IM_COL32(120, 130, 110, 255), .weight = 1.5f } };
    s.on = { .fills = { ff::solid(lime) }, .radii = { r } };
    s.off_hovered = { .fills = { ff::solid(IM_COL32(255, 255, 255, 14)) }, .radii = { r }, .stroke = { .color = IM_COL32(160, 170, 150, 255), .weight = 1.5f } };
    s.on_hovered = { .fills = { ff::solid(IM_COL32(206, 250, 130, 255)) }, .radii = { r } };
    s.mark_color = IM_COL32(16, 20, 10, 255);
    s.round = round;
    s.label = { .style = &text_ink, .pos = { 30.f, 0.f }, .size = { 150.f, 20.f }, .baseline = 15.f };
    return s;
}

ui::SliderStyle slider_style()
{
    ui::SliderStyle s;
    s.track_pos = { 0.f, 28.f };
    s.track_size = { 220.f, 6.f };
    s.track = { .fills = { ff::solid(IM_COL32(60, 68, 52, 255)) }, .radii = { 3.f } };
    s.has_fill = true;
    s.fill = { .fills = { ff::solid(lime) }, .radii = { 3.f } };
    s.has_thumb = true;
    s.thumb_size = { 16.f, 16.f };
    s.thumb = { .fills = { ff::solid(ink) }, .radii = { 8.f }, .shadows = { { .color = IM_COL32(0, 0, 0, 120), .offset = { 0.f, 2.f }, .blur = 6.f } } };
    s.thumb_hovered = { .fills = { ff::solid(IM_COL32(255, 255, 255, 255)) }, .radii = { 8.f }, .shadows = { { .color = IM_COL32(0, 0, 0, 140), .offset = { 0.f, 2.f }, .blur = 8.f } } };
    s.thumb_active = s.thumb_hovered;
    s.value = { .style = &text_muted, .pos = { 170.f, 0.f }, .size = { 50.f, 20.f }, .baseline = 15.f, .align = ff::Align::end };
    s.format = "%.0f%%";
    return s;
}

ui::TextFieldStyle field_style()
{
    ui::TextFieldStyle s;
    s.idle = { .fills = { ff::solid(panel) }, .radii = { 10.f }, .stroke = { .color = IM_COL32(255, 255, 255, 26), .weight = 1.f } };
    s.hovered = { .fills = { ff::solid(panel) }, .radii = { 10.f }, .stroke = { .color = IM_COL32(255, 255, 255, 48), .weight = 1.f } };
    s.focused = { .fills = { ff::solid(panel) }, .radii = { 10.f }, .stroke = { .color = lime, .weight = 1.5f } };
    s.text = &text_ink;
    s.placeholder = &text_muted;
    s.text_left = 14.f;
    s.text_right = 14.f;
    s.baseline = 26.f;
    return s;
}

ui::ComboStyle combo_style()
{
    ui::ComboStyle s;
    s.idle = { .fills = { ff::solid(panel) }, .radii = { 10.f }, .stroke = { .color = IM_COL32(255, 255, 255, 26), .weight = 1.f } };
    s.hovered = { .fills = { ff::solid(raised) }, .radii = { 10.f }, .stroke = { .color = IM_COL32(255, 255, 255, 40), .weight = 1.f } };
    s.open = { .fills = { ff::solid(raised) }, .radii = { 10.f }, .stroke = { .color = lime, .weight = 1.f } };
    s.value = { .style = &text_ink, .pos = { 14.f, 0.f }, .size = { 150.f, 40.f }, .baseline = 25.f };
    s.panel = { .fills = { ff::solid(raised) }, .radii = { 10.f }, .shadows = { { .color = IM_COL32(0, 0, 0, 160), .offset = { 0.f, 8.f }, .blur = 20.f } } };
    s.item = &text_ink;
    s.item_height = 32.f;
    s.item_hovered = { .fills = { ff::solid(IM_COL32(255, 255, 255, 14)) }, .radii = { 7.f } };
    s.item_selected = { .fills = { ff::solid(IM_COL32(190, 242, 100, 40)) }, .radii = { 7.f } };
    s.item_selected_text = lime;
    return s;
}

ui::KeybindStyle keybind_style()
{
    ui::KeybindStyle s;
    s.idle = { .fills = { ff::solid(panel) }, .radii = { 7.f }, .stroke = { .color = IM_COL32(255, 255, 255, 26), .weight = 1.f } };
    s.hovered = { .fills = { ff::solid(raised) }, .radii = { 7.f }, .stroke = { .color = IM_COL32(255, 255, 255, 40), .weight = 1.f } };
    s.waiting = { .fills = { ff::solid(raised) }, .radii = { 7.f }, .stroke = { .color = lime, .weight = 1.f } };
    s.text = { .style = &text_ink, .pos = { 0.f, 0.f }, .size = { 90.f, 30.f }, .baseline = 20.f, .align = ff::Align::center };
    s.waiting_color = lime;
    return s;
}

} // namespace

int WINAPI wWinMain(HINSTANCE, HINSTANCE, PWSTR, int)
{
    ff::HostConfig cfg;
    cfg.title = L"Figflow widgets test";
    cfg.size = ImVec2(720.f, 480.f);
    if (!ff::host_create(cfg))
        return 1;
    static std::vector<unsigned char> segoe = read_file("C:\\Windows\\Fonts\\segoeui.ttf");
    ff::FontSource regular{ segoe.data(), (unsigned)segoe.size(), 0.f, "Segoe UI" };
    g_font = segoe.empty() ? nullptr : ff::add_font(regular);

    const ui::ButtonStyle primary = primary_button();
    const ui::ButtonStyle nav = nav_item();
    const ui::ToggleStyle toggle = toggle_style();
    const ui::CheckboxStyle check = checkbox_style(false);
    const ui::CheckboxStyle radio = checkbox_style(true);
    const ui::SliderStyle slider = slider_style();
    const ui::TextFieldStyle field = field_style();
    const ui::ComboStyle combo = combo_style();
    const ui::KeybindStyle keybind = keybind_style();
    const ff::Box background{ .fills = { ff::solid(IM_COL32(12, 15, 9, 255)) }, .radii = { 18.f } };
    const ff::Box dim{ .fills = { ff::solid(IM_COL32(0, 0, 0, 150)) }, .radii = { 18.f } };
    const ff::Box dialog{ .fills = { ff::solid(panel) }, .radii = { 16.f }, .stroke = { .color = IM_COL32(255, 255, 255, 30), .weight = 1.f },
                          .shadows = { { .color = IM_COL32(0, 0, 0, 170), .offset = { 0.f, 16.f }, .blur = 40.f } } };
    const ff::Box toast_box{ .fills = { ff::solid(raised) }, .radii = { 12.f }, .stroke = { .color = IM_COL32(190, 242, 100, 120), .weight = 1.f } };

    ff::Screens screens;
    ff::Popups popups;
    ff::Toasts toasts;
    int page = 0, mode = 1, choice = 0;
    bool aim = true, esp = false;
    float fov = 60.f;
    char key[64] = "";
    ImGuiKey bind = ImGuiKey_Insert;
    const char* choices[] = { "Head", "Chest", "Nearest" };

    while (ff::host_begin_frame())
    {
        const float dt = ImGui::GetIO().DeltaTime;
        screens.update(dt);
        popups.update(dt);
        toasts.update(dt);

        if (ff::begin_design_window("##screens"))
        {
            const ff::Frame f = ff::begin_frame("main", cfg.size);
            ImDrawList* dl = ImGui::GetWindowDrawList();
            ff::draw::box(dl, f.rect(), background);
            const char* pages[] = { "Aim##p0", "Visuals##p1", "Settings##p2" };
            for (int i = 0; i < 3; i++)
            {
                ff::place(f, { 20.f, 24.f + 44.f * (float)i });
                if (ui::selectable(pages[i], page == i, { 140.f, 36.f }, nav))
                    page = i;
            }
            ff::place(f, { 200.f, 24.f });
            ui::toggle("Aimbot##aim", &aim, { 200.f, 22.f }, toggle);
            ff::place(f, { 200.f, 64.f });
            ui::checkbox("Draw boxes##esp", &esp, { 180.f, 20.f }, check);
            for (int i = 0; i < 2; i++)
            {
                ff::place(f, { 420.f, 24.f + 34.f * (float)i });
                if (ui::radio(i == 0 ? "Legit##m0" : "Rage##m1", mode == i, { 150.f, 20.f }, radio))
                    mode = i;
            }
            ff::place(f, { 200.f, 110.f });
            ui::slider("##fov", &fov, 0.f, 180.f, { 220.f, 40.f }, slider);
            ff::place(f, { 200.f, 170.f });
            ui::combo("##target", &choice, choices, 3, { 180.f, 40.f }, combo);
            ff::place(f, { 420.f, 175.f });
            ui::keybind("##bind", &bind, { 90.f, 30.f }, keybind);
            ff::place(f, { 200.f, 240.f });
            ui::text_field("##key", key, sizeof(key), { 300.f, 42.f }, field, "Enter your key");
            ff::place(f, { 200.f, 300.f });
            if (ui::button("Activate##open", { 160.f, 40.f }, primary))
                popups.open(0);
            ff::end_frame();
        }
        ff::end_design_window();

        if (popups.showing >= 0)
        {
            if (ff::begin_design_layer("##popup", true))
            {
                ff::Fade fade(popups.eased());
                const ff::Frame f = ff::begin_frame("popup", cfg.size);
                ImDrawList* dl = ImGui::GetWindowDrawList();
                ImGui::PushItemFlag(ImGuiItemFlags_Disabled, !popups.is_open());
                ff::draw::box(dl, f.rect(), dim);
                const ImVec2 at{ 210.f, 140.f + (1.f - popups.eased()) * 12.f };
                ff::draw::box(dl, f.rect(at, { 300.f, 180.f }), dialog);
                ff::text(dl, f.at(at + ImVec2(24.f, 44.f)), text_ink, "Activate your key?");
                ff::place(f, at + ImVec2(70.f, 110.f));
                if (ui::button("Confirm##confirm", { 160.f, 40.f }, primary))
                {
                    toasts.push(0, key[0] ? key : nullptr, 3.f);
                    popups.close();
                }
                if (popups.is_open() && ff::clicked_outside(f.rect(at, { 300.f, 180.f })))
                    popups.close();
                ImGui::PopItemFlag();
                ff::end_frame();
            }
            ff::end_design_layer();
            if (popups.is_open() && ImGui::IsKeyPressed(ImGuiKey_Escape, false) && !ImGui::IsAnyItemActive())
                popups.close();
        }

        if (toasts.count > 0)
        {
            if (ff::begin_design_layer("##toasts", false))
            {
                ImDrawList* dl = ImGui::GetWindowDrawList();
                const ImVec2 origin = ImGui::GetCursorScreenPos();
                for (int i = 0; i < toasts.count; i++)
                {
                    const ff::Toast& t = toasts.items[i];
                    const float v = toasts.visibility(t);
                    ff::Fade fade(v);
                    const ImVec2 p = origin + ImVec2(220.f, 410.f - 56.f * (float)(toasts.count - 1 - i) + (1.f - v) * 20.f);
                    ff::draw::box(dl, ImRect(p, p + ImVec2(280.f, 44.f)), toast_box);
                    ff::text(dl, p + ImVec2(16.f, 28.f), text_ink, t.text[0] ? t.text : "Activated successfully");
                }
            }
            ff::end_design_layer();
        }
        ff::host_end_frame();
    }
    ff::host_destroy();
    return 0;
}
