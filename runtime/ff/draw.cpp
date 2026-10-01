// Figflow runtime: ImDrawList rendering of Figma layers. See draw.h.
#include "draw.h"
#include "alpha.h"
#include "image.h"

#include <cmath>

namespace ff::draw {

namespace {

constexpr float kSqrt2 = 1.41421356f;

// Normal helpers, identical to the private macros in imgui_draw.cpp, so custom
// meshes anti-alias exactly like ImGui's own fills.
#define FF_NORMALIZE2F_OVER_ZERO(VX, VY) { float d2 = VX * VX + VY * VY; if (d2 > 0.0f) { float inv_len = ImRsqrt(d2); VX *= inv_len; VY *= inv_len; } } (void)0
#define FF_FIXNORMAL2F_MAX_INVLEN2 100.0f
#define FF_FIXNORMAL2F(VX, VY) { float d2 = VX * VX + VY * VY; if (d2 > 0.000001f) { float inv_len2 = 1.0f / d2; if (inv_len2 > FF_FIXNORMAL2F_MAX_INVLEN2) inv_len2 = FF_FIXNORMAL2F_MAX_INVLEN2; VX *= inv_len2; VY *= inv_len2; } } (void)0

float clamp0(float v) { return v > 0.f ? v : 0.f; }

// Scales radii down together when opposite corners overlap (CSS rule).
Radii fit(const Radii& r, float w, float h)
{
    Radii o(clamp0(r.tl), clamp0(r.tr), clamp0(r.br), clamp0(r.bl));
    float f = 1.f;
    auto limit = [&f](float sum, float len) {
        if (sum > len && sum > 0.f)
            f = ImMin(f, ImMax(len, 0.f) / sum);
    };
    limit(o.tl + o.tr, w);
    limit(o.bl + o.br, w);
    limit(o.tl + o.bl, h);
    limit(o.tr + o.br, h);
    if (f < 1.f)
        o = Radii(o.tl * f, o.tr * f, o.br * f, o.bl * f);
    return o;
}

ImU32 with_alpha(ImU32 col, float a)
{
    const int ai = (int)(ImSaturate(a) * 255.f + 0.5f);
    return (col & ~IM_COL32_A_MASK) | ((ImU32)ai << IM_COL32_A_SHIFT);
}

float alpha_of(ImU32 col) { return (float)((col >> IM_COL32_A_SHIFT) & 0xFF) / 255.f; }

// ---------------------------------------------------------------------------
// Contours: rounded rectangles as point lists with a fixed topology, so that
// contours at different offsets correspond point by point (ring meshes).

struct CornerRadii
{
    float rx, ry;
};

struct ContourSpec
{
    ImVec2 min, max;
    CornerRadii c[4]; // tl, tr, br, bl
};

// Points per quarter arc and per straight edge are fixed per mesh so every
// contour of a ring mesh has the same number of points.
struct Topology
{
    int arc = 6;
    int edge = 1;
    int count() const { return 4 * (arc + 1) + 4 * (edge - 1); }
};

void emit_contour(ImVector<ImVec2>& out, const ContourSpec& s, const Topology& t)
{
    out.resize(0);
    const float a0[4] = { IM_PI, IM_PI * 1.5f, 0.f, IM_PI * 0.5f };
    const ImVec2 centers[4] = {
        ImVec2(s.min.x + s.c[0].rx, s.min.y + s.c[0].ry),
        ImVec2(s.max.x - s.c[1].rx, s.min.y + s.c[1].ry),
        ImVec2(s.max.x - s.c[2].rx, s.max.y - s.c[2].ry),
        ImVec2(s.min.x + s.c[3].rx, s.max.y - s.c[3].ry),
    };
    for (int k = 0; k < 4; k++)
    {
        for (int i = 0; i <= t.arc; i++)
        {
            const float a = a0[k] + (IM_PI * 0.5f) * (float)i / (float)t.arc;
            out.push_back(ImVec2(centers[k].x + ImCos(a) * s.c[k].rx, centers[k].y + ImSin(a) * s.c[k].ry));
        }
        // Straight edge to the next corner, subdivided so fields vary smoothly along it.
        const ImVec2 from = out.back();
        const int next = (k + 1) & 3;
        const float an = a0[next];
        const ImVec2 to(centers[next].x + ImCos(an) * s.c[next].rx, centers[next].y + ImSin(an) * s.c[next].ry);
        for (int i = 1; i < t.edge; i++)
            out.push_back(ImLerp(from, to, (float)i / (float)t.edge));
    }
}

// Rounded rect grown by `d` on every side (d < 0 shrinks), radii following.
ContourSpec offset_spec(const ImRect& r, const Radii& radii, float d)
{
    ContourSpec s;
    const ImVec2 c = r.GetCenter();
    s.min = ImVec2(ImMin(r.Min.x - d, c.x), ImMin(r.Min.y - d, c.y));
    s.max = ImVec2(ImMax(r.Max.x + d, c.x), ImMax(r.Max.y + d, c.y));
    const Radii f = fit(Radii(radii.tl + d, radii.tr + d, radii.br + d, radii.bl + d), s.max.x - s.min.x, s.max.y - s.min.y);
    const float v[4] = { f.tl, f.tr, f.br, f.bl };
    for (int k = 0; k < 4; k++)
        s.c[k] = { clamp0(v[k]), clamp0(v[k]) };
    return s;
}

Topology topology_for(const ImDrawList* dl, float max_radius, float max_edge, float spacing)
{
    Topology t;
    const int full = max_radius > 0.5f ? dl->_CalcCircleAutoSegmentCount(max_radius) : 4;
    t.arc = ImClamp((full + 3) / 4, 2, 32);
    t.edge = spacing > 0.f ? ImClamp((int)ImCeil(max_edge / spacing), 1, 24) : 1;
    return t;
}

// Signed distance to a rounded rectangle with per-corner radii (negative inside).
float sd_rrect(ImVec2 p, const ImRect& r, const Radii& radii)
{
    const ImVec2 c = r.GetCenter();
    const ImVec2 half = r.GetSize() * 0.5f;
    const ImVec2 q(p.x - c.x, p.y - c.y);
    float rad = q.x >= 0.f ? (q.y >= 0.f ? radii.br : radii.tr) : (q.y >= 0.f ? radii.bl : radii.tl);
    rad = ImMin(clamp0(rad), ImMin(half.x, half.y));
    const float dx = ImFabs(q.x) - half.x + rad;
    const float dy = ImFabs(q.y) - half.y + rad;
    const float ox = ImMax(dx, 0.f), oy = ImMax(dy, 0.f);
    return ImSqrt(ox * ox + oy * oy) + ImMin(ImMax(dx, dy), 0.f) - rad;
}

// Coverage of a Gaussian-blurred edge at signed distance `sd` (sigma = blur / 2).
float blurred_coverage(float sd, float sigma) { return 0.5f * (float)std::erfc(sd / (sigma * kSqrt2)); }

// Emits quads between consecutive contours, coloring each vertex from
// `alpha_at(point, contour_index)`. With `fill_first`, the innermost contour
// is also fanned from its centroid.
template <typename AlphaFn>
void emit_rings(ImDrawList* dl, const ImVector<ImVec2>* contours, int contour_count, ImU32 rgb, AlphaFn&& alpha_at, bool fill_first)
{
    if (contour_count < 1)
        return;
    const int n = contours[0].Size;
    const int ring_count = contour_count - 1;
    const int vtx = n * contour_count + (fill_first ? 1 : 0);
    const int idx = ring_count * n * 6 + (fill_first ? n * 3 : 0);
    if (vtx <= 0 || idx <= 0)
        return;
    dl->PrimReserve(idx, vtx);
    const ImVec2 uv = dl->_Data->TexUvWhitePixel;
    const unsigned int base = dl->_VtxCurrentIdx;
    for (int k = 0; k < contour_count; k++)
        for (int i = 0; i < n; i++)
        {
            const ImVec2 p = contours[k][i];
            dl->PrimWriteVtx(p, uv, with_alpha(rgb, alpha_at(p, k)));
        }
    unsigned int center = 0;
    if (fill_first)
    {
        ImVec2 c(0.f, 0.f);
        for (int i = 0; i < n; i++)
            c += contours[0][i];
        c /= (float)n;
        center = dl->_VtxCurrentIdx;
        dl->PrimWriteVtx(c, uv, with_alpha(rgb, alpha_at(c, 0)));
    }
    for (int k = 0; k < ring_count; k++)
        for (int i = 0; i < n; i++)
        {
            const int j = (i + 1) % n;
            const ImDrawIdx a = (ImDrawIdx)(base + k * n + i), b = (ImDrawIdx)(base + k * n + j);
            const ImDrawIdx c = (ImDrawIdx)(base + (k + 1) * n + j), d = (ImDrawIdx)(base + (k + 1) * n + i);
            dl->PrimWriteIdx(a); dl->PrimWriteIdx(b); dl->PrimWriteIdx(c);
            dl->PrimWriteIdx(a); dl->PrimWriteIdx(c); dl->PrimWriteIdx(d);
        }
    if (fill_first)
        for (int i = 0; i < n; i++)
        {
            dl->PrimWriteIdx((ImDrawIdx)center);
            dl->PrimWriteIdx((ImDrawIdx)(base + (i + 1) % n));
            dl->PrimWriteIdx((ImDrawIdx)(base + i));
        }
}

// Per-vertex outward normals of a clockwise contour, averaged like ImGui's fills.
void vertex_normals(const ImVec2* pts, int n, ImVector<ImVec2>& out)
{
    out.resize(n);
    ImVector<ImVec2> edge;
    edge.resize(n);
    for (int i0 = n - 1, i1 = 0; i1 < n; i0 = i1++)
    {
        float dx = pts[i1].x - pts[i0].x, dy = pts[i1].y - pts[i0].y;
        FF_NORMALIZE2F_OVER_ZERO(dx, dy);
        edge[i0] = ImVec2(dy, -dx);
    }
    for (int i0 = n - 1, i1 = 0; i1 < n; i0 = i1++)
    {
        float dm_x = (edge[i0].x + edge[i1].x) * 0.5f, dm_y = (edge[i0].y + edge[i1].y) * 0.5f;
        FF_FIXNORMAL2F(dm_x, dm_y);
        out[i1] = ImVec2(dm_x, dm_y);
    }
}

// Clips a convex polygon to the half-plane dot(p - origin, axis) (>= or <=) value.
void clip_halfplane(const ImVector<ImVec2>& in, ImVector<ImVec2>& out, ImVec2 origin, ImVec2 axis, float value, bool keep_greater)
{
    out.resize(0);
    const int n = in.Size;
    for (int i = 0; i < n; i++)
    {
        const ImVec2 a = in[i], b = in[(i + 1) % n];
        const float ta = ImDot(a - origin, axis) - value, tb = ImDot(b - origin, axis) - value;
        const bool ina = keep_greater ? ta >= 0.f : ta <= 0.f;
        const bool inb = keep_greater ? tb >= 0.f : tb <= 0.f;
        if (ina)
            out.push_back(a);
        if (ina != inb)
        {
            // Compute from a fixed endpoint order so neighbouring bands agree exactly.
            const bool swap = (a.x > b.x) || (a.x == b.x && a.y > b.y);
            const ImVec2 p = swap ? b : a, q = swap ? a : b;
            const float tp = swap ? tb : ta, tq = swap ? ta : tb;
            out.push_back(ImLerp(p, q, tp / (tp - tq)));
        }
    }
}

// Evaluates a linear gradient (stops sorted by position) at parameter t.
ImU32 gradient_at(const Gradient& g, float t)
{
    if (g.stop_count <= 0)
        return 0;
    if (t <= g.stops[0].position)
        return g.stops[0].color;
    for (int i = 1; i < g.stop_count; i++)
        if (t <= g.stops[i].position)
        {
            const float span = g.stops[i].position - g.stops[i - 1].position;
            return mix(g.stops[i - 1].color, g.stops[i].color, span > 0.f ? (t - g.stops[i - 1].position) / span : 1.f);
        }
    return g.stops[g.stop_count - 1].color;
}

void fill_path_with(ImDrawList* dl, const Fill& f, const ImRect& r, float alpha)
{
    const float a = alpha * f.opacity;
    switch (f.kind)
    {
    case FillKind::solid:
        dl->PathFillConvex(fade(f.color, a));
        break;
    case FillKind::linear:
        convex_gradient(dl, dl->_Path.Data, dl->_Path.Size, f.gradient, r.Min, a);
        dl->PathClear();
        break;
    case FillKind::image: {
        const ImTextureID tex = ff::image_texture(f.image);
        if (tex == ImTextureID_Invalid)
        {
            dl->PathClear();
            break;
        }
        const ImTextureRef ref(tex);
        const bool push = ref != dl->_CmdHeader.TexRef;
        if (push)
            dl->PushTexture(ref);
        const int start = dl->VtxBuffer.Size;
        dl->PathFillConvex(fade(f.color, a));
        ImGui::ShadeVertsLinearUV(dl, start, dl->VtxBuffer.Size, r.Min, r.Max, f.uv0, f.uv1, true);
        if (push)
            dl->PopTexture();
        break;
    }
    case FillKind::none:
        dl->PathClear();
        break;
    }
}

// Where a background blur shows: under any fill (Figma: a fill at any opacity
// above 0; 100% simply covers it), else only under the stroke.
void backdrop(ImDrawList* dl, const ImRect& r, const Box& b, float alpha)
{
    bool filled = false;
    for (const Fill& f : b.fills)
        filled |= f.kind != FillKind::none && f.opacity > 0.001f;
    if (filled)
    {
        ff::backdrop_blur(dl, r, r, b.radii, 0.f, b.backdrop_blur, alpha);
        return;
    }
    const Stroke& s = b.stroke;
    if (!s.visible())
        return;
    const float w = s.independent() ? ImMax(ImMax(s.top, s.right), ImMax(s.bottom, s.left)) : s.weight;
    const float out = s.align == StrokeAlign::outside ? w : s.align == StrokeAlign::center ? w * 0.5f : 0.f;
    const Radii grown(b.radii.tl > 0.f ? b.radii.tl + out : 0.f, b.radii.tr > 0.f ? b.radii.tr + out : 0.f, b.radii.br > 0.f ? b.radii.br + out : 0.f, b.radii.bl > 0.f ? b.radii.bl + out : 0.f);
    ff::backdrop_blur(dl, r, ImRect(r.Min - ImVec2(out, out), r.Max + ImVec2(out, out)), grown, w, b.backdrop_blur, alpha);
}

bool is_opaque(const Box& b)
{
    for (const Fill& f : b.fills)
        if (f.kind == FillKind::solid && f.opacity >= 1.f && alpha_of(f.color) >= 0.999f)
            return true;
    return false;
}

} // namespace

// ---------------------------------------------------------------------------

ImU32 mix(ImU32 a, ImU32 b, float t)
{
    if (t <= 0.f)
        return a;
    if (t >= 1.f)
        return b;
    const float aa = alpha_of(a), ba = alpha_of(b);
    const float oa = aa + (ba - aa) * t;
    if (oa <= 0.f)
        return 0;
    auto ch = [&](int shift) {
        const float ca = (float)((a >> shift) & 0xFF) * aa;
        const float cb = (float)((b >> shift) & 0xFF) * ba;
        return (ImU32)ImClamp((int)((ca + (cb - ca) * t) / oa + 0.5f), 0, 255) << shift;
    };
    return ch(IM_COL32_R_SHIFT) | ch(IM_COL32_G_SHIFT) | ch(IM_COL32_B_SHIFT) | ((ImU32)(oa * 255.f + 0.5f) << IM_COL32_A_SHIFT);
}

// Removes consecutive duplicate points the corner arcs leave where they meet
// (a stadium's arcs share their end points). Zero-length segments make stroke
// joins spike and waste fill vertices.
static void dedupe_path_from(ImDrawList* dl, int start)
{
    ImVector<ImVec2>& p = dl->_Path;
    int w = start;
    for (int i = start; i < p.Size; i++)
        if (w == start || ImLengthSqr(p[i] - p[w - 1]) > 1e-6f)
            p[w++] = p[i];
    while (w - start > 1 && ImLengthSqr(p[w - 1] - p[start]) <= 1e-6f)
        w--;
    p.resize(w);
}

void path_rect(ImDrawList* dl, const ImRect& rect, const Radii& radii)
{
    const int start = dl->_Path.Size;
    struct Dedupe
    {
        ImDrawList* dl;
        int start;
        ~Dedupe() { dedupe_path_from(dl, start); }
    } dedupe{ dl, start };
    const ImVec2 a = rect.Min, b = rect.Max;
    const Radii r = fit(radii, b.x - a.x, b.y - a.y);
    if (r.tl > 0.f) dl->PathArcTo(ImVec2(a.x + r.tl, a.y + r.tl), r.tl, IM_PI, IM_PI * 1.5f);
    else dl->PathLineTo(a);
    if (r.tr > 0.f) dl->PathArcTo(ImVec2(b.x - r.tr, a.y + r.tr), r.tr, IM_PI * 1.5f, IM_PI * 2.f);
    else dl->PathLineTo(ImVec2(b.x, a.y));
    if (r.br > 0.f) dl->PathArcTo(ImVec2(b.x - r.br, b.y - r.br), r.br, 0.f, IM_PI * 0.5f);
    else dl->PathLineTo(b);
    if (r.bl > 0.f) dl->PathArcTo(ImVec2(a.x + r.bl, b.y - r.bl), r.bl, IM_PI * 0.5f, IM_PI);
    else dl->PathLineTo(ImVec2(a.x, b.y));
}

void path_ellipse(ImDrawList* dl, const ImRect& r)
{
    const ImVec2 c = r.GetCenter();
    const ImVec2 rad = r.GetSize() * 0.5f;
    const int segments = dl->_CalcCircleAutoSegmentCount(ImMax(rad.x, rad.y));
    dl->PathEllipticalArcTo(c, rad, 0.f, 0.f, IM_PI * 2.f * (float)(segments - 1) / (float)segments, segments - 1);
}

void convex_gradient(ImDrawList* dl, const ImVec2* points, int count, const Gradient& g, ImVec2 origin, float alpha)
{
    if (count < 3 || g.stop_count <= 0)
        return;
    const ImVec2 from = origin + g.from, to = origin + g.to;
    ImVec2 axis = to - from;
    const float len2 = ImLengthSqr(axis);
    axis = len2 > 1e-8f ? axis / len2 : ImVec2(0.f, 0.f); // dot(p - from, axis) == t
    auto color_at = [&](ImVec2 p) { return fade(gradient_at(g, ImDot(p - from, axis)), alpha); };

    // 1. Outline with vertices where stop lines cross it, so edge colors are exact.
    ImVector<ImVec2> poly;
    poly.reserve(count * 2);
    for (int i = 0; i < count; i++)
    {
        const ImVec2 a = points[i], b = points[(i + 1) % count];
        poly.push_back(a);
        const float ta = ImDot(a - from, axis), tb = ImDot(b - from, axis);
        for (int s = 0; s < g.stop_count; s++)
        {
            const float st = g.stops[s].position;
            if ((st > ta && st < tb) || (st < ta && st > tb))
                poly.push_back(ImLerp(a, b, (st - ta) / (tb - ta)));
        }
    }
    const int n = poly.Size;

    // 2. Anti-aliased fringe, exactly like ImDrawList::AddConvexPolyFilled.
    const bool aa = (dl->Flags & ImDrawListFlags_AntiAliasedFill) != 0;
    const float aa_half = aa ? dl->_FringeScale * 0.5f : 0.f;
    ImVector<ImVec2> normals;
    vertex_normals(poly.Data, n, normals);
    ImVector<ImVec2> inner;
    inner.resize(n);
    for (int i = 0; i < n; i++)
        inner[i] = poly[i] - normals[i] * aa_half;
    const ImVec2 uv = dl->_Data->TexUvWhitePixel;
    if (aa)
    {
        dl->PrimReserve(n * 6, n * 2);
        const unsigned int base = dl->_VtxCurrentIdx;
        for (int i = 0; i < n; i++)
        {
            const ImU32 c = color_at(poly[i]);
            dl->PrimWriteVtx(inner[i], uv, c);
            dl->PrimWriteVtx(poly[i] + normals[i] * aa_half, uv, c & ~IM_COL32_A_MASK);
        }
        for (int i0 = n - 1, i1 = 0; i1 < n; i0 = i1++)
        {
            dl->PrimWriteIdx((ImDrawIdx)(base + (i1 << 1)));
            dl->PrimWriteIdx((ImDrawIdx)(base + (i0 << 1)));
            dl->PrimWriteIdx((ImDrawIdx)(base + (i0 << 1) + 1));
            dl->PrimWriteIdx((ImDrawIdx)(base + (i0 << 1) + 1));
            dl->PrimWriteIdx((ImDrawIdx)(base + (i1 << 1) + 1));
            dl->PrimWriteIdx((ImDrawIdx)(base + (i1 << 1)));
        }
    }

    // 3. Interior split into one convex band per pair of stops, each fanned
    //    with exact per-vertex colors (a single fan would blur middle stops).
    ImVector<ImVec2> band, tmp;
    const int bands = g.stop_count + 1;
    const float axis_len = ImSqrt(ImLengthSqr(axis));
    const ImVec2 unit = axis_len > 0.f ? axis / axis_len : ImVec2(0.f, 1.f);
    for (int k = 0; k < bands; k++)
    {
        band = inner;
        // band k covers t in [stop k-1, stop k]
        if (k > 0 && axis_len > 0.f)
        {
            clip_halfplane(band, tmp, from, unit, g.stops[k - 1].position / axis_len, true);
            band.swap(tmp);
        }
        if (k < g.stop_count && axis_len > 0.f)
        {
            clip_halfplane(band, tmp, from, unit, g.stops[k].position / axis_len, false);
            band.swap(tmp);
        }
        if (axis_len <= 0.f && k > 0)
            break;
        if (band.Size < 3)
            continue;
        dl->PrimReserve((band.Size - 2) * 3, band.Size);
        const unsigned int base = dl->_VtxCurrentIdx;
        for (int i = 0; i < band.Size; i++)
            dl->PrimWriteVtx(band[i], uv, color_at(band[i]));
        for (int i = 2; i < band.Size; i++)
        {
            dl->PrimWriteIdx((ImDrawIdx)base);
            dl->PrimWriteIdx((ImDrawIdx)(base + i - 1));
            dl->PrimWriteIdx((ImDrawIdx)(base + i));
        }
    }
}

void fill(ImDrawList* dl, const ImRect& r, const Radii& radii, const Fill& f, float alpha)
{
    if (f.kind == FillKind::none || r.GetWidth() <= 0.f || r.GetHeight() <= 0.f)
        return;
    if (f.kind == FillKind::solid && radii.is_zero())
    {
        dl->AddRectFilled(r.Min, r.Max, fade(f.color, alpha * f.opacity));
        return;
    }
    path_rect(dl, r, radii);
    fill_path_with(dl, f, r, alpha);
}

void stroke(ImDrawList* dl, const ImRect& r, const Radii& radii, const Stroke& s, float alpha)
{
    if (!s.visible())
        return;
    const ImU32 col = fade(s.color, alpha * s.opacity);
    if (!s.independent())
    {
        const float w = s.weight;
        const float inset = s.align == StrokeAlign::inside ? w * 0.5f : s.align == StrokeAlign::outside ? -w * 0.5f : 0.f;
        const ImRect c(r.Min + ImVec2(inset, inset), r.Max - ImVec2(inset, inset));
        if (c.GetWidth() <= 0.f || c.GetHeight() <= 0.f)
            return;
        path_rect(dl, c, Radii(radii.tl - inset, radii.tr - inset, radii.br - inset, radii.bl - inset));
        dl->PathStroke(col, w, ImDrawFlags_Closed); // 1.92.8+: thickness before flags
        return;
    }

    // Independent sides: fill the ring between the outer and inner outlines.
    // Inner corners are elliptical, so rounded corners taper like Figma's.
    const float wt = s.top >= 0.f ? s.top : s.weight, wr = s.right >= 0.f ? s.right : s.weight;
    const float wb = s.bottom >= 0.f ? s.bottom : s.weight, wl = s.left >= 0.f ? s.left : s.weight;
    const float k_out = s.align == StrokeAlign::inside ? 0.f : s.align == StrokeAlign::outside ? 1.f : 0.5f;
    const ImRect outer(r.Min - ImVec2(wl, wt) * k_out, r.Max + ImVec2(wr, wb) * k_out);
    const ImRect inner(outer.Min + ImVec2(wl, wt), outer.Max - ImVec2(wr, wb));
    const Radii ro = fit(Radii(radii.tl + ImMax(wl, wt) * k_out, radii.tr + ImMax(wr, wt) * k_out, radii.br + ImMax(wr, wb) * k_out, radii.bl + ImMax(wl, wb) * k_out),
                         outer.GetWidth(), outer.GetHeight());
    ContourSpec so{ outer.Min, outer.Max, { { ro.tl, ro.tl }, { ro.tr, ro.tr }, { ro.br, ro.br }, { ro.bl, ro.bl } } };
    ContourSpec si{ inner.Min, ImMax(inner.Max, inner.Min),
                    { { clamp0(ro.tl - wl), clamp0(ro.tl - wt) }, { clamp0(ro.tr - wr), clamp0(ro.tr - wt) }, { clamp0(ro.br - wr), clamp0(ro.br - wb) }, { clamp0(ro.bl - wl), clamp0(ro.bl - wb) } } };
    const Topology t = topology_for(dl, ImMax(ImMax(ro.tl, ro.tr), ImMax(ro.br, ro.bl)), 0.f, 0.f);
    ImVector<ImVec2> po, pi;
    emit_contour(po, so, t);
    emit_contour(pi, si, t);
    // The ring's width at each point (emit_contour's order): a side's weight along it, and around a
    // corner the two sides' weights blended by direction. The distance between the contours won't do:
    // a sharp corner's points all sit at its diagonal, which would bleed into a side with no weight.
    ImVector<float> widths;
    {
        const float a0[4] = { IM_PI, IM_PI * 1.5f, 0.f, IM_PI * 0.5f };
        const float wx[4] = { wl, wr, wr, wl }, wy[4] = { wt, wt, wb, wb }, after[4] = { wt, wr, wb, wl };
        for (int k = 0; k < 4; k++)
        {
            for (int i = 0; i <= t.arc; i++)
            {
                const float a = a0[k] + (IM_PI * 0.5f) * (float)i / (float)t.arc;
                const float x = wx[k] * ImCos(a), y = wy[k] * ImSin(a);
                widths.push_back(ImSqrt(x * x + y * y));
            }
            for (int i = 1; i < t.edge; i++)
                widths.push_back(after[k]);
        }
    }
    const int n = po.Size;
    ImVector<ImVec2> no, ni;
    vertex_normals(po.Data, n, no);
    vertex_normals(pi.Data, n, ni);
    const bool aa = (dl->Flags & ImDrawListFlags_AntiAliasedFill) != 0;
    const float h = aa ? dl->_FringeScale * 0.5f : 0.f;
    const ImU32 clear = col & ~IM_COL32_A_MASK;
    const ImVec2 uv = dl->_Data->TexUvWhitePixel;
    // Four vertices per contour point: outer edge (clear, solid), inner edge (solid, clear).
    dl->PrimReserve(n * 18, n * 4);
    const unsigned int base = dl->_VtxCurrentIdx;
    const float col_alpha = alpha_of(col);
    for (int i = 0; i < n; i++)
    {
        // Coverage follows the local ring width: sides with zero weight vanish
        // (no stray fringe), hairlines thinner than a pixel fade proportionally.
        const ImU32 c = with_alpha(col, col_alpha * ImSaturate(widths[i]));
        dl->PrimWriteVtx(po[i] + no[i] * h, uv, clear);
        dl->PrimWriteVtx(po[i] - no[i] * h, uv, c);
        dl->PrimWriteVtx(pi[i] + ni[i] * h, uv, c);
        dl->PrimWriteVtx(pi[i] - ni[i] * h, uv, clear);
    }
    for (int i = 0; i < n; i++)
    {
        const int j = (i + 1) % n;
        for (int lane = 0; lane < 3; lane++)
        {
            const ImDrawIdx a = (ImDrawIdx)(base + i * 4 + lane), b = (ImDrawIdx)(base + j * 4 + lane);
            const ImDrawIdx c = (ImDrawIdx)(base + j * 4 + lane + 1), d = (ImDrawIdx)(base + i * 4 + lane + 1);
            dl->PrimWriteIdx(a); dl->PrimWriteIdx(b); dl->PrimWriteIdx(c);
            dl->PrimWriteIdx(a); dl->PrimWriteIdx(c); dl->PrimWriteIdx(d);
        }
    }
}

void shadow(ImDrawList* dl, const ImRect& r, const Radii& radii, const Shadow& s, float alpha, bool knockout)
{
    if (!s.visible() || r.GetWidth() <= 0.f || r.GetHeight() <= 0.f)
        return;
    const float peak = alpha_of(s.color) * alpha;
    if (peak <= 0.f)
        return;
    const ImU32 rgb = s.color & ~IM_COL32_A_MASK;
    // A zero blur still gets ~1px of softness so the edge is anti-aliased.
    const float sigma = ImMax(s.blur * 0.5f, 0.35f);
    const float extent = 3.f * sigma;
    const float offset_len = ImMax(ImFabs(s.offset.x), ImFabs(s.offset.y));

    if (!s.inner)
    {
        const ImRect sr(r.Min + s.offset - ImVec2(s.spread, s.spread), r.Max + s.offset + ImVec2(s.spread, s.spread));
        if (sr.GetWidth() <= 0.f || sr.GetHeight() <= 0.f)
            return;
        const Radii srad(radii.tl + s.spread, radii.tr + s.spread, radii.br + s.spread, radii.bl + s.spread);
        const Radii sfit = fit(srad, sr.GetWidth(), sr.GetHeight());
        auto alpha_at = [&](ImVec2 p, int) { return peak * blurred_coverage(sd_rrect(p, sr, sfit), sigma); };

        // Mesh around the original shape (knockout) or around the shadow itself.
        const ImRect base = knockout ? r : sr;
        const Radii base_r = knockout ? radii : srad;
        const float d_out = knockout ? extent + ImMax(s.spread, 0.f) + offset_len : extent;
        const float d_in = knockout ? 0.f : -ImMin(extent, ImMin(sr.GetWidth(), sr.GetHeight()) * 0.5f);
        const int rings = ImClamp((int)ImCeil((d_out - d_in) / ImMax(sigma * 0.6f, 0.5f)), 3, 28);
        const float max_r = ImMax(ImMax(base_r.tl, base_r.tr), ImMax(base_r.br, base_r.bl)) + d_out;
        const Topology t = topology_for(dl, ImMax(max_r, 2.f), ImMax(base.GetWidth(), base.GetHeight()), ImMax(sigma * 2.f, 8.f));
        ImVector<ImVec2> contours[29];
        for (int k = 0; k <= rings; k++)
            emit_contour(contours[k], offset_spec(base, base_r, d_in + (d_out - d_in) * (float)k / (float)rings), t);
        emit_rings(dl, contours, rings + 1, rgb, alpha_at, !knockout);
        return;
    }

    // Inner shadow: the outside of the shape, shifted and shrunk by spread,
    // blurred, seen through the shape. The field is sampled on rings inside
    // the shape; one extra rim contour half a pixel outside the edge fades to
    // nothing, the same anti-aliasing ImGui gives its own fills.
    const ImRect cast(r.Min + s.offset + ImVec2(s.spread, s.spread), r.Max + s.offset - ImVec2(s.spread, s.spread));
    const Radii crad(radii.tl - s.spread, radii.tr - s.spread, radii.br - s.spread, radii.bl - s.spread);
    const bool empty = cast.GetWidth() <= 0.f || cast.GetHeight() <= 0.f;
    const Radii cfit = empty ? Radii() : fit(crad, cast.GetWidth(), cast.GetHeight());
    const float half_min = ImMin(r.GetWidth(), r.GetHeight()) * 0.5f;
    const float depth = ImMin(extent + offset_len + ImMax(s.spread, 0.f), half_min);
    const float aa_half = (dl->Flags & ImDrawListFlags_AntiAliasedFill) ? dl->_FringeScale * 0.5f : 0.f;
    const int rings = ImClamp((int)ImCeil(depth / ImMax(sigma * 0.6f, 0.5f)), 2, 28);
    const Topology t = topology_for(dl, ImMax(ImMax(radii.tl, radii.tr), ImMax(radii.br, radii.bl)), ImMax(r.GetWidth(), r.GetHeight()), ImMax(sigma * 2.f, 8.f));
    ImVector<ImVec2> contours[31];
    int count = 0;
    for (int k = 0; k <= rings; k++)
        emit_contour(contours[count++], offset_spec(r, radii, -depth + (depth - aa_half) * (float)k / (float)rings), t);
    emit_contour(contours[count++], offset_spec(r, radii, aa_half), t);
    const int rim = count - 1;
    auto alpha_at = [&](ImVec2 p, int k) {
        if (k == rim)
            return 0.f;
        return empty ? peak : peak * blurred_coverage(-sd_rrect(p, cast, cfit), sigma);
    };
    emit_rings(dl, contours, count, rgb, alpha_at, depth >= half_min - 0.01f);
}

void image(ImDrawList* dl, const ImRect& r, int asset, ImU32 tint, float alpha)
{
    const ImTextureID tex = ff::image_texture(asset);
    const ImU32 col = fade(tint, alpha * ff::alpha());
    if (tex == ImTextureID_Invalid || (col & IM_COL32_A_MASK) == 0)
        return;
    dl->AddImage(ImTextureRef(tex), r.Min, r.Max, ImVec2(0.f, 0.f), ImVec2(1.f, 1.f), col);
}

void box(ImDrawList* dl, const ImRect& r, const Box& b, float alpha)
{
    alpha *= b.opacity * ff::alpha();
    if (alpha <= 0.f)
        return;
    const bool opaque = is_opaque(b);
    for (const Shadow& s : b.shadows)
        if (!s.inner)
            shadow(dl, r, b.radii, s, alpha, !s.show_behind && !opaque);
    if (b.backdrop_blur > 0.f)
        backdrop(dl, r, b, alpha);
    for (const Fill& f : b.fills)
        fill(dl, r, b.radii, f, alpha);
    for (const Shadow& s : b.shadows)
        if (s.inner)
            shadow(dl, r, b.radii, s, alpha);
    stroke(dl, r, b.radii, b.stroke, alpha);
}

void ellipse(ImDrawList* dl, const ImRect& r, const Box& b, float alpha)
{
    alpha *= b.opacity * ff::alpha();
    if (alpha <= 0.f)
        return;
    // Shadows and strokes of ellipses use the stadium-rounded rect, exact for circles.
    const Radii round(ImMin(r.GetWidth(), r.GetHeight()) * 0.5f);
    const bool opaque = is_opaque(b);
    for (const Shadow& s : b.shadows)
        if (!s.inner)
            shadow(dl, r, round, s, alpha, !s.show_behind && !opaque);
    for (const Fill& f : b.fills)
    {
        if (f.kind == FillKind::none)
            continue;
        path_ellipse(dl, r);
        fill_path_with(dl, f, r, alpha);
    }
    for (const Shadow& s : b.shadows)
        if (s.inner)
            shadow(dl, r, round, s, alpha);
    if (b.stroke.visible() && !b.stroke.independent())
    {
        const float w = b.stroke.weight;
        const float inset = b.stroke.align == StrokeAlign::inside ? w * 0.5f : b.stroke.align == StrokeAlign::outside ? -w * 0.5f : 0.f;
        path_ellipse(dl, ImRect(r.Min + ImVec2(inset, inset), r.Max - ImVec2(inset, inset)));
        dl->PathStroke(fade(b.stroke.color, alpha * b.stroke.opacity), w, ImDrawFlags_Closed);
    }
}

Radii mix(const Radii& a, const Radii& b, float t)
{
    return Radii(ImLerp(a.tl, b.tl, t), ImLerp(a.tr, b.tr, t), ImLerp(a.br, b.br, t), ImLerp(a.bl, b.bl, t));
}

Fill mix(const Fill& a, const Fill& b, float t)
{
    if (t <= 0.f)
        return a;
    if (t >= 1.f)
        return b;
    if (a.kind == FillKind::none && b.kind == FillKind::none)
        return a;
    // A missing layer fades in or out from a transparent copy of the other.
    if (a.kind == FillKind::none || b.kind == FillKind::none)
    {
        Fill f = a.kind == FillKind::none ? b : a;
        f.opacity *= a.kind == FillKind::none ? t : (1.f - t);
        return f;
    }
    Fill f = t < 0.5f ? a : b;
    f.opacity = ImLerp(a.opacity, b.opacity, t);
    if (a.kind == FillKind::solid && b.kind == FillKind::solid)
        f.color = mix(a.color, b.color, t);
    else if (a.kind == FillKind::linear && b.kind == FillKind::linear && a.gradient.stop_count == b.gradient.stop_count)
    {
        f.gradient.from = ImLerp(a.gradient.from, b.gradient.from, t);
        f.gradient.to = ImLerp(a.gradient.to, b.gradient.to, t);
        for (int i = 0; i < a.gradient.stop_count; i++)
        {
            f.gradient.stops[i].position = ImLerp(a.gradient.stops[i].position, b.gradient.stops[i].position, t);
            f.gradient.stops[i].color = mix(a.gradient.stops[i].color, b.gradient.stops[i].color, t);
        }
    }
    else if (a.kind == FillKind::solid && b.kind == FillKind::linear)
    {
        f = b;
        for (int i = 0; i < f.gradient.stop_count; i++)
            f.gradient.stops[i].color = mix(a.color, b.gradient.stops[i].color, t);
    }
    else if (a.kind == FillKind::linear && b.kind == FillKind::solid)
    {
        f = a;
        for (int i = 0; i < f.gradient.stop_count; i++)
            f.gradient.stops[i].color = mix(a.gradient.stops[i].color, b.color, t);
    }
    else if (a.kind == FillKind::image && b.kind == FillKind::image)
        f.color = mix(a.color, b.color, t);
    return f;
}

Shadow mix(const Shadow& a, const Shadow& b, float t)
{
    if (t <= 0.f)
        return a;
    if (t >= 1.f)
        return b;
    Shadow s = t < 0.5f ? a : b;
    const bool a_on = a.visible(), b_on = b.visible();
    if (a_on && !b_on)
        s = a, s.color = fade(a.color, 1.f - t);
    else if (!a_on && b_on)
        s = b, s.color = fade(b.color, t);
    else
    {
        s.color = mix(a.color, b.color, t);
        s.offset = ImLerp(a.offset, b.offset, t);
        s.blur = ImLerp(a.blur, b.blur, t);
        s.spread = ImLerp(a.spread, b.spread, t);
    }
    return s;
}

Stroke mix(const Stroke& a, const Stroke& b, float t)
{
    if (t <= 0.f)
        return a;
    if (t >= 1.f)
        return b;
    Stroke s = t < 0.5f ? a : b;
    const bool a_on = a.visible(), b_on = b.visible();
    if (a_on && !b_on)
        s = a, s.opacity = a.opacity * (1.f - t);
    else if (!a_on && b_on)
        s = b, s.opacity = b.opacity * t;
    else
    {
        s.color = mix(a.color, b.color, t);
        s.weight = ImLerp(a.weight, b.weight, t);
        s.opacity = ImLerp(a.opacity, b.opacity, t);
    }
    return s;
}

Box mix(const Box& a, const Box& b, float t)
{
    if (t <= 0.f)
        return a;
    if (t >= 1.f)
        return b;
    Box o{};
    for (int i = 0; i < Box::max_fills; i++)
        o.fills[i] = mix(a.fills[i], b.fills[i], t);
    for (int i = 0; i < Box::max_shadows; i++)
        o.shadows[i] = mix(a.shadows[i], b.shadows[i], t);
    o.radii = mix(a.radii, b.radii, t);
    o.stroke = mix(a.stroke, b.stroke, t);
    o.opacity = ImLerp(a.opacity, b.opacity, t);
    o.backdrop_blur = ImLerp(a.backdrop_blur, b.backdrop_blur, t);
    return o;
}

} // namespace ff::draw
