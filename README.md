# libmpv-wasm

## Requirements
Requires [mpv-build (Emscripten version)](https://github.com/brianhvo02/mpv-build)

## Build with Docker:
`docker run -it --rm --name mpv-build -e UID=$(id -u) -e GID=$(id -g) -v .:/app -w /app mpv-build scripts/rebuild`

## Build locally:
```sh
export MPV_BUILD_DIR=[path to mpv-build] 
scripts/rebuild
```
