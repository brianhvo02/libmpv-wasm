interface ArrayConstructor {
    /**
     * Creates an array from an async iterator or iterable object.
     * @param iterableOrArrayLike An async iterator or array-like object to convert to an array.
     */
    fromAsync<T>(iterableOrArrayLike: AsyncIterable<T> | Iterable<T | PromiseLike<T>> | ArrayLike<T | PromiseLike<T>>): Promise<T[]>;

    /**
     * Creates an array from an async iterator or iterable object.
     *
     * @param iterableOrArrayLike An async iterator or array-like object to convert to an array.
     * @param mapfn A mapping function to call on every element of itarableOrArrayLike.
     *      Each return value is awaited before being added to result array.
     * @param thisArg Value of 'this' used when executing mapfn.
     */
    fromAsync<T, U>(iterableOrArrayLike: AsyncIterable<T> | Iterable<T> | ArrayLike<T>, mapFn: (value: Awaited<T>) => U, thisArg?: any): Promise<Awaited<U>[]>;
}

interface Track {
    id: number;
    type: string;
    srcId: number;
    title: string;
    lang: string;
    image: number;
    albumart: number;
    default: number;
    forced: number;
    dependent: number;
    visualImpaired: number;
    hearingImpaired: number;
    external: number;
    selected: number;
    mainSelection?: number;
    ffIndex: number;
    codec: string;
}

interface VideoTrack extends Track {
    codecDesc: string;
    codecProfile: string;
    demuxW: number;
    demuxH: number;
    demuxFps: number;
    demuxPar: number;
}

interface AudioTrack extends Track {
    audioChannels: number;
    codecDesc: string;
    demuxChannelCount: number;
    demuxChannels: string;
    demuxSamplerate: number;
}