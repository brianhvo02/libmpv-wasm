#include <stddef.h>
#include <stdlib.h>
#include <stdio.h>

#include <mpv/client.h>
#include <mpv/render_gl.h>

#include <SDL3/SDL.h>
#include <SDL3/SDL_hints.h>
#include <SDL3/SDL_video.h>
#include <SDL3/SDL_events.h>

#include <emscripten.h>
#include <emscripten/bind.h>
#include <emscripten/threading.h>
#include <emscripten/wasmfs.h>

#include <filesystem>
#include <iostream>
#include <string>

#include <AL/al.h>
#include <AL/alc.h>

#include "thumbnail.h"
#include "libbluray.h"
#include <unistd.h>

struct s_mallinfo {
	int arena;    /* non-mmapped space allocated from system */
	int ordblks;  /* number of free chunks */
	int smblks;   /* always 0 */
	int hblks;    /* always 0 */
	int hblkhd;   /* space in mmapped regions */
	int usmblks;  /* maximum total allocated space */
	int fsmblks;  /* always 0 */
	int uordblks; /* total allocated space */
	int fordblks; /* total free space */
	int keepcost; /* releasable (via malloc_trim) space */
};

extern "C" {
	extern s_mallinfo mallinfo();
}

using namespace emscripten;
using namespace std;

static Uint32 wakeup_on_mpv_render_update, wakeup_on_mpv_events;
int width = 1920;
int height = 1080;
int64_t video_width = 1920;
int64_t video_height = 1080;
SDL_Window *window;
mpv_handle *mpv;
mpv_render_context *mpv_gl;
pthread_t fs_thread;
pthread_t mpv_thread;

void init_mpv();
void main_loop();
void* load_fs(void *args);
void create_mpv_map_obj(mpv_node_list *map);
int get_shader_count();
void get_tracks();
void get_chapters();
static void *get_proc_address_mpv(void *fn_ctx, const char *name);
static void on_mpv_events(void *ctx);
static void on_mpv_render_update(void *ctx);
intptr_t get_fs_thread();
intptr_t get_mpv_thread();
void die(const char *msg);
void quit();

int main(int argc, char const *argv[]) {
    mpv_thread = pthread_self();
    pthread_create(&fs_thread, NULL, load_fs, NULL);

    backend_t opfs = wasmfs_create_opfs_backend();
    int err = wasmfs_create_directory("/opfs", 0777, opfs);
    assert(err == 0);

    backend_t extfs = wasmfs_create_externalfs_backend();
    err = wasmfs_create_directory("/extfs", 0777, extfs);
    assert(err == 0);

    init_mpv();
    emscripten_set_main_loop(main_loop, 0, 1);

    return 0;
}

void init_mpv() {
    mpv = mpv_create();
    if (!mpv)
        die("context init failed");

    mpv_set_property_string(mpv, "vo", "libmpv");

    if (mpv_initialize(mpv) < 0)
        die("mpv init failed");

    // mpv_request_log_messages(mpv, "debug");

    SDL_SetHint(SDL_HINT_NO_SIGNAL_HANDLERS, "no");

    if (SDL_Init(SDL_INIT_VIDEO) < 0)
        die("SDL init failed");
    
    emscripten_get_screen_size(&width, &height);
    window = SDL_CreateWindow("mpv Media Player", width, height, SDL_WINDOW_OPENGL);

    if (!window)
        die("failed to create SDL window");

    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 3);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 0);

    SDL_GLContext glcontext = SDL_GL_CreateContext(window);
    if (!glcontext)
        die("failed to create SDL GL context");

    mpv_opengl_init_params init_params = { get_proc_address_mpv };
    int advanced_control = 1;

    mpv_render_param params[] = {
        {MPV_RENDER_PARAM_API_TYPE, (void *)MPV_RENDER_API_TYPE_OPENGL},
        {MPV_RENDER_PARAM_OPENGL_INIT_PARAMS, &init_params},
        {MPV_RENDER_PARAM_ADVANCED_CONTROL, &advanced_control},
        {(mpv_render_param_type) 0}
    };

    if (mpv_render_context_create(&mpv_gl, mpv, params) < 0)
        die("failed to initialize mpv GL context");

    wakeup_on_mpv_render_update = SDL_RegisterEvents(1);
    wakeup_on_mpv_events = SDL_RegisterEvents(1);
    if (wakeup_on_mpv_render_update == (Uint32) - 1 || wakeup_on_mpv_events == (Uint32) - 1)
        die("could not register events");

    mpv_set_wakeup_callback(mpv, on_mpv_events, NULL);
    mpv_render_context_set_update_callback(mpv_gl, on_mpv_render_update, NULL);

    mpv_observe_property(mpv, 0, "pause", MPV_FORMAT_FLAG);
    mpv_observe_property(mpv, 0, "duration", MPV_FORMAT_DOUBLE);
    mpv_observe_property(mpv, 0, "playback-time", MPV_FORMAT_DOUBLE);
    mpv_observe_property(mpv, 0, "vid", MPV_FORMAT_INT64);
    mpv_observe_property(mpv, 0, "aid", MPV_FORMAT_INT64);
    mpv_observe_property(mpv, 0, "sid", MPV_FORMAT_INT64);
    mpv_observe_property(mpv, 0, "chapter", MPV_FORMAT_INT64);
    mpv_observe_property(mpv, 0, "metadata/by-key/title", MPV_FORMAT_STRING);
    mpv_observe_property(mpv, 0, "playlist-playing-pos", MPV_FORMAT_INT64);
}

