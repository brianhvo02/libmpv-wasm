import libmpvLoader from './libmpv.js';
import _ from 'lodash';
import { isAudioTrack, isVideoTrack } from './utils';
import { showOpenFilePicker } from 'native-file-system-adapter';
import { LibmpvModule } from './libmpv.js';

const LIMIT = 4 * 1024 * 1024 * 1024;

type ProxyHandle<K, V> = (this: MpvPlayer, value: V, key: K) => void;
interface ProxyOptions {
    idle: ProxyHandle<'idle', MpvPlayer['idle']>;
    isPlaying: ProxyHandle<'isPlaying', MpvPlayer['isPlaying']>;
    duration: ProxyHandle<'duration', MpvPlayer['duration']>;
    elapsed: ProxyHandle<'elapsed', MpvPlayer['elapsed']>;
    videoStream: ProxyHandle<'videoStream', MpvPlayer['videoStream']>;
    videoTracks: ProxyHandle<'videoTracks', MpvPlayer['videoTracks']>;
    audioStream: ProxyHandle<'audioStream', MpvPlayer['audioStream']>;
    audioTracks: ProxyHandle<'audioTracks', MpvPlayer['audioTracks']>;
    subtitleStream: ProxyHandle<'subtitleStream', MpvPlayer['subtitleStream']>;
    subtitleTracks: ProxyHandle<'subtitleTracks', MpvPlayer['subtitleTracks']>;
    currentChapter: ProxyHandle<'currentChapter', MpvPlayer['currentChapter']>;
    chapters: ProxyHandle<'chapters', MpvPlayer['chapters']>;
    isSeeking: ProxyHandle<'isSeeking', MpvPlayer['isSeeking']>;
    uploading: ProxyHandle<'uploading', MpvPlayer['uploading']>;
    title: ProxyHandle<'title', MpvPlayer['title']>;
    fileEnd: ProxyHandle<'fileEnd', MpvPlayer['fileEnd']>;
    files: ProxyHandle<'files', MpvPlayer['files']>;
    shaderCount: ProxyHandle<'shaderCount', MpvPlayer['shaderCount']>;
}

const isMpvPlayerProperty = (prop: string | symbol): prop is keyof MpvPlayer => [
    'idle', 'isPlaying', 'duration', 'elapsed',
    'videoStream', 'videoTracks', 'audioStream', 'audioTracks',
    'subtitleStream', 'subtitleTracks', 'currentChapter', 'chapters',
    'isSeeking', 'uploading', 'title', 'fileEnd', 'files', 'shaderCount'
].includes(typeof prop === 'symbol' ? prop.toString() : prop);

export default class MpvPlayer {
    module: LibmpvModule;

    fsWorker: Worker | null = null;
    mpvWorker: Worker | null = null;

    fileEnd = false;
    
    idle = false;
    isPlaying = false;
    duration = 0;
    elapsed = 0;

    videoStream = 1;
    audioStream = 1;
    subtitleStream = 1;
    currentChapter = 0;

    videoTracks: VideoTrack[] = [];
    audioTracks: AudioTrack[] = [];
    subtitleTracks: Track[] = [];
    chapters: Chapter[] = [];

    isSeeking = false;
    uploading = '';
    title: 0 | string = 0;
    files: string[] = [];

    shaderCount = -1;

    proxy: MpvPlayer;

    private constructor(module: LibmpvModule, options: Partial<ProxyOptions>) {
        this.module = module;

        this.proxy = new Proxy(this, {
            set(target, prop, newValue) {
                if (!isMpvPlayerProperty(prop))
                    return false;
                
                if (( prop === 'title' && !['string', 'number'].includes(typeof newValue) )
                    || ( prop !== 'title' && typeof newValue !== typeof target[prop] )
                ) return false;

                if (prop === 'idle' && target.idle != newValue) {
                    if (!target.fsWorker)
                        target.setupFsWorker();

                    target.getFiles();
                }

                // @ts-ignore
                target[prop] = newValue;

                if (options[prop as keyof typeof options]) {
                    // @ts-ignore
                    options[prop].call(target, newValue, prop);
                }
                
                return true;
            },
        });
        
        this.setupMpvWorker();
    }

    static async load(
        canvas: HTMLCanvasElement, mainScriptUrlOrBlob: string, options: Partial<ProxyOptions> = {}
    ) {
        const module = await libmpvLoader({
            canvas,
            mainScriptUrlOrBlob
        });

        return new this(module, options);
    }

