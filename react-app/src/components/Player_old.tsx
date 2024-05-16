// import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
// import dashjs, { MediaInfo, MediaPlayerClass, PlaybackPausedEvent, PlaybackTimeUpdatedEvent } from 'dashjs';
import './Player.scss';
// import { useQuery } from 'react-query';
// import SUPtitles from 'suptitles';
// import { useParams, useSearchParams } from 'react-router-dom';
// import SubtitlesOctopus from 'libass-wasm';
// import { ListItemIcon, ListItemText, Menu, MenuItem, Popover, PopoverOrigin, Slider } from '@mui/material';
// import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
// import { faBars, faBookmark, faBug, faChevronDown, faChevronLeft, faChevronRight, faChevronUp, faCircleCheck, faCompass, faExpand, faHome, faMessage, faMusic, faPause, faPlay, faVolumeHigh } from '@fortawesome/free-solid-svg-icons';
// import { formatTime } from '../utils';
// import { Check } from '@mui/icons-material';

// const createImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
//     const img = new Image();
//     img.addEventListener('load', () => resolve(img));
//     img.addEventListener('error', reject);
//     img.src = 'data:image/png;base64,' + src;
// });

// interface PlayerPlaylist {
//     list: Playlist,
//     idx: number;
// }

// interface Program {
//     titleIdx: number;
//     commands: ProgramObject[];
//     idx: number;
//     allowMenu: boolean;
// }

// const anchorOrigin: PopoverOrigin = {
//     vertical: 'top',
//     horizontal: 'center'
// }

// const transformOrigin: PopoverOrigin = {
//     vertical: 'bottom',
//     horizontal: 'center'
// }

// const findButton = (bogs: BogWithButtonMap[], selected: number) =>
//     bogs.reduce((button: BogButton | null, { buttons }) => {
//         if (button) return button;

//         return buttons[selected] ?? null;
//     }, null);

// const parseHex = (hex: string) => BigInt('0x' + hex);

// const Player = () => {
//     const { id } = useParams();
//     const [params] = useSearchParams();
//     const skipFirstPlay = useMemo(() => params.get('skipFirstPlay'), [params]);

//     const streamEndpoint = useMemo(() => '/api/stream/' + id, [id]);

//     const videoRef = useRef<HTMLVideoElement>(null);
//     const canvasRef = useRef<HTMLCanvasElement>(null);
//     const playerRef = useRef<MediaPlayerClass | null>(null);

//     const memoryRef = useRef<Record<string, string>>({});
//     const titleMenuRef = useRef(false);
//     const buttonsRef = useRef<number[]>([]);

//     const [playlist, setPlaylist] = useState<PlayerPlaylist | null>(null);
//     const [program, setProgram] = useState<Program | null>(null);

//     const isSeeking = useRef(false);
//     const [elapsed, setElapsed] = useState(0);
//     const [duration, setDuration] = useState(0);
//     const [isPlaying, setIsPlaying] = useState(false);
//     const [remoteMenu, setRemoteMenu] = useState(false);
//     const [volumeMenu, setVolumeMenu] = useState(false);
//     const [audioMenu, setAudioMenu] = useState(false);
//     const [subsMenu, setSubsMenu] = useState(false);
//     const [chaptersMenu, setChaptersMenu] = useState(false);
//     const [volume, setVolume] = useState(1);
//     const remoteRef = useRef<SVGSVGElement>(null);
//     const volumeRef = useRef<SVGSVGElement>(null);
//     const audioMenuRef = useRef<SVGSVGElement>(null);
//     const subsMenuRef = useRef<SVGSVGElement>(null);
//     const chaptersMenuRef = useRef<SVGSVGElement>(null);

//     const { data: menu } = useQuery({ 
//         queryKey: ['menu', playlist?.list.menu], 
//         queryFn: async ({ queryKey: [, stream] }) => {
//             if (typeof stream !== 'string' || !stream.length) return null;

//             const { height, width, pages, pictures }: Menu = await fetch(`${streamEndpoint}/${stream}.json`)
//                 .then(res => res.json());

//             const menuPages = Object.values(pages)
//                 .map(({ bogs, in_effects, def_button }) => ({
//                     transition: in_effects.effects[0]?.duration,
//                     defaultButton: def_button,
//                     bogs: bogs.map(({ buttons, def_button }) => ({ def_button, buttons: Object.fromEntries(buttons.map(button => [button.id, button])) }))
//                 }));

//             const images: MenuImage[] = await Promise.all(
//                 Object.values(pictures).map(async picture => {
//                     return Object.fromEntries(await Promise.all(
//                         Object.entries(picture.decoded_pictures).map(async ([idx, b64]) => 
//                             [idx, await createImage(b64)]
//                         )
//                     ))
//                 })
//             );

//             const palettes = Object.values(pages).map(page => page.palette ?? 0);

//             return {
//                 dimensions: { width, height },
//                 menuPages, palettes, images
//             };
//         }
//     });

//     const { data: movieObject } = useQuery<MovieObject>({
//         queryKey: 'movieObject',
//         queryFn: async () => fetch(streamEndpoint + '/MovieObject.json').then(res => res.json())
//     });

//     const { data: playlists } = useQuery<Record<string, Playlist>>({
//         queryKey: 'playlists',
//         queryFn: async () => fetch(streamEndpoint + '/Playlists.json').then(res => res.json())
//     });

