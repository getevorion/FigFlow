// Figflow runtime: embedded images. See image.h.
#include "image.h"
#include "imgui_internal.h"

#define STB_IMAGE_IMPLEMENTATION
#define STBI_ONLY_PNG
#define STBI_ONLY_JPEG
#define STBI_NO_STDIO
#include "stb_image.h"

namespace ff {

namespace {

Backend g_backend;
const ImageAsset* g_assets = nullptr;
int g_asset_count = 0;
ImVector<ImTextureID> g_textures;

} // namespace

void set_backend(const Backend& b) { g_backend = b; }
const Backend& backend() { return g_backend; }

void register_images(const ImageAsset* assets, int count)
{
    g_assets = assets;
    g_asset_count = count;
    g_textures.resize(count);
    for (int i = 0; i < count; i++)
        g_textures[i] = ImTextureID_Invalid;
}

unsigned char* decode_image(const unsigned char* data, int size, int* width, int* height)
{
    int channels = 0;
    return stbi_load_from_memory(data, size, width, height, &channels, 4);
}

void free_pixels(unsigned char* pixels) { stbi_image_free(pixels); }

ImTextureID image_texture(int index)
{
    if (index < 0 || index >= g_asset_count)
        return ImTextureID_Invalid;
    if (g_textures[index] != ImTextureID_Invalid || !g_backend.create_texture)
        return g_textures[index];
    int w = 0, h = 0;
    unsigned char* rgba = decode_image(g_assets[index].data, (int)g_assets[index].size, &w, &h);
    if (!rgba)
        return ImTextureID_Invalid;
    g_textures[index] = g_backend.create_texture(rgba, w, h);
    free_pixels(rgba);
    return g_textures[index];
}

ImVec2 image_size(int index)
{
    if (index < 0 || index >= g_asset_count)
        return ImVec2(0.f, 0.f);
    return ImVec2((float)g_assets[index].width, (float)g_assets[index].height);
}

void backdrop_blur(ImDrawList* dl, const ImRect& bounds, const ImRect& shape, const Radii& radii, float ring, float radius, float alpha)
{
    if (g_backend.backdrop_blur && radius > 0.f && alpha > 0.f)
        g_backend.backdrop_blur(dl, bounds, shape, radii, ring, radius, alpha);
}

} // namespace ff
