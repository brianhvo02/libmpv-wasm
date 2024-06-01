interface ArrayConstructor {
    fromAsync<T>(iterableOrArrayLike: AsyncIterable<T> | Iterable<T | PromiseLike<T>> | ArrayLike<T | PromiseLike<T>>): Promise<T[]>;
    fromAsync<T, U>(iterableOrArrayLike: AsyncIterable<T> | Iterable<T> | ArrayLike<T>, mapFn: (value: Awaited<T>) => U, thisArg?: any): Promise<Awaited<U>[]>;
}

interface Track {
    id: bigint;
    type: string;
    srcId: bigint;
    programId?: number;
    title?: string;
    lang?: string;
    image: number;
    albumart: number;
    default: number;
    forced: number;
    dependent: number;
    visualImpaired: number;
    hearingImpaired: number;
    external: number;
    selected: number;
    mainSelection?: bigint;
    ffIndex: bigint;
    codec: string;
}

interface VideoTrack extends Track {
    codecDesc: string;
    codecProfile: string;
    demuxW: bigint;
    demuxH: bigint;
    demuxFps: number;
    demuxPar: number;
}

interface AudioTrack extends Track {
    audioChannels: number;
    codecDesc: string;
    demuxChannelCount: bigint;
    demuxChannels: string;
    demuxSamplerate: bigint;
}

interface Chapter {
    title: string;
    time: number;
}

interface Vector<T> {
    push_back(val: T): void;
    resize(size: number, val: T): void;
    size(): number;
    get(idx: number): T | undefined;
    set(idx: number, val: T): boolean;
    delete(): void;
}