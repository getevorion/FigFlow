// Visual test for the Figflow runtime: every drawing feature on one canvas.
// Build with CMake, then run with FIGFLOW_CAPTURE=out.png to get a PNG.
#include "ff/draw.h"
#include "ff/host.h"
#include "ff/layout.h"
#include "ff/text.h"
#include "ff/anim.h"

#include <windows.h>

#include <cstdio>
#include <cstdlib>
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

int WINAPI wWinMain(HINSTANCE, HINSTANCE, PWSTR, int)
{
    ff::HostConfig cfg;
    cfg.title = L"Figflow runtime test";
    cfg.size = ImVec2(900.f, 560.f);
    if (!ff::host_create(cfg))
        return 1;

    static std::vector<unsigned char> segoe = read_file("C:\\Windows\\Fonts\\segoeui.ttf");
    static std::vector<unsigned char> segoe_bold = read_file("C:\\Windows\\Fonts\\segoeuib.ttf");
    ff::FontSource regular{ segoe.data(), (unsigned)segoe.size(), 0.f, "Segoe UI" };
    ff::FontSource bold{ segoe_bold.data(), (unsigned)segoe_bold.size(), 0.f, "Segoe UI Bold" };
    ImFont* f_regular = segoe.empty() ? nullptr : ff::add_font(regular);
    ImFont* f_bold = segoe_bold.empty() ? nullptr : ff::add_font(bold);

    const ff::Box background{ .fills = { ff::solid(IM_COL32(12, 15, 9, 255)) }, .radii = { 20.f } };
    const ff::Box card{
        .fills = { ff::solid(IM_COL32(24, 29, 19, 255)) },
        .radii = { 14.f, 14.f, 4.f, 4.f },
        .stroke = { .color = IM_COL32(255, 255, 255, 22), .weight = 1.f, .align = ff::StrokeAlign::inside },
        .shadows = { { .color = IM_COL32(0, 0, 0, 150), .offset = { 0.f, 12.f }, .blur = 28.f, .spread = -4.f } },
    };
    ff::Fill lime_gradient{};
    lime_gradient.kind = ff::FillKind::linear;
    lime_gradient.gradient.from = ImVec2(0.f, 0.f);
    lime_gradient.gradient.to = ImVec2(200.f, 0.f);
    lime_gradient.gradient.stops[0] = { 0.f, IM_COL32(217, 249, 157, 255) };
    lime_gradient.gradient.stops[1] = { 0.5f, IM_COL32(190, 242, 100, 255) };
    lime_gradient.gradient.stops[2] = { 1.f, IM_COL32(40, 120, 20, 255) };
    lime_gradient.gradient.stop_count = 3;
    const ff::Box gradient_pill{ .fills = { lime_gradient }, .radii = { 22.f } };
    const ff::Box glow{
        .fills = { ff::solid(IM_COL32(190, 242, 100, 255)) },
        .radii = { 12.f },
        .shadows = { { .color = IM_COL32(190, 242, 100, 170), .offset = { 0.f, 0.f }, .blur = 30.f, .spread = 2.f } },
    };
    const ff::Box inset{
        .fills = { ff::solid(IM_COL32(20, 24, 16, 255)) },
        .radii = { 12.f },
        .shadows = { { .color = IM_COL32(0, 0, 0, 200), .offset = { 0.f, 3.f }, .blur = 10.f, .inner = true },
                     { .color = IM_COL32(255, 255, 255, 40), .offset = { 0.f, 1.f }, .blur = 0.f, .inner = true } },
    };
    const ff::Box divider_bottom{
        .fills = { ff::solid(IM_COL32(28, 34, 22, 255)) },
        .radii = { 10.f },
        .stroke = { .color = IM_COL32(190, 242, 100, 255), .weight = 0.f, .align = ff::StrokeAlign::inside, .top = 0.f, .right = 0.f, .bottom = 3.f, .left = 0.f },
    };
    const ff::Box ring_center{ .radii = { 16.f }, .stroke = { .color = IM_COL32(255, 255, 255, 200), .weight = 4.f, .align = ff::StrokeAlign::center } };
    const ff::Box ring_outside{ .radii = { 16.f }, .stroke = { .color = IM_COL32(125, 211, 252, 220), .weight = 4.f, .align = ff::StrokeAlign::outside } };
    const ff::Box translucent{
        .fills = { ff::solid(IM_COL32(255, 255, 255, 30)) },
        .radii = { 18.f },
        .stroke = { .color = IM_COL32(255, 255, 255, 60), .weight = 1.f },
        .shadows = { { .color = IM_COL32(0, 0, 0, 180), .offset = { 0.f, 10.f }, .blur = 24.f } },
    };
    const ff::Box knob{ .fills = { ff::solid(IM_COL32(245, 247, 240, 255)) }, .shadows = { { .color = IM_COL32(0, 0, 0, 110), .offset = { 0.f, 1.f }, .blur = 3.f } } };

    static ImFont* h_bold = nullptr; static ImFont* h_regular = nullptr; h_bold = f_bold; h_regular = f_regular;
    ff::TextStyle title{ .font = &h_bold, .size = 24.f, .color = IM_COL32(242, 246, 234, 255) };
    ff::TextStyle body{ .font = &h_regular, .size = 14.f, .color = IM_COL32(154, 163, 143, 255) };
    ff::TextStyle spaced{ .font = &h_bold, .size = 11.f, .color = IM_COL32(190, 242, 100, 255), .letter_spacing = 2.f };
    ff::TextStyle dark{ .font = &h_bold, .size = 15.f, .color = IM_COL32(17, 23, 10, 255) };

    while (ff::host_begin_frame())
    {
        if (ff::begin_design_window("##design"))
        {
            ImDrawList* dl = ImGui::GetWindowDrawList();
            const ImVec2 o = ImGui::GetWindowPos();
            auto R = [&](float x, float y, float w, float h) { return ImRect(o + ImVec2(x, y), o + ImVec2(x + w, y + h)); };

            ff::draw::box(dl, R(0, 0, 900, 560), background);
            ff::text(dl, o + ImVec2(40, 64), title, "Figflow runtime");
            ff::text(dl, o + ImVec2(40, 90), spaced, "DRAW \xC2\xB7 TEXT \xC2\xB7 SHADOWS");
            ff::text(dl, o + ImVec2(40, 116), body, "Per-corner radii, multi-stop gradients, aligned strokes, analytic shadows.");

            ff::draw::box(dl, R(40, 150, 240, 150), card);
            ff::text(dl, o + ImVec2(60, 186), body, "Card: 14/14/4/4 radii");
            ff::draw::box(dl, R(60, 210, 200, 44), gradient_pill);
            ff::text_in(dl, R(60, 210, 200, 44), 27.f, ff::Align::center, dark, "3-stop gradient");

            ff::draw::box(dl, R(330, 170, 120, 90), glow);
            ff::draw::box(dl, R(490, 160, 160, 110), inset);
            ff::text_in(dl, R(490, 160, 160, 110), 60.f, ff::Align::center, body, "Inner shadows");

            ff::draw::box(dl, R(700, 160, 160, 110), divider_bottom);
            ff::text_in(dl, R(700, 160, 160, 110), 60.f, ff::Align::center, body, "Bottom border");

            ff::draw::box(dl, R(60, 350, 120, 120), ring_center);
            ff::draw::box(dl, R(220, 350, 120, 120), ring_outside);
            ff::draw::box(dl, R(380, 340, 220, 140), translucent);
            ff::text_in(dl, R(380, 340, 220, 140), 75.f, ff::Align::center, body, "Translucent, knocked-out shadow");

            // A toggle track + knob drawn from the same primitives the widgets use.
            const ff::Box track_on{ .fills = { ff::solid(IM_COL32(190, 242, 100, 255)) }, .radii = { 11.f } };
            ff::draw::box(dl, R(660, 380, 44, 22), track_on);
            ff::draw::ellipse(dl, R(684, 382, 18, 18), knob);
            const ff::Box track_off{ .fills = { ff::solid(IM_COL32(255, 255, 255, 30)) }, .radii = { 11.f } };
            ff::draw::box(dl, R(660, 420, 44, 22), track_off);
            ff::draw::ellipse(dl, R(662, 422, 18, 18), knob);
        }
        ff::end_design_window();
        ff::host_end_frame();
    }
    ff::host_destroy();
    return 0;
}
