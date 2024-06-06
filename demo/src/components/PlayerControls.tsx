import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Player } from '../MpvPlayerHooks';
import { ListItemIcon, ListItemText, Menu, MenuItem, Popover, PopoverOrigin, Slider } from '@mui/material';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBackwardStep, faBars, faBookmark, faCompass, faExpand, faForwardStep, faMessage, faMusic, faPause, faPlay, faVideo, faVolumeHigh } from '@fortawesome/free-solid-svg-icons';
import { formatTime } from '../utils';
import { Check } from '@mui/icons-material';

const anchorOrigin: PopoverOrigin = {
    vertical: 'top',
    horizontal: 'center'
}

const transformOrigin: PopoverOrigin = {
    vertical: 'bottom',
    horizontal: 'center'
}

interface PlayerControlsProps {
    player: Player;
}

const PlayerControls = ({ player }: PlayerControlsProps) => {
    const {
        mpvPlayer, playerRef, setVolume, setElapsed,
        title, elapsed, duration, isPlaying, volume,
        videoStream, videoTracks,
        audioStream, audioTracks,
        currentChapter, chapters,
        subtitleStream, subtitleTracks,
        menuCallAllow, hasPopupMenu,
    } = player;

    const volumeRef = useRef<SVGSVGElement>(null);
    const videoMenuRef = useRef<SVGSVGElement>(null);
    const audioMenuRef = useRef<SVGSVGElement>(null);
    const subtitleMenuRef = useRef<SVGSVGElement>(null);
    const chapterMenuRef = useRef<SVGSVGElement>(null);
    const mouseTimeout = useRef<number>();

    const [volumeMenu, setVolumeMenu] = useState(false);
    const [videoMenu, setVideoMenu] = useState(false);
    const [audioMenu, setAudioMenu] = useState(false);
    const [subtitleMenu, setSubtitleMenu] = useState(false);
    const [chapterMenu, setChapterMenu] = useState(false);
    const [mouseIsMoving, setMouseIsMoving] = useState(false);

    const toggleFullscreen = useCallback(() => document.fullscreenElement
        ? document.exitFullscreen()
        : document.body.requestFullscreen(), 
    []);
    
    const onMouseMove = useCallback(() => {
        if (mouseTimeout.current)
            clearTimeout(mouseTimeout.current);

        setMouseIsMoving(true);

        mouseTimeout.current = window.setTimeout(() => {
            setMouseIsMoving(false);
        }, 2000);
    }, []);

    useEffect(() => {
        const playerRef = player.playerRef.current;
        if (!playerRef) return;

        playerRef.addEventListener('mousemove', onMouseMove);

        return () => {
            playerRef.removeEventListener('mousemove', onMouseMove);
        }
    }, [onMouseMove, player]);

    const pointerStyle: CSSProperties = useMemo(() => {
        return { pointerEvents: mouseIsMoving ? 'auto' : 'none' };
    }, [mouseIsMoving]);

    const marks = useMemo(() => chapters?.filter(({ title }) => title
        .includes(`Clip ${(mpvPlayer?.playItemId ?? 0) + 1}`))
        .map(({ title, time }) => ({
            label: title.slice(0, title.indexOf(' (Clip')),
            value: time
        })), [chapters, mpvPlayer?.playItemId]);

    if (!mpvPlayer) return null;

    return (
        <div className='player-controls' style={{ opacity: Number(mouseIsMoving) }}>
            <div className='progress'>
                <span>{formatTime(elapsed)}</span>
                <Slider
                    sx={{
                        color: '#73467d',
                        margin: '0 1rem'
                    }}
                    value={elapsed}
                    max={duration} 
                    onChange={(_, val) => {
                        if (typeof val !== 'number')
                            return;

                        mpvPlayer.isSeeking = true;
                        setElapsed(val);
                    }}
                    onChangeCommitted={(_, val) => {
                        if (typeof val !== 'number')
                            return;

                        mpvPlayer.isSeeking = false;
                        mpvPlayer.module.setPlaybackTime(val);
                    }}
                    marks={marks && marks.length > 1 ? marks : false}
                    disabled={!mouseIsMoving || mpvPlayer.blurayTitle === 0}
                />
                <span>{formatTime(duration)}</span>
            </div>
            <div className='controls'>
                <div className='playback-controls'>
                    <FontAwesomeIcon 
                        icon={isPlaying ? faPause : faPlay} 
                        onClick={() => mpvPlayer.module.togglePlay()}
                        style={pointerStyle}
                    />
                    <FontAwesomeIcon 
                        icon={faBackwardStep} 
                        onClick={() => mpvPlayer.module.skipBackward()}
                        style={pointerStyle}
                    />
                    <FontAwesomeIcon 
                        icon={faForwardStep} 
                        onClick={() => mpvPlayer.module.skipForward()}
                        style={pointerStyle}
                    />
                    { menuCallAllow &&
                    <FontAwesomeIcon 
                        icon={faBars} 
                        onClick={() => mpvPlayer.openTopMenu()}
                        style={pointerStyle}
                    /> }
                    { hasPopupMenu &&
                    <FontAwesomeIcon 
                        icon={faCompass} 
                        onClick={() => mpvPlayer.menuPageId < 0
                            ? mpvPlayer.nextMenuCommand()
                            : mpvPlayer.resetMenu()
                        }
                        style={pointerStyle}
                    /> }
                </div>
                <div className='media-info'>{title}</div>
                <div className='adjustable'>
                    <FontAwesomeIcon 
                        icon={faVolumeHigh}
                        ref={volumeRef}
                        onClick={() => setVolumeMenu(true)}
                        color={volumeMenu ? '#73467d' : 'white'}
                    />
                    <Popover
                        className='volume-popover'
                        open={volumeMenu}
                        anchorEl={volumeRef.current}
                        onClose={() => setVolumeMenu(false)}
                        anchorOrigin={anchorOrigin}
                        transformOrigin={transformOrigin}
                        sx={{backgroundColor: 'transparent'}}
                        container={playerRef.current}
                    >
                        <Slider
                            className='volume-slider'
                            orientation='vertical'
                            step={0.01}
                            value={volume}
                            max={1} 
                            onChange={(_, val) => {
                                if (typeof val !== 'number') return;
                                setVolume(val);
                            }}
                            onChangeCommitted={(_, val) => {
                                if (typeof val !== 'number') return;
                                mpvPlayer.module.setVolume(val * 100);
                            }}
                            disabled={!mouseIsMoving}
                        />
                        <p>{Math.floor(volume * 100)}</p>
                    </Popover>
                    { chapters && chapters.length > 0 && <>
                    <FontAwesomeIcon 
                        icon={faBookmark} 
                        ref={chapterMenuRef}
                        onClick={() => setChapterMenu(true)}
                        style={pointerStyle}
                        color={chapterMenu ? '#73467d' : 'white'}
                    />
                    <Menu
                        anchorEl={chapterMenuRef.current}
                        anchorOrigin={anchorOrigin}
                        transformOrigin={transformOrigin}
                        open={chapterMenu}
                        onClose={() => setChapterMenu(false)}
                        container={playerRef.current}
                    >{ chapters.map((chapter, i) => (
                        <MenuItem key={`chapter_${i}`} 
                            onClick={() => {
                                if (player.bluray) {
                                    player.mpvPlayer?.executeCommand({
                                        insn: {
                                            opCnt: 2,
                                            grp: 0,
                                            subGrp: 2,
                                            immOp1: 1,
                                            immOp2: 1,
                                            branchOpt: 2,
                                            cmpOpt: 0,
                                            setOpt: 0
                                        },
                                        dst: player.playlistId,
                                        src: i
                                    }, true);
                                    return;
                                }
                                
                                mpvPlayer.module.setChapter(BigInt(i));
                            }}>
                            {
                                currentChapter === i &&
                                <ListItemIcon>
                                    <Check />
                                </ListItemIcon>
                            }
                            <ListItemText inset={currentChapter !== i}>
                                {chapter.title ?? 'Chapter ' + (i + 1)}
                            </ListItemText>
                        </MenuItem>
                    )) }</Menu>
                    </> }
                    {
                        videoTracks && videoTracks.length > 1 &&
                        <>
                            <FontAwesomeIcon 
                                icon={faVideo}
                                ref={videoMenuRef}
                                onClick={() => setVideoMenu(true)}
                                style={pointerStyle}
                                color={videoMenu ? '#73467d' : 'white'}
                            />
                            <Menu
                                anchorEl={videoMenuRef.current}
                                anchorOrigin={anchorOrigin}
                                transformOrigin={transformOrigin}
                                open={audioMenu}
                                onClose={() => setVideoMenu(false)}
                                container={playerRef.current}
                            >
                                {videoTracks.map((track) => (
                                <MenuItem key={`video_${Number(track.id)}`} 
                                    onClick={() => mpvPlayer.module.setVideoTrack(track.id)}>
                                    {
                                        videoStream === Number(track.id) &&
                                        <ListItemIcon>
                                            <Check />
                                        </ListItemIcon>
                                    }
                                    <ListItemText inset={videoStream !== Number(track.id)}>
                                        {track.title ?? 'Video Track ' + Number(track.id)}
                                    </ListItemText>
                                </MenuItem>
                                ))}
                            </Menu>
                        </>
                    }
                    {
                        audioTracks && audioTracks.length > 1 &&
                        <>
                            <FontAwesomeIcon 
                                icon={faMusic}
                                ref={audioMenuRef}
                                onClick={() => setAudioMenu(true)}
                                style={pointerStyle}
                                color={audioMenu ? '#73467d' : 'white'}
                            />
                            <Menu
                                anchorEl={audioMenuRef.current}
                                anchorOrigin={anchorOrigin}
                                transformOrigin={transformOrigin}
                                open={audioMenu}
                                onClose={() => setAudioMenu(false)}
                                container={playerRef.current}
                            >
                                {audioTracks.map((track) => (
                                <MenuItem key={`audio_${Number(track.id)}`} 
                                    onClick={() => mpvPlayer.module.setAudioTrack(track.id)}>
                                    {
                                        audioStream === Number(track.id) &&
                                        <ListItemIcon>
                                            <Check />
                                        </ListItemIcon>
                                    }
                                    <ListItemText inset={audioStream !== Number(track.id)}>
                                        {track.title ?? 'Audio Track ' + Number(track.id)} ({track.lang ?? 'und'})
                                    </ListItemText>
                                </MenuItem>
                                ))}
                            </Menu>
                        </>
                    }
                    { subtitleTracks && subtitleTracks.length > 0 && <>
                    <FontAwesomeIcon 
                        icon={faMessage} 
                        ref={subtitleMenuRef}
                        onClick={() => setSubtitleMenu(true)}
                        style={pointerStyle}
                        color={subtitleMenu ? '#73467d' : 'white'}
                    />
                    <Menu
                        anchorEl={subtitleMenuRef.current}
                        anchorOrigin={anchorOrigin}
                        transformOrigin={transformOrigin}
                        open={subtitleMenu}
                        onClose={() => setSubtitleMenu(false)}
                        container={playerRef.current}
                    >
                        <MenuItem onClick={() => mpvPlayer.module.setSubtitleTrack(0n)}>
                            {
                                !subtitleStream &&
                                <ListItemIcon>
                                    <Check />
                                </ListItemIcon>
                            }
                            <ListItemText inset={subtitleStream > 0}>
                                None
                            </ListItemText>
                        </MenuItem>
                        {
                            subtitleTracks.map(track => (
                                <MenuItem key={`subs_${Number(track.id)}`} 
                                    onClick={() => mpvPlayer.module.setSubtitleTrack(track.id)}>
                                    {
                                        subtitleStream === Number(track.id) &&
                                        <ListItemIcon>
                                            <Check />
                                        </ListItemIcon>
                                    }
                                    <ListItemText inset={subtitleStream !== Number(track.id)}>
                                        {track.title ?? 'Subtitle Track ' + Number(track.id)} ({track.lang ?? 'und'})
                                    </ListItemText>
                                </MenuItem>
                            ))
                        }
                    </Menu>
                    </> }
                    <FontAwesomeIcon
                        icon={faExpand}
                        onClick={() => toggleFullscreen()}
                        style={pointerStyle}
                    />
                </div>
            </div>
        </div>
    );
}

export default PlayerControls;