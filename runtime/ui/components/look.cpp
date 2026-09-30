// Figflow widgets: shared drawing of control parts. See look.h.
#include "ui/components/look.h"

#include "ff/draw.h"
#include "ff/text.h"

namespace ui {

Look mix(const Look& a, const Look& b, float t)
{
    if (t <= 0.f)
        return a;
    if (t >= 1.f)
        return b;
    Look o;
    o.surface = ff::draw::mix(a.surface, b.surface, t);
    // A zero colour means "the default": blend only when both states set one.
    o.label = a.label && b.label ? ff::draw::mix(a.label, b.label, t) : (t < 0.5f ? a.label : b.label);
    o.icon = a.icon && b.icon ? ff::draw::mix(a.icon, b.icon, t) : (t < 0.5f ? a.icon : b.icon);
    o.plate = a.plate && b.plate ? ff::draw::mix(a.plate, b.plate, t) : (t < 0.5f ? a.plate : b.plate);
    return o;
}

void draw_label(ImDrawList* dl, const ImRect& bb, const Label& label, ImU32 color, const char* text, const char* text_end)
{
    if (!label.style || !text || text == text_end || (text_end == nullptr && text[0] == 0))
        return;
    ff::TextStyle style = *label.style;
    if (color)
        style.color = color;
    const ImRect area(bb.Min + label.pos, bb.Min + label.pos + label.size);
    ff::text_in(dl, area, label.baseline, label.align, style, text, text_end, 1.f, label.clip);
}

void draw_icon(ImDrawList* dl, const ImRect& bb, const Icon& icon, ImU32 tint)
{
    if (icon.image < 0)
        return;
    const ImVec2 p = bb.Min + icon.pos;
    ff::draw::image(dl, ImRect(p, p + icon.size), icon.image, tint ? tint : icon.tint);
}

void draw(ImDrawList* dl, const ImRect& bb, const Look& look, const Label& label, const char* text, const char* text_end, const Icon& icon, const ImRect* surface, const Icon* plate)
{
    ff::draw::box(dl, surface ? *surface : bb, look.surface);
    if (plate)
        draw_icon(dl, bb, *plate, look.plate);
    draw_icon(dl, bb, icon, look.icon);
    draw_label(dl, bb, label, look.label, text, text_end);
}

bool looks_disabled()
{
    ImGuiContext& g = *GImGui;
    return g.DisabledStackSize > 0;
}

} // namespace ui
