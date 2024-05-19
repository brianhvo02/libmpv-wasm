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
    setVideoTrack(id: number): void;
    setAudioTrack(id: number): void;
    setSubtitleTrack(id: number): void;
    getFsThread(): BigInt;
    addShaders(): void;
    clearShaders(): void;
    getShaderCount(): number;
}

export type LibmpvModule = typeof RuntimeExports & EmbindModule;
export type LibmpvLoaderOptions = {
    canvas: HTMLCanvasElement,
    mainScriptUrlOrBlob: string,
}
export default function LibmpvLoader (options?: unknown): Promise<LibmpvModule>;