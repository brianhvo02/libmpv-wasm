import './Player.scss';

import { useContext } from 'react';
import { PlayerContext } from '../MpvPlayerHooks';
import PlayerControls from './PlayerControls';

const Player = () => {
    const player = useContext(PlayerContext);
                        
    return (
        <div className='player' ref={player?.playerRef}
            // onDoubleClick={toggleFullscreen}
        >
            <canvas id='canvas' ref={player?.canvasRef} />
            <div className="canvas-blocker" onClick={() => player?.title.length && player.mpvPlayer?.module.togglePlay()} />
            { !!player?.title.length &&
            <PlayerControls player={player} /> }
        </div>
    );
}

export default Player;