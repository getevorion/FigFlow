// Figflow runtime: a global opacity for everything lf draws, so a whole
// screen, popup or toast can fade in and out as one layer (like ImGui's
// style.Alpha, which lf's own drawing doesn't go through).
#pragma once

namespace ff {

// Current opacity multiplier (1 outside any push).
float alpha();

// Multiplies the current opacity by `a` until the matching pop_alpha().
void push_alpha(float a);
void pop_alpha();

// RAII helper: `ff::Fade fade(t);` fades everything drawn in the scope.
struct Fade
{
    explicit Fade(float a) { push_alpha(a); }
    ~Fade() { pop_alpha(); }
    Fade(const Fade&) = delete;
    Fade& operator=(const Fade&) = delete;
};

} // namespace ff
