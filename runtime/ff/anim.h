// Figflow runtime: frame-rate independent animation for widgets.
//
// Values live in the current window's ImGuiStorage under a key derived from
// the widget's ID and a channel name, so one widget can animate several
// properties without colliding with Dear ImGui's own per-ID storage.
#pragma once

#include "imgui.h"
#include "imgui_internal.h"

#include <cmath>

namespace ff::anim {

// Seconds of frame time an animation step may use. A stalled frame then
// can't teleport the animation to its end.
inline float delta_time() { return ImMin(ImGui::GetIO().DeltaTime, 1.f / 15.f); }

inline ImGuiID key(ImGuiID id, const char* channel) { return ImGui::GetIDWithSeed(channel, nullptr, id); }

// Moves a stored value toward `target`, covering most of the distance in
// `duration` seconds (exponential ease-out, independent of frame rate).
// The first time a key is seen it starts at the target, so nothing pops in.
inline float approach(ImGuiID id, const char* channel, float target, float duration = 0.14f)
{
    ImGuiStorage* storage = ImGui::GetStateStorage();
    const ImGuiID k = key(id, channel);
    float v = storage->GetFloat(k, target);
    if (duration <= 0.f)
        v = target;
    else
    {
        // Reach ~98% of the distance after `duration`.
        const float rate = 4.f / duration;
        v += (target - v) * (1.f - std::exp(-rate * delta_time()));
        if (ImFabs(target - v) < 0.0005f)
            v = target;
    }
    storage->SetFloat(k, v);
    return v;
}

// Linear, fixed-duration sweep toward `target` (0..1 values).
inline float sweep(ImGuiID id, const char* channel, float target, float duration = 0.14f)
{
    ImGuiStorage* storage = ImGui::GetStateStorage();
    const ImGuiID k = key(id, channel);
    float v = storage->GetFloat(k, target);
    v = duration > 0.f ? ImLinearSweep(v, target, delta_time() / duration) : target;
    storage->SetFloat(k, v);
    return v;
}

// Smoothstep easing for 0..1 progress values.
inline float smooth(float t) { t = ImSaturate(t); return t * t * (3.f - 2.f * t); }

} // namespace ff::anim
