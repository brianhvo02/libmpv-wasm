import { createContext, useEffect, useMemo, useRef, useState } from 'react';
import MpvPlayer from 'libmpv-wasm/build';
import { BlurayDiscInfo } from 'libmpv-wasm/build/libmpv';

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
    const [bluray, setBluray] = useState<BlurayDiscInfo | null>(null);
    const [menuPageId, setMenuPageId] = useState(-1);
    const [blurayTitle, setBlurayTitle] = useState(-1);
    const [playlistId, setPlaylistId] = useState(0);
    const [objectIdx, setObjectIdx] = useState(0);

    const [shaderCount, setShaderCount] = useState<number>(0);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const overlayRef = useRef<HTMLCanvasElement>(null);
    const playerRef = useRef<HTMLDivElement>(null);
    const ranOnce = useRef(false);

    const currentObject = useMemo(() => objectIdx > -1 ? mpvPlayer?.getCurrentObject() : null, [mpvPlayer, objectIdx]);
    const currentPlaylist = useMemo(() => {
        const val = playlistId >= -1 ? mpvPlayer?.getCurrentPlaylist() : null;
        console.log('clip size frontend', val?.clips.size());
        return val;
    }, [mpvPlayer, playlistId]);

    const contextValue = useMemo(() => ({
        mpvPlayer, canvasRef, overlayRef, playerRef,
        title, idle, elapsed, duration, isPlaying, volume,
        videoStream, videoTracks,
        audioStream, audioTracks,
        subtitleStream, subtitleTracks,
        currentChapter, chapters,
        blurayTitle, objectIdx,
        uploading, fileEnd, shaderCount,
        currentObject, currentPlaylist,
        playlistId, setPlaylistId,
        menuPageId, setMenuPageId,
        bluray, setBluray,
        setVolume, setTitle, setElapsed
    }), [
        mpvPlayer, canvasRef, overlayRef, playerRef,
        title, idle, elapsed, duration, isPlaying, volume,
        videoStream, videoTracks,
        audioStream, audioTracks,
        subtitleStream, subtitleTracks,
        currentChapter, chapters,
        blurayTitle, objectIdx,
        uploading, fileEnd, shaderCount,
        currentObject, currentPlaylist,
        playlistId, setPlaylistId,
        menuPageId, setMenuPageId,
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
            blurayDiscInfo: setBluray,
            menuPageId: setMenuPageId,
            blurayTitle: setBlurayTitle,
            playlistId: setPlaylistId,
            objectIdx: setObjectIdx,
        }).then(setMpvPlayer);

        ranOnce.current = true;
    }, []);

    return contextValue;
}

export type Player = ReturnType<typeof useMpvPlayer>;

export const PlayerContext = createContext<Player | null>(null);