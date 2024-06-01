#include "libbluray.h"

BLURAY* bd = bd_init();

static bluray_mobj_objects_t read_mobj(string path) {
    mobj_objects* mobj_objects = bd_read_mobj(path.c_str());
    vector<bluray_mobj_object_t> objects(mobj_objects->num_objects);

    for (uint16_t obj_idx = 0; obj_idx < mobj_objects->num_objects; obj_idx++) {
        MOBJ_OBJECT* object = &mobj_objects->objects[obj_idx];
        vector<bluray_mobj_cmd_t> cmds(object->num_cmds);

        for (uint16_t cmd_idx = 0; cmd_idx < object->num_cmds; cmd_idx++) {
            bluray_mobj_cmd_t cmd = bluray_mobj_cmd_t {
                .insn = {
                    object->cmds[cmd_idx].insn.op_cnt,
                    object->cmds[cmd_idx].insn.grp,
                    object->cmds[cmd_idx].insn.sub_grp,
                    object->cmds[cmd_idx].insn.imm_op1,
                    object->cmds[cmd_idx].insn.imm_op2,
                    object->cmds[cmd_idx].insn.branch_opt,
                    object->cmds[cmd_idx].insn.cmp_opt,
                    object->cmds[cmd_idx].insn.set_opt
                },
                .dst = object->cmds[cmd_idx].dst,
                .src = object->cmds[cmd_idx].src
            };
            cmds[cmd_idx] = cmd;
        }

        bluray_mobj_object_t mobj_object = bluray_mobj_object_t {
            object->resume_intention_flag,
            object->menu_call_mask,
            object->title_search_mask,
            object->num_cmds,
            cmds
        };

        objects[obj_idx] = mobj_object;
    }

    return bluray_mobj_objects_t {
        mobj_objects->mobj_version,
        mobj_objects->num_objects,
        objects
    };
}

static igs_t get_menu(uint32_t playlist_id, string path) {
    string mpls_name = to_string(playlist_id);
    mpls_name.insert(mpls_name.begin(), 5 - mpls_name.length(), '0');
    string mpls_path = path + "/BDMV/PLAYLIST/" + mpls_name + ".mpls";
    mpls_pl *mpls = bd_read_mpls(mpls_path.c_str());
    
    if (!mpls->sub_count || !mpls->sub_path[0].sub_playitem_count || !mpls->sub_path[0].sub_play_item[0].clip_count)
        return igs_t { .menu = { 0, 0, 0 } };

    string clip_id(mpls->sub_path[0].sub_play_item[0].clip[0].clip_id);

    string menu_path = path + "/BDMV/STREAM/" + clip_id + ".m2ts";
    igs_t igs = extract_menu(menu_path.c_str());

    return igs;
}

static bluray_title_info_t get_title_info(const BLURAY_TITLE_INFO *title, string path) {
    vector<bluray_clip_info_t> clips(title->clip_count);
    vector<BLURAY_TITLE_MARK> marks(title->marks, title->marks + title->mark_count);
    
    for (uint32_t clip_idx = 0; clip_idx < title->clip_count; clip_idx++)
        clips[clip_idx] = {
            title->clips[clip_idx].clip_id,
            title->clips[clip_idx].in_time,
            title->clips[clip_idx].out_time
        };

    return { clips, marks, get_menu(title->playlist, path) };
}

bluray_disc_info_t open_bd_disc(string path) {
    int success = bd_open_disc(bd, path.c_str(), NULL);
    assert(success == 1);

    const BLURAY_DISC_INFO *info = bd_get_disc_info(bd);
    uint32_t num_titles = bd_get_titles(bd, 0, 0);
    vector<bluray_title_info_t> titles(num_titles);

    for (uint32_t title_idx = 0; title_idx < num_titles; title_idx++) {
        const BLURAY_TITLE_INFO *title_info = bd_get_title_info(bd, title_idx, 0);
        titles[title_idx] = get_title_info(title_info, path);
    }

    bluray_mobj_objects_t mobj = read_mobj(path + "/BDMV/MovieObject.bdmv");
    
    return bluray_disc_info_t {
        info->disc_name,
        num_titles,
        titles,
        info->first_play_supported,
        mobj
    };
}