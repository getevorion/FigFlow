// Figflow runtime: binary data compiled into the program.
//
// Generated projects carry their fonts and images as byte arrays
// (src/ui/assets/fonts.cpp, icons.cpp, images.cpp): each is named by a Bytes
// in namespace assets, valid for as long as the program runs.
#pragma once

namespace ff {

struct Bytes
{
    const unsigned char* data = nullptr;
    unsigned int size = 0;
};

} // namespace ff