//     const { data: clipInfo } = useQuery<Record<string, ClipInfo>>({
//         queryKey: 'clipInfo',
//         queryFn: async () => fetch(streamEndpoint + '/ClipInfo.json').then(res => res.json())
//     });

//     const { data: subtitles } = useQuery<Subtitles>({
//         queryKey: 'subtitles',
//         queryFn: async () => fetch(streamEndpoint + '/subtitles').then(res => res.json())
//     });

//     const [chapter, setChapter] = useState(0);
//     const [seekToChapter, setSeekToChapter] = useState(0);
//     const [audioStream, setAudioStream] = useState(1);
//     const [audioTracks, setAudioTracks] = useState<MediaInfo[]>();
//     const [subtitleStream, setSubtitleStream] = useState(0);

//     const [extSubStream, setExtSubStream] = useState('');

//     const [cursor, setCursor] = useState({
//         page: -1,
//         selected: 0,
//         activated: false
//     });

//     const togglePlay = useCallback(() => isPlaying ? playerRef.current?.pause() : playerRef.current?.play(), [isPlaying]);

//     useEffect(() => {
//         if (!videoRef.current || playerRef.current) return;

//         const player = dashjs.MediaPlayer().create();
//         player.initialize(videoRef.current, undefined, true);
//         player.on('streamInitialized', () => setAudioTracks(player.getTracksFor('audio')));
//         player.on('log', console.log);
//         player.on('error', console.error);
//         player.on('playbackPlaying', () => setIsPlaying(true));
//         player.on('playbackTimeUpdated', e => !isSeeking.current && setElapsed(e.time ?? 0));
//         player.on('playbackStarted', () => setDuration(player.duration()))
//         playerRef.current = player;

//         const onFullscreenChange = () => setIsFullscreen(prev => !prev);

//         document.addEventListener('fullscreenchange', onFullscreenChange);

//         return () => {
//             player.destroy();
//             playerRef.current = null;
//             document.removeEventListener('fullscreenchange', onFullscreenChange);
//             memoryRef.current = {};
//             titleMenuRef.current = false;
//             buttonsRef.current = [];
//         }
//     }, []);

//     const divRef = useRef<HTMLDivElement>(null);
//     const [isFullscreen, setIsFullscreen] = useState(false);

//     const toggleFullscreen = useCallback(() => isFullscreen
//         ? document.exitFullscreen()
//         : divRef.current?.requestFullscreen(), 
//     [isFullscreen]);

//     useEffect(() => {
//         if (subtitleStream === 0) return;
//         setExtSubStream('');
//     }, [subtitleStream]);

//     const extSubRef = useRef<SubtitlesOctopus | null>(null);

//     useEffect(() => {
//         if (!videoRef.current || !extSubStream.length || !subtitles)
//             return;

//         if ((program?.titleIdx ?? 0) < 1) {
//             return extSubRef.current?.freeTrack();
//         }
        
//         if (extSubRef.current) {
//             extSubRef.current.setTrackByUrl(`http://localhost:5050${streamEndpoint}/ext_subs/${extSubStream}`)
//         } else {
//             extSubRef.current = new SubtitlesOctopus({
//                 video: videoRef.current,
//                 subUrl: `http://localhost:5050${streamEndpoint}/ext_subs/${extSubStream}`,
//                 fonts: subtitles.attachments.map(t => `http://localhost:5050${streamEndpoint}/ext_subs/${t}`),
//                 workerUrl: '/subtitles-octopus-worker.js',
//                 fallbackFont: '/trebuc.ttf'
//             });
//         }

//         return () => {
//             extSubRef.current?.freeTrack();
//         }
//     }, [subtitles, streamEndpoint, extSubStream, program?.titleIdx]);

//     const chapterTrack = useCallback(({ time }: PlaybackTimeUpdatedEvent) => {
//         if (!playlist || !clipInfo || !time) return;
//         const { list, idx } = playlist;

//         const stream = list.streams[idx];
//         if (!stream) return;

//         const { startTime } = clipInfo[stream];
        
//         const chapterNum = list.chapters.findIndex(chapter => chapter.time > time + startTime);
//         setChapter(chapterNum > 0 ? chapterNum - 1 : list.chapters.length - 1);
//     }, [playlist, clipInfo]);

//     useEffect(() => {
//         playerRef.current?.on('playbackTimeUpdated', chapterTrack);

//         return () => {
//             playerRef.current?.off('playbackTimeUpdated', chapterTrack);
//         }
//     }, [chapterTrack]);

//     useEffect(() => {
//         if (!videoRef.current || !playlist?.list.chapters.length || !clipInfo || seekToChapter === -1) return;

//         if (isSeeking.current) {
//             isSeeking.current = false;
//             return;
//         }

//         const currentPlayItem = playlist.list.streams[playlist.idx];

//         const { playItem, time } = playlist.list.chapters[seekToChapter];
//         const { startTime } = clipInfo[playItem];

