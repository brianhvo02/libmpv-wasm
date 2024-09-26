import './Player.scss';

import { CSSProperties, Dispatch, SetStateAction, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { PlayerContext } from '../MpvPlayerHooks';
import PlayerControls from './PlayerControls';
import { useMediaQuery } from '@mui/material';
import json2mq from 'json2mq';
import MpvPlayer from 'libmpv-wasm/build';

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

        // console.log(player.mpvPlayer.module.getFreeMemory());

        const playlist = player.mpvPlayer.blurayDiscInfo?.playlists.get(player.playlistId.toString());
        if (!playlist) throw new Error('Playlist not found');
        
        const page = playlist.igs.menu.pages.get(player.menuPageId);
        if (!page) throw new Error('Menu not found');

        ctx.canvas.width = playlist.igs.menu.width;
        ctx.canvas.height = playlist.igs.menu.height;
        
        player.mpvPlayer.buttonState.forEach(id => {
            const button = page.buttons.get(id.toString());
            if (!button) return;

            const state = player.menuSelected === id
                ? player.menuActivated
                    ? button.activated
                    : button.selected
                : button.normal;
            
            if (state.start === 0xFFFF) return;
            
            ctx.drawImage(playlistPictures[state.start][page.palette], button.x, button.y);
        });

        MpvPlayer.destructPlaylist(playlist);
    }, [
        playlistPictures,
        player?.bluray, player?.blurayTitle, player?.overlayRef, player?.playlistId, 
        player?.menuPageId, player?.mpvPlayer, player?.menuSelected, player?.menuActivated
    ]);

    const onKeyDown = useCallback((e: KeyboardEvent) => {
        const module = player?.mpvPlayer?.module;
        if (!module || !player.title.length) return;

        if (e.shiftKey && e.code === 'KeyD') {
            module.subDelayUp();
            return;
        }

        if (e.shiftKey && e.code === 'KeyA') {
            module.subDelayDown();
            return;
        }

        if (player?.menuPageId > -1) {
            if (!player.mpvPlayer) return;

            const playlist = player.mpvPlayer.blurayDiscInfo?.playlists.get(player.playlistId.toString());
            if (!playlist) return;
            
            const nav = playlist?.igs.menu.pages.get(player.menuPageId)
                ?.buttons.get(player.menuSelected.toString())?.navigation;
            if (!nav) return;

            switch (e.code) {
                case 'ArrowUp':
                    player.mpvPlayer.proxy.menuSelected = nav.up;
                    break;
                case 'ArrowDown':
                    player.mpvPlayer.proxy.menuSelected = nav.down;
                    break;
                case 'ArrowLeft':
                    player.mpvPlayer.proxy.menuSelected = nav.left;
                    break;
                case 'ArrowRight':
                    player.mpvPlayer.proxy.menuSelected = nav.right;
                    break;
                case 'Enter':
                    player.mpvPlayer.menuActivate();
                    break;
            }

            MpvPlayer.destructPlaylist(playlist);
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
    }, [player?.menuPageId, player?.menuSelected, player?.mpvPlayer, player?.playlistId, player?.title.length]);

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
            <canvas ref={player?.overlayRef} style={sizeStyle} />
            <div className="canvas-blocker" 
                onClick={e => setWillTogglePlay(e.detail === 1)} />
            { !!player?.title.length &&
            <PlayerControls player={player} /> }
        </div>
    );
}

export default Player;