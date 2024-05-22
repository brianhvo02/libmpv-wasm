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
    setPlaybackTime(seconds: number): void;
    setVolume(volume: number): void;
    getTracks(): void;
    getChapters(): void;
    setVideoTrack(id: bigint): void;
    setAudioTrack(id: bigint): void;
    setSubtitleTrack(id: bigint): void;
    setChapter(id: bigint): void;
    getFsThread(): bigint;
    addShaders(): void;
    clearShaders(): void;
    getShaderCount(): number;
}

interface LoaderOptions {
    canvas: HTMLCanvasElement;
    mainScriptUrlOrBlob: string | Blob;
}

export type LibmpvModule = typeof RuntimeExports & EmbindModule;
export type LibmpvLoaderOptions = {
    canvas: HTMLCanvasElement,
    mainScriptUrlOrBlob: string,
}
export default function LibmpvLoader (options?: LoaderOptions): Promise<LibmpvModule>;