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
#include <webgpu/webgpu_cpp.h>

#include <filesystem>
#include <iostream>
#include <string>

#include <AL/al.h>
#include <AL/alc.h>

#include <zlib.h>
#include <fstream>

using namespace emscripten;
using namespace std;

uint32_t kWidth = 1920;
uint32_t kHeight = 1080;

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

void quit() {
    mpv_render_context_free(mpv_gl);
    mpv_destroy(mpv);

    SDL_Renderer *renderer = SDL_CreateRenderer(window, NULL);
    SDL_RenderPresent(renderer);
    SDL_Quit();

    emscripten_cancel_main_loop();

    printf("properly terminated\n");
}

wgpu::Instance instance;
wgpu::SwapChain swapChain;
wgpu::Device device;
wgpu::RenderPipeline pipeline;

const char shaderCode[] = R"(
    @vertex fn vertexMain(@builtin(vertex_index) i : u32) ->
      @builtin(position) vec4f {
        const pos = array(vec2f(0, 1), vec2f(-1, -1), vec2f(1, -1));
        return vec4f(pos[i], 0, 1);
    }
    @fragment fn fragmentMain() -> @location(0) vec4f {
        return vec4f(1, 0, 0, 1);
    }
)";

void printDeviceError(WGPUErrorType errorType, const char* message,
                      void* /*unused*/) {
    const char* errorTypeName = "";
    switch (errorType) {
    case WGPUErrorType_Validation:
        errorTypeName = "Validation";
        break;
    case WGPUErrorType_OutOfMemory:
        errorTypeName = "Out of memory";
        break;
    case WGPUErrorType_Unknown:
        errorTypeName = "Unknown";
        break;
    case WGPUErrorType_DeviceLost:
        errorTypeName = "Device lost";
        break;
    default:
        die("ERROR: Should not be reached.");
        return;
    }

    printf("Dawn: %s error: %s\n", errorTypeName, message);
}

static void
wgpu_compilation_info_callback(WGPUCompilationInfoRequestStatus status,
                               WGPUCompilationInfo const* compilationInfo,
                               void* /*userdata*/) {
    if (status == WGPUCompilationInfoRequestStatus_Error) {
        for (uint32_t m = 0; m < compilationInfo->messageCount; ++m) {
            WGPUCompilationMessage message = compilationInfo->messages[m];
            printf("Shader compile error: lineNum: %llu, linePos: %llu: %s\n",
                message.lineNum, message.linePos, message.message);
        }
    }
}

void SetupSwapChain(wgpu::Surface surface) {
    wgpu::SwapChainDescriptor scDesc{.usage =
                                         wgpu::TextureUsage::RenderAttachment,
                                     .format = wgpu::TextureFormat::BGRA8Unorm,
                                     .width = kWidth,
                                     .height = kHeight,
                                     .presentMode = wgpu::PresentMode::Fifo};
    swapChain = device.CreateSwapChain(surface, &scDesc);
}

void CreateRenderPipeline() {
    wgpu::ShaderModuleWGSLDescriptor wgslDesc{};
    wgslDesc.code = shaderCode;

    wgpu::ShaderModuleDescriptor shaderModuleDescriptor{.nextInChain =
                                                            &wgslDesc};
    printf("Creating shader module.\n");
    wgpu::ShaderModule shaderModule =
        device.CreateShaderModule(&shaderModuleDescriptor);
    printf("Done creating shader module.\n");
    if (shaderModule == nullptr)
        die("ERROR: Invalid shader module!\n");
    shaderModule.GetCompilationInfo(wgpu_compilation_info_callback, nullptr);
    // instance.ProcessEvents();

    wgpu::ColorTargetState colorTargetState{
        .format = wgpu::TextureFormat::BGRA8Unorm};

    wgpu::FragmentState fragmentState{.module = shaderModule,
                                      .entryPoint = "fragmentMain",
                                      .targetCount = 1,
                                      .targets = &colorTargetState};

    wgpu::RenderPipelineDescriptor descriptor{
        .vertex = {.module = shaderModule, .entryPoint = "vertexMain"},
        .fragment = &fragmentState};

    printf("Creating pipeline\n");
    pipeline = device.CreateRenderPipeline(&descriptor);
    printf("Done creating pipeline\n");
}