//         if (currentPlayItem !== playItem && program?.titleIdx !== 0) {
//             const idx = playlist.list.streams.findIndex(stream => stream === playItem);
//             setPlaylist(prev => prev && { ...prev, idx });
//         } else {
//             playerRef.current?.attachSource(
//                 `${streamEndpoint}/streams/${currentPlayItem}/stream.mpd`, 
//                 time - startTime
//             );
//             setSeekToChapter(-1);
//         }
//     }, [playlist, clipInfo, streamEndpoint, seekToChapter, program?.titleIdx]);

//     const onPlaybackPaused = useCallback(({ ended }: PlaybackPausedEvent) => {
//         setIsPlaying(false);
//         if (!playlist || !ended) return;

//         if (playlist.idx < playlist.list.streams.length - 1) {
//             const nextPlayItem = playlist.list.streams[playlist.idx + 1];
//             const chapter = playlist.list.chapters.findIndex(chapter => chapter.playItem === nextPlayItem);
//             if (chapter === -1) {
//                 playerRef.current?.attachSource(`${streamEndpoint}/streams/${nextPlayItem}/stream.mpd`);
//             } else {
//                 setSeekToChapter(chapter);
//             }
            
//             setPlaylist(prev => prev && { ...prev, idx: prev.idx + 1 });
//         } else {
//             setProgram(prev => prev && { ...prev, idx: prev.idx + 1 });
//         }
//     }, [playlist, streamEndpoint]);

//     useEffect(() => {
//         playerRef.current?.on('playbackPaused', onPlaybackPaused);

//         return () => {
//             playerRef.current?.off('playbackPaused', onPlaybackPaused);
//         }
//     }, [onPlaybackPaused]);

//     useEffect(() => {
//         const currentPlayItem = playlist?.list.streams[playlist.idx];
//         if (!videoRef.current || !currentPlayItem || !subtitleStream) return;
        
//         const sup = SUPtitles.init(
//             videoRef.current, 
//             `http://localhost:5050${streamEndpoint}/${currentPlayItem}_subtitle_${subtitleStream}.sup`
//         );

//         return () => {
//             sup?.then(sup => sup.dispose());
//         }
//     }, [playlist, subtitleStream, streamEndpoint]);

//     useEffect(() => {
//         const val = (chapter + 1).toString(16).padStart(8, '0');
//         memoryRef.current['80000005'] = val;
//         memoryRef.current['80000025'] = val;
//     }, [chapter]);

//     useEffect(() => {
//         const val = audioStream.toString(16).padStart(8, '0');
//         memoryRef.current['80000001'] = val;
//     }, [audioStream]);

//     useEffect(() => {
//         if (!audioTracks) return;

//         playerRef.current?.setCurrentTrack(audioTracks[audioStream - 1]);
//     }, [audioStream, audioTracks]);

//     useEffect(() => {
//         const val = (subtitleStream ? subtitleStream + (parseInt('80000000', 16)) : 0)
//             .toString(16).padStart(8, '0');
//         memoryRef.current['80000002'] = val;
//     }, [subtitleStream]);

//     useEffect(() => {
//         if (!movieObject || !playlists || !clipInfo) return;
//         if (!program) {
//             return setProgram({
//                 titleIdx: -1,
//                 commands: movieObject.firstPlay.program,
//                 allowMenu: !movieObject.firstPlay.menuCallMask,
//                 idx: 0,
//             });
//         }

//         if (program.commands.length === program.idx)
//             return setProgram(prev => prev && { ...prev, idx: 0 });

//         const { opc, dst, src } = program.commands[program.idx];
//         // console.log('title', program.titleIdx, program.idx, opc, dst, src);

//         switch (opc) {
//             case '12c10000': {
//                 const list = playlists[`${parseInt(dst, 16)}`.padStart(5, '0')];
//                 const idx = parseInt(src, 16);
//                 const chapterIdx = list.chapters.findIndex(chapter => chapter.playItem === list.streams[idx]);
//                 setSeekToChapter(chapterIdx > -1 ? chapterIdx : 0);
//                 return setPlaylist({ list, idx });
//             }
//             case '12810000': {
//                 const list = playlists[`${parseInt(dst, 16)}`.padStart(5, '0')];
//                 const idx = parseInt(memoryRef.current[src] ?? '00', 16);
//                 const chapterIdx = list.chapters.findIndex(chapter => chapter.playItem === list.streams[idx]);
//                 setSeekToChapter(chapterIdx > -1 ? chapterIdx : 0);
//                 return setPlaylist({ list, idx });
//             }
//             case '0a800000': {
//                 if (skipFirstPlay && program.titleIdx === -1)
//                     return setProgram(prev => prev && { ...prev, idx: prev.idx + 1 });

//                 const list = playlists[`${parseInt(dst, 16)}`.padStart(5, '0')];

//                 setSeekToChapter(0);
//                 return setPlaylist({
//                     list,
//                     idx: 0
//                 });
//             }
//             case '12820000':
//                 const list = playlists[`${parseInt(dst, 16)}`.padStart(5, '0')];
//                 const chapterIdx = parseInt(memoryRef.current[src] ?? '00', 16);
//                 const { playItem } = list.chapters[chapterIdx];
//                 const idx = list.streams.findIndex(stream => stream === playItem);

//                 setPlaylist({ list, idx });
//                 return setSeekToChapter(chapterIdx);
//             case '09810000':
//                 const titleIdx = parseInt(dst, 16);
//                 const newMovieObject = movieObject.titles[titleIdx];

