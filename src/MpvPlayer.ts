import libmpvLoader, { BlurayDiscInfo, MobjCmd } from './libmpv.js';
import _ from 'lodash';
import { getRandom, isAudioTrack, isVideoTrack, loadImage } from './utils';
import { showOpenFilePicker } from 'native-file-system-adapter';
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
    playlistIdx: ProxyHandle<'playlistIdx', MpvPlayer['playlistIdx']>;
    isSeeking: ProxyHandle<'isSeeking', MpvPlayer['isSeeking']>;
    uploading: ProxyHandle<'uploading', MpvPlayer['uploading']>;
    title: ProxyHandle<'title', MpvPlayer['title']>;
    fileEnd: ProxyHandle<'fileEnd', MpvPlayer['fileEnd']>;
    files: ProxyHandle<'files', MpvPlayer['files']>;
    shaderCount: ProxyHandle<'shaderCount', MpvPlayer['shaderCount']>;

    memory: ProxyHandle<'memory', MpvPlayer['memory']>;

    blurayDiscInfo: ProxyHandle<'blurayDiscInfo', MpvPlayer['blurayDiscInfo']>;
    objectIdx: ProxyHandle<'objectIdx', MpvPlayer['objectIdx']>;

    firstPlaySupported: ProxyHandle<'firstPlaySupported', MpvPlayer['firstPlaySupported']>;
    blurayTitle: ProxyHandle<'blurayTitle', MpvPlayer['blurayTitle']>;
    playlistId: ProxyHandle<'playlistId', MpvPlayer['playlistId']>;
    playItemId: ProxyHandle<'playItemId', MpvPlayer['playItemId']>;

    menuPictures: ProxyHandle<'menuPictures', MpvPlayer['menuPictures']>;
    menuActivated: ProxyHandle<'menuActivated', MpvPlayer['menuActivated']>;
    menuSelected: ProxyHandle<'menuSelected', MpvPlayer['menuSelected']>;
    menuPageId: ProxyHandle<'menuPageId', MpvPlayer['menuPageId']>;
}