void main_loop() {
    SDL_Event event;
    if (SDL_WaitEvent(&event) != 1)
        die("event loop error");
    int redraw = 0;
    switch (event.type) {
        case SDL_EVENT_QUIT:
            quit();
            break;
        case SDL_EVENT_WINDOW_EXPOSED:
            redraw = 1;
            break;
        default:
            if (event.type == wakeup_on_mpv_render_update) {
                uint64_t flags = mpv_render_context_update(mpv_gl);
                if (flags & MPV_RENDER_UPDATE_FRAME)
                    redraw = 1;
            }
            if (event.type == wakeup_on_mpv_events) {
                while (1) {
                    mpv_event *mp_event = mpv_wait_event(mpv, 0);
                    if (mp_event->event_id == MPV_EVENT_NONE)
                        break;
                    switch (mp_event->event_id) {
                        case MPV_EVENT_IDLE:
                            EM_ASM({
                                postMessage(JSON.stringify({ type: 'idle', shaderCount: $0 }));
                            }, get_shader_count());
                            break;
                        case MPV_EVENT_LOG_MESSAGE: {
                            mpv_event_log_message *msg = (mpv_event_log_message*)mp_event->data;
                            printf("log: %s", msg->text);
                            break;
                        }
                        case MPV_EVENT_FILE_LOADED:
                            get_tracks();
                            get_chapters();
                            break;
                        case MPV_EVENT_START_FILE:
                            EM_ASM(postMessage(JSON.stringify({ type: 'file-start' })););
                            break;
                        case MPV_EVENT_END_FILE:
                            EM_ASM(postMessage(JSON.stringify({ type: 'file-end' })););
                            break;
                        case MPV_EVENT_GET_PROPERTY_REPLY:
                        case MPV_EVENT_PROPERTY_CHANGE: {
                            mpv_event_property *evt = (mpv_event_property*)mp_event->data;
                            
                            switch (evt->format) {
                                case MPV_FORMAT_NONE:
                                    EM_ASM({
                                        postMessage(JSON.stringify({
                                            type: 'property-change',
                                            name: UTF8ToString($0),
                                            value: 0
                                        }));
                                    }, evt->name);
                                    break;
                                case MPV_FORMAT_STRING: {
                                    const char **data = (const char **)evt->data;
                                    EM_ASM({
                                        postMessage(JSON.stringify({
                                            type: 'property-change',
                                            name: UTF8ToString($0),
                                            value: UTF8ToString($1)
                                        }));
                                    }, evt->name, *data);
                                    break;
                                }
                                case MPV_FORMAT_FLAG: {
                                    int *data = (int *)evt->data;
                                    EM_ASM({
                                        postMessage(JSON.stringify({
                                            type: 'property-change',
                                            name: UTF8ToString($0),
                                            value: $1
                                        }));
                                    }, evt->name, *data);
                                    break;
                                }
                                case MPV_FORMAT_DOUBLE: {
                                    double *data = (double *)evt->data;
                                    EM_ASM({
                                        postMessage(JSON.stringify({
                                            type: 'property-change',
                                            name: UTF8ToString($0),
                                            value: $1
                                        }));
                                    }, evt->name, *data);
                                    break;
                                }
                                case MPV_FORMAT_INT64: {
                                    int64_t *data = (int64_t *)evt->data;
                                    EM_ASM({
                                        postMessage(JSON.stringify({
                                            type: 'property-change',
                                            name: UTF8ToString($0),
                                            value: $1.toString()
                                        }));
                                    }, evt->name, *data);
                                    break;
                                }
                                case MPV_FORMAT_NODE: {
                                    mpv_node *data = (mpv_node *)evt->data;
                                    mpv_node_list *list;
                                    mpv_node_list *map;
    
                                    if (strcmp(evt->name, "track-list") != 0 && strcmp(evt->name, "chapter-list") != 0)
                                        break;

                                    list = (mpv_node_list *)data->u.list;
                                    EM_ASM(arr = [];);
                                    
                                    for (int i = 0; i < list->num; i++) {
                                        map = (mpv_node_list *)list->values[i].u.list;
                                        create_mpv_map_obj(map);
                                        EM_ASM(arr.push(obj););
                                    }
                                    if (strcmp(evt->name, "track-list") == 0) {
                                        EM_ASM({
                                            postMessage(JSON.stringify({
                                                type: 'track-list',
                                                tracks: arr
                                            }));
                                        });
                                    }
                                    if (strcmp(evt->name, "chapter-list") == 0) {
                                        EM_ASM({
                                            postMessage(JSON.stringify({
                                                type: 'chapter-list',
                                                chapters: arr
                                            }));
                                        });
                                    }
                                    break;
                                }
                                default:
                                    printf("property-change: { name: %s, format: %d }\n", evt->name, evt->format);
                            }
                            break;
                        }
                        default:
                            printf("event: %s\n", mpv_event_name(mp_event->event_id));
                    }
                }
            }
    }
    if (redraw) {
        mpv_opengl_fbo fbo = { 0, width, height };
        int flip_y = 1;
        mpv_render_param params[] = {
            {MPV_RENDER_PARAM_OPENGL_FBO, &fbo},
            {MPV_RENDER_PARAM_FLIP_Y, &flip_y},
            {(mpv_render_param_type) 0}
        };
        mpv_render_context_render(mpv_gl, params);
        SDL_GL_SwapWindow(window);
    }
}

