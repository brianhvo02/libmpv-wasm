import './Player.scss';

import { Dispatch, SetStateAction, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { PlayerContext } from '../MpvPlayerHooks';
import PlayerControls from './PlayerControls';

interface PlayerProps {
    setHideHeader: Dispatch<SetStateAction<boolean>>;
}

const Player = ({ setHideHeader }: PlayerProps) => {
    const player = useContext(PlayerContext);

    const togglePlayTimeout = useRef<number>();
    const [willTogglePlay, setWillTogglePlay] = useState<boolean>();
    const togglePlay = useRef<() => void>();

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
            <canvas id='canvas' ref={player?.canvasRef} />
            <div className="canvas-blocker" 
                onClick={e => setWillTogglePlay(e.detail === 1)} />
            { !!player?.title.length &&
            <PlayerControls player={player} /> }
        </div>
    );
}

export default Player;