import libmpvLoader, { BlurayDiscInfo, BlurayPlaylistInfo, MobjCmd } from './libmpv.js';
import _ from 'lodash';
import { getRandom, isAudioTrack, isVideoTrack, loadImage } from './utils';
import { MainModule } from './libmpv.js';

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
    extSubLoaded: ProxyHandle<'extSubLoaded', MpvPlayer['extSubLoaded']>;
    subDelay: ProxyHandle<'subDelay', MpvPlayer['subDelay']>;

    memory: ProxyHandle<'memory', MpvPlayer['memory']>;

    blurayDiscInfo: ProxyHandle<'blurayDiscInfo', MpvPlayer['blurayDiscInfo']>;
    blurayDiscPath: ProxyHandle<'blurayDiscPath', MpvPlayer['blurayDiscPath']>;
    objectIdx: ProxyHandle<'objectIdx', MpvPlayer['objectIdx']>;

    blurayTitle: ProxyHandle<'blurayTitle', MpvPlayer['blurayTitle']>;
    playlistId: ProxyHandle<'playlistId', MpvPlayer['playlistId']>;
    playItemId: ProxyHandle<'playItemId', MpvPlayer['playItemId']>;
    menuCallAllow: ProxyHandle<'menuCallAllow', MpvPlayer['menuCallAllow']>;

    menuPictures: ProxyHandle<'menuPictures', MpvPlayer['menuPictures']>;
    menuActivated: ProxyHandle<'menuActivated', MpvPlayer['menuActivated']>;
    menuSelected: ProxyHandle<'menuSelected', MpvPlayer['menuSelected']>;
    menuPageId: ProxyHandle<'menuPageId', MpvPlayer['menuPageId']>;
    hasPopupMenu: ProxyHandle<'hasPopupMenu', MpvPlayer['hasPopupMenu']>;
}

const isMpvPlayerProperty = (prop: string | symbol): prop is keyof MpvPlayer => [
    'idle', 'isPlaying', 'duration', 'elapsed',
    'videoStream', 'videoTracks', 'audioStream', 'audioTracks',
    'subtitleStream', 'subtitleTracks', 'currentChapter', 'chapters',
    'isSeeking', 'uploading', 'title', 'fileEnd', 'files', 'shaderCount', 'extSubLoaded', 'subDelay',
    'memory', 'blurayDiscInfo', 'blurayDiscPath', 'objectIdx', 'blurayTitle', 'menuCallAllow',
    'playlistId', 'playItemId', 'menuPictures', 'menuActivated', 'menuSelected', 'menuPageId', 'hasPopupMenu'
].includes(typeof prop === 'symbol' ? prop.toString() : prop);

export default class MpvPlayer {
    module: MainModule;

    fsWorker: Worker | null = null;
    mpvWorker: Worker | null = null;

    fileEnd = false;
    
    idle = false;
    isPlaying = false;
    duration = 0;
    elapsed = 0;

    memory: Record<number, number> = {};

    blurayDiscInfo: BlurayDiscInfo | null = null;
    blurayDiscPath = '/';
    objectIdx = 0;
    menuIdx = 0;

    videoStream = 1;
    audioStream = 1;
    nextAudioTrack: number | null = null;
    currentChapter = 0;
    subtitleStream = 1;
    subtitleDispFlag = false;
    
    blurayTitle = 0;
    playlistId = 0;
    playItemId = 0;

    menuPictures: Record<string, Record<string, Record<string, HTMLImageElement>>> = {};
    menuActivated = false;
    menuSelected = 0;
    menuPageId = -1;
    buttonState: number[] = [];
    menuCallAllow = false;
    hasPopupMenu = false;
    menuInitiated = false;

    resumeInfo: ResumeInfo | null = null;

    videoTracks: VideoTrack[] = [];
    audioTracks: AudioTrack[] = [];
    subtitleTracks: Track[] = [];
    chapters: Chapter[] = [];

    isSeeking = false;
    uploading = '';
    title: 0 | string = 0;
    files: string[] = [];

    shaderCount = -1;
    extSubLoaded = false;
    subDelay = 0;

    proxy: MpvPlayer;

    static vectorToArray<T>(vector: Vector<T>) {
        const arr: T[] = [];

        for (let i = 0; i < vector.size(); i++) {
            const val = vector.get(i);
            if (val === undefined) continue;
            arr.push(val);
        }
            
        return arr;
    }

