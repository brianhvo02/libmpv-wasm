import { createContext, useEffect, useMemo, useRef, useState } from 'react';
import MpvPlayer from 'libmpv-wasm';

export const useMpvPlayer = () => {
    const [mpvPlayer, setMpvPlayer] = useState<MpvPlayer>();

    const [title, setTitle] = useState('');
    const [idle, setIdle] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [volume, setVolume] = useState(1);

    const [videoStream, setVideoStream] = useState(1);
    const [videoTracks, setVideoTracks] = useState<VideoTrack[]>([]);

    const [audioStream, setAudioStream] = useState(1);
    const [audioTracks, setAudioTracks] = useState<AudioTrack[]>();

    const [subtitleStream, setSubtitleStream] = useState(1);
    const [subtitleTracks, setSubtitleTracks] = useState<Track[]>();

    const [currentChapter, setCurrentChapter] = useState(0);
    const [chapters, setChapters] = useState<Chapter[]>();
    
    const [uploading, setUploading] = useState(false);
    const [files, setFiles] = useState<string[]>([]);

    const [shaderCount, setShaderCount] = useState<number>(0);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const playerRef = useRef<HTMLDivElement>(null);
    const ranOnce = useRef(false);

    const contextValue = useMemo(() => ({
        mpvPlayer, canvasRef, playerRef,
        title, idle, elapsed, duration, isPlaying, volume,
        videoStream, videoTracks,
        audioStream, audioTracks,
        subtitleStream, subtitleTracks,
        currentChapter, chapters,
        uploading, files, shaderCount,
        setVolume, setTitle, setElapsed
    }), [
        mpvPlayer, canvasRef, playerRef,
        title, idle, elapsed, duration, isPlaying, volume,
        videoStream, videoTracks,
        audioStream, audioTracks,
        subtitleStream, subtitleTracks,
        currentChapter, chapters,
        uploading, files, shaderCount,
        setVolume, setTitle, setElapsed
    ]);

    useEffect(() => {
        if (!canvasRef.current || ranOnce.current) return;

        MpvPlayer.load(canvasRef.current, '/static/js/libmpv.js')
            .then(player => {
                const proxy = new Proxy(player, {
                    apply(target, thisArg, argArray) {
                        console.log('Unimplemented apply:', target, thisArg, argArray);
                    },
                    set(target, p, newValue) {
                        switch (p) {
                            case 'idle':
                                target.idle = newValue;
                                setIdle(newValue);
                                break;
                            case 'isPlaying':
                                target.isPlaying = newValue;
                                setIsPlaying(newValue);
                                break;
                            case 'duration':
                                target.duration = newValue;
                                setDuration(newValue);
                                break;
                            case 'elapsed':
                                target.elapsed = newValue;
                                setElapsed(newValue);
                                break;
                            // case 'volume':
                            //     target.volume = newValue;
                            //     setVolume(newValue);
                            //     break;
                            case 'videoStream':
                                target.videoStream = parseInt(newValue);
                                setVideoStream(parseInt(newValue));
                                break;
                            case 'videoTracks':
                                target.videoTracks = newValue;
                                setVideoTracks(newValue);
                                break;
                            case 'audioStream':
                                target.audioStream = parseInt(newValue);
                                setAudioStream(parseInt(newValue));
                                break;
                            case 'audioTracks':
                                target.audioTracks = newValue;
                                setAudioTracks(newValue);
                                break;
                            case 'subtitleStream':
                                target.subtitleStream = parseInt(newValue);
                                setSubtitleStream(parseInt(newValue));
                                break;
                            case 'subtitleTracks':
                                target.subtitleTracks = newValue;
                                setSubtitleTracks(newValue);
                                break;
                            case 'currentChapter':
                                target.currentChapter = parseInt(newValue);
                                setCurrentChapter(parseInt(newValue));
                                break;
                            case 'chapters':
                                target.chapters = newValue;
                                setChapters(newValue);
                                break;
                            case 'isSeeking':
                                target.isSeeking = newValue;
                                break;
                            case 'uploading':
                                target.uploading = newValue;
                                setUploading(newValue);
                                break;
                            case 'files':
                                target.files = newValue;
                                setFiles(newValue);
                                break;
                            case 'shaderCount':
                                target.shaderCount = newValue;
                                setShaderCount(newValue);
                                break;
                            default:
                                console.log('Unimplemented set:', p);
                                return false;
                        }
                        
                        return true;
                    },
                });

                player.setProxy(proxy);
                setMpvPlayer(proxy);
            });

        ranOnce.current = true;
    }, []);

    return contextValue;
}

export type Player = ReturnType<typeof useMpvPlayer>;

export const PlayerContext = createContext<Player | null>(null);