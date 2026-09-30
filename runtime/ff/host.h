// Figflow runtime: the window, graphics device and frame loop.
//
// Two styles, matching how the design is meant to run:
//   loader - a borderless window exactly the size of the design frame; empty
//            areas drag the window, rounded corners are truly transparent.
//   menu   - a full-screen see-through overlay with the design centered on
//            it; the design window can be dragged anywhere.
//
// Set FIGFLOW_CAPTURE=out.png to render headless at the design size and
// save a PNG instead of opening a window (FIGFLOW_CAPTURE_FRAMES = frames
// to run first, default 60, at a fixed 60 fps step).
#pragma once

#include "imgui.h"

namespace ff {

enum class HostStyle
{
    loader,
    menu,
};

struct HostConfig
{
    const wchar_t* title = L"Figflow";
    ImVec2 size{ 800.f, 600.f }; // the design frame, in pixels
    HostStyle style = HostStyle::loader;
    ImVec4 clear{ 0.f, 0.f, 0.f, 0.f }; // transparent: only the design is visible
    bool vsync = true;
};

// Creates the window, device and Dear ImGui context. Returns false on failure.
bool host_create(const HostConfig& config);

// Pumps window messages and starts an ImGui frame. Returns false when the app should exit.
bool host_begin_frame();

// Renders and presents the frame (or captures it in capture mode).
void host_end_frame();

void host_destroy();

// True while running headless for FIGFLOW_CAPTURE.
bool host_capturing();

// The screen rectangle the design occupies this frame (menu style: where the design window is).
ImVec2 host_design_origin();

// Window buttons in the design call these.
void close_window();
void minimize_window();

// Begins the full-size, undecorated ImGui window the design is drawn into.
// In menu style the window is movable by dragging its empty areas.
bool begin_design_window(const char* id);
void end_design_window();

// A window of the design's size exactly over the design window, drawn above
// it: popups use one (being a separate window, it blocks input to the screen
// below, like a modal), toasts use one without inputs (`inputs` false: it
// never takes focus or clicks, and stays on top).
bool begin_design_layer(const char* id, bool inputs);
void end_design_layer();

} // namespace ff
