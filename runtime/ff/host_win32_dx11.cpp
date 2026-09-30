// Figflow runtime: Win32 + DirectX 11 host. See host.h.
// Based on Dear ImGui's examples/example_win32_directx11/main.cpp.
#include "host.h"
#include "draw.h"
#include "image.h"

#include "imgui_impl_dx11.h"
#include "imgui_impl_win32.h"
#include "imgui_internal.h"

#include <d3d11.h>
#include <d3dcompiler.h>
#include <dwmapi.h>
#include <windows.h>

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "stb_image_write.h"

#pragma comment(lib, "d3d11.lib")
#pragma comment(lib, "dwmapi.lib")

extern IMGUI_IMPL_API LRESULT ImGui_ImplWin32_WndProcHandler(HWND hWnd, UINT msg, WPARAM wParam, LPARAM lParam);

namespace ff {

namespace {

struct State
{
    HostConfig config;
    HWND hwnd = nullptr;
    WNDCLASSEXW wc{};
    ID3D11Device* device = nullptr;
    ID3D11DeviceContext* context = nullptr;
    IDXGISwapChain* swap_chain = nullptr;
    ID3D11RenderTargetView* rtv = nullptr;
    bool occluded = false;
    UINT resize_w = 0, resize_h = 0;
    bool quit = false;

    // capture mode
    const char* capture_path = nullptr;
    int capture_frames = 60;
    int frame_index = 0;
    ID3D11Texture2D* capture_tex = nullptr;
    ID3D11RenderTargetView* capture_rtv = nullptr;

    ImVec2 design_origin{ 0.f, 0.f };
    ImGuiWindow* design_window = nullptr;