//                 return setProgram({
//                     titleIdx,
//                     commands: newMovieObject.program,
//                     allowMenu: !newMovieObject.menuCallMask,
//                     idx: 0,
//                 });
//             case '90400001':
//                 memoryRef.current[dst] = src;
//                 return setProgram(prev => prev && { ...prev, idx: prev.idx + 1 });
//             case '90000001':
//                 memoryRef.current[dst] = memoryRef.current[src];
//                 return setProgram(prev => prev && { ...prev, idx: prev.idx + 1 });
//             case '50400200':
//                 return setProgram(prev => prev && { ...prev, idx: prev.idx + (
//                     memoryRef.current[dst] === src
//                         ? 1 : 2
//                 ) });
//             case '50400600':
//                 return setProgram(prev => prev && { ...prev, idx: prev.idx + (
//                     parseHex(memoryRef.current[dst]) <= parseHex(src)
//                         ? 1 : 2
//                 ) });
//             case '50400400':
//                 return setProgram(prev => prev && { ...prev, idx: prev.idx + (
//                     parseHex(memoryRef.current[dst]) >= parseHex(src)
//                         ? 1 : 2
//                 ) });
//             case '08810000':
//                 return setProgram(prev => prev && { ...prev, idx: parseInt(dst, 16) });
//             case '91c00001':
//                 if (skipFirstPlay && program.titleIdx === -1)
//                     return setProgram(prev => prev && { ...prev, idx: prev.idx + 1 });

//                 const audioStream = parseInt(dst.slice(2, 4), 16);
//                 audioStream && setAudioStream(audioStream);
//                 setSubtitleStream(dst.slice(4, 6) === 'c0' ? parseInt(dst.slice(6, 8), 16) : 0);
//                 return setProgram(prev => prev && { ...prev, idx: prev.idx + 1 });
//             case '12020000': {
//                 const list = playlists[`${parseInt(memoryRef.current[dst], 16)}`.padStart(5, '0')];
//                 const idx = parseInt(memoryRef.current[src] ?? '00', 16);
//                 const chapterIdx = list.chapters.findIndex(chapter => chapter.playItem === list.streams[idx]);
//                 setSeekToChapter(chapterIdx);
//                 return setPlaylist({ list, idx });
//             }
//             default:
//                 setProgram(prev => prev && { ...prev, idx: prev.idx + 1 });
//         }
//     }, [movieObject, playlists, program, skipFirstPlay, streamEndpoint, clipInfo]);

//     useEffect(() => {
//         memoryRef.current['80000004'] = (program?.titleIdx ?? 0).toString(16).padStart(8, '0');
//     }, [program?.titleIdx]);

//     useEffect(() => {
//         memoryRef.current['8000000a'] = cursor.selected.toString(16).padStart(8, '0');
//     }, [cursor.selected]);

//     useEffect(() => {
//         if (!menu || !canvasRef.current) return;

//         canvasRef.current.width = menu.dimensions.width;
//         canvasRef.current.height = menu.dimensions.height;
//     }, [menu]);

//     useEffect(() => {
//         if (!menu || cursor.page === -1) return;

//         buttonsRef.current = menu.menuPages[cursor.page].bogs.map(bog => bog.def_button);
//     }, [cursor.page, menu]);

//     useEffect(() => {
//         const { page, selected, activated } = cursor;
//         const ctx = canvasRef.current?.getContext('2d');

//         if (!ctx || !menu || page === -1) return;

//         const { bogs, defaultButton } = menu.menuPages[page];
//         const palette = menu.palettes[page];

//         if (selected === -1)
//             return setCursor(prev => ({ ...prev, selected: defaultButton }));
        
//         bogs.forEach(async (bog, i) => {
//             const { buttons, def_button } = bog;
//             const { id, states, x, y } = buttons[buttonsRef.current[i] ?? def_button];

//             const idx = states[
//                 id === selected
//                     ? activated 
//                         ? 'activated' 
//                         : 'selected' 
//                     : 'normal'
//                 ].start;

//             if (idx === 65535 || !menu.images[idx]) return;

//             const image = menu.images[idx][palette];
            
//             // console.log('image', id, x, y, image.width, image.height)
//             ctx.drawImage(image, x, y);
//         });

//         return () => {
//             const { width, height } = menu.dimensions;
//             ctx.clearRect(0, 0, width, height);
//         }
//     }, [cursor, menu]);
    
//     // useEffect(() => console.log('page', cursor.page), [cursor.page]);
//     // useEffect(() => console.log('selected', cursor.selected), [cursor.selected]);

//     const runButton = useCallback((button: BogButton) => {
//         if (!movieObject) return;

//         for (let i = 0; i < button.commands.length; i++) {
//             const [opc, dst, src] = button.commands[i].map(val => val.toString(16).padStart(8, '0'));
//             // console.log('button', i, opc, dst, src);