    private constructor(module: MainModule, options: Partial<ProxyOptions>) {
        this.module = module;

        this.proxy = new Proxy(this, {
            set(target, prop, newValue) {
                if (!isMpvPlayerProperty(prop))
                    return false;
                
                if (( prop === 'title' && !['string', 'number'].includes(typeof newValue) )
                    || ( prop !== 'title' && typeof newValue !== typeof target[prop] )
                ) return false;

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
    
    static destructPlaylist(playlist: BlurayPlaylistInfo) {
        playlist.clips.delete();
        playlist.marks.delete();
        playlist.igs.palettes.delete();
        playlist.igs.pictures.delete();
        playlist.igs.menu.pages.delete();
    }

    async setupMpvWorker() {
        const mainThread = await new Promise<number>(resolve => {
            const interval = setInterval(() => {
                const threadId = this.module.getMpvThread();
                if (!threadId) return;
                clearInterval(interval);
                resolve(threadId);
            }, 100);
        });
        const pthreads: Record<number, Worker> = this.module.PThread.pthreads;
        this.mpvWorker = pthreads[mainThread];
        if (!this.mpvWorker)
            throw new Error('mpv worker not found');

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
                            case 'playlist-current-pos':
                                if (this.blurayDiscInfo) {
                                    if (payload.value > 0)
                                        this.proxy.playItemId++;
                                    
                                    if (payload.value === '-1')
                                        this.nextObjectCommand();
                                }
                                break;
                            case 'playback-time':
                                if (this.isSeeking) break;

                                if (this.blurayDiscInfo && ![0, 0xFFFF].includes(this.blurayTitle)) {
                                    const currentPlaylistChapter = (chapter: Chapter) => chapter.title.includes('Clip ' + (this.playItemId + 1));
                                    const firstIdx = this.chapters.findIndex(currentPlaylistChapter)
                                    const lastIdx = this.chapters.findLastIndex(currentPlaylistChapter);
                                    const chapterIdx = this.chapters.slice(firstIdx, lastIdx + 1)
                                        .findIndex(chapter => payload.value <= chapter.time) - 1;
                                    this.proxy.currentChapter = chapterIdx < 0 ? lastIdx < 0 ? 0 : lastIdx : (firstIdx + chapterIdx);
                                }

                                this.proxy.elapsed = payload.value;
                                break;
                            case 'vid':
                                this.proxy.videoStream = parseInt(payload.value);
                                break;
                            case 'aid':
                                this.proxy.audioStream =  parseInt(payload.value);
                                break;
                            case 'sid':
                                this.proxy.subtitleStream = parseInt(payload.value);
                                if (this.blurayDiscInfo && this.subtitleStream)
                                    this.subtitleDispFlag = true;
                                break;
                            case 'chapter':
                                this.proxy.currentChapter = parseInt(payload.value);
                                break;
                            case 'shaderCount':
                                this.proxy.shaderCount = payload.value;
                                break;
                            case 'media-title':
                                if (!this.blurayDiscInfo?.discName)
                                    this.proxy.title = payload.value;
                                break;
                            case 'sub-delay':
                                this.proxy.subDelay = Math.round((payload.value + Number.EPSILON) * 10) / 10;
                                break;
                            default:
                                console.log(`event: property-change -> { name: ${
                                    payload.name
                                }, value: ${payload.value} }`);
                        }
                        break;
                    case 'track-list':
                        this.proxy.extSubLoaded = false;

                        const bigIntKeys = [
                            'id', 'srcId', 'mainSelection', 'ffIndex', 
                            'demuxW', 'demuxH', 'demuxChannelCount', 'demuxSamplerate'
                        ];
                        
                        const tracks: Track[] = payload.tracks
                            .map((track: any) => _.mapKeys(track, (__, k) => _.camelCase(k)))
                            .map((track: any) => _.mapValues(track, (v, k) => bigIntKeys.includes(k) ? BigInt(v) : v ));
                            
                        const audioTrackSrcIds: bigint[] = [];

                        const { videoTracks, audioTracks, subtitleTracks } = tracks.reduce(
                            (map: { 
                                videoTracks: VideoTrack[], 
                                audioTracks: AudioTrack[], 
                                subtitleTracks: Track[]
                            }, track) => {
                                if (isVideoTrack(track))
                                    map.videoTracks.push(track);
                                else if (isAudioTrack(track) && !audioTrackSrcIds.includes(track.srcId)) {
                                    map.audioTracks.push(track);
                                    audioTrackSrcIds.push(track.srcId);
                                } else
                                    map.subtitleTracks.push(track);

                                return map;
                            }, {
                                videoTracks: [], 
                                audioTracks: [], 
                                subtitleTracks: []
                            }
                        );
                        
                        if (this.blurayDiscInfo && this.nextAudioTrack && audioTracks[this.nextAudioTrack]) {
                            this.module.setAudioTrack(audioTracks[this.nextAudioTrack].id);
                            this.nextAudioTrack = null;
                        }
                        
                        this.proxy.videoTracks = videoTracks;
                        this.proxy.audioTracks = audioTracks;
                        this.proxy.subtitleTracks = subtitleTracks;
                        break;
                    case "chapter-list":
                        if (!this.blurayDiscInfo)
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

    getDirectories = (): Promise<FileSystemDirectoryHandle[]> => 
        this.module.ExternalFS.getAllStoredHandles();

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

    async mountFolder(): Promise<Record<string, FileSystemDirectoryHandle>> {
        const directoryHandle = await showDirectoryPicker()
            .catch(e => console.error(e));
        
        if (!directoryHandle)
            return {};

        const name: string = await this.module.ExternalFS.addDirectory(directoryHandle)
        return { [name]: directoryHandle };
    }

    getMemoryValue(addr: number) {
        if (addr < 0x80000000)
            return this.memory[addr] ?? 0;

        addr -= 0x80000000;

        switch (addr) {
            case 1:
                return this.nextAudioTrack 
                    ? this.nextAudioTrack + 1
                    : this.audioStream;
            case 2:
                const dispFlag = this.subtitleDispFlag ? 0x80000000 : 0;
                return Number(BigInt(this.subtitleStream) | BigInt(dispFlag));
            case 4:
            case 36:
                return this.blurayTitle;
            case 5:
            case 37:
                return this.currentChapter + 1;
            case 6:
                return this.playlistId;
            case 7:
                return this.playItemId;
            case 10:
                return this.menuSelected;
            case 11:
                return this.menuPageId > -1 ? this.menuPageId : 0;
            case 26:
                return Number(screen.height >= 2160 && screen.width >= 3840);
            default:
                console.log('Unknown PSR address:', addr);
                return 0;
        }
    }

    setMemoryValue(addr: number, val: number) {
        if (addr < 0x80000000) {
            this.memory[addr] = val;
            return;
        }

        addr -= 0x80000000;

        switch (addr) {
            case 1:
                this.module.setAudioTrack(this.audioTracks[val - 1].id);
                return;
            case 2:
                this.module.setSubtitleTrack(BigInt(val));
                return;
            case 4:
            case 36:
                this.proxy.blurayTitle = val;
                return;
            case 5:
            case 37:
                this.proxy.currentChapter = val - 1;
                return;
            case 6:
                this.proxy.playlistId = val;
                return;
            case 7:
                this.proxy.playItemId = val;
                return;
            case 10:
                this.proxy.menuSelected = val;
                return;
            case 11:
                this.proxy.menuPageId = val;
                return;
            default:
                console.log('Unknown PSR address:', addr);
                return;
        }
    }

    async nextObjectCommand(): Promise<void> {
        if (!this.blurayDiscInfo) return;

        const object = this.blurayDiscInfo.mobjObjects.objects.get(
            this.blurayTitle === 0xFFFF
                ? this.blurayDiscInfo.firstPlayIdx
                : Number(this.blurayDiscInfo.titleMap.get(this.blurayTitle))
        );

        if (!object) throw new Error('Object not found');

        if (this.menuCallAllow !== !object.menuCallMask)
            this.proxy.menuCallAllow = !object.menuCallMask;

        if (object.cmds.size() === this.objectIdx)
            return console.log('End of object commands');

        const command = object.cmds.get(this.objectIdx);
        if (!command) throw new Error('Object command not found');

        const ret = await this.executeCommand(command);
        
        if (this.blurayTitle !== 0xFFFF)
            object.cmds.delete();
        
        const playlist = this.blurayDiscInfo?.playlists.get(this.playlistId.toString());
        
        if (ret === 2) {
            if ((!this.blurayTitle || (!this.menuCallAllow && playlist?.igs.menu.pages.get(0))) && !this.menuInitiated) {
                this.menuInitiated = true;
                return this.nextMenuCommand();
            } else if (this.blurayTitle) {
                this.menuInitiated = false;
            } else {
                return this.nextMenuCommand();
            }
            
            return;
        }

        if (playlist)
            MpvPlayer.destructPlaylist(playlist);

        if (ret) return this.nextObjectCommand();
    }

    menuActivate() {
        this.proxy.menuActivated = true;
        this.menuIdx = 0;
    }

    async nextMenuCommand(): Promise<void> {
        
        const playlist = this.blurayDiscInfo?.playlists.get(this.playlistId.toString());
        if (!playlist) throw new Error('Playlist not found');
        
        const menu = playlist.igs.menu.pages.get(this.menuPageId < 0 ? 0 : this.menuPageId);
        if (!menu) throw new Error('Menu not found');

        if (this.menuPageId < 0) {
            this.proxy.menuPageId = 0;
            this.buttonState = MpvPlayer.vectorToArray(menu.bogs)
                .map(bog => bog.defButton);
        }

        const button = menu.buttons.get(this.menuSelected.toString());
        if (!button) throw new Error('Button not found');
            
        const command = button.commands.get(this.menuIdx);
        
        if (!command)
            throw new Error('Menu command not found');
        
        const run = (button?.autoAction || this.menuActivated) && await this.executeCommand(command, true);

        MpvPlayer.destructPlaylist(playlist);

        if (run === 1) return this.nextMenuCommand();
    }

    resetMenu() {
        this.proxy.menuPageId = -1;
        this.proxy.menuSelected = 0;
        this.menuIdx = 0;
        this.buttonState = [];
        this.proxy.menuActivated = false;
    }

    generateResumeInfo() {  
        this.resumeInfo = {
            blurayTitle: this.blurayTitle,
            objectIdx: this.objectIdx,
            playlistId: this.playlistId,
            playItemId: this.playItemId,
            resumeTime: this.elapsed
        };
    }

    openTopMenu() {
        if (!this.blurayDiscInfo?.topMenuSupported) return;

        const object = this.blurayDiscInfo.mobjObjects.objects.get(
            this.blurayTitle === 0xFFFF
                ? this.blurayDiscInfo.firstPlayIdx
                : Number(this.blurayDiscInfo.titleMap.get(this.blurayTitle))
        );

        if (!object) throw new Error('Object not found');

        if (object.resumeIntentionFlag)
            this.generateResumeInfo();

        object.cmds.delete();

        this.proxy.blurayTitle = 0;
        this.objectIdx = 0;
        this.resetMenu();
        this.nextObjectCommand();
    }

    async executeCommand(cmd: MobjCmd, menu = false) {
        // console.log(menu ? {
        //     memory: { ...this.memory },
        //     playlistId: this.playlistId,
        //     menuPageId: this.menuPageId, 
        //     menuSelected: this.menuSelected, 
        //     menuIdx: this.menuIdx, 
        //     insn: cmd.insn,
        //     dst: cmd.dst.toString(16).padStart(8, '0'),
        //     src: cmd.src.toString(16).padStart(8, '0')
        // } : {
        //     memory: { ...this.memory },
        //     blurayTitle: this.blurayTitle,
        //     objectIdx: this.objectIdx, 
        //     insn: cmd.insn,
        //     dst: cmd.dst.toString(16).padStart(8, '0'),
        //     src: cmd.src.toString(16).padStart(8, '0')
        // });
        switch (cmd.insn.grp) {
            case HDMV_INSN_GRP.INSN_GROUP_BRANCH:
                switch (cmd.insn.subGrp) {
                    case HDMV_INSN_GRP_BRANCH.BRANCH_GOTO:
                        switch (cmd.insn.branchOpt) {
                            case HDMV_INSN_GOTO.INSN_NOP:
                                if (menu) this.menuIdx++;
                                else this.proxy.objectIdx++;
                                return 1;
                            case HDMV_INSN_GOTO.INSN_GOTO:
                                if (menu) this.menuIdx = cmd.dst;
                                else this.proxy.objectIdx = cmd.dst;
                                return 1;
                            case HDMV_INSN_GOTO.INSN_BREAK:
                                this.proxy.objectIdx++;
                                return 0;
                            default:
                                console.log('Unknown BRANCH_GOTO:', cmd.insn.branchOpt.toString(16));
                        }
                        return 0;
                    case HDMV_INSN_GRP_BRANCH.BRANCH_JUMP:
                        switch (cmd.insn.branchOpt) {
                            case HDMV_INSN_JUMP.INSN_CALL_OBJECT:
                            case HDMV_INSN_JUMP.INSN_CALL_TITLE:
                                this.generateResumeInfo();
                            case HDMV_INSN_JUMP.INSN_JUMP_OBJECT:
                            case HDMV_INSN_JUMP.INSN_JUMP_TITLE:
                                this.proxy.blurayTitle = cmd.insn.immOp1 
                                    ? cmd.dst : this.getMemoryValue(cmd.dst);

                                this.proxy.objectIdx = 0;

                                if (menu) {
                                    this.resetMenu();
                                    this.nextObjectCommand();
                                    return 0;
                                } else return 1;
                            case HDMV_INSN_JUMP.INSN_RESUME:
                                if (!this.resumeInfo) throw new Error('No resume info found');

                                const { blurayTitle, objectIdx, playlistId, playItemId, resumeTime } = this.resumeInfo;
                                this.proxy.blurayTitle = blurayTitle;
                                this.proxy.objectIdx = objectIdx;

                                const playlist = this.blurayDiscInfo?.playlists.get(playlistId.toString());
                                if (!playlist) throw new Error('Playlist not found');

                                const vector = new this.module.StringVector();
                                MpvPlayer.vectorToArray(playlist.clips).slice(playItemId)
                                    .forEach((clip, i) => i 
                                        ? vector.push_back(`/${this.blurayDiscPath}/BDMV/STREAM/${clip.clipId}.m2ts`)
                                        : this.module.loadFile(
                                            `/${this.blurayDiscPath}/BDMV/STREAM/${clip.clipId}.m2ts`, 
                                            `start=${resumeTime},` +
                                            'aid=' + (this.nextAudioTrack !== null
                                                ? this.audioTracks[this.nextAudioTrack].id
                                                : this.audioStream
                                                    ? this.audioStream
                                                    : 'auto'
                                            )
                                        ));

                                this.module.loadFiles(vector);

                                vector.delete();
                                MpvPlayer.destructPlaylist(playlist);

                                const object = this.blurayDiscInfo?.mobjObjects.objects.get(
                                    this.blurayTitle === 0xFFFF
                                        ? this.blurayDiscInfo.firstPlayIdx
                                        : Number(this.blurayDiscInfo.titleMap.get(this.blurayTitle))
                                );
                        
                                if (!object) throw new Error('Object not found');

                                this.proxy.menuCallAllow = !object.menuCallMask;

                                object.cmds.delete();

                                this.proxy.playlistId = playlistId;
                                this.proxy.playItemId = playItemId;
                                this.proxy.hasPopupMenu = Boolean(playlist.igs.menu.pageCount && this.blurayTitle !== 0);
                                this.getBlurayChapters();
                                
                                if (menu) this.resetMenu();
                                this.menuInitiated = false;

                                this.resumeInfo = null;

                                return 0;
                            default:
                                console.log('Unknown BRANCH_JUMP:', cmd.insn.branchOpt.toString(16));
                        }
                        return 0;
                    case HDMV_INSN_GRP_BRANCH.BRANCH_PLAY:
                        const dstVal = cmd.insn.immOp1 ? cmd.dst : this.getMemoryValue(cmd.dst);
                        const srcVal = cmd.insn.immOp2 ? cmd.src : this.getMemoryValue(cmd.src);
                        switch (cmd.insn.branchOpt) {
                            case HDMV_INSN_PLAY.INSN_PLAY_PL:
                            case HDMV_INSN_PLAY.INSN_PLAY_PL_PI: {
                                const playlist = this.blurayDiscInfo?.playlists.get(dstVal.toString());
                                if (!playlist) throw new Error('Playlist not found');
                                
                                const src = cmd.insn.branchOpt === HDMV_INSN_PLAY.INSN_PLAY_PL ? cmd.src : srcVal;

                                const vector = new this.module.StringVector();
                                MpvPlayer.vectorToArray(playlist.clips).slice(src)
                                    .forEach((clip, i) => i 
                                        ? vector.push_back(
                                            `/${this.blurayDiscPath}/BDMV/STREAM/${clip.clipId}.m2ts`
                                        ) : this.module.loadFile(
                                            `/${this.blurayDiscPath}/BDMV/STREAM/${clip.clipId}.m2ts`, 
                                            'aid=' + (this.nextAudioTrack !== null
                                                ? this.audioTracks[this.nextAudioTrack]?.id
                                                : this.audioStream
                                                    ? this.audioStream
                                                    : 'auto'
                                            )
                                        )
                                    );

                                this.module.loadFiles(vector);

                                vector.delete();
                                MpvPlayer.destructPlaylist(playlist);

                                this.proxy.playlistId = dstVal;
                                this.proxy.playItemId = src;
                                this.proxy.hasPopupMenu = Boolean(playlist.igs.menu.pageCount && this.blurayTitle !== 0);
                                this.getBlurayChapters();
                                
                                if (menu) this.resetMenu();
                                else this.proxy.objectIdx++;

                                return 2;
                            }
                            case HDMV_INSN_PLAY.INSN_PLAY_PL_PM: {
                                const playlist = this.blurayDiscInfo?.playlists.get(dstVal.toString());
                                if (!playlist) throw new Error('Playlist not found');

                                const playMark = playlist.marks.get(srcVal);
                                if (!playMark) throw new Error('Play mark not found');

                                const vector = new this.module.StringVector();
                                const clips = MpvPlayer.vectorToArray(playlist.clips);
                                const duration = clips.slice(0, playMark.clipRef)
                                    .reduce((duration, clip) => duration + clip.outTime - clip.inTime, 0n);
                                clips.slice(playMark.clipRef)
                                    .forEach((clip, i) => i
                                        ? vector.push_back(`/${this.blurayDiscPath}/BDMV/STREAM/${clip.clipId}.m2ts`)
                                        : this.module.loadFile(
                                            `/${this.blurayDiscPath}/BDMV/STREAM/${clip.clipId}.m2ts`, 
                                            `start=${(playMark.start - duration) / 90000n},` +
                                            'aid=' + (this.nextAudioTrack !== null
                                                ? this.audioTracks[this.nextAudioTrack].id
                                                : this.audioStream
                                                    ? this.audioStream
                                                    : 'auto'
                                            )
                                        ));

                                this.module.loadFiles(vector);

                                this.proxy.playlistId = dstVal;
                                this.proxy.playItemId = playMark.clipRef;
                                this.proxy.hasPopupMenu = Boolean(playlist.igs.menu.pageCount && this.blurayTitle !== 0);
                                this.getBlurayChapters();

                                vector.delete();
                                MpvPlayer.destructPlaylist(playlist);

                                if (menu) this.resetMenu();
                                else this.proxy.objectIdx++;

                                return 2;
                            }
                            case HDMV_INSN_PLAY.INSN_TERMINATE_PL:
                                this.module.stop();
                                this.proxy.objectIdx++;
                                return 0;
                            case HDMV_INSN_PLAY.INSN_LINK_PI: {
                                const playlist = this.blurayDiscInfo?.playlists.get(this.playlistId.toString());
                                if (!playlist) throw new Error('Playlist not found');

                                const vector = new this.module.StringVector();
                                MpvPlayer.vectorToArray(playlist.clips).slice(dstVal)
                                    .forEach((clip, i) => i 
                                        ? vector.push_back(`/${this.blurayDiscPath}/BDMV/STREAM/${clip.clipId}.m2ts`) 
                                        : this.module.loadFile(
                                            `/${this.blurayDiscPath}/BDMV/STREAM/${clip.clipId}.m2ts`, 
                                            'aid=' + (this.nextAudioTrack !== null
                                                ? this.audioTracks[this.nextAudioTrack].id
                                                : this.audioStream
                                                    ? this.audioStream
                                                    : 'auto'
                                            )
                                        ));

                                this.module.loadFiles(vector);

                                vector.delete();
                                MpvPlayer.destructPlaylist(playlist);

                                this.proxy.playItemId = dstVal;
                                this.proxy.hasPopupMenu = Boolean(playlist.igs.menu.pageCount && this.blurayTitle !== 0);
                                this.getBlurayChapters();
                                
                                if (menu) this.resetMenu();
                                else this.proxy.objectIdx++;

                                return 2;
                            }
                            case HDMV_INSN_PLAY.INSN_LINK_MK:
                                const playlist = this.blurayDiscInfo?.playlists.get(this.playlistId.toString());
                                if (!playlist) throw new Error('Playlist not found');

                                const playMark = playlist.marks.get(dstVal);
                                if (!playMark) throw new Error('Play mark not found');

                                const vector = new this.module.StringVector();
                                const clips = MpvPlayer.vectorToArray(playlist.clips);
                                const duration = clips.slice(0, playMark.clipRef)
                                    .reduce((duration, clip) => duration + clip.outTime - clip.inTime, 0n);
                                clips.slice(playMark.clipRef)
                                    .forEach((clip, i) => i
                                        ? vector.push_back(`/${this.blurayDiscPath}/BDMV/STREAM/${clip.clipId}.m2ts`)
                                        : this.module.loadFile(
                                            `/${this.blurayDiscPath}/BDMV/STREAM/${clip.clipId}.m2ts`, 
                                            `start=${(playMark.start - duration) / 90000n},` +
                                            'aid=' + (this.nextAudioTrack !== null
                                                ? this.audioTracks[this.nextAudioTrack].id
                                                : this.audioStream
                                                    ? this.audioStream
                                                    : 'auto'
                                            )
                                        ));

                                this.module.loadFiles(vector);

                                vector.delete();
                                MpvPlayer.destructPlaylist(playlist);

                                this.proxy.playItemId = playMark.clipRef;
                                this.proxy.hasPopupMenu = Boolean(playlist.igs.menu.pageCount && this.blurayTitle !== 0);
                                this.getBlurayChapters();
                                
                                if (menu) this.resetMenu();
                                else this.proxy.objectIdx++;

                                return 2; 
                            default:
                                console.log('Unknown BRANCH_PLAY:', cmd.insn.branchOpt.toString(16));
                        }
                        return 0;
                    default:
                        console.log('Unknown HDMV_INSN_GRP_BRANCH:', cmd.insn.subGrp.toString(16));
                }
                return 0;
            case HDMV_INSN_GRP.INSN_GROUP_CMP:
                const dstVal = cmd.insn.immOp1 ? cmd.dst : this.getMemoryValue(cmd.dst);
                const srcVal = cmd.insn.immOp2 ? cmd.src : this.getMemoryValue(cmd.src);
                switch (cmd.insn.cmpOpt) {
                    case HDMV_INSN_CMP.INSN_BC:
                        console.log('INSN_BC not yet implemented');
                        return 0;
                    case HDMV_INSN_CMP.INSN_EQ:
                        if (menu) (dstVal === srcVal ? this.menuIdx++ : (this.menuIdx += 2))
                        else (dstVal === srcVal ? this.objectIdx++ : (this.objectIdx += 2));
                        return 1;
                    case HDMV_INSN_CMP.INSN_NE:
                        if (menu) dstVal !== srcVal ? this.menuIdx++ : (this.menuIdx += 2)
                        else dstVal !== srcVal ? this.objectIdx++ : (this.objectIdx += 2);
                        return 1;
                    case HDMV_INSN_CMP.INSN_GE:
                        if (menu) dstVal >= srcVal ? this.menuIdx++ : (this.menuIdx += 2)
                        else dstVal >= srcVal ? this.objectIdx++ : (this.objectIdx += 2);
                        return 1;
                    case HDMV_INSN_CMP.INSN_GT:
                        if (menu) dstVal > srcVal ? this.menuIdx++ : (this.menuIdx += 2)
                        else dstVal > srcVal ? this.objectIdx++ : (this.objectIdx += 2);
                        return 1;
                    case HDMV_INSN_CMP.INSN_LE:
                        if (menu) dstVal <= srcVal ? this.menuIdx++ : (this.menuIdx += 2)
                        else dstVal <= srcVal ? this.objectIdx++ : (this.objectIdx += 2);
                        return 1;
                    case HDMV_INSN_CMP.INSN_LT:
                        if (menu) dstVal < srcVal ? this.menuIdx++ : (this.menuIdx += 2)
                        else dstVal < srcVal ? this.objectIdx++ : (this.objectIdx += 2);
                        return 1;
                    default:
                        console.log('Unknown HDMV_INSN_CMP:', cmd.insn.subGrp.toString(16));
                }
                return 0;
            case HDMV_INSN_GRP.INSN_GROUP_SET:
                switch (cmd.insn.subGrp) {
                    case HDMV_INSN_GRP_SET.SET_SET:
                        const dstVal = cmd.insn.immOp1 ? cmd.dst : this.getMemoryValue(cmd.dst);
                        const srcVal = cmd.insn.immOp2 ? cmd.src : this.getMemoryValue(cmd.src);
                        switch (cmd.insn.setOpt) {
                            case HDMV_INSN_SET.INSN_MOVE:
                                this.setMemoryValue(cmd.dst, srcVal);
                                if (menu) this.menuIdx++;
                                else this.proxy.objectIdx++;
                                return 1;
                            case HDMV_INSN_SET.INSN_SWAP:
                                this.setMemoryValue(cmd.dst, srcVal);
                                this.setMemoryValue(cmd.src, dstVal);
                                if (menu) this.menuIdx++;
                                else this.proxy.objectIdx++;
                                return 1;
                            case HDMV_INSN_SET.INSN_ADD:
                                this.setMemoryValue(cmd.dst, dstVal + srcVal);
                                if (menu) this.menuIdx++;
                                else this.proxy.objectIdx++;
                                return 1;
                            case HDMV_INSN_SET.INSN_SUB:
                                if (dstVal > srcVal)
                                    this.setMemoryValue(cmd.dst, dstVal - srcVal);
                                if (menu) this.menuIdx++;
                                else this.proxy.objectIdx++;
                                return 1;
                            case HDMV_INSN_SET.INSN_MUL:
                                this.setMemoryValue(cmd.dst, dstVal * srcVal);
                                if (menu) this.menuIdx++;
                                else this.proxy.objectIdx++;
                                return 1;
                            case HDMV_INSN_SET.INSN_DIV:
                                this.setMemoryValue(cmd.dst, dstVal / srcVal);
                                if (menu) this.menuIdx++;
                                else this.proxy.objectIdx++;
                                return 1;
                            case HDMV_INSN_SET.INSN_MOD:
                                this.setMemoryValue(cmd.dst, dstVal % srcVal);
                                if (menu) this.menuIdx++;
                                else this.proxy.objectIdx++;
                                return 1;
                            case HDMV_INSN_SET.INSN_RND:
                                this.setMemoryValue(cmd.dst, getRandom(1, srcVal));
                                if (menu) this.menuIdx++;
                                else this.proxy.objectIdx++;
                                return 1;
                            case HDMV_INSN_SET.INSN_AND:
                                this.setMemoryValue(cmd.dst, Number(BigInt(srcVal) & BigInt(dstVal)));
                                if (menu) this.menuIdx++;
                                else this.proxy.objectIdx++;
                                return 1;
                            case HDMV_INSN_SET.INSN_OR:
                                this.setMemoryValue(cmd.dst, Number(BigInt(srcVal) | BigInt(dstVal)));
                                if (menu) this.menuIdx++;
                                else this.proxy.objectIdx++;
                                return 1;
                            case HDMV_INSN_SET.INSN_XOR:
                                this.setMemoryValue(cmd.dst, Number(BigInt(srcVal) ^ BigInt(dstVal)));
                                if (menu) this.menuIdx++;
                                else this.proxy.objectIdx++;
                                return 1;
                            case HDMV_INSN_SET.INSN_BITSET:
                                this.setMemoryValue(cmd.dst, Number(BigInt(2**srcVal) | BigInt(dstVal)));
                                return 1;
                            case HDMV_INSN_SET.INSN_BITCLR:
                                this.setMemoryValue(cmd.dst, Number(BigInt(2**srcVal) ^ BigInt(dstVal)));
                                return 1;
                            case HDMV_INSN_SET.INSN_SHL:
                                this.setMemoryValue(cmd.dst, Number(BigInt(dstVal) << BigInt(srcVal)));
                                return 0;
                            case HDMV_INSN_SET.INSN_SHR:
                                this.setMemoryValue(cmd.dst, Number(BigInt(dstVal) >> BigInt(srcVal)));
                                return 0;
                            default:
                                console.log('Unknown HDMV_INSN_SET:', cmd.insn.subGrp.toString(16));
                        }
                        return 0;
                    case HDMV_INSN_GRP_SET.SET_SETSYSTEM:
                        switch (cmd.insn.setOpt) {
                            case HDMV_INSN_SETSYSTEM.INSN_SET_STREAM:
                                const audioFlag = (BigInt(cmd.dst) & 0x80000000n) >> 31n;
                                const pgFlag = (BigInt(cmd.dst) & 0x8000n) >> 15n;
                                const dispFlag = (BigInt(cmd.dst) & 0x4000n) >> 14n;
                                // const igFlag = (BigInt(cmd.src) & 0x80000000n) >> 31n;
                                // const angleFlag = (BigInt(cmd.src) & 0x8000n) >> 15n;
                                
                                const newAudioStream = Number((BigInt(cmd.dst) & 0xFF0000n) >> 16n);
                                const trackIdx = (cmd.insn.immOp1 
                                    ? newAudioStream 
                                    : this.getMemoryValue(newAudioStream)
                                ) - 1;
                                if (audioFlag) this.audioTracks[trackIdx]
                                    ? this.module.setAudioTrack(this.audioTracks[trackIdx].id)
                                    : (this.nextAudioTrack = trackIdx);

                                const newSubtitleStream = BigInt(cmd.dst) & 0xFFn;
                                if (pgFlag) {
                                    this.subtitleDispFlag = !!(dispFlag);
                                    this.module.setSubtitleTrack(dispFlag
                                        ? cmd.insn.immOp1 
                                            ? newSubtitleStream 
                                            : BigInt(this.getMemoryValue(Number(newSubtitleStream)))
                                        : 0n);
                                }
                                
                                if (menu) this.menuIdx++;
                                else this.proxy.objectIdx++;
                                return 1;
                            case HDMV_INSN_SETSYSTEM.INSN_SET_NV_TIMER:
                                console.log('SET_NV_TIMER not yet implemented');
                                return 0;
                            case HDMV_INSN_SETSYSTEM.INSN_SET_BUTTON_PAGE:
                                if (!menu) return 0;

                                const dstVal = cmd.insn.immOp1 
                                    ? Number(BigInt(cmd.dst) & 0xFFFn)
                                    : this.getMemoryValue(Number(BigInt(cmd.dst) & 0xFFFFn));
                                const srcVal = cmd.insn.immOp2 
                                    ? Number(BigInt(cmd.src) & 0xFFFn)
                                    : this.getMemoryValue(Number(BigInt(cmd.src) & 0xFFn));

                                if (cmd.src >= 0x80000000) this.menuPageId = srcVal;

                                const playlist = this.blurayDiscInfo?.playlists.get(this.playlistId.toString());
                                if (!playlist) return 0;

                                const page = playlist.igs.menu.pages.get(this.menuPageId);
                                if (!page) return 0;
                                
                                const duration = MpvPlayer.vectorToArray(page.inEffects.effects)
                                    .reduce((duration, effect) => duration + effect.duration, 0) / 90;

                                await new Promise(resolve => setTimeout(resolve, duration));

                                if (cmd.src >= 0x80000000) {
                                    this.buttonState = MpvPlayer.vectorToArray(page.bogs)
                                        .map(bog => bog.defButton);
                                    this.proxy.menuPageId = srcVal
                                };

                                const newMenuSelected = cmd.dst >= 0x80000000 ? dstVal : page.defButton;
                                const bogIdx = MpvPlayer.vectorToArray(page.bogs)
                                    .findIndex(bog => MpvPlayer.vectorToArray(bog.buttonIds)
                                        .includes(newMenuSelected));
                                this.buttonState[bogIdx] = newMenuSelected;

                                this.proxy.menuSelected = newMenuSelected;
                                this.proxy.menuActivated = false;
                                this.menuIdx = 0;

                                MpvPlayer.destructPlaylist(playlist);

                                return 1;
                            case HDMV_INSN_SETSYSTEM.INSN_ENABLE_BUTTON: {
                                const dstVal = cmd.insn.immOp1 ? cmd.dst : this.getMemoryValue(cmd.dst);
                                
                                const playlist = this.blurayDiscInfo?.playlists.get(this.playlistId.toString());
                                if (!playlist) return 0;

                                const page = playlist.igs.menu.pages.get(this.menuPageId);
                                if (!page) return 0;

                                const bogIdx = MpvPlayer.vectorToArray(page.bogs)
                                    .findIndex(bog => MpvPlayer.vectorToArray(bog.buttonIds)
                                        .includes(dstVal));

                                this.buttonState[bogIdx] = dstVal;

                                MpvPlayer.destructPlaylist(playlist);

                                if (menu) this.menuIdx++;
                                else this.proxy.objectIdx++;
                                return 1;
                            }
                            case HDMV_INSN_SETSYSTEM.INSN_DISABLE_BUTTON: {
                                const dstVal = cmd.insn.immOp1 ? cmd.dst : this.getMemoryValue(cmd.dst);
                                
                                const playlist = this.blurayDiscInfo?.playlists.get(this.playlistId.toString());
                                if (!playlist) return 0;

                                const page = playlist.igs.menu.pages.get(this.menuPageId);
                                if (!page) return 0;

                                const bogs = MpvPlayer.vectorToArray(page.bogs);
                                const bogIdx = bogs.findIndex(bog => 
                                    MpvPlayer.vectorToArray(bog.buttonIds).includes(dstVal));

                                this.buttonState[bogIdx] = bogs[bogIdx].defButton;

                                MpvPlayer.destructPlaylist(playlist);

                                if (menu) this.menuIdx++;
                                else this.proxy.objectIdx++;
                                return 1;
                            }
                            case HDMV_INSN_SETSYSTEM.INSN_SET_SEC_STREAM:
                                console.log('SET_SEC_STREAM not yet implemented');
                                return 0;
                            case HDMV_INSN_SETSYSTEM.INSN_POPUP_OFF:
                                this.resetMenu();
                                return 0;
                            case HDMV_INSN_SETSYSTEM.INSN_STILL_ON:
                                console.log('STILL_ON not yet implemented');
                                return 0;
                            case HDMV_INSN_SETSYSTEM.INSN_STILL_OFF:
                                console.log('STILL_OFF not yet implemented');
                                return 0;
                            case HDMV_INSN_SETSYSTEM.INSN_SET_OUTPUT_MODE:
                                console.log('SET_OUTPUT_MODE not yet implemented');
                                return 0;
                            case HDMV_INSN_SETSYSTEM.INSN_SET_STREAM_SS:
                                console.log('SET_STREAM_SS not yet implemented');
                                return 0;
                            case HDMV_INSN_SETSYSTEM.INSN_SETSYSTEM_0x10:
                                console.log('SETSYSTEM_0x10 not yet implemented');
                                return 0;
                            default:
                                console.log('SET_SETSYSTEM not yet implemented');
                        }
                        return 0;
                    
                    default:
                        console.log('Unknown HDMV_INSN_CMP:', cmd.insn.subGrp.toString(16));
                }
                return 0;
            default:
                console.log('Unknown instruction group:', cmd.insn.grp.toString(16));
        }
    }

    getBlurayChapters() {
        const playlist = this.blurayDiscInfo?.playlists.get(this.playlistId.toString());
        if (!playlist) return;

        const clipTimes = MpvPlayer.vectorToArray(playlist.clips).reduce((timeArr: bigint[], clip) => {
            const diff = clip.outTime - clip.inTime;
            timeArr.push(diff + timeArr[timeArr.length - 1]);
            return timeArr;
        }, [0n]);

        const chapters = MpvPlayer.vectorToArray(playlist.marks).slice(0, -1).map((mark, i) => ({
            title: `Chapter ${i + 1} (Clip ${mark.clipRef + 1})`,
            time: Number((mark.start - clipTimes[mark.clipRef]) / 90000n)
        }));

        this.proxy.chapters = chapters;

        MpvPlayer.destructPlaylist(playlist);
    }

    resetBluray() {
        this.memory = {};

        this.blurayDiscInfo = null;
        this.blurayDiscPath = '/';
        this.objectIdx = 0;
        this.menuIdx = 0;

        this.videoStream = 1;
        this.audioStream = 1;
        this.nextAudioTrack = null;
        this.currentChapter = 0;
        this.subtitleStream = 1;
        this.subtitleDispFlag = false;
        
        this.blurayTitle = 0;
        this.playlistId = 0;
        this.playItemId = 0;

        this.menuPictures = {};
        this.menuActivated = false;
        this.menuSelected = 0;
        this.menuPageId = -1;
        this.buttonState = [];
        this.menuCallAllow = false;
        this.hasPopupMenu = false;
        this.menuInitiated = false;

        this.resumeInfo = null;
    }

    async loadBluray(path: string) {
        await this.module.getPromise(this.module.bdOpen(path));
        this.module.stop();
        this.resetBluray();
        this.proxy.blurayDiscInfo = this.module.bdGetInfo();
        this.proxy.blurayDiscPath = path;
        this.proxy.title = typeof this.proxy.blurayDiscInfo.discName === 'string' ? this.proxy.blurayDiscInfo.discName : "Bluray Disc";

        if (this.proxy.blurayDiscInfo.firstPlaySupported)
            this.proxy.blurayTitle = 0xFFFF;

        const menuPictures: Record<string, Record<string, Record<string, HTMLImageElement>>>= {};
        await Promise.all(
            MpvPlayer.vectorToArray(this.proxy.blurayDiscInfo.playlists.keys()).map(async playlistId => {
                const playlist = this.proxy.blurayDiscInfo!.playlists.get(playlistId);
                if (!playlist || typeof playlistId !== 'string') return;
                const playlistImages: Record<string, Record<string, HTMLImageElement>> = {};
                await Promise.all(
                    MpvPlayer.vectorToArray(playlist.igs.pictures.keys()).map(async pictureId => {
                        const picture = playlist.igs.pictures.get(pictureId);
                        const images: Record<string, HTMLImageElement> = {};
                        if (!picture || typeof pictureId !== 'string') return;
                        
                        await Promise.all(
                            MpvPlayer.vectorToArray(picture.data.keys()).map(async paletteId => {
                                const base64 = picture.data.get(paletteId);
                                if (typeof paletteId !== 'string' || typeof base64 !== 'string') 
                                    return;
            
                                images[paletteId] = await loadImage('data:image/png;base64,' + base64);
                            })
                        );

                        playlistImages[pictureId] = images;
                    })
                );

                menuPictures[playlistId] = playlistImages;
            })
        );
        
        this.proxy.menuPictures = menuPictures;

        this.nextObjectCommand();
    }
}