    setupMpvWorker() {
        this.mpvWorker = this.module.PThread.runningWorkers.concat(this.module.PThread.unusedWorkers)[0];
        const listener = (e: MessageEvent) => {
            try {
                const payload = JSON.parse(e.data);
                switch (payload.type) {
                    case 'idle':
                        this.proxy.idle = true;
                        this.proxy.shaderCount = payload.shaderCount;
                        break;
                    case 'file-start':
                        this.proxy.fileEnd = false;
                        break;
                    case 'file-end':
                        this.proxy.fileEnd = true;
                        break;
                    case 'property-change':
                        switch (payload.name) {
                            case 'pause':
                                this.proxy.isPlaying = !payload.value;
                                break;
                            case 'duration':
                                this.proxy.duration = payload.value;
                                break;
                            case 'playback-time':
                                if (!this.isSeeking)
                                    this.proxy.elapsed = payload.value;
                                break;
                            case 'vid':
                                this.proxy.videoStream = parseInt(payload.value);
                                break;
                            case 'aid':
                                this.proxy.audioStream = parseInt(payload.value);
                                break;
                            case 'sid':
                                this.proxy.subtitleStream = parseInt(payload.value);
                                break;
                            case 'chapter':
                                this.proxy.currentChapter = parseInt(payload.value);
                                break;
                            case 'shaderCount':
                                this.proxy.shaderCount = payload.value;
                                break;
                            case 'metadata/by-key/title':
                                this.proxy.title = payload.value;
                                break;
                            default:
                                console.log(`event: property-change -> { name: ${
                                    payload.name
                                }, value: ${payload.value} }`);
                        }
                        break;
                    case 'track-list':
                        const bigIntKeys = [
                            'id', 'srcId', 'mainSelection', 'ffIndex', 
                            'demuxW', 'demuxH', 'demuxChannelCount', 'demuxSamplerate'
                        ];
                        
                        const tracks: Track[] = payload.tracks
                            .map((track: any) => _.mapKeys(track, (__, k) => _.camelCase(k)))
                            .map((track: any) => _.mapValues(track, (v, k) => bigIntKeys.includes(k) ? BigInt(v) : v ));
                            
                        const { videoTracks, audioTracks, subtitleTracks } = tracks.reduce(
                            (map: { 
                                videoTracks: VideoTrack[], 
                                audioTracks: AudioTrack[], 
                                subtitleTracks: Track[]
                            }, track) => {
                                if (isVideoTrack(track))
                                    map.videoTracks.push(track);
                                else if (isAudioTrack(track))
                                    map.audioTracks.push(track);
                                else
                                    map.subtitleTracks.push(track);

                                return map;
                            }, {
                                videoTracks: [], 
                                audioTracks: [], 
                                subtitleTracks: []
                            }
                        );
                        
                        this.proxy.videoTracks = videoTracks;
                        this.proxy.audioTracks = audioTracks;
                        this.proxy.subtitleTracks = subtitleTracks;
                        break;
                    case "chapter-list":
                        this.proxy.chapters = payload.chapters;
                        break;
                    default:
                        console.log('Recieved payload:', payload);
                }
            } catch (err) {
                // console.error(err);
                // console.log(e.data);
            }
        }

        this.mpvWorker.addEventListener('message', listener);
    }

    setupFsWorker() {
        console.log(this.proxy.module.PThread)
        const threadId = this.proxy.module.getFsThread();
        this.fsWorker = this.proxy.module.PThread.pthreads[threadId.toString()];

        const listener = (e: MessageEvent) => {
            const payload = JSON.parse(e.data);
            switch (payload.type) {
                case 'upload':
                    console.log('Uploading', payload.filename);
                    this.proxy.getFiles();
                    this.proxy.uploading = payload.filename;
                    break;
                case 'upload-complete':
                    console.log('Upload completed');
                    this.proxy.getFiles();
                    this.proxy.uploading = '';
                    break;
                default:
                    console.log('Recieved payload:', payload);
            }
        }

        this.fsWorker.addEventListener('message', listener);
    }

    getFiles = async () => navigator.storage.getDirectory()
        .then(opfsRoot => Array.fromAsync(opfsRoot.entries()))
        .then(entries => {
            const files = entries
                .filter(([, handle]) => handle.kind === 'file')
                .map(([name]) => name);

            if (files.length !== this.files.length)
                this.proxy.files = files;

            return files
        });

    async uploadFiles(path: string, files?: File[]) {
        if (!this.fsWorker)
            throw new Error('File system worker not initialized.');

        const pickedFiles = files ?? await showOpenFilePicker({ multiple: true })
            .then(files => Promise.all(files.map(file => file.getFile())))
            .catch(e => console.error(e));

        if (!pickedFiles?.length)
            return;

        this.proxy.uploading = pickedFiles[0].name;
        this.fsWorker.postMessage({ path, files: pickedFiles });
    }

    async mountFolder() {
        const directoryHandle = await showDirectoryPicker()
            .catch(e => console.error(e));
        
        if (!directoryHandle)
            return;

        this.proxy.module.PThread.runningWorkers[3].postMessage(directoryHandle);

        return directoryHandle;
    }
}