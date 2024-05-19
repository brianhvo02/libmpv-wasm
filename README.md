# libmpv-wasm

## Requirements
Requires [mpv-build (Emscripten version)](https://github.com/brianhvo02/mpv-build)

## Build with Docker:
`docker run --rm --name mpv-build -v .:/app -w /app mpv-build scripts/rebuild`

## Build locally:
```sh
export MPV_BUILD_DIR=[path to mpv-build] 
scripts/rebuild
```