//             switch (opc) {
//                 case '48400200':
//                     if (memoryRef.current[dst] !== src)
//                         i++;
//                     continue;
//                 case '48400300':
//                     if (memoryRef.current[dst] === src)
//                         i++;
//                     continue;
//                 case '48400400':
//                     if (parseHex(memoryRef.current[dst]) < parseHex(src))
//                         i++;
//                     continue;
//                 case '48400500':
//                     if (parseHex(memoryRef.current[dst]) <= parseHex(src))
//                         i++;
//                     continue;
//                 case '48400600':
//                     if (parseHex(memoryRef.current[dst]) > parseHex(src))
//                         i++;
//                     continue;
//                 case '48400700':
//                     if (parseHex(memoryRef.current[dst]) >= parseHex(src))
//                         i++;
//                     continue;
//                 case '51c00003': {
//                     const srcVal = parseInt(src, 16) % parseInt('40000000', 16);
//                     const dstVal = parseInt(dst, 16) % parseInt('40000000', 16);

//                     const bogs = menu?.menuPages[cursor.page].bogs;
//                     const bogId = bogs?.findIndex(bog => bog.buttons[dstVal]);
//                     if (bogs && bogId !== undefined && bogId > -1 && Object.keys(bogs[bogId].buttons).length > 1) {
//                         buttonsRef.current[bogId] = dstVal;
//                     }

//                     return setCursor(prev => ({
//                         page: srcVal === 0 ? prev.page : srcVal,
//                         selected: dstVal,
//                         activated: false
//                     }));
//                 }
//                 case '51400003':
//                     return setCursor({
//                         page: parseInt(src, 16) % parseInt('40000000', 16),
//                         selected: parseInt(memoryRef.current[(parseInt(dst, 16) % parseInt('40000000', 16)).toString(16).padStart(8, '0')], 16),
//                         activated: false
//                     });
//                 case '50400001':
//                     memoryRef.current[dst] = src;
//                     continue;
//                 case '50000001':
//                     memoryRef.current[dst] = memoryRef.current[src];
//                     continue;
//                 case '50400003':
//                     memoryRef.current[dst] = (
//                         parseInt(memoryRef.current[dst], 16) + parseInt(src, 16)
//                     ).toString(16).padStart(8, '0');
//                     continue;
//                 case '50400004':
//                     memoryRef.current[dst] = (
//                         parseInt(memoryRef.current[dst], 16) - parseInt(src, 16)
//                     ).toString(16).padStart(8, '0');
//                     continue;
//                 case '22050000':
//                     const chapterIdx = parseInt(memoryRef.current[dst], 16);
//                     setSeekToChapter(chapterIdx);

//                     setCursor({
//                         page: -1,
//                         selected: 0,
//                         activated: false
//                     });

//                     continue;
//                 case '21810000':
//                 case '21830000':
//                     titleMenuRef.current = false;
//                     setCursor({
//                         page: -1,
//                         selected: 0,
//                         activated: false
//                     });

//                     const titleIdx = parseInt(dst, 16);
//                     const newMovieObject = movieObject.titles[titleIdx];
                    
//                     return setProgram({
//                         titleIdx,
//                         commands: newMovieObject.program,
//                         allowMenu: !newMovieObject.menuCallMask,
//                         idx: 0,
//                     });
//                 case '21010000': {
//                     titleMenuRef.current = false;
//                     setCursor({
//                         page: -1,
//                         selected: 0,
//                         activated: false
//                     });

//                     const titleIdx = parseInt(memoryRef.current[dst], 16);
//                     const newMovieObject = movieObject.titles[titleIdx];
                    
//                     return setProgram({
//                         titleIdx,
//                         commands: newMovieObject.program,
//                         allowMenu: !newMovieObject.menuCallMask,
//                         idx: 0,
//                     });
//                 }
//                 case '11000007':
//                     titleMenuRef.current = false;
//                     return setCursor({
//                         page: -1,
//                         selected: 0,
//                         activated: false
//                     });
//                 case '50400009':
//                     memoryRef.current[dst] = (parseHex(memoryRef.current[dst]) & parseHex(src)).toString(16).padStart(8, '0');
//                     continue;
//                 case '31800004':
//                     const buttonId = parseInt(dst, 16);
//                     const bogId = menu?.menuPages[cursor.page].bogs.findIndex(bog => bog.buttons[buttonId]);
//                     if (bogId === undefined || bogId === -1) continue;
//                     buttonsRef.current[bogId] = buttonId;
//                     continue;
//                 case '51400001':
//                     const dstRef1 = (parseInt(dst.slice(0, 4), 16) % parseInt('4000', 16)).toString(16).padStart(8, '0');
//                     const dstRef2 = (parseInt(dst.slice(4, 8), 16) % parseInt('4000', 16)).toString(16).padStart(8, '0');
//                     setAudioStream(parseInt(memoryRef.current[dstRef1], 16));
//                     setSubtitleStream(parseInt(memoryRef.current[dstRef2], 16));
//                     continue;
//                 case '51c00001':
//                     const audioStream = parseInt(dst.slice(2, 4), 16);
//                     audioStream && setAudioStream(audioStream);
//                     setSubtitleStream(dst.slice(4, 6) === 'c0' ? parseInt(dst.slice(6, 8), 16) : 0);
//                     continue;
//                 case '20810000':
//                     i = parseInt(dst, 16) - 1;
//                     continue;
//                 case '00020000':
//                     return;
//             }
//         }
//     }, [cursor.page, menu?.menuPages, movieObject]);

//     const onKeyNavigate = useCallback((event: KeyboardEvent) => {
//         const { page, selected } = cursor;
//         if (!menu || page === -1 || selected === -1) return;

