import './Player.scss';

import { CSSProperties, Dispatch, SetStateAction, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { PlayerContext } from '../MpvPlayerHooks';
import PlayerControls from './PlayerControls';
import { useMediaQuery } from '@mui/material';
import json2mq from 'json2mq';

interface PlayerProps {
    setHideHeader: Dispatch<SetStateAction<boolean>>;
}

const gcd = (a: number, b: number): number => (b === 0) ? a : gcd(b, a % b);

const Player = ({ setHideHeader }: PlayerProps) => {
    const player = useContext(PlayerContext);

    const togglePlayTimeout = useRef<number>();
    const [willTogglePlay, setWillTogglePlay] = useState<boolean>();
    const togglePlay = useRef<() => void>();
    
    const aspectRatio = useMemo(() => {
        if (!player) return '';
        const videoStream = player.videoTracks[player.videoStream - 1];
        if (!videoStream) return '';
        const { demuxW, demuxH } = videoStream;
        const w = Number(demuxW),
              h = Number(demuxH);
        const d = gcd(w, h);
        const ratio = `${w / d}/${h / d}`;
        return ratio;
    }, [player]);
    
    const minAspectRatio = useMediaQuery(json2mq({ minAspectRatio: aspectRatio }));
    const maxAspectRatio = useMediaQuery(json2mq({ maxAspectRatio: aspectRatio }));

    const sizeStyle = useMemo<CSSProperties>(() => minAspectRatio ? {
        width: 'auto'
    } : maxAspectRatio ? {
        height: 'auto'
    } : {
        width: '100%',
        height: '100%'
    }, [maxAspectRatio, minAspectRatio]);

    useEffect(() => {
        togglePlay.current = player?.title.length 
            ? player.mpvPlayer?.module.togglePlay : undefined;
    }, [player]);

    useEffect(() => {
        const play = togglePlay.current;
        if (!play) return;

        if (willTogglePlay) {
            togglePlayTimeout.current = window.setTimeout(() => {
                setWillTogglePlay(false);
                play();
            }, 350);
        } else {
            clearTimeout(togglePlayTimeout.current);
        }
    }, [willTogglePlay]);

    const toggleFullscreen = useCallback(() => document.fullscreenElement
        ? document.exitFullscreen()
        : document.body.requestFullscreen(), 
    []);

    useEffect(() => {
        const module = player?.mpvPlayer?.module;
        if (!module) return;

        const keyboardListener = (e: KeyboardEvent) => {
            if (!player.title.length) return;

            switch (e.code) {
                case 'Space':
                    module.togglePlay();
                    break;
                case 'ArrowLeft':
                    module.skipBackward();
                    break;
                case 'ArrowRight':
                    module.skipForward();
                    break;
            }
        }

        document.addEventListener('keydown', keyboardListener);

        return () => {
            document.removeEventListener('keydown', keyboardListener);
        }
    }, [player]);
    
    return (
        <div className='player' ref={player?.playerRef} tabIndex={0}
            onMouseEnter={() => player?.title.length && setHideHeader(true)}
            onDoubleClick={toggleFullscreen}
        >
            <canvas id='canvas' ref={player?.canvasRef} style={sizeStyle}/>
            <div className="canvas-blocker" 
                onClick={e => setWillTogglePlay(e.detail === 1)} />
            { !!player?.title.length &&
            <PlayerControls player={player} /> }
        </div>
    );
}

export default Player;