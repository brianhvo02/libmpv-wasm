# libmpv-wasm: mpv for WASM

This project is a port of mpv into WebAssembly to run completely in the browser.

The goal was to bring mpv into the browser, allowing for the expansion of audio/video codecs supported,
as well as various container and subtitle formats.

Building upon the TypeScript API in conjunction with the React demo, there is hope to bring more
functionality from mpv to the web, such as shaders and web streaming.

## Requirements

Requires [mpv-build](https://github.com/brianhvo02/mpv-build), which was forked and now implements
build scripts for all dependencies needed by mpv into WebAssembly.

Our build script also uses [Emscripten](https://github.com/emscripten-core/emscripten) and 
[CMake](https://gitlab.kitware.com/cmake/cmake).

## Build

To build locally (requires mpv-build, CMake, and Emscripten):
```sh
MPV_BUILD_DIR=[path to mpv-build] npm run build:local
```

To build using Docker:
```sh
npm install
npm run build
```

## Usage

The MpvPlayer class is initialized through the asynchronous `load` method, which takes in the canvas
element to be drawn on, the network path to `libmpv.js`, and an optional callback object. This object
(called `ProxyOptions`) feeds callbacks to almost every property of MpvPlayer that listens for any 
changes to those properties. For example:

```js
const canvas = document.getElementById('canvas');
const logChange = (v, k) => console.log(`Property ${k} has been changed to ${v}.`);

const mpvPlayer = await MpvPlayer.load(canvas, '/static/js/libmpv.js', {
    idle: () => console.log('Player is now idle.'),
    duration: logChange,
    elapsed: logChange,
    videoStream: logChange,
    audioStream: logChange,
    audioTracks: trackInfo => console.log('Audio track info:', trackInfo),
    subtitleStream: logChange,
    currentChapter: logChange,
});
```

## Demos

The main React demo is hosted on [Vercel](https://libmpv-wasm.vercel.app).
To run the demo locally, build libmpv-wasm first as shown above, then run `npm run dev:demo`.
To run the vanilla demo, build libmpv-wasm first as shown above, then run `npm run dev:demo-vanilla`.

## Roadmap

- Integrate OpenSSL and allow loading URLs
- Implement OPFS filesystem browser (possible separate project)
- Find way to lift 4GB limit on file loading
