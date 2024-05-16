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

using namespace emscripten;
namespace fs = std::filesystem;

static Uint32 wakeup_on_mpv_render_update, wakeup_on_mpv_events;
SDL_Window *window;
mpv_handle *mpv;
mpv_render_context *mpv_gl;

static void die(const char *msg)
{
    fprintf(stderr, "%s\n", msg);
    exit(1);
}

static void *get_proc_address_mpv(void *fn_ctx, const char *name)
{
    return (void *)SDL_GL_GetProcAddress(name);
}

static void on_mpv_events(void *ctx)
{
    SDL_Event event = {.type = wakeup_on_mpv_events};
    SDL_PushEvent(&event);
}

static void on_mpv_render_update(void *ctx)
{
    SDL_Event event = {.type = wakeup_on_mpv_render_update};
    SDL_PushEvent(&event);
}

void terminate() {
    mpv_render_context_free(mpv_gl);
    mpv_destroy(mpv);

    SDL_Renderer *renderer = SDL_CreateRenderer(window, NULL);
    SDL_RenderPresent(renderer);
    SDL_Quit();

    emscripten_cancel_main_loop();

    printf("properly terminated\n");
}

void main_loop() {
    SDL_Event event;
    if (SDL_WaitEvent(&event) != 1)
        die("event loop error");
    int redraw = 0;
    switch (event.type) {
        case SDL_EVENT_QUIT:
            terminate();
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
                        case MPV_EVENT_LOG_MESSAGE: {
                            mpv_event_log_message *msg = (mpv_event_log_message*)mp_event->data;
                            printf("log: %s", msg->text);
                            break;
                        }
                        case MPV_EVENT_FILE_LOADED:
                            mpv_get_property_async(mpv, 0, "track-list", MPV_FORMAT_NODE);
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
                                case MPV_FORMAT_NODE: {
                                    mpv_node *data = (mpv_node *)evt->data;
                                    mpv_node_list *list;
                                    mpv_node_list *map;
                                    mpv_node node;

                                    if (strcmp(evt->name, "track-list") == 0) {
                                        list = (mpv_node_list *)data->u.list;
                                        EM_ASM(tracks = [];);
                                        
                                        for (int i = 0; i < list->num; i++) {
                                            EM_ASM(track = {};);
                                            map = (mpv_node_list *)list->values[i].u.list;
                                            for (int j = 0; j < map->num; j++) {
                                                node = map->values[j];
                                                switch (node.format) {
                                                    case MPV_FORMAT_INT64:
                                                        EM_ASM({
                                                            track[UTF8ToString($0)] = $1;
                                                        }, map->keys[j], (int)node.u.int64);
                                                        break;
                                                    case MPV_FORMAT_STRING:
                                                        EM_ASM({
                                                            track[UTF8ToString($0)] = UTF8ToString($1);
                                                        }, map->keys[j], node.u.string);
                                                        break;
                                                    case MPV_FORMAT_FLAG:
                                                        EM_ASM({
                                                            track[UTF8ToString($0)] = $1;
                                                        }, map->keys[j], node.u.flag);
                                                        break;
                                                    case MPV_FORMAT_DOUBLE:
                                                        EM_ASM({
                                                            track[UTF8ToString($0)] = $1;
                                                        }, map->keys[j], (int)node.u.double_);
                                                        break;
                                                    default:
                                                        printf("%s, format: %d\n", map->keys[j], node.format);
                                                }
                                            }
                                            EM_ASM(tracks.push(track););
                                        }
                                        EM_ASM({
                                            postMessage(JSON.stringify({
                                                type: 'track-list',
                                                tracks
                                            }));
                                        });
                                        break;
                                    }
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
        int w, h;
        SDL_GetWindowSize(window, &w, &h);
        mpv_opengl_fbo fbo = { 0, w, h };
        int flip_y = 1;
        mpv_render_param params[] = {
            {MPV_RENDER_PARAM_OPENGL_FBO, &fbo},
            {MPV_RENDER_PARAM_FLIP_Y, &flip_y},
            {(mpv_render_param_type)0}
        };
        mpv_render_context_render(mpv_gl, params);
        SDL_GL_SwapWindow(window);
    }
}

void init_mpv() {
    EM_ASM(
        console.log('MPV worker id:', workerID);
    );

    mpv = mpv_create();
    if (!mpv) {
        die("context init failed");
    }

    mpv_set_option_string(mpv, "vo", "libmpv");

    if (mpv_initialize(mpv) < 0) {
        die("mpv init failed");
    }

    mpv_request_log_messages(mpv, "debug");

    SDL_SetHint(SDL_HINT_NO_SIGNAL_HANDLERS, "no");

    if (SDL_Init(SDL_INIT_VIDEO) < 0) {
        die("SDL init failed");
    }
    
    window = SDL_CreateWindow("Media Player", 1920, 1080, SDL_WINDOW_OPENGL);

    #ifdef TEST_SDL_LOCK_OPTS
    EM_ASM("SDL.defaults.copyOnLock = false; SDL.defaults.discardOnLock = true; SDL.defaults.opaqueFrontBuffer = false;");
    #endif

    if (!window) {
        die("failed to create SDL window");
    }

    SDL_GLContext glcontext = SDL_GL_CreateContext(window);
    if (!glcontext) {
        die("failed to create SDL GL context");
    }

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
    if (wakeup_on_mpv_render_update == (Uint32)-1 ||
        wakeup_on_mpv_events == (Uint32)-1)
        die("could not register events");

    mpv_set_wakeup_callback(mpv, on_mpv_events, NULL);
    mpv_render_context_set_update_callback(mpv_gl, on_mpv_render_update, NULL);

    mpv_observe_property(mpv, 0, "pause", MPV_FORMAT_FLAG);
    mpv_observe_property(mpv, 0, "duration", MPV_FORMAT_DOUBLE);
    mpv_observe_property(mpv, 0, "playback-time", MPV_FORMAT_DOUBLE);
    mpv_observe_property(mpv, 0, "vid", MPV_FORMAT_DOUBLE);
    mpv_observe_property(mpv, 0, "aid", MPV_FORMAT_DOUBLE);
    mpv_observe_property(mpv, 0, "sid", MPV_FORMAT_DOUBLE);
}

void load_file(std::string filename) {
    const char * char_filename = filename.c_str();
    printf("loading %s\n", char_filename);
    
    if (!fs::exists(char_filename)) {
        printf("file does not exist");
        return;
    }

    const char *cmd[] = {"loadfile", char_filename, NULL};
    mpv_command_async(mpv, 0, cmd);
}

void toggle_play() {
    const char *cmd[] = {"cycle", "pause", NULL};
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

void set_video_track(int idx) {
    uint64_t idx_cast = (uint64_t)idx;
    mpv_set_property_async(mpv, 0, "vid", MPV_FORMAT_INT64, &idx_cast);
}

void set_audio_track(int idx) {
    uint64_t idx_cast = (uint64_t)idx;
    mpv_set_property_async(mpv, 0, "aid", MPV_FORMAT_INT64, &idx_cast);
}

void set_subtitle_track(int idx) {
    uint64_t idx_cast = (uint64_t)idx;
    mpv_set_property_async(mpv, 0, "sid", MPV_FORMAT_INT64, &idx_cast);
}

void* load_fs(void *args) {
    EM_ASM(
        console.log('FS worker id:', workerID);
        onmessage = async e => {
            for (const file of e.data) {
                const writable = await navigator.storage.getDirectory()
                    .then(opfsRoot => opfsRoot.getDirectoryHandle('mnt', { create: true }))
                    .then(dirHandle => dirHandle.getFileHandle(file.name, { create: true }))
                    .then(accessHandle => accessHandle.createWritable());
                console.log('Writing', file.name);
                await writable.write(file);
                await writable.close();
            }

            postMessage(JSON.stringify({ type: 'upload' }));
        }
    );

    return NULL;
}

void readdir() {
    for (const auto & entry : fs::directory_iterator("/share/mnt"))
        printf("%s\n", entry.path().c_str());
}

int main(int argc, char const *argv[]) {
    pthread_t fs_thread;
    pthread_create(&fs_thread, NULL, load_fs, NULL);

    backend_t opfs = wasmfs_create_opfs_backend();
    int err = wasmfs_create_directory("/share", 0777, opfs);
    assert(err == 0);

    init_mpv();
    emscripten_set_main_loop(main_loop, 0, 1);

    return 0;
}

EMSCRIPTEN_BINDINGS(libmpv) {
    function("mpvInit", &init_mpv);
    function("loadFile", &load_file);
    function("togglePlay", &toggle_play);
    function("setPlaybackTime", &set_playback_time_pos);
    function("setVolume", &set_ao_volume);
    function("readdir", &readdir);
    function("getTracks", &get_tracks);
    function("setVideoTrack", &set_video_track);
    function("setAudioTrack", &set_audio_track);
    function("setSubtitleTrack", &set_subtitle_track);
}