void* load_fs(void *args) {
    EM_ASM(
        onmessage = async e => {
            let dirHandle;
            const segments = e.data.path.split('/');
            for (const segment of segments) {
                if (!segment.length) {
                    dirHandle = await navigator.storage.getDirectory();
                    continue;
                }
                
                dirHandle = await dirHandle.getDirectoryHandle(segment, { create: true });
            }

            for (const file of e.data.files) {
                postMessage(JSON.stringify({ type: 'upload', filename: file.name }));
                
                const fileHandle = await dirHandle.getFileHandle(file.name, { create: true });

                if (fileHandle.createWritable) {
                    const writable = await fileHandle.createWritable();
                    console.log('Writing', file.name);
                    await writable.write(file);
                    await writable.close();
                } else {
                    const accessHandle = await fileHandle.createSyncAccessHandle();
                    const buf = await file.arrayBuffer();
                    accessHandle.write(buf);
                    accessHandle.close();
                }

                Module.createThumbnail('/opfs' + e.data.path + '/' + file.name);
            }

            postMessage(JSON.stringify({ type: 'upload-complete' }));
        }
    );

    return NULL;
}

void load_file(string path, string options) {
    printf("loading %s with options %s\n", path.c_str(), options.c_str());
    
    if (!filesystem::exists(path)) {
        printf("file does not exist\n");
        return;
    }

    const char * cmd[] = {"loadfile", path.c_str(), "replace", "0", options.c_str(), NULL};
    mpv_command_async(mpv, 0, cmd);
}

