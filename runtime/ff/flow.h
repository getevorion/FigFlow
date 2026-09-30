// Figflow runtime: moving between screens, popups over them, and toasts.
//
// Plain state plus timing, by index: the generated app/navigation.cpp maps
// its Screen, Popup and Toast enums onto these and draws what they say.
#pragma once

#include "imgui.h"
#include "imgui_internal.h"

#include <cstdio>
#include <cstdlib>

namespace ff {

// The screen the app opens on: the design's start screen. Headless capture runs
// (FIGFLOW_CAPTURE) can open another with FIGFLOW_SCREEN=<index>, to check any
// screen against its design.
inline int start_screen(int design_start)
{
    const char* capture = std::getenv("FIGFLOW_CAPTURE");
    const char* screen = std::getenv("FIGFLOW_SCREEN");
    return capture && *capture && screen && *screen ? std::atoi(screen) : design_start;
}

// Call after a popup's contents: true when this frame's click landed on the
// popup's layer outside `panel` and no control took it (click-outside-to-close).
// Checking afterwards, instead of putting a catch-all button under the panel,
// means a control can never lose a click to the backdrop.
inline bool clicked_outside(const ImRect& panel)
{
    return ImGui::IsWindowHovered() && ImGui::IsMouseClicked(ImGuiMouseButton_Left) && !ImGui::IsAnyItemHovered() && !ImGui::IsAnyItemActive() &&
           !panel.Contains(ImGui::GetMousePos());
}

// The screen shown, where Back goes, and the fade from the previous screen.
struct Screens
{
    static constexpr int max_history = 32;

    int current = 0;
    int previous = -1;     // still drawn (under the new one) while it fades in
    float t = 1.f;         // fade-in progress of `current`, 1 = done
    float duration = 0.22f;
    int history[max_history]{};
    int depth = 0;

    // Shows `screen`. With `remember`, Back returns here; nav pages switch
    // without it, so Back skips them the way a tab bar does.
    void go(int screen, bool remember = true)
    {
        if (screen == current)
            return;
        if (remember)
        {
            if (depth == max_history) // drop the oldest entry
            {
                for (int i = 1; i < max_history; i++)
                    history[i - 1] = history[i];
                depth--;
            }
            history[depth++] = current;
        }
        previous = current;
        current = screen;
        t = duration > 0.f ? 0.f : 1.f;
    }

    // Returns to the screen before; false when there is none.
    bool back()
    {
        if (depth == 0)
            return false;
        const int to = history[--depth];
        previous = current;
        current = to;
        t = duration > 0.f ? 0.f : 1.f;
        return true;
    }

    void update(float dt)
    {
        if (t < 1.f)
            t = ImMin(1.f, t + dt / duration);
        if (t >= 1.f)
            previous = -1;
    }

    // Eased progress for drawing.
    float eased() const { return t * t * (3.f - 2.f * t); }
};

// The popup over the current screen. It stays drawn while fading out.
struct Popups
{
    int current = -1;  // open popup, -1 = none
    int showing = -1;  // drawn popup (the one fading out after close())
    float t = 0.f;     // 0 = hidden, 1 = fully shown
    float duration = 0.16f;

    void open(int popup)
    {
        if (showing != popup)
            t = 0.f;
        current = showing = popup;
    }
    void close() { current = -1; }
    bool is_open() const { return current >= 0; }

    void update(float dt)
    {
        const float target = current >= 0 ? 1.f : 0.f;
        const float step = duration > 0.f ? dt / duration : 1.f;
        t = target > t ? ImMin(target, t + step) : ImMax(target, t - step);
        if (current < 0 && t <= 0.f)
            showing = -1;
    }

    float eased() const { return t * t * (3.f - 2.f * t); }
};

// A notification shown for a few seconds; `text` replaces the designed message.
struct Toast
{
    int kind = 0;
    char text[160] = "";
    float age = 0.f;
    float seconds = 3.f;
};

struct Toasts
{
    static constexpr int max = 4;
    Toast items[max]{};
    int count = 0;
    float fade = 0.22f; // in and out

    void push(int kind, const char* text, float seconds)
    {
        if (count == max) // the oldest makes room
        {
            for (int i = 1; i < max; i++)
                items[i - 1] = items[i];
            count--;
        }
        Toast& t = items[count++];
        t = Toast{};
        t.kind = kind;
        t.seconds = seconds;
        if (text)
            std::snprintf(t.text, sizeof(t.text), "%s", text);
    }

    void update(float dt)
    {
        int w = 0;
        for (int i = 0; i < count; i++)
        {
            items[i].age += dt;
            if (items[i].age < items[i].seconds + fade)
                items[w++] = items[i];
        }
        count = w;
    }

    // 0..1: fading in, shown, fading out.
    float visibility(const Toast& t) const
    {
        const float in = ImSaturate(t.age / fade);
        const float out = ImSaturate((t.seconds + fade - t.age) / fade);
        const float v = ImMin(in, out);
        return v * v * (3.f - 2.f * v);
    }
};

} // namespace ff
