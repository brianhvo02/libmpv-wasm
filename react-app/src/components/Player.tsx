import './Player.scss';
import { ListItemIcon, ListItemText, Menu, MenuItem, Popover, PopoverOrigin, Slider } from '@mui/material';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMessage, faMusic, faPause, faPlay, faVolumeHigh } from '@fortawesome/free-solid-svg-icons';
import { formatTime, isAudioTrack, isVideoTrack } from '../utils';
import { Check } from '@mui/icons-material';
import libmpvLoader from '../libmpv.js';
import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MainModule } from '../types/interface';
import _ from 'lodash';

const LIMIT = 2 * 1000 * 1000 * 1000; // 2 GB

const anchorOrigin: PopoverOrigin = {
    vertical: 'top',
    horizontal: 'center'
}

const transformOrigin: PopoverOrigin = {
    vertical: 'bottom',
    horizontal: 'center'
}

const Player = () => {
    const [libmpv, setLibmpv] = useState<MainModule>();
    const [files, setFiles] = useState<string[]>([]);
    const [selectedFilename, setSelectedFilename] = useState('');
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const divRef = useRef<HTMLDivElement>(null);
    const workerRef = useRef<Worker>();
    const ranOnce = useRef(false);

    const isSeeking = useRef(false);
    const [elapsed, setElapsed] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [volumeMenu, setVolumeMenu] = useState(false);
    const [audioMenu, setAudioMenu] = useState(false);
    const [subsMenu, setSubsMenu] = useState(false);
    const [volume, setVolume] = useState(1);
    const volumeRef = useRef<SVGSVGElement>(null);
    const audioMenuRef = useRef<SVGSVGElement>(null);
    const subsMenuRef = useRef<SVGSVGElement>(null);
    
    const [title, setTitle] = useState('');

    const [videoStream, setVideoStream] = useState(1);
    const [videoTracks, setVideoTracks] = useState<VideoTrack[]>([]);

    const [audioStream, setAudioStream] = useState(1);
    const [audioTracks, setAudioTracks] = useState<AudioTrack[]>();

    const [subtitleStream, setSubtitleStream] = useState(1);
    const [subtitleTracks, setSubtitleTracks] = useState<Track[]>();

    const [extSubStream, setExtSubStream] = useState('');

    const [mouseIsMoving, setMouseIsMoving] = useState(false);
    const mouseTimeout = useRef<NodeJS.Timeout>();

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
        if (!canvasRef.current || ranOnce.current) return;

        libmpvLoader({
            canvas: canvasRef.current,
            mainScriptUrlOrBlob: '/static/js/libmpv.js',
        }).then(setLibmpv);

        navigator.storage.getDirectory()
            .then(opfsRoot => opfsRoot.getDirectoryHandle('mnt', { create: true }))
            .then(dirHandle => Array.fromAsync(dirHandle.keys()))
            .then(setFiles);

        // const onFullscreenChange = () => setIsFullscreen(prev => !prev);
        // document.addEventListener('fullscreenchange', onFullscreenChange);

        ranOnce.current = true;
    }, []);

    useEffect(() => {
        if (!libmpv || workerRef.current) return;

        const pthreads = libmpv.PThread.unusedWorkers.concat(libmpv.PThread.runningWorkers);
        const fsWorker = pthreads.find((worker: any) => worker.workerID === pthreads.length - 1);
        const mpvWorker = pthreads.find((worker: any) => worker.workerID === pthreads.length);

        const listener = (e: MessageEvent) => {
            const payload = JSON.parse(e.data);
            switch (payload.type) {
                case 'upload':
                    libmpv.loadFile(payload.name);
                    setTitle(payload.name);
                    break;
                case 'playback-restart':
                    console.log('event: playback-restart');
                    setIsPlaying(true);
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
                            setVideoStream(payload.value);
                            break;
                        case 'aid':
                            setAudioStream(payload.value);
                            break;
                        case 'sid':
                            setSubtitleStream(payload.value);
                            break;
                        default:
                            console.log(`event: property-change -> { name: ${
                                payload.name
                            }, value: ${payload.value} }`);
                    }
                    break;
                case 'track-list':
                    const tracks: Track[] = payload.tracks
                        .map((track: any) => _.mapKeys(track, (v, k) => _.camelCase(k)));
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
        }

        fsWorker.addEventListener('message', listener);
        mpvWorker.addEventListener('message', listener);

        workerRef.current = fsWorker;
    }, [libmpv]);

    useEffect(() => {
        if (!libmpv || !selectedFilename.length) return;

        libmpv.loadFile('/share/mnt/' + selectedFilename);
        setTitle(selectedFilename);
    }, [libmpv, selectedFilename]);

    const handleUpload = async () => {
        if (!workerRef.current) return;

        const files = await showOpenFilePicker()
            .catch(e => console.error(e));

        if (!files?.length)
            return;

        const file = await files[0].getFile();
        if (file.size > LIMIT) {
            const splitFiles = [];
            const count = Math.ceil(file.size / LIMIT);

            for (let i = 0; i < count; i++) {
                const blobSlice = file.slice(LIMIT * i, (i + 1 === count) ? file.size : LIMIT * (i + 1));
                splitFiles.push(new File([blobSlice], file.name));
            }

            workerRef.current.postMessage(splitFiles);
        } else {
            workerRef.current.postMessage([file]);
        }
    }
                        
    return (
        <div className='player' ref={divRef}
            // onDoubleClick={toggleFullscreen}
        >
            <canvas id='canvas' ref={canvasRef} />
            <div className="canvas-blocker"></div>
            { libmpv && 
            <div className='other-controls'>
                <button onClick={handleUpload}>Upload</button>
                <select value={selectedFilename}
                    onChange={e => setSelectedFilename(e.target.value)}>
                    <option value=''></option>
                    { files.sort().map(filename =>
                        <option key={filename} value={filename}>{filename}</option>
                    ) }
                </select>
            </div> }
            { libmpv &&
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
                            container={divRef.current}
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
                                    container={divRef.current}
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
                                            {track.title} ({track.lang})
                                        </ListItemText>
                                    </MenuItem>
                                    ))}
                                </Menu>
                            </>
                        }
                        { subtitleTracks && subtitleTracks.length > 1 && <>
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
                            container={divRef.current}
                        >
                            <MenuItem onClick={() => libmpv.setSubtitleTrack(0)}>
                                {
                                    !(subtitleStream + extSubStream.length) &&
                                    <ListItemIcon>
                                        <Check />
                                    </ListItemIcon>
                                }
                                <ListItemText inset={subtitleStream + extSubStream.length > 0}>
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
                                            {track.title} ({track.lang})
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