void InitGraphics(wgpu::Surface surface) {
    SetupSwapChain(surface);
    printf("Creating RenderPipeline...\n");
    CreateRenderPipeline();
    printf("Graphics initialized.\n");
}

void Render() {
    static double curTime = 0.0;
    curTime += 0.1;

    // Check the current canvas size:
    double cwidth = 0;
    double cheight = 0;
    const char* tgt = "canvas";
    // element_size returns the **framebuffer** size (and args are ints)
    // emscripten_get_canvas_element_size(tgt, &cwidth, &cheight);
    // We need to call css_size to get the display size:
    emscripten_get_element_css_size(tgt, &cwidth, &cheight);

    int curWidth = (int)cwidth;
    int curHeight = (int)cheight;

    if (curWidth != kWidth || curHeight != kHeight) {
        printf("Canvas resized to %dx%d", curWidth, curHeight);
        kWidth = curWidth;
        kHeight = curHeight;
    }

    wgpu::RenderPassColorAttachment attachment{
        .view = swapChain.GetCurrentTextureView(),
        .loadOp = wgpu::LoadOp::Clear,
        .storeOp = wgpu::StoreOp::Store,
        .clearValue = {(std::cos(curTime) + 1.0) * 0.5,
                       (std::sin(3.0 * curTime) + 1.0) * 0.5,
                       (std::cos(2.0 * curTime + 3.14) + 1.0) * 0.5}};

    wgpu::RenderPassDescriptor renderpass{.colorAttachmentCount = 1,
                                          .colorAttachments = &attachment};

    wgpu::CommandEncoder encoder = device.CreateCommandEncoder();
    wgpu::RenderPassEncoder pass = encoder.BeginRenderPass(&renderpass);
    pass.SetPipeline(pipeline);
    pass.Draw(3);
    pass.End();
    wgpu::CommandBuffer commands = encoder.Finish();
    device.GetQueue().Submit(1, &commands);
}

void GetDevice(void (*callback)(wgpu::Device)) {
    instance.RequestAdapter(
        nullptr,
        [](WGPURequestAdapterStatus status, WGPUAdapter cAdapter,
           const char* message, void* userdata) {
            if (status != WGPURequestAdapterStatus_Success) {
                die("ERROR: Cannot retrieve WebGPU adapter!");
            }
            wgpu::Adapter adapter = wgpu::Adapter::Acquire(cAdapter);

            // **Note**: in the RequestDevice call below the first argument is
            // the device
            //  descriptor: this is where we should specify the required
            //  features later.
            adapter.RequestDevice(
                nullptr,
                [](WGPURequestDeviceStatus status, WGPUDevice cDevice,
                   const char* message, void* userdata) {
                    wgpu::Device device = wgpu::Device::Acquire(cDevice);
                    // Now call the callback:
                    reinterpret_cast<void (*)(wgpu::Device)>(userdata)(device);
                },
                userdata);
        },
        reinterpret_cast<void*>(callback));
}