//         const nav = findButton(menu.menuPages[page].bogs, selected)?.navigation;
//         if (!nav) return;

//         const { up, left, down, right } = nav;

//         switch (event.code) {
//             case 'ArrowUp':
//                 setCursor(prev => ({
//                     ...prev,
//                     selected: up
//                 }));
//                 break;
//             case 'ArrowLeft':
//                 setCursor(prev => ({
//                     ...prev,
//                     selected: left
//                 }));
//                 break;
//             case 'ArrowDown':
//                 setCursor(prev => ({
//                     ...prev,
//                     selected: down
//                 }));
//                 break;
//             case 'ArrowRight':
//                 setCursor(prev => ({
//                     ...prev,
//                     selected: right
//                 }));
//                 break;
//             case 'Enter':
//                 setCursor(prev => ({
//                     ...prev,
//                     activated: true
//                 }));
//         }
//     }, [cursor, menu]);

//     useEffect(() => {
//         if (cursor.page > -1)
//             document.addEventListener('keydown', onKeyNavigate);

//         return () => {
//             document.removeEventListener('keydown', onKeyNavigate);
//         }
//     }, [onKeyNavigate, cursor.page]);

//     useEffect(() => {
//         const { page, selected, activated } = cursor;
        
//         if (page === -1 || selected === -1 || !menu) return;

//         const { transition, bogs } = menu.menuPages[page];

//         const button = findButton(bogs, selected);
//         if (!button || (!button.auto_action && !activated))
//             return;

//         // console.log('button id', button.id)

//         setTimeout(() => {
//             runButton(button);
//             setCursor(prev => ({ ...prev, activated: false }));
//         }, (transition ?? 0) / 100);
//     }, [cursor, menu, runButton]);

//     useEffect(() => {
//         if (!menu) return;

//         if ((titleMenuRef.current && program?.titleIdx === 0) || program?.titleIdx === -1) {
//             setCursor(prev => prev.page === 0 ? prev : {
//                 page: 0,
//                 selected: 0,
//                 activated: false
//             });
//         }

//         if (program?.titleIdx === 0) {
//             titleMenuRef.current = true;
//         } else {
//             titleMenuRef.current = false;
//         }
//     }, [menu, program?.titleIdx]);

//     const menuOpened = useMemo(
//         () => volumeMenu || audioMenu || subsMenu || chaptersMenu, 
//         [audioMenu, chaptersMenu, subsMenu, volumeMenu]
//     );

//     const [mouseIsMoving, setMouseIsMoving] = useState(false);
//     const mouseTimeout = useRef<NodeJS.Timeout>();

//     const onMouseMove = useCallback(() => {
//         if (mouseTimeout.current)
//             clearTimeout(mouseTimeout.current);

//         if (menuOpened)
//             return;

//         setMouseIsMoving(true);

//         mouseTimeout.current = setTimeout(() => {
//             setMouseIsMoving(false);
//         }, 2000);
//     }, [menuOpened]);

//     useEffect(() => {
//         document.addEventListener('mousemove', onMouseMove);
//         document.addEventListener('click', onMouseMove);

//         return () => {
//             document.removeEventListener('mousemove', onMouseMove);
//         }
//     }, [onMouseMove]);

//     const pointerStyle: CSSProperties = useMemo(() => {
//         return { pointerEvents: mouseIsMoving ? 'auto' : 'none' };
//     }, [mouseIsMoving]);
    
//     const marks = useMemo(() => {
//         const currentPlayItem = playlist?.list.streams[playlist.idx];
//         if (!clipInfo || !currentPlayItem) return;

//         return playlist.list.chapters.reduce(
//             (arr: { value: number; label: string; }[], { playItem, time }, i) => {
//                 if (playItem === currentPlayItem) {
//                     const { startTime } = clipInfo[currentPlayItem];
    
//                     arr.push({
//                         value: time - startTime,
//                         label: `Chapter ${i + 1}`
//                     });
//                 }
    
//                 return arr;
//             }, []
//         )
//     }, [clipInfo, playlist]);

//     return (
//         <div ref={divRef} className='player' onDoubleClick={toggleFullscreen}>
//             <canvas ref={canvasRef} />
//             <video ref={videoRef} />
//             <div className='player-controls' style={{ opacity: Number(mouseIsMoving) }}>
//                 <div className='progress'>
//                     <span>{formatTime(elapsed)}</span>
//                     <Slider
//                         sx={{
//                             color: '#ff5957',
//                             margin: '0 1rem'
//                         }}
//                         value={elapsed}
//                         max={duration} 
//                         onChange={(_, val) => {
//                             if (typeof val !== 'number' || (program?.titleIdx ?? 0) < 1)
//                                 return;

//                             isSeeking.current = true;
//                             setElapsed(val);
//                         }}
//                         onChangeCommitted={(_, val) => {
//                             if (typeof val !== 'number' || (program?.titleIdx ?? 0) < 1)
//                                 return;

