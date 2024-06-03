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
    }, [player?.mpvPlayer?.module, player?.title]);

    const [pictures, setPictures] = useState<HTMLImageElement[]>([]);

    useEffect(() => {
        if (!player?.mpvPlayer || player.blurayTitle < 0 || player.menuPageId < 0) return;
        
        const igs = player.currentPlaylist?.igs;
        if (!igs) return;

        setPictures([]);
        Promise.all(
            MpvPlayer.vectorToArray(igs.pictures)
                .map((picture, i) => new Promise<HTMLImageElement>(resolve => {
                    const base64 = player.mpvPlayer!.module.getPicture(igs, player.menuPageId, picture);
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.src = 'data:image/png;base64,' + base64;
                }))
        ).then(setPictures);
    }, [player?.bluray, player?.blurayTitle, player?.currentPlaylist, player?.menuPageId, player?.mpvPlayer]);

    useEffect(() => {
        if (!player?.mpvPlayer || !player.overlayRef || player.blurayTitle < 0 || player.menuPageId < 0 || !pictures.length) return;

        const igs = player.currentPlaylist?.igs;
        if (!igs) return;
        
        const page = igs.menu.pages.get(player.menuPageId);
        if (!page) return;

        const ctx = player.overlayRef.current?.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, igs.menu.width, igs.menu.height);

        const duration = MpvPlayer.vectorToArray(page.inEffects.effect)
            .reduce((duration, effect) => duration + effect.duration, 0) / 90;

        setTimeout(() => {
            MpvPlayer.vectorToArray(page.bogs).forEach(bog => {
                MpvPlayer.vectorToArray(bog.buttons).forEach(button => {
                    console.log(button);
                    if (button.autoAction)
                        MpvPlayer.vectorToArray(button.commands)
                            .forEach(command => player.mpvPlayer?.executeCommand(command));
                    if (button.selected.start === 0xFFFF) return;
                    // console.log('drawing button', button.selected.start, button.x, button.y);
                    ctx.drawImage(pictures[button.selected.start], button.x, button.y);
                });
            });
        }, duration);
    }, [pictures, player?.bluray, player?.blurayTitle, player?.overlayRef, player?.currentPlaylist, player?.menuPageId, player?.mpvPlayer]);
    
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