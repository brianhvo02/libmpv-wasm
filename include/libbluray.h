#ifndef LIBBLURAY_H
#define LIBBLURAY_H

#include <string>
#include <cassert>
#include <libbluray/bluray.h>
#include "igs_reader.h"

using namespace std;

typedef struct bluray_title_info_t {
    uint32_t playlist_id;
} bluray_title_info_t;

typedef struct bluray_disc_info_t {
    string disc_name;
    uint32_t num_titles;
    vector<bluray_title_info_t> titles;
} bluray_disc_info_t;

bluray_disc_info_t open_bd_disc(string path);

#endif /* LIBBLURAY_H */