void load_files(vector<string> paths) {
    printf("loading %lu paths\n", paths.size());

    for (auto path : paths) {
        if (!filesystem::exists(path))
            printf("%s does not exist\n", path.c_str());

        const char * cmd[] = {"loadfile", path.c_str(), "append-play", NULL};
        mpv_command_async(mpv, 0, cmd);
    }
}

// void load_url(string url) {
//     printf("loading %s\n", url.c_str());
    
//     if (url.find("http://") + url.find("https://") < string::npos) {
//         printf("unsupported protocol\n");
//         return;
//     }

//     const char * cmd[] = {"loadfile", url.c_str(), NULL};
//     mpv_command_async(mpv, 0, cmd);
// }

void toggle_play() {
    const char * cmd[] = {"cycle", "pause", NULL};
    mpv_command_async(mpv, 0, cmd);
}

void stop() {
    const char * cmd[] = {"stop", NULL};
    mpv_command_async(mpv, 0, cmd);
}

void set_playback_time_pos(double time) {
    mpv_set_property_async(mpv, 0, "playback-time", MPV_FORMAT_DOUBLE, &time);
}

void set_ao_volume(double volume) {
    mpv_set_property_async(mpv, 0, "ao-volume", MPV_FORMAT_DOUBLE, &volume);
}

void get_tracks() {
    mpv_get_property_async(mpv, 0, "track-list", MPV_FORMAT_NODE);
}

void get_metadata() {
    mpv_get_property_async(mpv, 0, "metadata", MPV_FORMAT_NODE);
}

void get_chapters() {
    mpv_get_property_async(mpv, 0, "chapter-list", MPV_FORMAT_NODE);
}

void set_video_track(int64_t idx) {
    mpv_set_property_async(mpv, 0, "vid", MPV_FORMAT_INT64, &idx);
}

void set_audio_track(int64_t idx) {
    mpv_set_property_async(mpv, 0, "aid", MPV_FORMAT_INT64, &idx);
}

void set_subtitle_track(int64_t idx) {
    mpv_set_property_async(mpv, 0, "sid", MPV_FORMAT_INT64, &idx);
}

void set_chapter(int64_t idx) {
    mpv_set_property_async(mpv, 0, "chapter", MPV_FORMAT_INT64, &idx);
}

void skip_forward() {
    const char * cmd[] = {"seek", "10", NULL};
    mpv_command_async(mpv, 0, cmd);
}

void skip_backward() {
    const char * cmd[] = {"seek", "-10", NULL};
    mpv_command_async(mpv, 0, cmd);
}

void add_shaders() {
    const char *shader_list = "/shaders/Anime4K_Clamp_Highlights.glsl:/shaders/Anime4K_Restore_CNN_VL.glsl:/shaders/Anime4K_Upscale_CNN_x2_VL.glsl:/shaders/Anime4K_AutoDownscalePre_x2.glsl:/shaders/Anime4K_AutoDownscalePre_x4.glsl:/shaders/Anime4K_Upscale_CNN_x2_M.glsl";
    const char * cmd[] = {"change-list", "glsl-shaders", "set", shader_list, NULL};
    mpv_command_async(mpv, 0, cmd);
}

void clear_shaders() {
    const char * cmd[] = {"change-list", "glsl-shaders", "clr", "", NULL};
    mpv_command_async(mpv, 0, cmd);
}

int get_shader_count() {
    auto dirIter = std::filesystem::directory_iterator("/shaders");

    int fileCount = std::count_if(
        begin(dirIter),
        end(dirIter),
        [](auto& entry) { return entry.is_regular_file(); }
    );

    return fileCount - 1;
}

intptr_t get_fs_thread() {
    return (intptr_t)fs_thread;
}

intptr_t get_mpv_thread() {
    return (intptr_t)mpv_thread;
}

static void *get_proc_address_mpv(void *fn_ctx, const char *name) {
    return (void *)SDL_GL_GetProcAddress(name);
}

static void on_mpv_events(void *ctx) {
    SDL_Event event = {.type = wakeup_on_mpv_events};
    SDL_PushEvent(&event);
}

