#include "libbluray.h"

BLURAY* bd = bd_init();

static bluray_title_info_t get_title_info(uint32_t title_idx) {
    const BLURAY_TITLE_INFO *title_info = bd_get_title_info(bd, title_idx, 0);
    return bluray_title_info_t {
        title_info->playlist
    };
}

bluray_disc_info_t open_bd_disc(string path) {
    int success = bd_open_disc(bd, path.c_str(), NULL);
    assert(success == 1);

    const BLURAY_DISC_INFO *info = bd_get_disc_info(bd);
    uint32_t num_titles = bd_get_titles(bd, 0, 0);
    vector<bluray_title_info_t> titles;

    for (uint32_t i = 0; i < num_titles; i++) {
        titles.push_back(get_title_info(i));
    }
    
    return bluray_disc_info_t {
        info->disc_name,
        num_titles,
        titles
    };
}