import './Player.scss';

import { Dispatch, SetStateAction, useContext, useEffect, useState } from 'react';
import { PlayerContext } from '../MpvPlayerHooks';
import PlayerControls from './PlayerControls';

interface PlayerProps {
    setHideHeader: Dispatch<SetStateAction<boolean>>;
}

const Player = ({ setHideHeader }: PlayerProps) => {
    const player = useContext(PlayerContext);
    const [playerFocus, setPlayerFocus] = useState(false);

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
            onFocus={() => setPlayerFocus(true)} onBlur={() => setPlayerFocus(false)}
            // onDoubleClick={toggleFullscreen}
        >
            <canvas id='canvas' ref={player?.canvasRef} />
            <div className="canvas-blocker" 
                onClick={() => player?.title.length && playerFocus && player.mpvPlayer?.module.togglePlay()} />
            { !!player?.title.length &&
            <PlayerControls player={player} /> }
        </div>
    );
}

export default Player;