static void on_mpv_render_update(void *ctx) {
    SDL_Event event = {.type = wakeup_on_mpv_render_update};
    SDL_PushEvent(&event);
}

void quit() {
    mpv_render_context_free(mpv_gl);
    mpv_destroy(mpv);

    SDL_Renderer *renderer = SDL_CreateRenderer(window, NULL);
    SDL_RenderPresent(renderer);
    SDL_Quit();

    emscripten_cancel_main_loop();

    printf("properly terminated\n");
}

void match_window_screen_size() {
    emscripten_get_screen_size(&width, &height);
        
    double aspect_ratio = (double)video_height / video_width;
    int new_height = height;
    if (aspect_ratio != (double)height / width)
        new_height = aspect_ratio * width;

    SDL_SetWindowSize(window, width, new_height);

    printf("video: %lldx%lld -> screen: %dx%d = canvas: %dx%d\n", video_width, video_height, width, height, width, new_height);
}

void create_mpv_map_obj(mpv_node_list *map) {
    mpv_node node;
    char* key;
    int is_video = 0;
    int is_first = 0;
    int w = 16;
    int h = 9;
    EM_ASM(obj = {};);
    for (int i = 0; i < map->num; i++) {
        key = map->keys[i];
        node = map->values[i];
        if (strcmp(key, "id") == 0 && node.u.int64 == 1) 
            is_first = 1;
        if (strcmp(key, "type") == 0 && node.format == MPV_FORMAT_STRING && strcmp(node.u.string, "video") == 0) 
            is_video = 1;
        if (strcmp(key, "demux-w") == 0) 
            w = node.u.int64;
        if (strcmp(key, "demux-h") == 0) 
            h = node.u.int64;
        switch (node.format) {
            case MPV_FORMAT_INT64:
                EM_ASM({
                    obj[UTF8ToString($0)] = $1.toString();
                }, key, node.u.int64);
                break;
            case MPV_FORMAT_STRING:
                EM_ASM({
                    obj[UTF8ToString($0)] = UTF8ToString($1);
                }, key, node.u.string);
                break;
            case MPV_FORMAT_FLAG:
                EM_ASM({
                    obj[UTF8ToString($0)] = $1;
                }, key, node.u.flag);
                break;
            case MPV_FORMAT_DOUBLE:
                EM_ASM({
                    obj[UTF8ToString($0)] = $1;
                }, key, node.u.double_);
                break;
            default:
                printf("%s, format: %d\n", key, node.format);
        }
    }

    if (is_video && is_first) {
        video_width = w;
        video_height = h;

        match_window_screen_size();
    }
}

void *thumbnail_thread_gen(void *args) {
    string *path_ptr = (string *)(args);
    generate_thumbnail(path_ptr, 15);
    free(args);

    return NULL;
}

void create_thumbnail_thread(string path) {
    pthread_t thumbnail_thread;
    string *path_ptr = (string *)malloc(sizeof(path));
    *path_ptr = path;
    pthread_create(&thumbnail_thread, NULL, thumbnail_thread_gen, path_ptr);
}

void die(const char *msg) {
    fprintf(stderr, "%s\n", msg);
    exit(1);
}

unsigned int get_total_memory() {
	return EM_ASM_INT(return HEAP8.length);
}

unsigned int get_free_memory() {
	s_mallinfo i = mallinfo();
	unsigned int totalMemory = get_total_memory();
	unsigned int dynamicTop = (unsigned int)sbrk(0);
	return totalMemory - dynamicTop + i.fordblks;
}

