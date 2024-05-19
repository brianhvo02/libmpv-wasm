import libmpvLoader from 'libmpv-wasm/libmpv';
import type { LibmpvModule } from './types/libmpv';
import _ from 'lodash';
import { isAudioTrack, isVideoTrack } from './utils';

const LIMIT = 4 * 1024 * 1024 * 1024;

export default class MpvPlayer {
    module: LibmpvModule;

    fsWorker: Worker | null = null;
    mpvWorker: Worker | null = null;
    
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
    uploading = false;
    files: string[] = [];

    shaderCount = 0;

    proxy: MpvPlayer | null = null;

    private constructor(module: LibmpvModule) {
        this.module = module;
    }

    static async load(canvas: HTMLCanvasElement, mainScriptUrlOrBlob?: string) {
        const module = await libmpvLoader({
            canvas,
            mainScriptUrlOrBlob,
        });

        return new this(module);
    }

    setProxy(proxy: MpvPlayer) {
        this.proxy = proxy;

        this.setupMpvWorker();
    }

    setupMpvWorker() {
        const player = this.proxy ?? this;

        this.mpvWorker = this.module.PThread.runningWorkers.concat(this.module.PThread.unusedWorkers)[0];
        const listener = (e: MessageEvent) => {
            try {
                const payload = JSON.parse(e.data);
                switch (payload.type) {
                    case 'idle':
                        if (player.idle !== payload.value) {
                            this.setupFsWorker();
                            player.getFiles();
                            player.shaderCount = this.module.getShaderCount();
                        }
                        player.idle = true;
                        break;
                    case 'property-change':
                        switch (payload.name) {
                            case 'pause':
                                player.isPlaying = !payload.value;
                                break;
                            case 'duration':
                                player.duration = payload.value;
                                break;
                            case 'playback-time':
                                if (!this.isSeeking)
                                    player.elapsed = payload.value;
                                break;
                            case 'vid':
                                player.videoStream = parseInt(payload.value);
                                break;
                            case 'aid':
                                player.audioStream = parseInt(payload.value);
                                break;
                            case 'sid':
                                player.subtitleStream = parseInt(payload.value);
                                break;
                            case 'chapter':
                                player.currentChapter = parseInt(payload.value);
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
                        
                        player.videoTracks = videoTracks;
                        player.audioTracks = audioTracks;
                        player.subtitleTracks = subtitleTracks;
                        break;
                    case "chapter-list":
                        player.chapters = payload.chapters;
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
        const player = this.proxy ?? this;

        const threadId = player.module.getFsThread();
        this.fsWorker = player.module.PThread.pthreads[threadId.toString()];

        const listener = (e: MessageEvent) => {
            const payload = JSON.parse(e.data);
            switch (payload.type) {
                case 'upload':
                    console.log('Upload finished');
                    player.getFiles();
                    player.uploading = false;
                    break;
                default:
                    console.log('Recieved payload:', payload);
            }
        }

        this.fsWorker.addEventListener('message', listener);
    }

    getFiles = async () => navigator.storage.getDirectory()
        .then(opfsRoot => opfsRoot.getDirectoryHandle('mnt', { create: true }))
        .then(dirHandle => Array.fromAsync(dirHandle.keys()))
        .then(files => {
            (this.proxy ?? this).files = files;
            return files;
        });

    async uploadFiles() {
        if (!this.fsWorker)
            throw new Error('File system worker not initialized.');

        const files = await showOpenFilePicker()
            .then(files => Promise.all(files.map(file => file.getFile())))
            .catch(e => console.error(e));

        if (!files?.length)
            return;

        for (const file of files) {
            if (file.size < LIMIT)
                continue;

            throw new Error('File size exceeds 4GB file limit.');
        }

        this.uploading = true;
        this.fsWorker.postMessage(files);
    }
}