#ifndef LIBBLURAY_H
#define LIBBLURAY_H

#include <string>
#include <cassert>
#include <libbluray/bluray.h>
#include <libbluray/mpls_data.h>
#include "igs_reader.h"

using namespace std;

const uint8_t MAX_THREADS = 15;

typedef struct bluray_mobj_object_t {
    uint8_t resume_intention_flag;
    uint8_t menu_call_mask;
    uint8_t title_search_mask;
    uint16_t num_cmds;
    vector<bluray_mobj_cmd_t> cmds;
} bluray_mobj_object_t;

typedef struct bluray_mobj_objects_t {
    uint32_t mobj_version;
    uint16_t num_objects;
    vector<bluray_mobj_object_t> objects;
} bluray_mobj_objects_t;

typedef struct bluray_clip_info_t {
    string clip_id;
    uint64_t in_time;
    uint64_t out_time;
} bluray_clip_info_t;

typedef struct bluray_playlist_info_t {
    uint32_t playlist_id;
    vector<bluray_clip_info_t> clips;
    vector<BLURAY_TITLE_MARK> marks;
    igs_t igs;
} bluray_playlist_info_t;

typedef struct bluray_disc_info_t {
    string disc_name;
    uint32_t num_playlists;
    map<string, bluray_playlist_info_t> playlists;
    uint8_t first_play_supported;
    uint32_t first_play_idx;
    uint8_t top_menu_supported;
    vector<uint32_t> title_map;
    bluray_mobj_objects_t mobj;
} bluray_disc_info_t;

bluray_disc_info_t open_bd_disc(string path);

#endif /* LIBBLURAY_H */