const isMpvPlayerProperty = (prop: string | symbol): prop is keyof MpvPlayer => [
    'idle', 'isPlaying', 'duration', 'elapsed',
    'videoStream', 'videoTracks', 'audioStream', 'audioTracks',
    'subtitleStream', 'subtitleTracks', 'currentChapter', 'chapters', 'playlistIdx',
    'isSeeking', 'uploading', 'title', 'fileEnd', 'files', 'shaderCount',
    'memory', 'blurayDiscInfo', 'objectIdx', 'firstPlaySupported', 'blurayTitle', 
    'playlistId', 'playItemId', 'menuPictures', 'menuActivated', 'menuSelected', 'menuPageId'
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
    objectIdx = 0;
    menuIdx = 0;

    videoStream = 1;
    audioStream = 1;
    subtitleStream = 1;
    currentChapter = 0;
    playlistIdx = 0;
    
    firstPlaySupported = 0;
    blurayTitle = -1;
    playlistId = 0;
    playItemId = 0;

    menuPictures: Record<string, Record<string, HTMLImageElement>>[] = [];
    menuActivated = false;
    menuSelected = 0;
    menuPageId = -1;

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

    static vectorToArray<T>(vector: Vector<T>) {
        const arr: T[] = [];

        for (let i = 0; i < vector.size(); i++) {
            const val = vector.get(i);
            if (!val) continue;
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
                            case 'playlist-playing-pos':
                                if (this.blurayDiscInfo) {
                                    if (payload.value > 0)
                                        this.proxy.playlistIdx++;
                                    
                                    if (payload.value === '-1')
                                        this.nextObjectCommand();
                                }
                                break;
                            case 'playback-time':
                                if (this.isSeeking) break;

                                if (this.blurayDiscInfo) {
                                    const currentPlaylistChapter = (chapter: Chapter) => chapter.title.includes('Clip ' + (this.playlistIdx + 1));
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

    setupFsWorker() {
        const threadId = this.proxy.module.getFsThread();
        this.fsWorker = (this.proxy.module.PThread.pthreads as Record<string, Worker>)[threadId.toString()];

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

    getMemoryValue(addr: number) {
        if (addr < 0x80000000)
            return this.memory[addr] ?? 0;

        addr -= 0x80000000;

        switch (addr) {
            case 1:
                return this.audioStream;
            case 2:
                return this.subtitleStream;
            case 4:
                return this.blurayTitle > -1 ? this.blurayTitle : 0;
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
                this.proxy.audioStream = val;
                return;
            case 2:
                this.proxy.subtitleStream = val;
                return;
            case 4:
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

    getCurrentPlaylist = () => this.blurayDiscInfo?.playlists.get(this.playlistId);
    getCurrentObject = () => this.blurayDiscInfo?.mobjObjects.objects.get(this.blurayTitle + this.firstPlaySupported);
    getCurrentMenu = () => this.getCurrentPlaylist()?.igs.menu.pages.get(this.menuPageId);

    async nextObjectCommand() {
        const command = this.getCurrentObject()?.cmds.get(this.objectIdx);
        if (!command)
            throw new Error('Object command not found');

        if (await this.executeCommand(command))
            this.nextObjectCommand();
    }

    setMenuSelected(buttonId: number) {
        const bogsVector = this.getCurrentMenu()?.bogs;
        if (!bogsVector) return;

        const bogs = MpvPlayer.vectorToArray(bogsVector);

        for (let bog_idx = 0; bog_idx < bogs.length; bog_idx++) {
            for (const button of MpvPlayer.vectorToArray(bogs[bog_idx].buttons)) {
                if (button.buttonId === buttonId) {
                    this.proxy.menuSelected = buttonId;
                    return;
                }
            }
        }
    }

    menuActivate() {
        this.proxy.menuActivated = true;
        this.menuIdx = 0;
        this.nextMenuCommand();
    }

    async nextMenuCommand() {
        if (this.menuPageId < 0)
            this.menuPageId = 0;

        const bog = this.getCurrentMenu()?.bogs.get(this.menuSelected);
        if (!bog) return;

        const button = MpvPlayer.vectorToArray(bog.buttons)
            .find(({ buttonId }) => buttonId === bog.defButton);
            
        const command = button?.commands.get(this.menuIdx);
        
        if (!command)
            throw new Error('Menu command not found');

        if ((button?.autoAction || this.menuActivated) && await this.executeCommand(command, true))
            this.nextMenuCommand();
    }

    resetMenu() {
        this.proxy.menuPageId = -1;
        this.proxy.menuSelected = 0;
        this.menuIdx = 0;
        this.proxy.menuActivated = false;
    }

    openTopMenu() {
        this.proxy.blurayTitle = 0;
        this.objectIdx = 0;
        this.resetMenu();
        this.nextObjectCommand();
    }

    async executeCommand(cmd: MobjCmd, menu = false) {
        if (menu) console.log(this.memory, this.menuPageId, this.menuSelected, this.menuIdx);
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
                                console.log('INSN_BREAK not yet implemented');
                                return 0;
                            default:
                                console.log('Unknown BRANCH_GOTO:', cmd.insn.branchOpt.toString(16));
                        }
                        return 0;
                    case HDMV_INSN_GRP_BRANCH.BRANCH_JUMP:
                        switch (cmd.insn.branchOpt) {
                            case HDMV_INSN_JUMP.INSN_JUMP_OBJECT:
                                console.log('INSN_JUMP_OBJECT not yet implemented');
                                return 0;
                            case HDMV_INSN_JUMP.INSN_JUMP_TITLE:
                                this.proxy.blurayTitle = cmd.dst;
                                this.proxy.objectIdx = 0;

                                if (menu) {
                                    this.resetMenu();
                                    this.nextObjectCommand();
                                    return 0;
                                } else return 1;
                            case HDMV_INSN_JUMP.INSN_CALL_OBJECT:
                                console.log('INSN_CALL_OBJECT not yet implemented');
                                return 0;
                            case HDMV_INSN_JUMP.INSN_CALL_TITLE:
                                console.log('INSN_CALL_TITLE not yet implemented');
                                return 0;
                            case HDMV_INSN_JUMP.INSN_RESUME:
                                console.log('INSN_RESUME not yet implemented');
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
                                const clips = this.blurayDiscInfo?.playlists.get(dstVal)?.clips;
                                if (!clips) throw new Error('Clip IDs not found');

                                const src = cmd.insn.branchOpt === HDMV_INSN_PLAY.INSN_PLAY_PL ? cmd.src : srcVal;

                                const vector = new this.module.StringVector();
                                MpvPlayer.vectorToArray(clips).slice(src)
                                    .forEach((clip, i) => i 
                                        ? vector.push_back(`/extfs/BDMV/STREAM/${clip.clipId}.m2ts`) 
                                        : this.module.loadFile(`/extfs/BDMV/STREAM/${clip.clipId}.m2ts`, ''));

                                this.module.loadFiles(vector);

                                this.proxy.playlistId = dstVal;
                                this.proxy.playlistIdx = src;
                                this.proxy.objectIdx++;
                                this.getBlurayChapters();
                                if (menu) this.resetMenu();
                                else if (this.blurayTitle === 0) this.nextMenuCommand();
                                return 0;
                            }
                            case HDMV_INSN_PLAY.INSN_PLAY_PL_PM: {
                                const playlist = this.blurayDiscInfo?.playlists.get(dstVal);
                                if (!playlist) throw new Error('Playlist not found');

                                const playMark = playlist.marks.get(srcVal);
                                if (!playMark) throw new Error('Play mark not found');

                                const vector = new this.module.StringVector();
                                const clips = MpvPlayer.vectorToArray(playlist.clips);
                                const duration = clips.slice(0, playMark.clipRef)
                                    .reduce((duration, clip) => duration + clip.outTime - clip.inTime, 0n);
                                clips.slice(playMark.clipRef)
                                    .forEach((clip, i) => i
                                        ? vector.push_back(`/extfs/BDMV/STREAM/${clip.clipId}.m2ts`)
                                        : this.module.loadFile(
                                            `/extfs/BDMV/STREAM/${clip.clipId}.m2ts`, 
                                            `start=${(playMark.start - duration) / 90000n}`
                                        ));

                                this.module.loadFiles(vector);

                                this.proxy.playlistId = dstVal;
                                this.proxy.playlistIdx = playMark.clipRef;
                                this.getBlurayChapters();
                                this.proxy.objectIdx++;
                                if (menu) this.resetMenu();
                                else if (this.blurayTitle === 0) this.nextMenuCommand();
                                return 0;
                            }
                            case HDMV_INSN_PLAY.INSN_TERMINATE_PL:
                                console.log('INSN_TERMINATE_PL not yet implemented');
                                return 0;
                            case HDMV_INSN_PLAY.INSN_LINK_PI: {
                                const clips = this.getCurrentPlaylist()?.clips;
                                if (!clips) throw new Error('Clip IDs not found');

                                const vector = new this.module.StringVector();
                                MpvPlayer.vectorToArray(clips).slice(dstVal)
                                    .forEach((clip, i) => i 
                                        ? vector.push_back(`/extfs/BDMV/STREAM/${clip.clipId}.m2ts`) 
                                        : this.module.loadFile(`/extfs/BDMV/STREAM/${clip.clipId}.m2ts`, ''));

                                this.module.loadFiles(vector);

                                this.proxy.playlistIdx = dstVal;
                                this.proxy.objectIdx++;
                                this.getBlurayChapters();
                                if (menu) this.resetMenu();
                                else if (this.blurayTitle === 0) this.nextMenuCommand();
                                return 0;
                            }
                            case HDMV_INSN_PLAY.INSN_LINK_MK:
                                const playlist = this.getCurrentPlaylist();
                                if (!playlist) throw new Error('Playlist not found');

                                const playMark = playlist.marks.get(dstVal);
                                if (!playMark) throw new Error('Play mark not found');

                                const vector = new this.module.StringVector();
                                const clips = MpvPlayer.vectorToArray(playlist.clips);
                                const duration = clips.slice(0, playMark.clipRef)
                                    .reduce((duration, clip) => duration + clip.outTime - clip.inTime, 0n);
                                clips.slice(playMark.clipRef)
                                    .forEach((clip, i) => i
                                        ? vector.push_back(`/extfs/BDMV/STREAM/${clip.clipId}.m2ts`)
                                        : this.module.loadFile(
                                            `/extfs/BDMV/STREAM/${clip.clipId}.m2ts`, 
                                            `start=${(playMark.start - duration) / 90000n}`
                                        ));

                                this.module.loadFiles(vector);

                                this.proxy.playlistIdx = playMark.clipRef;
                                this.getBlurayChapters();
                                this.proxy.objectIdx++;
                                if (menu) this.resetMenu();
                                else if (this.blurayTitle === 0) this.nextMenuCommand();
                                return 0; 
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
                                this.setMemoryValue(cmd.dst, srcVal & dstVal);
                                if (menu) this.menuIdx++;
                                else this.proxy.objectIdx++;
                                return 1;
                            case HDMV_INSN_SET.INSN_OR:
                                this.setMemoryValue(cmd.dst, srcVal | dstVal);
                                if (menu) this.menuIdx++;
                                else this.proxy.objectIdx++;
                                return 1;
                            case HDMV_INSN_SET.INSN_XOR:
                                this.setMemoryValue(cmd.dst, srcVal ^ dstVal);
                                if (menu) this.menuIdx++;
                                else this.proxy.objectIdx++;
                                return 1;
                            case HDMV_INSN_SET.INSN_BITSET:
                                console.log('INSN_BITSET not yet implemented');
                                return 0;
                            case HDMV_INSN_SET.INSN_BITCLR:
                                console.log('INSN_BITCLR not yet implemented');
                                return 0;
                            case HDMV_INSN_SET.INSN_SHL:
                                console.log('INSN_SHL not yet implemented');
                                return 0;
                            case HDMV_INSN_SET.INSN_SHR:
                                console.log('INSN_SHR not yet implemented');
                                return 0;
                            default:
                                console.log('Unknown HDMV_INSN_SET:', cmd.insn.subGrp.toString(16));
                        }
                        return 0;
                    case HDMV_INSN_GRP_SET.SET_SETSYSTEM:
                        switch (cmd.insn.setOpt) {
                            case HDMV_INSN_SETSYSTEM.INSN_SET_STREAM:
                                // const audioFlag = (BigInt(cmd.dst) & 0x80000000n) >> 31n;
                                // const pgFlag = (BigInt(cmd.dst) & 0x800000n) >> 15n;
                                // const dispFlag = (BigInt(cmd.dst) & 0x400000n) >> 14n;
                                // const igFlag = (BigInt(cmd.src) & 0x80000000n) >> 31n;
                                // const angleFlag = (BigInt(cmd.src) & 0x800000n) >> 15n;
                                
                                const newAudioStream = Number((BigInt(cmd.dst) & 0xFF0000n) >> 16n);
                                if (newAudioStream) this.audioStream = cmd.insn.immOp1 
                                    ? newAudioStream : this.getMemoryValue(newAudioStream);

                                const newSubtitleStream = Number(BigInt(cmd.dst) & 0xFFn);
                                if (newSubtitleStream) this.subtitleStream = cmd.insn.immOp1 
                                    ? newSubtitleStream : this.getMemoryValue(newSubtitleStream);

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

                                this.menuPageId = srcVal;
                                this.menuSelected = dstVal;

                                const page = this.getCurrentMenu();
                                if (!page) return 0;
                                
                                const duration = MpvPlayer.vectorToArray(page.inEffects.effects)
                                    .reduce((duration, effect) => duration + effect.duration, 0) / 90;

                                await new Promise(resolve => setTimeout(resolve, duration));

                                this.proxy.menuPageId = srcVal;
                                this.proxy.menuSelected = dstVal;
                                this.proxy.menuActivated = false;
                                this.menuIdx = 0;

                                return 1;
                            case HDMV_INSN_SETSYSTEM.INSN_ENABLE_BUTTON:
                                console.log('ENABLE_BUTTON not yet implemented');
                                return 0;
                            case HDMV_INSN_SETSYSTEM.INSN_DISABLE_BUTTON:
                                console.log('DISABLE_BUTTON not yet implemented');
                                return 0;
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
        const playlist = this.getCurrentPlaylist();
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
    }

    async loadBluray() {
        const handle = await this.mountFolder();
        if (!handle) return;
        this.proxy.blurayDiscInfo = this.module.bdOpen('/extfs');
        this.proxy.title = typeof this.proxy.blurayDiscInfo.discName === 'string' ? this.proxy.blurayDiscInfo.discName : "Bluray Disc";
        this.proxy.firstPlaySupported = this.proxy.blurayDiscInfo.firstPlaySupported;

        this.proxy.menuPictures = await Promise.all(
            MpvPlayer.vectorToArray(this.proxy.blurayDiscInfo.playlists).map(async playlist => {
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

                return playlistImages;
            })
        );

        this.nextObjectCommand();
    }
}