//                             isSeeking.current = false;
//                             setElapsed(val);
//                             playerRef.current?.seek(val);
//                         }}
//                         marks={marks && marks.length > 1 ? marks : false}
//                         disabled={!mouseIsMoving}
//                     />
//                     <span>{formatTime(duration)}</span>
//                 </div>
//                 <div className='controls'>
//                     <div className='playback-controls'>
//                         <FontAwesomeIcon 
//                             icon={isPlaying ? faPause : faPlay} 
//                             onClick={togglePlay}
//                             style={pointerStyle}
//                         />
//                         <FontAwesomeIcon 
//                             icon={faBug} 
//                             onClick={() => console.log(memoryRef.current)}
//                             style={pointerStyle}
//                         />
//                         {
//                             movieObject && program?.allowMenu &&
//                             <>
//                                 <FontAwesomeIcon 
//                                     icon={faHome}
//                                     onClick={e => {
//                                         e.preventDefault();
                
//                                         if (program.titleIdx === 0) return;
                
//                                         setProgram({
//                                             titleIdx: 0,
//                                             commands: movieObject.titles[0].program,
//                                             allowMenu: !movieObject.titles[0].menuCallMask,
//                                             idx: 0,
//                                         });
//                                     }}
//                                     color={program.titleIdx === 0 ? '#ff5957' : 'white'}
//                                 />
//                                 {
//                                     menu &&
//                                     <FontAwesomeIcon 
//                                         icon={faBars}
//                                         onClick={e => {
//                                             e.preventDefault();
                    
