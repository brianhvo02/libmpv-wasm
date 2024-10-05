#include "libbluray.h"

BLURAY* bd = NULL;

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

typedef struct bd_pl_thread_args_t {
    uint32_t title_idx;
    string path;
    uint8_t bdj_detected;
    bluray_playlist_info_t playlist;
} bd_pl_thread_args_t;

static bluray_playlist_info_t get_playlist_info(const BLURAY_TITLE_INFO *title, bd_pl_thread_args_t *bd_pl_args) {
    vector<bluray_clip_info_t> clips(title->clip_count);
    vector<BLURAY_TITLE_MARK> marks(title->marks, title->marks + title->mark_count);
    
    for (uint32_t clip_idx = 0; clip_idx < title->clip_count; clip_idx++)
        clips[clip_idx] = {
            title->clips[clip_idx].clip_id,
            title->clips[clip_idx].in_time,
            title->clips[clip_idx].out_time
        };

    bluray_playlist_info_t info = { title->playlist, clips, marks };
    if (!bd_pl_args->bdj_detected)
        info.igs = get_menu(title->playlist, bd_pl_args->path);
    return info;
}

pthread_mutex_t bd_lock;

void* get_playlist_thread(void* args) {
    bd_pl_thread_args_t *bd_pl_args = (bd_pl_thread_args_t *)args;

    pthread_mutex_lock(&bd_lock);
    const BLURAY_TITLE_INFO *title_info = bd_get_title_info(bd, bd_pl_args->title_idx, 0);
    pthread_mutex_unlock(&bd_lock); 
    // printf("Title %u has playlist %u\n", bd_pl_args->title_idx, title_info->playlist);
    bd_pl_args->playlist = get_playlist_info(title_info, bd_pl_args);
    printf("Retrieved playlist %u\n", title_info->playlist);

    return NULL;
}

bluray_disc_info_t open_bd_disc(string path) {
    if (bd != NULL)
        bd_close(bd);

    bd = bd_open(path.c_str(), NULL);

    const BLURAY_DISC_INFO *info = bd_get_disc_info(bd);
    uint32_t num_playlists = bd_get_titles(bd, 0, 0);
    map<string, bluray_playlist_info_t> playlists;

    printf("%u playlists detected\n", num_playlists);

    bd_pl_thread_args_t thread_args[MAX_THREADS];
    pthread_t threads[MAX_THREADS];

    pthread_mutex_init(&bd_lock, NULL);

    for (uint32_t group_idx = 0; group_idx <= num_playlists / MAX_THREADS; group_idx++) {
        for (uint32_t thread_idx = 0; thread_idx < min((uint32_t)MAX_THREADS, num_playlists - (group_idx * MAX_THREADS)); thread_idx++) {
            thread_args[thread_idx] = { group_idx * MAX_THREADS + thread_idx, path, info->bdj_detected };
            pthread_create(&(threads[thread_idx]), NULL, &get_playlist_thread, &(thread_args[thread_idx]));
        }

        for (uint32_t thread_idx = 0; thread_idx < min((uint32_t)MAX_THREADS, num_playlists - (group_idx * MAX_THREADS)); thread_idx++) {
            pthread_join(threads[thread_idx], NULL);
            bluray_playlist_info_t playlist = thread_args[thread_idx].playlist;
            playlists.insert({ to_string(playlist.playlist_id), playlist });
        }
    }
    
    pthread_mutex_destroy(&bd_lock); 

    bluray_mobj_objects_t mobj = read_mobj(path + "/BDMV/MovieObject.bdmv");

    uint32_t top_menu_idx = info->top_menu == NULL ? 0xFFFFFFFF : info->top_menu->id_ref;

    vector<uint32_t> title_map;
    title_map.push_back(top_menu_idx);
    for (uint32_t title_idx = 1; title_idx <= info->num_titles; title_idx++) 
        title_map.push_back(info->titles[title_idx]->id_ref);

    return bluray_disc_info_t {
        info->disc_name ? info->disc_name : "Untitled",
        num_playlists,
        playlists,
        info->first_play_supported && !info->bdj_detected,
        info->first_play->id_ref,
        info->top_menu_supported,
        title_map,
        mobj
    };
}