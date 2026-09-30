// Figflow runtime: fonts and baseline-anchored text. See text.h.
#include "text.h"
#include "alpha.h"
#include "draw.h"

#include <cstring>

namespace ff {

namespace {

// Glyph quads keep their sub-pixel x (fonts are oversampled horizontally);
// callers snap the baseline row themselves.
struct NoPixelSnap
{
    ImDrawList* dl;
    ImDrawListFlags saved;
    explicit NoPixelSnap(ImDrawList* d) : dl(d), saved(d->Flags) { dl->Flags |= ImDrawListFlags_TextNoPixelSnap; }
    ~NoPixelSnap() { dl->Flags = saved; }
};

ImFont* resolve(const TextStyle& s) { return s.font && *s.font ? *s.font : ImGui::GetFont(); }

unsigned read_u16(const unsigned char* p) { return (unsigned)(p[0] << 8 | p[1]); }
int read_i16(const unsigned char* p) { return (short)(p[0] << 8 | p[1]); }
unsigned read_u32(const unsigned char* p) { return (unsigned)p[0] << 24 | (unsigned)p[1] << 16 | (unsigned)p[2] << 8 | p[3]; }

// (hhea ascender - descender) / head.unitsPerEm: the ratio between stb_truetype's
// pixel-height sizing and the em sizing Figma uses. 1 when the tables are missing.
float em_scale_from_font(const unsigned char* data, unsigned size)
{
    if (size < 12)
        return 1.f;
    const unsigned tables = read_u16(data + 4);
    unsigned upem = 0;
    int ascender = 0, descender = 0;
    for (unsigned i = 0; i < tables && 12 + i * 16 + 16 <= size; i++)
    {
        const unsigned char* rec = data + 12 + i * 16;
        const unsigned offset = read_u32(rec + 8);
        if (std::memcmp(rec, "head", 4) == 0 && offset + 20 <= size)
            upem = read_u16(data + offset + 18);
        else if (std::memcmp(rec, "hhea", 4) == 0 && offset + 8 <= size)
        {
            ascender = read_i16(data + offset + 4);
            descender = read_i16(data + offset + 6);
        }
    }
    if (upem == 0 || ascender - descender <= 0)
        return 1.f;
    return (float)(ascender - descender) / (float)upem;
}

// Kerning tables by font. ImFont has no user data, so fonts are looked up by
// address (a handful of fonts: a linear scan).
struct KernTable
{
    ImFont* font;
    const KernPair* pairs;
    int count;
};

ImVector<KernTable>& kern_tables()
{
    static ImVector<KernTable> tables;
    return tables;
}

const KernTable* kern_table(ImFont* font)
{
    for (const KernTable& t : kern_tables())
        if (t.font == font)
            return &t;
    return nullptr;
}

// Binary search of a sorted table; em.
float kern_em(const KernTable* t, unsigned int left, unsigned int right)
{
    if (!t)
        return 0.f;
    int lo = 0, hi = t->count - 1;
    while (lo <= hi)
    {
        const int mid = (lo + hi) >> 1;
        const KernPair& p = t->pairs[mid];
        if (p.left == left && p.right == right)
            return p.em;
        if (p.left < left || (p.left == left && p.right < right))
            lo = mid + 1;
        else
            hi = mid - 1;
    }
    return 0.f;
}

} // namespace

ImFont* add_font(const FontSource& src, ImFont* merge_into)
{
    ImFontConfig cfg;
    cfg.FontDataOwnedByAtlas = false; // embedded, lives for the whole program
    cfg.ExtraSizeScale = src.em_scale > 0.f ? src.em_scale : em_scale_from_font(src.data, src.size);
    cfg.MergeMode = merge_into != nullptr;
    cfg.DstFont = merge_into;
    cfg.GlyphExcludeRanges = src.exclude;
    cfg.OversampleV = 2; // text sits on fractional baselines, like Figma's
    ImFormatString(cfg.Name, IM_COUNTOF(cfg.Name), "%s", src.name);
    // Size only sets the font's LegacySize: every draw passes its own size.
    ImFont* font = ImGui::GetIO().Fonts->AddFontFromMemoryTTF((void*)src.data, (int)src.size, 16.f, &cfg);
    if (font && (src.kerning_count > 0 || !merge_into))
    {
        // A new font may reuse a destroyed one's address: its entry is replaced, not inherited.
        ImVector<KernTable>& tables = kern_tables();
        for (int i = tables.Size - 1; i >= 0; i--)
            if (tables[i].font == font)
                tables.erase(tables.Data + i);
        if (src.kerning_count > 0)
            tables.push_back({ font, src.kerning, src.kerning_count });
    }
    return font;
}

float kerning(ImFont* font, float size, unsigned int left, unsigned int right)
{
    return kern_em(kern_table(font), left, right) * size;
}

float text_width(const TextStyle& style, const char* text, const char* text_end)
{
    if (!text_end)
        text_end = text + std::strlen(text);
    ImFont* font = resolve(style);
    const KernTable* kern = kern_table(font);
    if (style.letter_spacing == 0.f && !kern)
        return font->CalcTextSizeA(style.size, FLT_MAX, 0.f, text, text_end).x;
    ImFontBaked* baked = font->GetFontBaked(style.size);
    float w = 0.f;
    int n = 0;
    unsigned int prev = 0;
    for (const char* p = text; p < text_end;)
    {
        unsigned int c = 0;
        const int len = ImTextCharFromUtf8(&c, p, text_end);
        p += len > 0 ? len : 1;
        if (prev)
            w += kern_em(kern, prev, c) * style.size;
        w += baked->GetCharAdvance((ImWchar)c);
        prev = c;
        n++;
    }
    // Figma spaces characters apart: spacing between each pair, none after the last.
    return w + style.letter_spacing * (float)ImMax(n - 1, 0);
}

void text(ImDrawList* dl, ImVec2 baseline_left, const TextStyle& style, const char* text, const char* text_end, float alpha)
{
    if (!text_end)
        text_end = text + std::strlen(text);
    if (text == text_end)
        return;
    ImFont* font = resolve(style);
    ImFontBaked* baked = font->GetFontBaked(style.size);
    const ImU32 col = draw::fade(style.color, alpha * ff::alpha());
    if ((col & IM_COL32_A_MASK) == 0)
        return;
    // Glyph offsets include round(Ascent): this puts the baseline exactly on
    // Figma's (fractional) baseline. Fonts are oversampled vertically, so
    // sub-pixel rows stay sharp.
    const float top = baseline_left.y - IM_ROUND(baked->Ascent);
    NoPixelSnap snap(dl);
    const KernTable* kern = kern_table(font);
    if (style.letter_spacing == 0.f && !kern)
    {
        dl->AddText(font, style.size, ImVec2(baseline_left.x, top), col, text, text_end);
        return;
    }
    float x = baseline_left.x;
    unsigned int prev = 0;
    for (const char* p = text; p < text_end;)
    {
        unsigned int c = 0;
        const int len = ImTextCharFromUtf8(&c, p, text_end);
        p += len > 0 ? len : 1;
        if (c == '\n' || c == '\r')
            continue;
        if (prev)
            x += kern_em(kern, prev, c) * style.size;
        font->RenderChar(dl, style.size, ImVec2(x, top), col, (ImWchar)c);
        x += baked->GetCharAdvance((ImWchar)c) + style.letter_spacing;
        prev = c;
    }
}

void text_in(ImDrawList* dl, const ImRect& box, float baseline, Align align, const TextStyle& style, const char* text, float alpha, bool clip)
{
    text_in(dl, box, baseline, align, style, text, text + std::strlen(text), alpha, clip);
}

void text_in(ImDrawList* dl, const ImRect& box, float baseline, Align align, const TextStyle& style, const char* text, const char* text_end, float alpha, bool clip)
{
    const char* end = text_end ? text_end : text + std::strlen(text);
    // Trailing spaces hang: they don't count when a line is centred or right
    // aligned (Figma's rule, and CSS's), so "Label " centres like "Label".
    const char* ink_end = end;
    while (ink_end > text && (ink_end[-1] == ' ' || ink_end[-1] == '\t'))
        ink_end--;
    float w = text_width(style, text, ink_end);
    const float avail = box.GetWidth();
    char buf[256];
    if (clip && w > avail + 0.5f)
    {
        // Trim to fit with an ellipsis, the way Figma's "Truncate text" does.
        const char* ellipsis = "\xE2\x80\xA6";
        const float ew = text_width(style, ellipsis);
        const char* cut = text;
        float acc = 0.f;
        ImFont* font = resolve(style);
        ImFontBaked* baked = font->GetFontBaked(style.size);
        const KernTable* kern = kern_table(font);
        unsigned int prev = 0;
        for (const char* p = text; p < end;)
        {
            unsigned int c = 0;
            const int len = ImTextCharFromUtf8(&c, p, end);
            const float adv = (prev ? kern_em(kern, prev, c) * style.size : 0.f) + baked->GetCharAdvance((ImWchar)c) + style.letter_spacing;
            if (acc + adv + ew > avail)
                break;
            acc += adv;
            prev = c;
            p += len > 0 ? len : 1;
            cut = p;
        }
        const size_t n = ImMin((size_t)(cut - text), sizeof(buf) - 4);
        std::memcpy(buf, text, n);
        std::memcpy(buf + n, ellipsis, 4);
        text = buf;
        end = buf + n + 3;
        w = acc + ew;
    }
    float x = box.Min.x;
    if (align == Align::center)
        x += (avail - w) * 0.5f;
    else if (align == Align::end)
        x += avail - w;
    ff::text(dl, ImVec2(x, box.Min.y + baseline), style, text, end, alpha);
}

void icon(ImDrawList* dl, ImFont* icons, ImVec2 top_left, float size, ImWchar glyph, ImU32 color, float alpha)
{
    if (!icons)
        return;
    const ImU32 col = draw::fade(color, alpha * ff::alpha());
    if ((col & IM_COL32_A_MASK) == 0)
        return;
    // Icon fonts put the em square's top at the ascent line, so the glyph's top is the box's top.
    ImFontBaked* baked = icons->GetFontBaked(size);
    NoPixelSnap snap(dl);
    icons->RenderChar(dl, size, ImVec2(top_left.x, top_left.y + (size - IM_ROUND(baked->Ascent))), col, glyph);
}

} // namespace ff
