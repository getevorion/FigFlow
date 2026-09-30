# Figflow runtime: Dear ImGui + the ff helpers generated projects build on.
# This file builds the runtime's own tests; generated projects get their own
# CMakeLists.txt that includes the same sources.
cmake_minimum_required(VERSION 3.20)
project(figflow_runtime CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(IMGUI_DIR ${CMAKE_CURRENT_SOURCE_DIR}/third_party/imgui)

add_library(imgui STATIC
    ${IMGUI_DIR}/imgui.cpp
    ${IMGUI_DIR}/imgui_draw.cpp
    ${IMGUI_DIR}/imgui_tables.cpp
    ${IMGUI_DIR}/imgui_widgets.cpp
    ${IMGUI_DIR}/imgui_demo.cpp
    ${IMGUI_DIR}/backends/imgui_impl_win32.cpp
    ${IMGUI_DIR}/backends/imgui_impl_dx11.cpp
)
target_include_directories(imgui PUBLIC ${IMGUI_DIR} ${IMGUI_DIR}/backends)
# Math operators must be visible before the first imgui.h include everywhere.
target_compile_definitions(imgui PUBLIC IMGUI_DEFINE_MATH_OPERATORS IMGUI_DISABLE_OBSOLETE_FUNCTIONS)

add_library(ff STATIC
    ff/alpha.cpp
    ff/draw.cpp
    ff/text.cpp
    ff/image.cpp
    ff/host_win32_dx11.cpp
    ui/components/look.cpp
    ui/components/button.cpp
    ui/components/toggle.cpp
    ui/components/checkbox.cpp
    ui/components/slider.cpp
    ui/components/text_field.cpp
    ui/components/combo.cpp
    ui/components/keybind.cpp
)
target_include_directories(ff PUBLIC ${CMAKE_CURRENT_SOURCE_DIR} ${CMAKE_CURRENT_SOURCE_DIR}/third_party/stb)
target_link_libraries(ff PUBLIC imgui d3d11 dxgi dwmapi)
target_compile_definitions(ff PUBLIC UNICODE _UNICODE PRIVATE _CRT_SECURE_NO_WARNINGS)

if(MSVC)
    target_compile_options(imgui PRIVATE /utf-8 /W3)
    target_compile_options(ff PRIVATE /utf-8 /W4 /permissive-)
endif()

foreach(test render_test widgets_test)
    add_executable(${test} WIN32 tests/${test}/main.cpp)
    target_link_libraries(${test} PRIVATE ff)
    if(MSVC)
        target_compile_options(${test} PRIVATE /utf-8 /W4 /permissive-)
    endif()
endforeach()
