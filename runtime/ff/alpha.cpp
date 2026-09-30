// Figflow runtime: global opacity stack. See alpha.h.
#include "alpha.h"

namespace ff {

namespace {

constexpr int kMaxDepth = 32;
float g_stack[kMaxDepth] = { 1.f };
int g_depth = 0;

} // namespace

float alpha() { return g_stack[g_depth]; }

void push_alpha(float a)
{
    if (g_depth + 1 < kMaxDepth)
    {
        g_stack[g_depth + 1] = g_stack[g_depth] * (a < 0.f ? 0.f : a > 1.f ? 1.f : a);
        g_depth++;
    }
}

void pop_alpha()
{
    if (g_depth > 0)
        g_depth--;
}

} // namespace ff
