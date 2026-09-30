// Figflow runtime: embedded images and backend-dependent effects.
//
// Generated code registers its embedded PNGs once at startup; textures are
// created lazily through the backend the host installs (DirectX 11 or
// OpenGL 3), so the drawing code never depends on a graphics API.
#pragma once

#include "style.h"

struct ImRect;

namespace ff {

struct ImageAsset
{
    const unsigned char* data = nullptr; // PNG bytes
    unsigned int size = 0;
    int width = 0;
    int height = 0;
};

// Services only the graphics backend can provide.
struct Backend
{
    // Creates a texture from tightly packed RGBA8 pixels. Returns ImTextureID_Invalid on failure.
    ImTextureID (*create_texture)(const unsigned char* rgba, int width, int height) = nullptr;
    // Figma's background blur. Blurs what has been drawn under `bounds` (only
    // that area, mirrored at its edges, as Figma does) with a Gaussian of
    // Figma's radius, and draws it into the rounded rectangle `shape` (`radii`),
    // or with `ring` > 0 into the band that wide inside its outline (a layer
    // without fills shows its backdrop only under its strokes).
    // Optional: without it, background blur is skipped.
    void (*backdrop_blur)(ImDrawList* dl, const ImRect& bounds, const ImRect& shape, const Radii& radii, float ring, float radius, float alpha) = nullptr;
};

void set_backend(const Backend& backend);
const Backend& backend();

// Registers the generated asset table (index = asset id used by ff::image fills).
void register_images(const ImageAsset* assets, int count);

// The texture for an asset, created on first use.
ImTextureID image_texture(int index);
ImVec2 image_size(int index);

// Decodes a PNG (or JPEG) into RGBA8. Free the result with free_pixels().
unsigned char* decode_image(const unsigned char* data, int size, int* width, int* height);
void free_pixels(unsigned char* pixels);

// Background blur through the backend, if it provides one.
void backdrop_blur(ImDrawList* dl, const ImRect& bounds, const ImRect& shape, const Radii& radii, float ring, float radius, float alpha);

} // namespace ff
