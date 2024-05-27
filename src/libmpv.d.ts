declare namespace RuntimeExports {
    namespace PThread {
        let unusedWorkers: Worker[];
        let runningWorkers: Worker[];
        let pthreads: Record<string, Worker>;
    }
}

interface EmbindModule {
    mpvInit(): void;
    loadFile(filename: string): void;
    togglePlay(): void;
    stop(): void;
    setPlaybackTime(seconds: number): void;
    setVolume(volume: number): void;
    getTracks(): void;
    getChapters(): void;
    setVideoTrack(id: bigint): void;
    setAudioTrack(id: bigint): void;
    setSubtitleTrack(id: bigint): void;
    setChapter(id: bigint): void;
    skipForward(): void;
    skipBackward(): void;
    getFsThread(): bigint;
    getMpvThread(): bigint;
    addShaders(): void;
    clearShaders(): void;
    getShaderCount(): number;
    matchWindowScreenSize(): void;
    createThumbnail(path: string): void;
}

interface LoaderOptions {
    canvas: HTMLCanvasElement;
    mainScriptUrlOrBlob: string | Blob;
}

type LibmpvModule = typeof RuntimeExports & EmbindModule;
type LibmpvLoaderOptions = {
    canvas: HTMLCanvasElement,
    mainScriptUrlOrBlob: string,
}
export default function LibmpvLoader (options?: LoaderOptions): Promise<LibmpvModule>;