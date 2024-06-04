#ifndef IGS_READER_H
#define IGS_READER_H

#include <fstream>
#include <vector>
#include <set>
#include <cassert>
#include <map>
#include <cmath>
#include <png.h>
#include <string>
#include <libbluray/mobj_data.h>
#include "base64.h"

using namespace std;

const int PACKET_SIZE = 188;
const int MAX_PACKET_SIZE = 204;
const uint8_t SYNC_BYTE = 0x47;
const uint8_t STREAM_TYPE_IGS = 0x91;
const uint8_t PALETTE_SEGMENT = 0x14;
const uint8_t PICTURE_SEGMENT = 0x15;
const uint8_t BUTTON_SEGMENT  = 0x18;

typedef struct bluray_hdmv_insn_t {
    uint32_t op_cnt;
    uint32_t grp;
    uint32_t sub_grp;
    uint32_t imm_op1;
    uint32_t imm_op2;
    uint32_t branch_opt;
    uint32_t cmp_opt;
    uint32_t set_opt;
} bluray_hdmv_insn_t;

typedef struct bluray_mobj_cmd_t {
    bluray_hdmv_insn_t insn;
    uint32_t dst;
    uint32_t src;
} bluray_mobj_cmd_t;

typedef struct button_navigation_t {
    uint16_t up;
    uint16_t down;
    uint16_t left;
    uint16_t right;
} button_navigation_t;

typedef struct button_state_t {
    uint16_t start;
    uint16_t stop;
} button_state_t;

typedef struct button_t {
    uint16_t button_id;
    uint16_t v;
    uint8_t f;
    uint8_t auto_action;
    uint16_t x;
    uint16_t y;
    button_navigation_t navigation;
    button_state_t normal;
    uint16_t normal_flags;
    button_state_t selected;
    uint16_t selected_flags;
    button_state_t activated;
    uint16_t cmds_count;
    vector<bluray_mobj_cmd_t> commands;
} button_t;

typedef struct bog_t {
    uint16_t def_button;
    uint8_t button_count;
    vector<button_t> buttons;
} bog_t;

typedef struct window_t {
    uint8_t id;
    uint16_t x;
    uint16_t y;
    uint16_t width;
    uint16_t height;
} window_t;

typedef struct effect_object_t {
    uint16_t id;
    window_t window;
    uint16_t x;
    uint16_t y;
} effect_object_t;

typedef struct effect_t {
    uint32_t duration;
    uint8_t palette;
    uint8_t object_count;
    vector<effect_object_t> objects;
} effect_t;

typedef struct window_effect_t {
    map<string, window_t> windows;
    vector<effect_t> effects;
} window_effect_t;

typedef struct page_t {
    uint8_t id;
    uint64_t uo;
    window_effect_t in_effects;
    window_effect_t out_effects;
    uint8_t framerate_divider;
    uint16_t def_button;
    uint16_t def_activated;
    uint8_t palette;
    uint8_t bog_count;
    vector<bog_t> bogs;
} page_t;

typedef struct menu_t {
    uint16_t width;
    uint16_t height;
    uint8_t page_count;
    vector<page_t> pages;
} menu_t;

typedef struct color_t {
    uint8_t id;
    uint8_t r;
    uint8_t g;
    uint8_t b;
    uint8_t alpha;
} color_t;

typedef struct picture_t {
    uint16_t id;
    uint16_t width;
    uint16_t height;
    vector<uint8_t> data;
} picture_t;

typedef struct picture_extended_t {
    uint16_t id;
    uint16_t width;
    uint16_t height;
    map<string, string> data;
} picture_extended_t;

typedef struct igs_t {
    menu_t menu;
    vector<vector<color_t>> palettes;
    map<string, picture_extended_t> pictures;
} igs_t;

igs_t extract_menu(char const *filename);

#endif /* IGS_READER_H */