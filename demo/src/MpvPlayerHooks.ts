import { createContext, useEffect, useMemo, useRef, useState } from 'react';
import MpvPlayer from 'libmpv-wasm/build';

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
    const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);

    const [subtitleStream, setSubtitleStream] = useState(1);
    const [subtitleTracks, setSubtitleTracks] = useState<Track[]>([]);

    const [currentChapter, setCurrentChapter] = useState(0);
    const [chapters, setChapters] = useState<Chapter[]>([]);
    
    const [uploading, setUploading] = useState('');
    const [fileEnd, setFileEnd] = useState(false);
    const [bluray, setBluray] = useState(false);

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
        uploading, fileEnd, shaderCount,
        bluray, setBluray,
        setVolume, setTitle, setElapsed
    }), [
        mpvPlayer, canvasRef, playerRef,
        title, idle, elapsed, duration, isPlaying, volume,
        videoStream, videoTracks,
        audioStream, audioTracks,
        subtitleStream, subtitleTracks,
        currentChapter, chapters,
        uploading, fileEnd, shaderCount,
        bluray, setBluray,
        setVolume, setTitle, setElapsed
    ]);

    useEffect(() => {
        if (!canvasRef.current || ranOnce.current) return;

        MpvPlayer.load(canvasRef.current, '/static/js/libmpv.js', {
            idle: setIdle,
            isPlaying: setIsPlaying,
            duration: setDuration,
            elapsed: setElapsed,
            videoStream: setVideoStream,
            videoTracks: setVideoTracks,
            audioStream: setAudioStream,
            audioTracks: setAudioTracks,
            subtitleStream: setSubtitleStream,
            subtitleTracks: setSubtitleTracks,
            currentChapter: setCurrentChapter,
            chapters: setChapters,
            uploading: setUploading,
            title: val => {
                if (!val) return;
                setTitle(val);
            },
            fileEnd: setFileEnd,
            shaderCount: setShaderCount,
            blurayDiscInfo: val => setBluray(!!val),
        }).then(setMpvPlayer);

        ranOnce.current = true;
    }, []);

    return contextValue;
}

export type Player = ReturnType<typeof useMpvPlayer>;

export const PlayerContext = createContext<Player | null>(null);