    // scripted input (FIGFLOW_SCRIPT, capture mode only)
    struct Step
    {
        enum Kind { move, down, up, type, key, wait, shot } kind;
        float x = 0.f, y = 0.f;
        int n = 0;
        std::string text;
    };
    std::vector<Step> script;
    size_t script_pos = 0;
    int script_wait = 0;
    std::vector<ImGuiKey> keys_down;
    std::string shot_path;
};

State g;

// "click 300 380; wait 20; type hello; key Enter; shot out.png": each step
// takes a frame (move takes none; wait N takes N), frames are 1/60 s apart.
bool parse_script(const char* src)
{
    const std::string all(src);
    size_t start = 0;
    while (start <= all.size())
    {
        size_t end = all.find(';', start);
        if (end == std::string::npos)
            end = all.size();
        std::string cmd = all.substr(start, end - start);
        start = end + 1;
        const size_t a = cmd.find_first_not_of(" \t\r\n");
        if (a == std::string::npos)
            continue;
        cmd = cmd.substr(a, cmd.find_last_not_of(" \t\r\n") - a + 1);
        const size_t sp = cmd.find(' ');
        const std::string verb = cmd.substr(0, sp);
        const std::string arg = sp == std::string::npos ? "" : cmd.substr(sp + 1);
        State::Step st{};
        float x = 0.f, y = 0.f;
        if ((verb == "move" || verb == "click") && std::sscanf(arg.c_str(), "%f %f", &x, &y) == 2)
        {
            st.kind = State::Step::move, st.x = x, st.y = y;
            g.script.push_back(st);
            if (verb == "click")
            {
                g.script.push_back(State::Step{ State::Step::down });
                g.script.push_back(State::Step{ State::Step::up });
            }
        }
        else if (verb == "down" || verb == "up")
            g.script.push_back(State::Step{ verb == "down" ? State::Step::down : State::Step::up });
        else if (verb == "type" || verb == "key" || verb == "shot")
        {
            st.kind = verb == "type" ? State::Step::type : verb == "key" ? State::Step::key : State::Step::shot;
            st.text = arg;
            g.script.push_back(st);
        }
        else if (verb == "wait")
        {
            st.kind = State::Step::wait, st.n = ImMax(1, std::atoi(arg.c_str()));
            g.script.push_back(st);
        }
        else
        {
            std::fprintf(stderr, "FIGFLOW_SCRIPT: unknown step \"%s\"\n", cmd.c_str());
            return false;
        }
    }
    return true;
}

ImGuiKey key_by_name(const std::string& name)
{
    for (int k = ImGuiKey_NamedKey_BEGIN; k < ImGuiKey_NamedKey_END; k++)
        if (_stricmp(ImGui::GetKeyName((ImGuiKey)k), name.c_str()) == 0)
            return (ImGuiKey)k;
    return ImGuiKey_None;
}

// Feeds this frame's scripted input. Returns false when the script is done.
bool run_script(ImGuiIO& io)
{
    for (ImGuiKey k : g.keys_down)
        io.AddKeyEvent(k, false);
    g.keys_down.clear();
    if (g.script_wait > 0)
    {
        g.script_wait--;
        return true;
    }
    while (g.script_pos < g.script.size())
    {
        const State::Step& st = g.script[g.script_pos++];
        switch (st.kind)
        {
        case State::Step::move:
            io.AddMousePosEvent(st.x, st.y);
            continue; // moving takes no frame of its own
        case State::Step::down:
            io.AddMouseButtonEvent(ImGuiMouseButton_Left, true);
            return true;
        case State::Step::up:
            io.AddMouseButtonEvent(ImGuiMouseButton_Left, false);
            return true;
        case State::Step::type:
            io.AddInputCharactersUTF8(st.text.c_str());
            return true;
        case State::Step::key:
            if (const ImGuiKey k = key_by_name(st.text))
            {
                io.AddKeyEvent(k, true);
                g.keys_down.push_back(k);
            }
            else
                std::fprintf(stderr, "FIGFLOW_SCRIPT: unknown key \"%s\"\n", st.text.c_str());
            return true;
        case State::Step::wait:
            g.script_wait = st.n - 1;
            return true;
        case State::Step::shot:
            g.shot_path = st.text;
            return true;
        }
    }
    return false;
}

void create_render_target()
{
    ID3D11Texture2D* back = nullptr;
    g.swap_chain->GetBuffer(0, IID_PPV_ARGS(&back));
    if (back)
    {
        g.device->CreateRenderTargetView(back, nullptr, &g.rtv);
        back->Release();
    }
}

void cleanup_render_target()
{
    if (g.rtv)
    {
        g.rtv->Release();
        g.rtv = nullptr;
    }
}

bool create_device(HWND hwnd)
{
    DXGI_SWAP_CHAIN_DESC sd{};
    sd.BufferCount = 2;
    sd.BufferDesc.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
    sd.BufferDesc.RefreshRate.Numerator = 60;
    sd.BufferDesc.RefreshRate.Denominator = 1;
    sd.Flags = DXGI_SWAP_CHAIN_FLAG_ALLOW_MODE_SWITCH;
    sd.BufferUsage = DXGI_USAGE_RENDER_TARGET_OUTPUT;
    sd.OutputWindow = hwnd;
    sd.SampleDesc.Count = 1;
    sd.Windowed = TRUE;
    // Blt model: DWM composites the back buffer's alpha, which is what makes
    // the transparent parts of the window see-through.
    sd.SwapEffect = DXGI_SWAP_EFFECT_DISCARD;

    const D3D_FEATURE_LEVEL levels[2] = { D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_10_0 };
    D3D_FEATURE_LEVEL level;
    HRESULT hr = D3D11CreateDeviceAndSwapChain(nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr, 0, levels, 2, D3D11_SDK_VERSION, &sd, &g.swap_chain, &g.device, &level, &g.context);
    if (hr == DXGI_ERROR_UNSUPPORTED)
        hr = D3D11CreateDeviceAndSwapChain(nullptr, D3D_DRIVER_TYPE_WARP, nullptr, 0, levels, 2, D3D11_SDK_VERSION, &sd, &g.swap_chain, &g.device, &level, &g.context);
    if (hr != S_OK)
        return false;
    create_render_target();
    return true;
}

void cleanup_device()
{
    cleanup_render_target();
    if (g.capture_rtv) g.capture_rtv->Release(), g.capture_rtv = nullptr;
    if (g.capture_tex) g.capture_tex->Release(), g.capture_tex = nullptr;
    if (g.swap_chain) g.swap_chain->Release(), g.swap_chain = nullptr;
    if (g.context) g.context->Release(), g.context = nullptr;
    if (g.device) g.device->Release(), g.device = nullptr;
}

ImTextureID create_texture(const unsigned char* rgba, int w, int h)
{
    D3D11_TEXTURE2D_DESC desc{};
    desc.Width = (UINT)w;
    desc.Height = (UINT)h;
    desc.MipLevels = 1;
    desc.ArraySize = 1;
    desc.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
    desc.SampleDesc.Count = 1;
    desc.Usage = D3D11_USAGE_IMMUTABLE;
    desc.BindFlags = D3D11_BIND_SHADER_RESOURCE;
    D3D11_SUBRESOURCE_DATA init{ rgba, (UINT)(w * 4), 0 };
    ID3D11Texture2D* tex = nullptr;
    if (FAILED(g.device->CreateTexture2D(&desc, &init, &tex)))
        return ImTextureID_Invalid;
    ID3D11ShaderResourceView* srv = nullptr;
    D3D11_SHADER_RESOURCE_VIEW_DESC sv{};
    sv.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
    sv.ViewDimension = D3D11_SRV_DIMENSION_TEXTURE2D;
    sv.Texture2D.MipLevels = 1;
    g.device->CreateShaderResourceView(tex, &sv, &srv);
    tex->Release();
    return (ImTextureID)(intptr_t)srv;
}

bool create_capture_target(int w, int h)
{
    D3D11_TEXTURE2D_DESC desc{};
    desc.Width = (UINT)w;
    desc.Height = (UINT)h;
    desc.MipLevels = 1;
    desc.ArraySize = 1;
    desc.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
    desc.SampleDesc.Count = 1;
    desc.Usage = D3D11_USAGE_DEFAULT;
    desc.BindFlags = D3D11_BIND_RENDER_TARGET | D3D11_BIND_SHADER_RESOURCE;
    if (FAILED(g.device->CreateTexture2D(&desc, nullptr, &g.capture_tex)))
        return false;
    return SUCCEEDED(g.device->CreateRenderTargetView(g.capture_tex, nullptr, &g.capture_rtv));
}

bool write_capture(const char* path)
{
    D3D11_TEXTURE2D_DESC desc;
    g.capture_tex->GetDesc(&desc);
    desc.Usage = D3D11_USAGE_STAGING;
    desc.BindFlags = 0;
    desc.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
    ID3D11Texture2D* staging = nullptr;
    if (FAILED(g.device->CreateTexture2D(&desc, nullptr, &staging)))
        return false;
    g.context->CopyResource(staging, g.capture_tex);
    D3D11_MAPPED_SUBRESOURCE map;
    bool ok = false;
    if (SUCCEEDED(g.context->Map(staging, 0, D3D11_MAP_READ, 0, &map)))
    {
        // Blending onto transparent black accumulates premultiplied color
        // (ImGui's blend: rgb = src*a + dst*(1-a), alpha = a + dst_a*(1-a));
        // PNG wants straight alpha, so divide it back out.
        const int w = (int)desc.Width, h = (int)desc.Height;
        unsigned char* pixels = (unsigned char*)std::malloc((size_t)w * h * 4);
        for (int y = 0; y < h; y++)
        {
            const unsigned char* src = (const unsigned char*)map.pData + (size_t)y * map.RowPitch;
            unsigned char* dst = pixels + (size_t)y * w * 4;
            for (int x = 0; x < w; x++, src += 4, dst += 4)
            {
                const int a = src[3];
                for (int c = 0; c < 3; c++)
                    dst[c] = a == 0 ? 0 : (unsigned char)ImMin(255, (src[c] * 255 + a / 2) / a);
                dst[3] = (unsigned char)a;
            }
        }
        g.context->Unmap(staging, 0);
        ok = stbi_write_png(path, w, h, 4, pixels, w * 4) != 0;
        std::free(pixels);
    }
    staging->Release();
    return ok;
}

LRESULT WINAPI wnd_proc(HWND hwnd, UINT msg, WPARAM wparam, LPARAM lparam)
{
    if (ImGui_ImplWin32_WndProcHandler(hwnd, msg, wparam, lparam))
        return true;
    switch (msg)
    {
    case WM_SIZE:
        if (wparam == SIZE_MINIMIZED)
            return 0;
        g.resize_w = (UINT)LOWORD(lparam);
        g.resize_h = (UINT)HIWORD(lparam);
        return 0;
    case WM_SYSCOMMAND:
        if ((wparam & 0xfff0) == SC_KEYMENU)
            return 0;
        break;
    case WM_DESTROY:
        ::PostQuitMessage(0);
        return 0;
    }
    return ::DefWindowProcW(hwnd, msg, wparam, lparam);
}

// ---------------------------------------------------------------------------
// Background blur (Figma's). At the point in the frame where a layer's
// backdrop is needed, a draw callback copies what has been drawn under the
// layer's bounds, blurs it on the GPU (two separable Gaussian passes; the
// sampler mirrors at the edges, as Figma does), and the layer then draws the
// result as a textured shape. Large radii blur at a lower resolution: the
// result is smooth anyway, and it keeps the kernel small.

namespace blur {

constexpr int kMaxTaps = 64;

struct Job
{
    int w = 0, h = 0, down = 1; // copied size, downsampling factor
    ID3D11Texture2D* copy = nullptr;
    ID3D11ShaderResourceView* copy_srv = nullptr;
    ID3D11Texture2D* a = nullptr;
    ID3D11RenderTargetView* a_rtv = nullptr;
    ID3D11ShaderResourceView* a_srv = nullptr;
    ID3D11Texture2D* b = nullptr;
    ID3D11RenderTargetView* b_rtv = nullptr;
    ID3D11ShaderResourceView* b_srv = nullptr;
    ImRect bounds;   // screen space
    float sigma = 0.f; // pixels
};

struct Constants
{
    float step[2];
    float taps;
    float pad;
    float weights[kMaxTaps][4];
};

struct Resources
{
    bool tried = false, ok = false;
    ID3D11VertexShader* vs = nullptr;
    ID3D11PixelShader* ps = nullptr;
    ID3D11Buffer* cb = nullptr;
    ID3D11SamplerState* mirror = nullptr;
    ID3D11RasterizerState* rs = nullptr;
    ID3D11BlendState* bs = nullptr;
    ID3D11DepthStencilState* ds = nullptr;
    std::vector<Job> jobs;
    int used = 0; // jobs used this frame
};

Resources r;

template <class T>
void release(T*& p)
{
    if (p)
        p->Release(), p = nullptr;
}

void release_job(Job& j)
{
    release(j.copy), release(j.copy_srv), release(j.a), release(j.a_rtv), release(j.a_srv), release(j.b), release(j.b_rtv), release(j.b_srv);
    j.w = j.h = 0;
}

void shutdown()
{
    for (Job& j : r.jobs)
        release_job(j);
    r.jobs.clear();
    release(r.vs), release(r.ps), release(r.cb), release(r.mirror), release(r.rs), release(r.bs), release(r.ds);
    r.tried = r.ok = false;
}

bool init(ID3D11Device* dev)
{
    if (r.tried)
        return r.ok;
    r.tried = true;
    static const char* vs_src =
        "struct O { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; };\n"
        "O main(uint id : SV_VertexID) { O o; float2 uv = float2((id << 1) & 2, id & 2);\n"
        "  o.uv = uv; o.pos = float4(uv * float2(2, -2) + float2(-1, 1), 0, 1); return o; }\n";
    static const char* ps_src =
        "cbuffer C : register(b0) { float2 step; float taps; float pad; float4 weights[64]; };\n"
        "Texture2D t : register(t0); SamplerState s : register(s0);\n"
        "float4 main(float4 pos : SV_POSITION, float2 uv : TEXCOORD0) : SV_Target {\n"
        "  float4 acc = t.Sample(s, uv) * weights[0].x;\n"
        "  for (int i = 1; i < (int)taps; i++) acc += (t.Sample(s, uv + step * i) + t.Sample(s, uv - step * i)) * weights[i].x;\n"
        "  return acc; }\n";
    ID3DBlob* blob = nullptr;
    if (FAILED(D3DCompile(vs_src, strlen(vs_src), nullptr, nullptr, nullptr, "main", "vs_4_0", 0, 0, &blob, nullptr)))
        return false;
    HRESULT hr = dev->CreateVertexShader(blob->GetBufferPointer(), blob->GetBufferSize(), nullptr, &r.vs);
    blob->Release();
    if (FAILED(hr) || FAILED(D3DCompile(ps_src, strlen(ps_src), nullptr, nullptr, nullptr, "main", "ps_4_0", 0, 0, &blob, nullptr)))
        return false;
    hr = dev->CreatePixelShader(blob->GetBufferPointer(), blob->GetBufferSize(), nullptr, &r.ps);
    blob->Release();
    if (FAILED(hr))
        return false;

    D3D11_BUFFER_DESC cb{};
    cb.ByteWidth = sizeof(Constants);
    cb.Usage = D3D11_USAGE_DYNAMIC;
    cb.BindFlags = D3D11_BIND_CONSTANT_BUFFER;
    cb.CPUAccessFlags = D3D11_CPU_ACCESS_WRITE;
    D3D11_SAMPLER_DESC sd{};
    sd.Filter = D3D11_FILTER_MIN_MAG_MIP_LINEAR;
    sd.AddressU = sd.AddressV = sd.AddressW = D3D11_TEXTURE_ADDRESS_MIRROR;
    sd.ComparisonFunc = D3D11_COMPARISON_ALWAYS;
    sd.MaxLOD = D3D11_FLOAT32_MAX;
    D3D11_RASTERIZER_DESC rd{};
    rd.FillMode = D3D11_FILL_SOLID;
    rd.CullMode = D3D11_CULL_NONE;
    rd.DepthClipEnable = TRUE;
    D3D11_BLEND_DESC bd{};
    bd.RenderTarget[0].RenderTargetWriteMask = D3D11_COLOR_WRITE_ENABLE_ALL;
    D3D11_DEPTH_STENCIL_DESC dd{};
    dd.DepthFunc = D3D11_COMPARISON_ALWAYS;
    r.ok = SUCCEEDED(dev->CreateBuffer(&cb, nullptr, &r.cb)) && SUCCEEDED(dev->CreateSamplerState(&sd, &r.mirror)) && SUCCEEDED(dev->CreateRasterizerState(&rd, &r.rs)) &&
           SUCCEEDED(dev->CreateBlendState(&bd, &r.bs)) && SUCCEEDED(dev->CreateDepthStencilState(&dd, &r.ds));
    return r.ok;
}

bool make_target(ID3D11Device* dev, int w, int h, ID3D11Texture2D** tex, ID3D11RenderTargetView** rtv, ID3D11ShaderResourceView** srv)
{
    D3D11_TEXTURE2D_DESC td{};
    td.Width = (UINT)w;
    td.Height = (UINT)h;
    td.MipLevels = 1;
    td.ArraySize = 1;
    td.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
    td.SampleDesc.Count = 1;
    td.Usage = D3D11_USAGE_DEFAULT;
    td.BindFlags = D3D11_BIND_SHADER_RESOURCE | (rtv ? D3D11_BIND_RENDER_TARGET : 0);
    if (FAILED(dev->CreateTexture2D(&td, nullptr, tex)))
        return false;
    if (rtv && FAILED(dev->CreateRenderTargetView(*tex, nullptr, rtv)))
        return false;
    return SUCCEEDED(dev->CreateShaderResourceView(*tex, nullptr, srv));
}

// Makes sure the job's textures fit; returns false when the GPU refuses.
bool prepare(ID3D11Device* dev, Job& j, int w, int h, int down)
{
    if (j.w == w && j.h == h && j.down == down && j.b_srv)
        return true;
    release_job(j);
    const int sw = ImMax(1, (w + down - 1) / down), sh = ImMax(1, (h + down - 1) / down);
    if (!make_target(dev, w, h, &j.copy, nullptr, &j.copy_srv) || !make_target(dev, sw, sh, &j.a, &j.a_rtv, &j.a_srv) || !make_target(dev, sw, sh, &j.b, &j.b_rtv, &j.b_srv))
    {
        release_job(j);
        return false;
    }
    j.w = w, j.h = h, j.down = down;
    return true;
}

// One separable pass: `src` sampled every `spacing` source texels along `dir`.
void pass(ID3D11DeviceContext* ctx, ID3D11ShaderResourceView* src, int src_w, int src_h, ID3D11RenderTargetView* dst, int dst_w, int dst_h, ImVec2 dir, float spacing, float sigma_taps)
{
    Constants c{};
    const int taps = ImClamp((int)ceilf(sigma_taps * 3.f) + 1, 1, kMaxTaps);
    float sum = 0.f;
    for (int i = 0; i < taps; i++)
    {
        const float wgt = sigma_taps > 0.01f ? expf(-(float)(i * i) / (2.f * sigma_taps * sigma_taps)) : (i == 0 ? 1.f : 0.f);
        c.weights[i][0] = wgt;
        sum += i == 0 ? wgt : 2.f * wgt;
    }
    for (int i = 0; i < taps; i++)
        c.weights[i][0] /= sum;
    c.taps = (float)taps;
    c.step[0] = dir.x * spacing / (float)src_w;
    c.step[1] = dir.y * spacing / (float)src_h;
    D3D11_MAPPED_SUBRESOURCE m;
    if (SUCCEEDED(ctx->Map(r.cb, 0, D3D11_MAP_WRITE_DISCARD, 0, &m)))
    {
        memcpy(m.pData, &c, sizeof(c));
        ctx->Unmap(r.cb, 0);
    }
    ID3D11ShaderResourceView* none = nullptr;
    ctx->PSSetShaderResources(0, 1, &none);
    ctx->OMSetRenderTargets(1, &dst, nullptr);
    D3D11_VIEWPORT vp{ 0.f, 0.f, (float)dst_w, (float)dst_h, 0.f, 1.f };
    ctx->RSSetViewports(1, &vp);
    ctx->PSSetShaderResources(0, 1, &src);
    ctx->Draw(3, 0);
}

// Draw callback: copy the bounds' pixels from the current target and blur them.
void run(const ImDrawList*, const ImDrawCmd* cmd)
{
    const int index = (int)(intptr_t)cmd->UserCallbackData;
    if (index < 0 || index >= (int)r.jobs.size())
        return;
    Job& j = r.jobs[index];
    ID3D11DeviceContext* ctx = g.context;
    ID3D11RenderTargetView* target = nullptr;
    ctx->OMGetRenderTargets(1, &target, nullptr);
    if (!target)
        return;
    ID3D11Resource* res = nullptr;
    target->GetResource(&res);
    ID3D11Texture2D* tex = nullptr;
    if (res && SUCCEEDED(res->QueryInterface(IID_PPV_ARGS(&tex))))
    {
        D3D11_TEXTURE2D_DESC td;
        tex->GetDesc(&td);
        const ImVec2 origin = ImGui::GetDrawData()->DisplayPos;
        const int x0 = (int)floorf(j.bounds.Min.x - origin.x), y0 = (int)floorf(j.bounds.Min.y - origin.y);
        // Only the part inside the target exists; the copy keeps the job's size.
        D3D11_BOX box{ (UINT)ImClamp(x0, 0, (int)td.Width), (UINT)ImClamp(y0, 0, (int)td.Height), 0, (UINT)ImClamp(x0 + j.w, 0, (int)td.Width), (UINT)ImClamp(y0 + j.h, 0, (int)td.Height), 1 };
        if (box.right > box.left && box.bottom > box.top && td.Format == DXGI_FORMAT_R8G8B8A8_UNORM)
        {
            ctx->CopySubresourceRegion(j.copy, 0, (UINT)((int)box.left - x0), (UINT)((int)box.top - y0), 0, tex, 0, &box);
            ctx->VSSetShader(r.vs, nullptr, 0);
            ctx->PSSetShader(r.ps, nullptr, 0);
            ctx->PSSetConstantBuffers(0, 1, &r.cb);
            ctx->PSSetSamplers(0, 1, &r.mirror);
            ctx->IASetInputLayout(nullptr);
            ctx->IASetPrimitiveTopology(D3D11_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
            ctx->RSSetState(r.rs);
            const float blend[4] = { 0.f, 0.f, 0.f, 0.f };
            ctx->OMSetBlendState(r.bs, blend, 0xffffffff);
            ctx->OMSetDepthStencilState(r.ds, 0);
            const int sw = ImMax(1, (j.w + j.down - 1) / j.down), sh = ImMax(1, (j.h + j.down - 1) / j.down);
            const float sigma_taps = j.sigma / (float)j.down;
            pass(ctx, j.copy_srv, j.w, j.h, j.a_rtv, sw, sh, ImVec2(1.f, 0.f), (float)j.down, sigma_taps); // horizontal, downsampling
            pass(ctx, j.a_srv, sw, sh, j.b_rtv, sw, sh, ImVec2(0.f, 1.f), 1.f, sigma_taps);                // vertical
            ID3D11ShaderResourceView* none = nullptr;
            ctx->PSSetShaderResources(0, 1, &none);
        }
        tex->Release();
    }
    if (res)
        res->Release();
    ctx->OMSetRenderTargets(1, &target, nullptr); // the backend's state reset doesn't restore the target
    target->Release();
}

// Adds a textured copy of `shape` (or of the band `ring` wide inside it) to `dl`,
// mapping `bounds` to the whole texture.
void draw_shape(ImDrawList* dl, ImTextureID tex, const ImRect& bounds, const ImRect& shape, const ff::Radii& radii, float ring, ImU32 col)
{
    const ImVec2 uv_scale(1.f / ImMax(1.f, bounds.GetWidth()), 1.f / ImMax(1.f, bounds.GetHeight()));
    const auto uv = [&](ImVec2 p) { return ImVec2((p.x - bounds.Min.x) * uv_scale.x, (p.y - bounds.Min.y) * uv_scale.y); };
    dl->PushTexture(ImTextureRef(tex));
    if (ring <= 0.f)
    {
        const int start = dl->VtxBuffer.Size;
        ff::draw::path_rect(dl, shape, radii);
        dl->PathFillConvex(col);
        ImGui::ShadeVertsLinearUV(dl, start, dl->VtxBuffer.Size, shape.Min, shape.Max, uv(shape.Min), uv(shape.Max), true);
    }
    else
    {
        // Outer and inner outlines with matching points, joined by quads.
        constexpr int seg = 12;
        const auto outline = [&](const ImRect& rc, float inset, ImVector<ImVec2>& out) {
            const float rr[4] = { ImMax(0.f, radii.tl - inset), ImMax(0.f, radii.tr - inset), ImMax(0.f, radii.br - inset), ImMax(0.f, radii.bl - inset) };
            const ImVec2 c[4] = { ImVec2(rc.Min.x + rr[0], rc.Min.y + rr[0]), ImVec2(rc.Max.x - rr[1], rc.Min.y + rr[1]), ImVec2(rc.Max.x - rr[2], rc.Max.y - rr[2]), ImVec2(rc.Min.x + rr[3], rc.Max.y - rr[3]) };
            for (int k = 0; k < 4; k++)
                for (int i = 0; i <= seg; i++)
                {
                    const float a = IM_PI * (1.f + 0.5f * (float)k) + IM_PI * 0.5f * (float)i / (float)seg;
                    out.push_back(ImVec2(c[k].x + cosf(a) * rr[k], c[k].y + sinf(a) * rr[k]));
                }
        };
        ImVector<ImVec2> outer, inner;
        outline(shape, 0.f, outer);
        outline(ImRect(shape.Min + ImVec2(ring, ring), shape.Max - ImVec2(ring, ring)), ring, inner);
        const int n = outer.Size;
        dl->PrimReserve(n * 6, n * 2);
        const ImDrawIdx base = (ImDrawIdx)dl->_VtxCurrentIdx;
        for (int i = 0; i < n; i++)
        {
            dl->PrimWriteVtx(outer[i], uv(outer[i]), col);
            dl->PrimWriteVtx(inner[i], uv(inner[i]), col);
        }
        for (int i = 0; i < n; i++)
        {
            const ImDrawIdx o0 = (ImDrawIdx)(base + i * 2), i0 = (ImDrawIdx)(o0 + 1);
            const ImDrawIdx o1 = (ImDrawIdx)(base + ((i + 1) % n) * 2), i1 = (ImDrawIdx)(o1 + 1);
            dl->PrimWriteIdx(o0), dl->PrimWriteIdx(o1), dl->PrimWriteIdx(i1);
            dl->PrimWriteIdx(o0), dl->PrimWriteIdx(i1), dl->PrimWriteIdx(i0);
        }
    }
    dl->PopTexture();
}

// Backend entry point (see ff::Backend::backdrop_blur).
void backdrop(ImDrawList* dl, const ImRect& bounds, const ImRect& shape, const ff::Radii& radii, float ring, float radius, float alpha)
{
    const int w = (int)ceilf(bounds.GetWidth()), h = (int)ceilf(bounds.GetHeight());
    if (w < 1 || h < 1 || !init(g.device))
        return;
    const float sigma = radius * 0.5f; // Figma's radius is twice the Gaussian's sigma
    const int down = ImClamp((int)ceilf(sigma / 16.f), 1, 8);
    if (r.used >= (int)r.jobs.size())
        r.jobs.resize(r.used + 1);
    Job& j = r.jobs[r.used];
    if (!prepare(g.device, j, w, h, down))
        return;
    j.bounds = ImRect(bounds.Min, bounds.Min + ImVec2((float)w, (float)h));
    j.sigma = sigma;
    dl->AddCallback(run, (void*)(intptr_t)r.used);
    dl->AddCallback(ImGui::GetPlatformIO().DrawCallback_ResetRenderState, nullptr);
    draw_shape(dl, (ImTextureID)(intptr_t)j.b_srv, j.bounds, shape, radii, ring, IM_COL32(255, 255, 255, (int)(ImSaturate(alpha) * 255.f + 0.5f)));
    r.used++;
}

} // namespace blur

} // namespace

bool host_capturing() { return g.capture_path != nullptr; }
ImVec2 host_design_origin() { return g.design_origin; }

bool host_create(const HostConfig& config)
{
    g.config = config;
    g.capture_path = std::getenv("FIGFLOW_CAPTURE");
    if (const char* frames = std::getenv("FIGFLOW_CAPTURE_FRAMES"))
        g.capture_frames = ImMax(1, std::atoi(frames));
    if (const char* script = std::getenv("FIGFLOW_SCRIPT"); script && g.capture_path && !parse_script(script))
        return false;
    const bool capture = g.capture_path != nullptr;
    const int w = (int)config.size.x, h = (int)config.size.y;

    ImGui_ImplWin32_EnableDpiAwareness();
    g.wc = { sizeof(g.wc), CS_CLASSDC, wnd_proc, 0L, 0L, ::GetModuleHandleW(nullptr), nullptr, ::LoadCursorW(nullptr, MAKEINTRESOURCEW(32512) /* IDC_ARROW */), nullptr, nullptr, L"FigflowHost", nullptr };
    ::RegisterClassExW(&g.wc);

    int x = 0, y = 0, ww = w, wh = h;
    DWORD ex_style = WS_EX_APPWINDOW;
    if (config.style == HostStyle::menu && !capture)
    {
        // The overlay covers the primary monitor; the design is centered on it.
        ww = ::GetSystemMetrics(SM_CXSCREEN);
        wh = ::GetSystemMetrics(SM_CYSCREEN);
        ex_style = WS_EX_TOPMOST | WS_EX_LAYERED | WS_EX_TOOLWINDOW;
    }
    else
    {
        x = (::GetSystemMetrics(SM_CXSCREEN) - w) / 2;
        y = (::GetSystemMetrics(SM_CYSCREEN) - h) / 2;
        ex_style |= WS_EX_LAYERED;
    }
    g.hwnd = ::CreateWindowExW(ex_style, g.wc.lpszClassName, config.title, WS_POPUP | WS_MINIMIZEBOX | WS_SYSMENU, x, y, ww, wh, nullptr, nullptr, g.wc.hInstance, nullptr);
    if (!g.hwnd)
        return false;

    // Per-pixel transparency: a fully opaque layered window whose client area is
    // DWM "glass", so the alpha we clear to and draw with reaches the desktop.
    ::SetLayeredWindowAttributes(g.hwnd, RGB(0, 0, 0), 255, LWA_ALPHA);
    const MARGINS margins = { -1, -1, -1, -1 };
    ::DwmExtendFrameIntoClientArea(g.hwnd, &margins);

    if (!create_device(g.hwnd))
    {
        cleanup_device();
        ::UnregisterClassW(g.wc.lpszClassName, g.wc.hInstance);
        return false;
    }
    if (capture && !create_capture_target(w, h))
        return false;
    if (!capture)
    {
        ::ShowWindow(g.hwnd, SW_SHOWDEFAULT);
        ::UpdateWindow(g.hwnd);
    }

    IMGUI_CHECKVERSION();
    ImGui::CreateContext();
    ImGuiIO& io = ImGui::GetIO();
    io.ConfigFlags |= ImGuiConfigFlags_NavEnableKeyboard;
    io.IniFilename = nullptr; // designs place their own windows
    ImGui_ImplWin32_Init(g.hwnd);
    ImGui_ImplDX11_Init(g.device, g.context);

    Backend b;
    b.create_texture = create_texture;
    b.backdrop_blur = blur::backdrop;
    set_backend(b);
    return true;
}

bool host_begin_frame()
{
    MSG msg;
    while (::PeekMessageW(&msg, nullptr, 0U, 0U, PM_REMOVE))
    {
        ::TranslateMessage(&msg);
        ::DispatchMessageW(&msg);
        if (msg.message == WM_QUIT)
            g.quit = true;
    }
    if (g.quit)
        return false;
    if (!host_capturing())
    {
        if (g.occluded && g.swap_chain->Present(0, DXGI_PRESENT_TEST) == DXGI_STATUS_OCCLUDED)
        {
            ::Sleep(10);
            return host_begin_frame();
        }
        g.occluded = false;
        if (g.resize_w != 0 && g.resize_h != 0)
        {
            cleanup_render_target();
            g.swap_chain->ResizeBuffers(0, g.resize_w, g.resize_h, DXGI_FORMAT_UNKNOWN, 0);
            g.resize_w = g.resize_h = 0;
            create_render_target();
        }
    }

    ImGui_ImplDX11_NewFrame();
    ImGui_ImplWin32_NewFrame();
    blur::r.used = 0;
    ImGuiIO& io = ImGui::GetIO();
    if (host_capturing())
    {
        // Deterministic: fixed step, the design's size, and the mouse parked
        // outside unless a script drives it.
        io.DeltaTime = 1.f / 60.f;
        io.DisplaySize = g.config.size;
        if (g.script.empty())
            io.AddMousePosEvent(-FLT_MAX, -FLT_MAX);
        else if (!run_script(io) && g.shot_path.empty())
            g.quit = true; // after this frame
    }
    ImGui::NewFrame();
    return true;
}

void host_end_frame()
{
    ImGuiIO& io = ImGui::GetIO();

    // Loader style: pressing on an empty part of the design drags the OS window
    // (only the design window itself: a popup layer above it takes its clicks).
    if (!host_capturing() && g.config.style == HostStyle::loader && ImGui::IsMouseClicked(ImGuiMouseButton_Left) && GImGui->HoveredWindow == g.design_window &&
        !ImGui::IsAnyItemHovered() && !ImGui::IsAnyItemActive() && !ImGui::IsPopupOpen(nullptr, ImGuiPopupFlags_AnyPopupId | ImGuiPopupFlags_AnyPopupLevel))
    {
        ::ReleaseCapture();
        ::SendMessageW(g.hwnd, WM_NCLBUTTONDOWN, HTCAPTION, 0);
        io.AddMouseButtonEvent(ImGuiMouseButton_Left, false);
    }

    ImGui::Render();
    const ImVec4 c = g.config.clear;
    const float clear[4] = { c.x * c.w, c.y * c.w, c.z * c.w, c.w };
    ID3D11RenderTargetView* target = host_capturing() ? g.capture_rtv : g.rtv;
    g.context->OMSetRenderTargets(1, &target, nullptr);
    g.context->ClearRenderTargetView(target, clear);
    ImGui_ImplDX11_RenderDrawData(ImGui::GetDrawData());

    if (host_capturing())
    {
        if (!g.script.empty())
        {
            if (!g.shot_path.empty())
            {
                const bool ok = write_capture(g.shot_path.c_str());
                std::fprintf(ok ? stdout : stderr, ok ? "captured %s\n" : "capture failed: %s\n", g.shot_path.c_str());
                g.shot_path.clear();
            }
        }
        else if (++g.frame_index >= g.capture_frames)
        {
            const bool ok = write_capture(g.capture_path);
            std::fprintf(ok ? stdout : stderr, ok ? "captured %s\n" : "capture failed: %s\n", g.capture_path);
            g.quit = true;
        }
        return;
    }
    const HRESULT hr = g.swap_chain->Present(g.config.vsync ? 1 : 0, 0);
    g.occluded = hr == DXGI_STATUS_OCCLUDED;

    // Menu style: clicks outside the design fall through to whatever is below.
    if (g.config.style == HostStyle::menu)
    {
        const LONG ex = ::GetWindowLongW(g.hwnd, GWL_EXSTYLE);
        const bool over_ui = io.WantCaptureMouse;
        const LONG want = over_ui ? (ex & ~WS_EX_TRANSPARENT) : (ex | WS_EX_TRANSPARENT);
        if (want != ex)
            ::SetWindowLongW(g.hwnd, GWL_EXSTYLE, want);
    }
}

void host_destroy()
{
    blur::shutdown();
    ImGui_ImplDX11_Shutdown();
    ImGui_ImplWin32_Shutdown();
    ImGui::DestroyContext();
    cleanup_device();
    ::DestroyWindow(g.hwnd);
    ::UnregisterClassW(g.wc.lpszClassName, g.wc.hInstance);
}

void close_window()
{
    if (g.hwnd)
        ::PostMessageW(g.hwnd, WM_CLOSE, 0, 0);
}

void minimize_window()
{
    if (g.hwnd && !host_capturing())
        ::ShowWindow(g.hwnd, SW_MINIMIZE);
}

bool begin_design_window(const char* id)
{
    const ImGuiViewport* vp = ImGui::GetMainViewport();
    const bool menu = g.config.style == HostStyle::menu && !host_capturing();
    if (menu)
        ImGui::SetNextWindowPos(ImVec2(vp->WorkPos.x + (vp->WorkSize.x - g.config.size.x) * 0.5f, vp->WorkPos.y + (vp->WorkSize.y - g.config.size.y) * 0.5f), ImGuiCond_FirstUseEver);
    else
        ImGui::SetNextWindowPos(vp->Pos);
    ImGui::SetNextWindowSize(g.config.size);
    ImGui::PushStyleVar(ImGuiStyleVar_WindowPadding, ImVec2(0.f, 0.f));
    ImGui::PushStyleVar(ImGuiStyleVar_WindowBorderSize, 0.f);
    ImGui::PushStyleVar(ImGuiStyleVar_WindowRounding, 0.f);
    ImGuiWindowFlags flags = ImGuiWindowFlags_NoDecoration | ImGuiWindowFlags_NoSavedSettings | ImGuiWindowFlags_NoBackground |
                             ImGuiWindowFlags_NoScrollWithMouse | ImGuiWindowFlags_NoBringToFrontOnFocus;
    if (!menu)
        flags |= ImGuiWindowFlags_NoMove;
    const bool open = ImGui::Begin(id, nullptr, flags);
    ImGui::PopStyleVar(3);
    g.design_origin = ImGui::GetWindowPos();
    g.design_window = ImGui::GetCurrentWindow();
    return open;
}

void end_design_window() { ImGui::End(); }

bool begin_design_layer(const char* id, bool inputs)
{
    ImGui::SetNextWindowPos(g.design_origin);
    ImGui::SetNextWindowSize(g.config.size);
    ImGui::PushStyleVar(ImGuiStyleVar_WindowPadding, ImVec2(0.f, 0.f));
    ImGui::PushStyleVar(ImGuiStyleVar_WindowBorderSize, 0.f);
    ImGui::PushStyleVar(ImGuiStyleVar_WindowRounding, 0.f);
    ImGuiWindowFlags flags = ImGuiWindowFlags_NoDecoration | ImGuiWindowFlags_NoSavedSettings | ImGuiWindowFlags_NoBackground |
                             ImGuiWindowFlags_NoScrollWithMouse | ImGuiWindowFlags_NoMove;
    if (!inputs)
        flags |= ImGuiWindowFlags_NoInputs | ImGuiWindowFlags_NoFocusOnAppearing | ImGuiWindowFlags_NoNav;
    const bool open = ImGui::Begin(id, nullptr, flags);
    ImGui::PopStyleVar(3);
    // Input-less layers (toasts) stay above everything, including a popup focused after them.
    if (!inputs)
        ImGui::BringWindowToDisplayFront(ImGui::GetCurrentWindow());
    return open;
}

void end_design_layer() { ImGui::End(); }

} // namespace ff
