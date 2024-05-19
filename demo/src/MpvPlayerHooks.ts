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

    const [videoStream, setVideoStream] = useState(1n);
    const [videoTracks, setVideoTracks] = useState<VideoTrack[]>([]);

    const [audioStream, setAudioStream] = useState(1n);
    const [audioTracks, setAudioTracks] = useState<AudioTrack[]>();

    const [subtitleStream, setSubtitleStream] = useState(1n);
    const [subtitleTracks, setSubtitleTracks] = useState<Track[]>();
    
    const [uploading, setUploading] = useState(false);
    const [files, setFiles] = useState<string[]>([]);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const playerRef = useRef<HTMLDivElement>(null);
    const ranOnce = useRef(false);

    const contextValue = useMemo(() => ({
        mpvPlayer, canvasRef, playerRef,
        title, idle, elapsed, duration, isPlaying, volume,
        videoStream, videoTracks,
        audioStream, audioTracks,
        subtitleStream, subtitleTracks,
        uploading, files,
        setVolume, setTitle, setElapsed
    }), [
        mpvPlayer, canvasRef, playerRef,
        title, idle, elapsed, duration, isPlaying, volume,
        videoStream, videoTracks,
        audioStream, audioTracks,
        subtitleStream, subtitleTracks,
        uploading, files,
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
                                target.videoStream = BigInt(newValue);
                                setVideoStream(BigInt(newValue));
                                break;
                            case 'videoTracks':
                                target.videoTracks = newValue;
                                setVideoTracks(newValue);
                                break;
                            case 'audioStream':
                                target.audioStream = BigInt(newValue);
                                setAudioStream(BigInt(newValue));
                                break;
                            case 'audioTracks':
                                target.audioTracks = newValue;
                                setAudioTracks(newValue);
                                break;
                            case 'subtitleStream':
                                target.subtitleStream = BigInt(newValue);
                                setSubtitleStream(BigInt(newValue));
                                break;
                            case 'subtitleTracks':
                                target.subtitleTracks = newValue;
                                setSubtitleTracks(newValue);
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