EMSCRIPTEN_BINDINGS(libmpv) {
    register_vector<string>("StringVector");

    emscripten::function("mpvInit", &init_mpv);
    emscripten::function("loadFile", &load_file);
    emscripten::function("loadFiles", &load_files);
    // emscripten::function("loadUrl", &load_url);
    emscripten::function("togglePlay", &toggle_play);
    emscripten::function("stop", &stop);
    emscripten::function("setPlaybackTime", &set_playback_time_pos);
    emscripten::function("setVolume", &set_ao_volume);
    emscripten::function("getTracks", &get_tracks);
    emscripten::function("getChapters", &get_chapters);
    emscripten::function("setVideoTrack", &set_video_track);
    emscripten::function("setAudioTrack", &set_audio_track);
    emscripten::function("setSubtitleTrack", &set_subtitle_track);
    emscripten::function("setChapter", &set_chapter);
    emscripten::function("skipForward", &skip_forward);
    emscripten::function("skipBackward", &skip_backward);
    emscripten::function("getFsThread", &get_fs_thread);
    emscripten::function("getMpvThread", &get_mpv_thread);
    emscripten::function("addShaders", &add_shaders);
    emscripten::function("clearShaders", &clear_shaders);
    emscripten::function("getShaderCount", &get_shader_count);
    emscripten::function("matchWindowScreenSize", &match_window_screen_size);
    emscripten::function("createThumbnail", &create_thumbnail_thread);
    emscripten::function("getFreeMemory", &get_free_memory);

    register_vector<bluray_mobj_cmd_t>("MobjCmdVector");
    register_vector<bluray_mobj_object_t>("MobjObjectVector");
    register_vector<bluray_playlist_info_t>("BlurayPlaylistVector");
    register_vector<button_t>("ButtonVector");
    register_vector<effect_object_t>("EffectObjectVector");
    register_vector<effect_t>("EffectVector");
    register_vector<bog_t>("BogVector");
    register_vector<page_t>("PageVector");
    register_vector<color_t>("ColorVector");
    register_vector<vector<color_t>>("PaletteVector");
    register_vector<BLURAY_TITLE_MARK>("BlurayTitleMarkVector");
    register_vector<bluray_clip_info_t>("BlurayClipInfoVector");

    register_map<string, window_t>("WindowMap");
    register_map<string, string>("StringMap");
    register_map<string, picture_extended_t>("PictureMap");

    value_object<bluray_hdmv_insn_t>("HdmvInsn")
        .field("opCnt", &bluray_hdmv_insn_t::op_cnt)
        .field("grp", &bluray_hdmv_insn_t::grp)
        .field("subGrp", &bluray_hdmv_insn_t::sub_grp)
        .field("immOp1", &bluray_hdmv_insn_t::imm_op1)
        .field("immOp2", &bluray_hdmv_insn_t::imm_op2)
        .field("branchOpt", &bluray_hdmv_insn_t::branch_opt)
        .field("cmpOpt", &bluray_hdmv_insn_t::cmp_opt)
        .field("setOpt", &bluray_hdmv_insn_t::set_opt);

    value_object<bluray_mobj_cmd_t>("MobjCmd")
        .field("insn", &bluray_mobj_cmd_t::insn)
        .field("dst", &bluray_mobj_cmd_t::dst)
        .field("src", &bluray_mobj_cmd_t::src);

    value_object<bluray_mobj_object_t>("MobjObject")
        .field("resumeIntentionFlag", &bluray_mobj_object_t::resume_intention_flag)
        .field("menuCallMask", &bluray_mobj_object_t::menu_call_mask)
        .field("titleSearchMask", &bluray_mobj_object_t::title_search_mask)
        .field("numCmds", &bluray_mobj_object_t::num_cmds)
        .field("cmds", &bluray_mobj_object_t::cmds);

    value_object<bluray_mobj_objects_t>("MobjObjects")
        .field("mobjVersion", &bluray_mobj_objects_t::mobj_version)
        .field("numObjects", &bluray_mobj_objects_t::num_objects)
        .field("objects", &bluray_mobj_objects_t::objects);

    value_object<button_navigation_t>("ButtonNavigation")
        .field("up", &button_navigation_t::up)
        .field("down", &button_navigation_t::down)
        .field("left", &button_navigation_t::left)
        .field("right", &button_navigation_t::right);

    value_object<button_state_t>("ButtonState")
        .field("start", &button_state_t::start)
        .field("stop", &button_state_t::stop);

    value_object<button_t>("Button")
        .field("buttonId", &button_t::button_id)
        .field("v", &button_t::v)
        .field("f", &button_t::f)
        .field("autoAction", &button_t::auto_action)
        .field("x", &button_t::x)
        .field("y", &button_t::y)
        .field("navigation", &button_t::navigation)
        .field("normal", &button_t::normal)
        .field("normalFlags", &button_t::normal_flags)
        .field("selected", &button_t::selected)
        .field("selectedFlags", &button_t::selected_flags)
        .field("activated", &button_t::activated)
        .field("cmdsCount", &button_t::cmds_count)
        .field("commands", &button_t::commands);

    value_object<bog_t>("Bog")
        .field("defButton", &bog_t::def_button)
        .field("buttonCount", &bog_t::button_count)
        .field("buttons", &bog_t::buttons);

    value_object<window_t>("Window")
        .field("id", &window_t::id)
        .field("x", &window_t::x)
        .field("y", &window_t::y)
        .field("width", &window_t::width)
        .field("height", &window_t::height);

    value_object<effect_object_t>("EffectObject")
        .field("id", &effect_object_t::id)
        .field("window", &effect_object_t::window)
        .field("x", &effect_object_t::x)
        .field("y", &effect_object_t::y);

    value_object<effect_t>("Effect")
        .field("duration", &effect_t::duration)
        .field("palette", &effect_t::palette)
        .field("objectCount", &effect_t::object_count)
        .field("objects", &effect_t::objects);

    value_object<window_effect_t>("WindowEffect")
        .field("windows", &window_effect_t::windows)
        .field("effects", &window_effect_t::effects);

    value_object<page_t>("Page")
        .field("id", &page_t::id)
        .field("uo", &page_t::uo)
        .field("inEffects", &page_t::in_effects)
        .field("outEffects", &page_t::out_effects)
        .field("framerateDivider", &page_t::framerate_divider)
        .field("defButton", &page_t::def_button)
        .field("defActivated", &page_t::def_activated)
        .field("palette", &page_t::palette)
        .field("bogCount", &page_t::bog_count)
        .field("bogs", &page_t::bogs);

    value_object<menu_t>("Menu")
        .field("width", &menu_t::width)
        .field("height", &menu_t::height)
        .field("pageCount", &menu_t::page_count)
        .field("pages", &menu_t::pages);

    value_object<color_t>("Color")
        .field("id", &color_t::id)
        .field("r", &color_t::r)
        .field("g", &color_t::g)
        .field("b", &color_t::b)
        .field("alpha", &color_t::alpha);

    value_object<picture_extended_t>("Picture")
        .field("id", &picture_extended_t::id)
        .field("width", &picture_extended_t::width)
        .field("height", &picture_extended_t::height)
        .field("data", &picture_extended_t::data);

    value_object<igs_t>("Igs")
        .field("menu", &igs_t::menu)
        .field("palettes", &igs_t::palettes)
        .field("pictures", &igs_t::pictures);

    value_object<BLURAY_TITLE_MARK>("BlurayTitleMark")
        .field("idx", &BLURAY_TITLE_MARK::idx)
        .field("type", &BLURAY_TITLE_MARK::type)
        .field("start", &BLURAY_TITLE_MARK::start)
        .field("duration", &BLURAY_TITLE_MARK::duration)
        .field("offset", &BLURAY_TITLE_MARK::offset)
        .field("clipRef", &BLURAY_TITLE_MARK::clip_ref);

    value_object<bluray_clip_info_t>("BlurayClipInfo")
        .field("clipId", &bluray_clip_info_t::clip_id)
        .field("inTime", &bluray_clip_info_t::in_time)
        .field("outTime", &bluray_clip_info_t::out_time);

    value_object<bluray_playlist_info_t>("BlurayPlaylistInfo")
        .field("clips", &bluray_playlist_info_t::clips)
        .field("marks", &bluray_playlist_info_t::marks)
        .field("igs", &bluray_playlist_info_t::igs);

    value_object<bluray_disc_info_t>("BlurayDiscInfo")
        .field("discName", &bluray_disc_info_t::disc_name)
        .field("numPlaylists", &bluray_disc_info_t::num_playlists)
        .field("firstPlaySupported", &bluray_disc_info_t::first_play_supported)
        .field("playlists", &bluray_disc_info_t::playlists)
        .field("mobjObjects", &bluray_disc_info_t::mobj);

    emscripten::function("bdOpen", &open_bd_disc);
}