void main_loop() {
    // printf("running main loop\n");
    SDL_Event event;
    if (SDL_WaitEvent(&event) != 1)
        die("event loop error");
    int redraw = 0;
    switch (event.type) {
        case SDL_EVENT_QUIT:
            quit();
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
                            EM_ASM(postMessage(JSON.stringify({ type: 'idle' })););
                            break;
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
        // Render();
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
    mpv = mpv_create();
    if (!mpv) {
        die("context init failed");
    }

    mpv_set_option_string(mpv, "vo", "gpu-next,gpu,libmpv");

    if (mpv_initialize(mpv) < 0) {
        die("mpv init failed");
    }

    mpv_request_log_messages(mpv, "debug");

    SDL_SetHint(SDL_HINT_NO_SIGNAL_HANDLERS, "no");

    if (SDL_Init(SDL_INIT_VIDEO) < 0) {
        die("SDL init failed");
    }
    
    window = SDL_CreateWindow("Media Player", kWidth, kHeight, SDL_WINDOW_OPENGL);

    #ifdef TEST_SDL_LOCK_OPTS
    EM_ASM("SDL.defaults.copyOnLock = false; SDL.defaults.discardOnLock = true; SDL.defaults.opaqueFrontBuffer = false;");
    #endif

    if (!window)
        die("failed to create SDL window");

    wgpu::SurfaceDescriptorFromCanvasHTMLSelector canvasDesc{};
    canvasDesc.selector = "#canvas";

    wgpu::SurfaceDescriptor surfaceDesc{.nextInChain = &canvasDesc};
    wgpu::Surface surface = instance.CreateSurface(&surfaceDesc);

    // SDL_GLContext glcontext = SDL_GL_CreateContext(window);
    // if (!glcontext)
    //     die("failed to create SDL GL context");

    mpv_opengl_init_params init_params = { get_proc_address_mpv };
    int advanced_control = 1;

    // mpv_render_param params[] = {
    //     {MPV_RENDER_PARAM_API_TYPE, (void *)MPV_RENDER_API_TYPE_OPENGL},
    //     {MPV_RENDER_PARAM_OPENGL_INIT_PARAMS, &init_params},
    //     {MPV_RENDER_PARAM_ADVANCED_CONTROL, &advanced_control},
    //     {(mpv_render_param_type) 0}
    // };

    mpv_render_param params[] = {
        {MPV_RENDER_PARAM_API_TYPE, (void *)MPV_RENDER_API_TYPE_SW},
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

void load_file(string filename) {
    const char * char_filename = filename.c_str();
    printf("loading %s\n", char_filename);
    
    if (!filesystem::exists(char_filename)) {
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

pthread_t fs_thread;

intptr_t get_fs_thread() {
    return (intptr_t)fs_thread;
}

void* crc32_gen(void *args) {
    printf("starting crc32\n");
    uLong crc = crc32(0L, Z_NULL, 0);

    ulong total_size = filesystem::file_size("/share/mnt/00001.m2ts");
    printf("%lu\n", total_size);
    ifstream file("/share/mnt/00001.m2ts");
    size_t bufferSize = 16 * 1024 * 1024;
    size_t test = (size_t)4 * 1024 * 1024 * 1024;
    file.seekg(test - 2 * bufferSize);
    unique_ptr<char[]> buffer(new char[bufferSize]);
    ulong size = 0;
    while (file) {
        file.read(buffer.get(), bufferSize);
        if (size + bufferSize > total_size)
            bufferSize = total_size - size;
        if (file.bad())
            printf("fatal\n");
        else if (file.eof())
            printf("end of file\n");
        else if (file.fail())
            printf("non-fatal\n");
        crc = crc32(crc, (Bytef*)buffer.get(), bufferSize);
        size = size + bufferSize;
        printf("progress: %lu / %lu = %lu\n", size, total_size, size * 100 / total_size);

        if (size == total_size)
            break;
    }
    printf("%lx\n", crc);
    
    file.close();

    return NULL;
}

int main(int argc, char const *argv[]) {
    pthread_create(&fs_thread, NULL, load_fs, NULL);
    // pthread_t crc32_thread;
    // pthread_create(&crc32_thread, NULL, crc32_gen, NULL);

    backend_t opfs = wasmfs_create_opfs_backend();
    int err = wasmfs_create_directory("/share", 0777, opfs);
    assert(err == 0);

    printf("Creating WebGPU instance...\n");
    instance = wgpu::CreateInstance();
    printf("WebGPU instance created.\n");

    printf("Retrieving device...\n");
    GetDevice([](wgpu::Device dev) {
        device = dev;
        device.SetUncapturedErrorCallback(printDeviceError, nullptr);

        init_mpv();
        emscripten_set_main_loop(main_loop, 0, 1);
    });

    return 0;
}

EMSCRIPTEN_BINDINGS(libmpv) {
    emscripten::function("mpvInit", &init_mpv);
    emscripten::function("loadFile", &load_file);
    emscripten::function("togglePlay", &toggle_play);
    emscripten::function("setPlaybackTime", &set_playback_time_pos);
    emscripten::function("setVolume", &set_ao_volume);
    emscripten::function("getTracks", &get_tracks);
    emscripten::function("setVideoTrack", &set_video_track);
    emscripten::function("setAudioTrack", &set_audio_track);
    emscripten::function("setSubtitleTrack", &set_subtitle_track);
    emscripten::function("getFsThread", &get_fs_thread);
    // emscripten::function("crc32Gen", &crc32_gen);
}