//                                             if (cursor.page > -1) {
//                                                 setCursor({
//                                                     page: -1,
//                                                     selected: 0,
//                                                     activated: false
//                                                 });
//                                             } else {
//                                                 setCursor({
//                                                     page: 0,
//                                                     selected: 0,
//                                                     activated: false
//                                                 });
//                                             }
//                                         }}
//                                         color={cursor.page > -1 ? '#ff5957' : 'white'}
//                                     />
//                                 }
//                             </>
//                         }
//                         {
//                             (program?.titleIdx === 0 || cursor.page > -1) &&
//                             <>
//                                 <FontAwesomeIcon
//                                     icon={faCompass}
//                                     style={pointerStyle}
//                                     ref={remoteRef}
//                                     onClick={() => setRemoteMenu(true)}
//                                     color={remoteMenu ? '#ff5957' : 'white'}
//                                 />
//                                 <Popover
//                                     className='remote-popover'
//                                     open={remoteMenu}
//                                     anchorEl={remoteRef.current}
//                                     onClose={() => setRemoteMenu(false)}
//                                     anchorOrigin={anchorOrigin}
//                                     transformOrigin={transformOrigin}
//                                     sx={{backgroundColor: 'transparent'}}
//                                     container={divRef.current}
//                                 >
//                                     <ul>
//                                         <li />
//                                         <li>
//                                             <FontAwesomeIcon
//                                                 icon={faChevronUp}
//                                                 onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp' }))}
//                                             />
//                                         </li>
//                                         <li />
//                                         <li>
//                                             <FontAwesomeIcon
//                                                 icon={faChevronLeft}
//                                                 onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }))}
//                                             />
//                                         </li>
//                                         <li>
//                                             <FontAwesomeIcon
//                                                 icon={faCircleCheck}
//                                                 onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' }))}
//                                             />
//                                         </li>
//                                         <li>
//                                             <FontAwesomeIcon
//                                                 icon={faChevronRight}
//                                                 onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }))}
//                                             />
//                                         </li>
//                                         <li />
//                                         <li>
//                                             <FontAwesomeIcon
//                                                 icon={faChevronDown}
//                                                 onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown' }))}
//                                             />
//                                         </li>
//                                         <li />
//                                     </ul>
//                                 </Popover>
//                             </>
//                         }
//                     </div>
//                     <div className='media-info'>
//                         {
//                             playlist &&
//                             <p>{id} - {playlist.list.streams[playlist.idx]}</p>
//                         }
//                     </div>
//                     <div className='adjustable'>
//                         <FontAwesomeIcon 
//                             icon={faVolumeHigh}
//                             ref={volumeRef}
//                             onClick={() => setVolumeMenu(true)}
//                             color={volumeMenu ? '#ff5957' : 'white'}
//                         />
//                         <Popover
//                             className='volume-popover'
//                             open={volumeMenu}
//                             anchorEl={volumeRef.current}
//                             onClose={() => setVolumeMenu(false)}
//                             anchorOrigin={anchorOrigin}
//                             transformOrigin={transformOrigin}
//                             sx={{backgroundColor: 'transparent'}}
//                             container={divRef.current}
//                         >
//                             <Slider
//                                 className='volume-slider'
//                                 orientation='vertical'
//                                 step={0.01}
//                                 value={volume}
//                                 max={1} 
//                                 onChange={(_, val) => {
//                                     if (typeof val !== 'number') return;
//                                     setVolume(val);
//                                     playerRef.current?.setVolume(val);
//                                 }}
//                                 disabled={!mouseIsMoving}
//                             />
//                             <p>{Math.floor(volume * 100)}</p>
//                         </Popover>
//                         {
//                             audioTracks && audioTracks.length > 1 &&
//                             <>
//                                 <FontAwesomeIcon 
//                                     icon={faMusic}
//                                     ref={audioMenuRef}
//                                     onClick={() => setAudioMenu(true)}
//                                     style={pointerStyle}
//                                     color={audioMenu ? '#ff5957' : 'white'}
//                                 />
//                                 <Menu
//                                     anchorEl={audioMenuRef.current}
//                                     anchorOrigin={anchorOrigin}
//                                     transformOrigin={transformOrigin}
//                                     open={audioMenu}
//                                     onClose={() => setAudioMenu(false)}
//                                     container={divRef.current}
//                                 >
//                                     {audioTracks.map((track, i) => (
//                                     <MenuItem key={track.id} onClick={() => setAudioStream(i + 1)}>
//                                         {
//                                             audioStream === i + 1 &&
//                                             <ListItemIcon>
//                                                 <Check />
//                                             </ListItemIcon>
//                                         }
//                                         <ListItemText inset={audioStream !== i + 1}>
//                                             Track {i + 1}
//                                         </ListItemText>
//                                     </MenuItem>
//                                     ))}
//                                 </Menu>
//                             </>
//                         }
//                         {
//                             subtitles && (
//                                 subtitles.external.length + Object.keys(subtitles.internal).length
//                             ) > 0 &&
//                             <>
//                                 <FontAwesomeIcon 
//                                     icon={faMessage} 
//                                     ref={subsMenuRef}
//                                     onClick={() => setSubsMenu(true)}
//                                     style={pointerStyle}
//                                     color={subsMenu ? '#ff5957' : 'white'}
//                                 />
//                                 <Menu
//                                     anchorEl={subsMenuRef.current}
//                                     anchorOrigin={anchorOrigin}
//                                     transformOrigin={transformOrigin}
//                                     open={subsMenu}
//                                     onClose={() => setSubsMenu(false)}
//                                     container={divRef.current}
//                                 >
//                                     <MenuItem onClick={() => {
//                                         setSubtitleStream(0);
//                                         setExtSubStream('');
//                                     }}>
//                                         {
//                                             !(subtitleStream + extSubStream.length) &&
//                                             <ListItemIcon>
//                                                 <Check />
//                                             </ListItemIcon>
//                                         }
//                                         <ListItemText inset={subtitleStream + extSubStream.length > 0}>
//                                             None
//                                         </ListItemText>
//                                     </MenuItem>
//                                     {
//                                         (playlist && subtitles.internal[playlist.list.streams[playlist.idx]]
//                                             ? [...Array(subtitles.internal[playlist.list.streams[playlist.idx]]).keys()] 
//                                             : []
//                                         ).map(i => (
//                                             <MenuItem key={`internal_subs_${i}`} onClick={() => {
//                                                 setSubtitleStream(i + 1);
//                                                 setExtSubStream('');
//                                             }}>
//                                                 {
//                                                     subtitleStream === i + 1 &&
//                                                     <ListItemIcon>
//                                                         <Check />
//                                                     </ListItemIcon>
//                                                 }
//                                                 <ListItemText inset={subtitleStream !== i + 1}>
//                                                     Internal Subtitle {i + 1}
//                                                 </ListItemText>
//                                             </MenuItem>
//                                         ))
//                                     }
//                                     {
//                                         subtitles.external.map(sub => (
//                                             <MenuItem key={sub} onClick={() => {
//                                                 setSubtitleStream(0);
//                                                 setExtSubStream(sub);
//                                             }}>
//                                             {
//                                                 extSubStream === sub &&
//                                                 <ListItemIcon>
//                                                     <Check />
//                                                 </ListItemIcon>
//                                             }
//                                             <ListItemText inset={extSubStream !== sub}>
//                                                 {sub}
//                                             </ListItemText>
//                                         </MenuItem>
//                                         ))
//                                     }
//                                 </Menu>
//                             </>
//                         }
//                         {
//                             clipInfo && playlist && playlist.list.chapters.length > 1 &&
//                             <>
//                                 <FontAwesomeIcon 
//                                     icon={faBookmark} 
//                                     ref={chaptersMenuRef}
//                                     onClick={() => setChaptersMenu(true)}
//                                     style={pointerStyle}
//                                     color={chaptersMenu ? '#ff5957' : 'white'}
//                                 />
//                                 <Menu
//                                     anchorEl={chaptersMenuRef.current}
//                                     anchorOrigin={anchorOrigin}
//                                     transformOrigin={transformOrigin}
//                                     open={chaptersMenu}
//                                     onClose={() => setChaptersMenu(false)}
//                                     container={divRef.current}
//                                 >
//                                     {playlist.list.chapters.map(({ playItem, time }, i) => {
//                                         const { startTime } = clipInfo[playItem];
//                                         return (
//                                             <MenuItem key={`chapter_${i}`} onClick={() => setSeekToChapter(i)}>
//                                                 {
//                                                     chapter === i &&
//                                                     <ListItemIcon>
//                                                         <Check />
//                                                     </ListItemIcon>
//                                                 }
//                                                 <ListItemText inset={chapter !== i}>
//                                                     Chapter {i + 1} ({playItem} - {formatTime(time - startTime)})
//                                                 </ListItemText>
//                                             </MenuItem>
//                                         )
//                                     })}
//                                 </Menu>
//                             </>
//                         }
//                         <FontAwesomeIcon
//                             icon={faExpand}
//                             onClick={() => toggleFullscreen()}
//                             style={pointerStyle}
//                         />
//                     </div>
//                 </div>
//             </div>
//         </div>
//     );
// }

// export default Player;