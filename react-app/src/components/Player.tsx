import './Player.scss';
import { ListItemIcon, ListItemText, Menu, MenuItem, Popover, PopoverOrigin, Slider } from '@mui/material';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMessage, faMusic, faPause, faPlay, faVideo, faVolumeHigh } from '@fortawesome/free-solid-svg-icons';
import { formatTime, isAudioTrack, isVideoTrack } from '../utils';
import { Check } from '@mui/icons-material';
import { CSSProperties, Dispatch, RefObject, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import _ from 'lodash';

const anchorOrigin: PopoverOrigin = {
    vertical: 'top',
    horizontal: 'center'
}

const transformOrigin: PopoverOrigin = {
    vertical: 'bottom',
    horizontal: 'center'
}

interface PlayerProps {
    libmpv?: any;
    title: string;
    canvasRef: RefObject<HTMLCanvasElement>;
    playerRef: RefObject<HTMLDivElement>;
    setIdle: Dispatch<SetStateAction<boolean>>
}

const Player = ({ libmpv, title, canvasRef, playerRef, setIdle }: PlayerProps) => {
    const [mouseIsMoving, setMouseIsMoving] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [volumeMenu, setVolumeMenu] = useState(false);
    const [videoMenu, setVideoMenu] = useState(false);
    const [audioMenu, setAudioMenu] = useState(false);
    const [subsMenu, setSubsMenu] = useState(false);
    const [volume, setVolume] = useState(1);

    const [videoStream, setVideoStream] = useState(1n);
    const [videoTracks, setVideoTracks] = useState<VideoTrack[]>([]);

    const [audioStream, setAudioStream] = useState(1n);
    const [audioTracks, setAudioTracks] = useState<AudioTrack[]>();

    const [subtitleStream, setSubtitleStream] = useState(1n);
    const [subtitleTracks, setSubtitleTracks] = useState<Track[]>();

    // const [extSubStream, setExtSubStream] = useState('');

    const volumeRef = useRef<SVGSVGElement>(null);
    const videoMenuRef = useRef<SVGSVGElement>(null);
    const audioMenuRef = useRef<SVGSVGElement>(null);
    const subsMenuRef = useRef<SVGSVGElement>(null);
    const isSeeking = useRef(false);
    const mouseTimeout = useRef<NodeJS.Timeout>();
    const workerRef = useRef<Worker>();

    // const [isFullscreen, setIsFullscreen] = useState(false);
    // const toggleFullscreen = useCallback(() => isFullscreen
    //     ? document.exitFullscreen()
    //     : divRef.current?.requestFullscreen(), 
    // [isFullscreen]);

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

    useEffect(() => {
        if (!libmpv || workerRef.current) return;

        const worker = libmpv.PThread.unusedWorkers.concat(libmpv.PThread.runningWorkers)[0];

        const listener = (e: MessageEvent) => {
            try {
                const payload = JSON.parse(e.data);
                switch (payload.type) {
                    case 'idle':
                        setIdle(true);
                        break;
                    case 'property-change':
                        switch (payload.name) {
                            case 'pause':
                                setIsPlaying(!payload.value);
                                break;
                            case 'duration':
                                setDuration(payload.value);
                                break;
                            case 'playback-time':
                                if (!isSeeking.current)
                                    setElapsed(payload.value);
                                break;
                            case 'vid':
                                setVideoStream(BigInt(payload.value));
                                break;
                            case 'aid':
                                setAudioStream(BigInt(payload.value));
                                break;
                            case 'sid':
                                setSubtitleStream(BigInt(payload.value));
                                break;
                            default:
                                console.log(`event: property-change -> { name: ${
                                    payload.name
                                }, value: ${payload.value} }`);
                        }
                        break;
                    case 'track-list':
                        const bigIntKeys = [
                            'id', 'srcId', 'mainSelection', 'ffIndex', 
                            'demuxW', 'demuxH', 'demuxChannelCount', 'demuxSamplerate'
                        ];
                        
                        const tracks: Track[] = payload.tracks
                            .map((track: any) => _.mapKeys(track, (v, k) => _.camelCase(k)))
                            .map((track: any) => _.mapValues(track, (v, k) => bigIntKeys.includes(k) ? BigInt(v) : v ));
                            
                        const { videoTracks, audioTracks, subtitleTracks } = tracks.reduce(
                            (map: { 
                                videoTracks: VideoTrack[], 
                                audioTracks: AudioTrack[], 
                                subtitleTracks: Track[]
                            }, track) => {
                                if (isVideoTrack(track))
                                    map.videoTracks.push(track);
                                else if (isAudioTrack(track))
                                    map.audioTracks.push(track);
                                else
                                    map.subtitleTracks.push(track);

                                return map;
                            }, {
                                videoTracks: [], 
                                audioTracks: [], 
                                subtitleTracks: []
                            }
                        );
                        setVideoTracks(videoTracks);
                        setAudioTracks(audioTracks);
                        setSubtitleTracks(subtitleTracks);
                        break;
                    default:
                        console.log('Recieved payload:', payload);
                }
            } catch (err) {
                // console.error(err);
                // console.log(e.data);
            }
        }

        worker.addEventListener('message', listener);

        workerRef.current = worker;
    }, [libmpv, setIdle]);
                        
    return (
        <div className='player' ref={playerRef}
            // onDoubleClick={toggleFullscreen}
        >
            <canvas id='canvas' ref={canvasRef} />
            <div className="canvas-blocker" onClick={() => title.length && libmpv?.togglePlay()} />
            { libmpv && title.length &&
            <div className='player-controls' style={{ opacity: Number(mouseIsMoving) }}>
                <div className='progress'>
                    <span>{formatTime(elapsed)}</span>
                    <Slider
                        sx={{
                            color: '#ff5957',
                            margin: '0 1rem'
                        }}
                        value={elapsed}
                        max={duration} 
                        onChange={(_, val) => {
                            if (typeof val !== 'number')
                                return;

                            isSeeking.current = true;
                            setElapsed(val);
                        }}
                        onChangeCommitted={(_, val) => {
                            if (typeof val !== 'number')
                                return;

                            isSeeking.current = false;
                            libmpv.setPlaybackTime(val);
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
                            onClick={() => libmpv.togglePlay()}
                            style={pointerStyle}
                        />
                    </div>
                    <div className='media-info'>{title}</div>
                    <div className='adjustable'>
                        <FontAwesomeIcon 
                            icon={faVolumeHigh}
                            ref={volumeRef}
                            onClick={() => setVolumeMenu(true)}
                            color={volumeMenu ? '#ff5957' : 'white'}
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
                                    libmpv.setVolume(val * 100);
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
                                    color={videoMenu ? '#ff5957' : 'white'}
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
                                        onClick={() => libmpv.setVideoTrack(track.id)}>
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
                                    color={audioMenu ? '#ff5957' : 'white'}
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
                                        onClick={() => libmpv.setAudioTrack(track.id)}>
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
                            color={subsMenu ? '#ff5957' : 'white'}
                        />
                        <Menu
                            anchorEl={subsMenuRef.current}
                            anchorOrigin={anchorOrigin}
                            transformOrigin={transformOrigin}
                            open={subsMenu}
                            onClose={() => setSubsMenu(false)}
                            container={playerRef.current}
                        >
                            <MenuItem onClick={() => libmpv.setSubtitleTrack(0)}>
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
                                        onClick={() => libmpv.setSubtitleTrack(track.id)}>
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
            }
        </div>
    );
}

export default Player;