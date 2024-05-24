#ifndef THUMBNAIL_H
#define THUMBNAIL_H

#include <stdio.h>
#include <stdarg.h>
#include <stdlib.h>
#include <filesystem>
#include <string>
#include <inttypes.h>
#include <png.h>

extern "C" { 
    #include <libavcodec/avcodec.h>
    #include <libavformat/avformat.h>
    #include <libavutil/avutil.h>
    #include <libswscale/swscale.h>
    #include <libavutil/imgutils.h>
}

void generate_thumbnail(std::string *path, int64_t offset_in_seconds);

#endif