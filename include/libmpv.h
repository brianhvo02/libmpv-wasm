#include <stddef.h>
#include <stdlib.h>
#include <stdio.h>

#include <mpv/client.h>
#include <mpv/render_gl.h>

#include <SDL3/SDL.h>
#include <SDL3/SDL_video.h>
#include <SDL3/SDL_events.h>

#include <emscripten.h>
#include <emscripten/bind.h>
#include <emscripten/threading.h>
#include <emscripten/wasmfs.h>
#include <emscripten/proxying.h>

#include <filesystem>
#include <iostream>
#include <string>

#include <AL/al.h>
#include <AL/alc.h>

#include "thumbnail.h"
#include "libbluray.h"

static Uint32 wakeup_on_mpv_render_update, wakeup_on_mpv_events;
int width = 1920;
int height = 1080;
int64_t video_width = 1920;
int64_t video_height = 1080;
SDL_Window *window;
mpv_handle *mpv;
mpv_render_context *mpv_gl;
pthread_t main_thread;
pthread_t side_thread;
bluray_disc_info_t disc_info;

em_proxying_queue* main_queue = em_proxying_queue_create();

void main_loop();
void create_mpv_map_obj(mpv_node_list *map);
int get_shader_count();
void get_tracks();
void get_chapters();
static void *get_proc_address_mpv(void *fn_ctx, const char *name);
static void on_mpv_events(void *ctx);
static void on_mpv_render_update(void *ctx);
intptr_t get_main_thread();
void die(const char *msg);
void quit();

void func() {}