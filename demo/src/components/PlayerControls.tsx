import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Player } from '../MpvPlayerHooks';
import { ListItemIcon, ListItemText, Menu, MenuItem, Popover, PopoverOrigin, Slider } from '@mui/material';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMessage, faMusic, faPause, faPlay, faVideo, faVolumeHigh } from '@fortawesome/free-solid-svg-icons';
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

const PlayerControls = ({ player }: { player: Player }) => {
    const {
        mpvPlayer, playerRef, setVolume, setElapsed,
        title, elapsed, duration, isPlaying, volume,
        videoStream, videoTracks,
        audioStream, audioTracks,
        subtitleStream, subtitleTracks,
    } = player;

    const volumeRef = useRef<SVGSVGElement>(null);
    const videoMenuRef = useRef<SVGSVGElement>(null);
    const audioMenuRef = useRef<SVGSVGElement>(null);
    const subsMenuRef = useRef<SVGSVGElement>(null);
    const mouseTimeout = useRef<NodeJS.Timeout>();

    const [volumeMenu, setVolumeMenu] = useState(false);
    const [videoMenu, setVideoMenu] = useState(false);
    const [audioMenu, setAudioMenu] = useState(false);
    const [subsMenu, setSubsMenu] = useState(false);
    const [mouseIsMoving, setMouseIsMoving] = useState(false);

    const onMouseMove = useCallback(() => {
        if (mouseTimeout.current)
            clearTimeout(mouseTimeout.current);

        setMouseIsMoving(true);

        mouseTimeout.current = setTimeout(() => {
            setMouseIsMoving(false);
        }, 2000);
    }, []);

    useEffect(() => {
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('click', onMouseMove);

        return () => {
            document.removeEventListener('mousemove', onMouseMove);
        }
    }, [onMouseMove]);

    const pointerStyle: CSSProperties = useMemo(() => {
        return { pointerEvents: mouseIsMoving ? 'auto' : 'none' };
    }, [mouseIsMoving]);

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
                    // marks={marks && marks.length > 1 ? marks : false}
                    disabled={!mouseIsMoving}
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
                                <MenuItem key={`video_${track.id}`} 
                                    onClick={() => mpvPlayer.module.setVideoTrack(track.id)}>
                                    {
                                        videoStream === track.id &&
                                        <ListItemIcon>
                                            <Check />
                                        </ListItemIcon>
                                    }
                                    <ListItemText inset={videoStream !== track.id}>
                                        {track.title ?? 'Video Track ' + track.id}
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
                                <MenuItem key={`audio_${track.id}`} 
                                    onClick={() => mpvPlayer.module.setAudioTrack(track.id)}>
                                    {
                                        audioStream === track.id &&
                                        <ListItemIcon>
                                            <Check />
                                        </ListItemIcon>
                                    }
                                    <ListItemText inset={audioStream !== track.id}>
                                        {track.title ?? 'Audio Track ' + track.id} ({track.lang ?? 'und'})
                                    </ListItemText>
                                </MenuItem>
                                ))}
                            </Menu>
                        </>
                    }
                    { subtitleTracks && subtitleTracks.length > 0 && <>
                    <FontAwesomeIcon 
                        icon={faMessage} 
                        ref={subsMenuRef}
                        onClick={() => setSubsMenu(true)}
                        style={pointerStyle}
                        color={subsMenu ? '#73467d' : 'white'}
                    />
                    <Menu
                        anchorEl={subsMenuRef.current}
                        anchorOrigin={anchorOrigin}
                        transformOrigin={transformOrigin}
                        open={subsMenu}
                        onClose={() => setSubsMenu(false)}
                        container={playerRef.current}
                    >
                        <MenuItem onClick={() => mpvPlayer.module.setSubtitleTrack(0)}>
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
                                <MenuItem key={`subs_${track.id}`} 
                                    onClick={() => mpvPlayer.module.setSubtitleTrack(track.id)}>
                                    {
                                        subtitleStream === track.id &&
                                        <ListItemIcon>
                                            <Check />
                                        </ListItemIcon>
                                    }
                                    <ListItemText inset={subtitleStream !== track.id}>
                                        {track.title ?? 'Subtitle Track ' + track.id} ({track.lang ?? 'und'})
                                    </ListItemText>
                                </MenuItem>
                            ))
                        }
                    </Menu>
                    </> }
                    {/* <FontAwesomeIcon
                        icon={faExpand}
                        onClick={() => toggleFullscreen()}
                        style={pointerStyle}
                    /> */}
                </div>
            </div>
        </div>
    );
}

export default PlayerControls;