import './Player.scss';

import { CSSProperties, Dispatch, SetStateAction, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { PlayerContext } from '../MpvPlayerHooks';
import PlayerControls from './PlayerControls';
import { useMediaQuery } from '@mui/material';
import json2mq from 'json2mq';
import MpvPlayer from 'libmpv-wasm/build';
import { Button } from 'libmpv-wasm/build/libmpv';

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
    }, [player?.title, player?.mpvPlayer?.module]);

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

    const playlistPictures = useMemo(
        () => player?.menuPictures[player.playlistId], 
        [player?.menuPictures, player?.playlistId]
    );

    useEffect(() => {
        const ctx = player?.overlayRef.current?.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        if (!player?.mpvPlayer || player.blurayTitle < 0 || player.menuPageId < 0 || !playlistPictures) return;

        const igs = player.currentPlaylist?.igs;
        if (!igs) return;
        
        const page = igs.menu.pages.get(player.menuPageId);
        if (!page) return;

        (async () => {
            const bogs = MpvPlayer.vectorToArray(page.bogs);
            for (let i = 0; i < bogs.length; i++) {
                const bog = bogs[i];

                const { enabled, defButton } = MpvPlayer.vectorToArray(bog.buttons)
                    .reduce((obj: { enabled: Button | null, defButton: Button | null }, button) => {
                        if (player.mpvPlayer!.buttonState[button.buttonId]) 
                            obj.enabled = button;
                        if (button.buttonId === bog.defButton)
                            obj.defButton = button;
                        return obj;
                    }, { enabled: null, defButton: null });

                const button = enabled || defButton;
                if (!button) continue;
    
                const pictureId = player.menuSelected === i ? player.menuActivated ? button.activated : button.selected : button.normal;
                if (!pictureId || pictureId.start === 0xFFFF) continue;
    
                ctx.drawImage(playlistPictures[pictureId.start][page.palette], button.x, button.y);

                bog.buttons.delete();
            }
        })();
    }, [
        playlistPictures,
        player?.bluray, player?.blurayTitle, player?.overlayRef, player?.currentPlaylist, 
        player?.menuPageId, player?.mpvPlayer, player?.menuSelected, player?.menuActivated
    ]);

    const onKeyDown = useCallback((e: KeyboardEvent) => {
        const module = player?.mpvPlayer?.module;
        if (!module || !player.title.length) return;

        if (player?.menuPageId > -1) {
            if (!player.mpvPlayer) return;
            
            const page = player.mpvPlayer.getCurrentMenu();
            if (!page) return;

            const bog = page.bogs.get(player.menuSelected);
            if (!bog) return;

            const { enabled, defButton } = MpvPlayer.vectorToArray(bog.buttons)
                .reduce((obj: { enabled: Button | null, defButton: Button | null }, button) => {
                    if (player.mpvPlayer!.buttonState[button.buttonId]) 
                        obj.enabled = button;
                    if (button.buttonId === bog.defButton)
                        obj.defButton = button;
                    return obj;
                }, { enabled: null, defButton: null });
            
            const nav = (enabled || defButton)?.navigation;
            if (!nav) return;

            switch (e.code) {
                case 'ArrowUp':
                    player.mpvPlayer.setMenuSelected(nav.up);
                    break;
                case 'ArrowDown':
                    player.mpvPlayer.setMenuSelected(nav.down);
                    break;
                case 'ArrowLeft':
                    player.mpvPlayer.setMenuSelected(nav.left);
                    break;
                case 'ArrowRight':
                    player.mpvPlayer.setMenuSelected(nav.right);
                    break;
                case 'Enter':
                    player.mpvPlayer.menuActivate();
                    break;
            }

            bog.buttons.delete();

            player.mpvPlayer.nextMenuCommand();
        } else {
            switch (e.code) {
                case 'ArrowLeft':
                    module.skipBackward();
                    return;
                case 'ArrowRight':
                    module.skipForward();
                    return;
                case 'Space':
                    module.togglePlay();
                    break;
            }
        }
    }, [player?.menuPageId, player?.menuSelected, player?.mpvPlayer, player?.title]);

    useEffect(() => {
        document.addEventListener('keydown', onKeyDown);

        return () => {
            document.removeEventListener('keydown', onKeyDown);
        }
    }, [onKeyDown]);
    
    return (
        <div className='player' ref={player?.playerRef} tabIndex={0}
            onMouseEnter={() => player?.title.length && setHideHeader(true)}
            onDoubleClick={toggleFullscreen}
        >
            <canvas id='canvas' ref={player?.canvasRef} style={sizeStyle}/>
            <canvas ref={player?.overlayRef} style={sizeStyle}
                width={player?.currentPlaylist?.igs.menu.width} 
                height={player?.currentPlaylist?.igs.menu.height} />
            <div className="canvas-blocker" 
                onClick={e => setWillTogglePlay(e.detail === 1)} />
            { !!player?.title.length &&
            <PlayerControls player={player} /> }
        </div>
    );
}

export default Player;