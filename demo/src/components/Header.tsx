import './Header.scss';
import { Dispatch, SetStateAction, useContext, useRef, useState } from 'react';
import { Button, CircularProgress, Modal, Paper, SxProps, Theme } from '@mui/material';
import { PlayerContext } from '../MpvPlayerHooks';
import FileExplorer from './FileExplorer';
// import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
// import { faChevronDown } from '@fortawesome/free-solid-svg-icons';

// const anchorOrigin: PopoverOrigin = {
//     vertical: 'bottom',
//     horizontal: 'left'
// }

// const transformOrigin: PopoverOrigin = {
//     vertical: 'top',
//     horizontal: 'left'
// }

const paperStyle: SxProps<Theme> = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',

    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',

    gap: '1rem',

    width: '15rem',
    height: '15rem',

    color: '#dadada',
    backgroundColor: '#141519', 

    outline: 'none'
}

interface HeaderProps {
    openHeader: boolean;
    setHideHeader: Dispatch<SetStateAction<boolean>>;
}

const Header = ({ openHeader, setHideHeader }: HeaderProps) => {
    const player = useContext(PlayerContext);
    // const [libraryMenu, setLibraryMenu] = useState(false);
    // const [openUrlMenu, setOpenUrlMenu] = useState(false);
    const [openFileExplorer, setOpenFileExplorer] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // const libraryRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLElement>(null);

    // OpenSSL capabilities
    // const [url, setUrl] = useState('');
    // const openUrlRef = useRef<HTMLDivElement>(null);

    // useEffect(() => {
    //     if (!openUrlMenu)
    //         setUrl('');
    // }, [openUrlMenu]);

    // const handleUrlLoadClick = () => {
    //     if (!player?.mpvPlayer) return;
    //     player.mpvPlayer.module.loadUrl(url);
    //     setOpenUrlMenu(false);
    //     player.setTitle(url);
    // }

    return (
        <header ref={headerRef} style={openHeader ? { top: 0 } : {}}>
            <div className='logo'>
                <img src='/logo192.png' alt='mpv logo' />
                <h1>mpv</h1>
            </div>
            { player?.mpvPlayer && <>
            <Modal open={!!error}>
                <Paper sx={paperStyle}>
                    <h2>Error!</h2>
                    <p>{error}</p>
                    <Button onClick={() => setError(null)}>Close</Button>
                </Paper>
            </Modal>
            <Modal open={!!player.uploading}>
                <Paper sx={paperStyle}>
                    <CircularProgress />
                    <h2>Uploading {player.uploading}</h2>
                </Paper>
            </Modal>
            <FileExplorer onFileClick={pathPromise => 
                pathPromise.then(path => {
                    if (!path.length) return;
                    player.mpvPlayer?.loadFile(path);
                    player.setTitle(path);
                    setHideHeader(true);
                    if (!player.isPlaying)
                        player.mpvPlayer?.module.togglePlay();
                    setOpenFileExplorer(false);
                })
            } openFileExplorer={openFileExplorer} setOpenFileExplorer={setOpenFileExplorer} />
            <div className='navbar' onClick={() => setOpenFileExplorer(true)}>
                <span>Open</span>
            </div>
            {/* OpenSSL capabilities */}
            {/* <div className='navbar' ref={openUrlRef} style={
                openUrlMenu ? { backgroundColor: '#141519' } : {}
            } onClick={() => {
                setOpenUrlMenu(prev => !prev);
                if (libraryMenu)
                    setLibraryMenu(false);
            }}>
                <span>Open URL</span>
                <FontAwesomeIcon icon={faChevronDown} />
            </div>
            <Popover
                open={openUrlMenu}
                anchorEl={openUrlRef.current}
                onClose={() => setOpenUrlMenu(false)}
                anchorOrigin={anchorOrigin}
                transformOrigin={transformOrigin}
                sx={{ top: 0 }}
                slotProps={{ 
                    root: { 
                        sx: { top: '4rem' },
                        slotProps: { 
                            backdrop: { 
                                invisible: false,
                                sx: { top: '4rem' }
                            }
                        } 
                    },
                    paper: { 
                        className: 'library-paper',
                        sx: { 
                            backgroundColor: '#141519', padding: '1rem',
                            display: 'flex', gap: '1rem', 
                        }
                    }
                }}
                container={player?.playerRef.current}
            >
                <TextField onChange={e => setUrl(e.target.value)}
                    label="Enter URL" variant="outlined" />
                <Button onClick={handleUrlLoadClick}
                    variant="contained">Load</Button>
            </Popover> */}
            {/* <div className='navbar' ref={libraryRef} style={
                libraryMenu ? { backgroundColor: '#141519' } : {}
            } onClick={() => {
                setLibraryMenu(prev => !prev);
                if (openUrlMenu)
                    setOpenUrlMenu(false);
            }}>
                <span>Select from Library</span>
                <FontAwesomeIcon icon={faChevronDown} />
            </div>
            <Popover
                open={libraryMenu}
                anchorEl={libraryRef.current}
                onClose={() => setLibraryMenu(false)}
                anchorOrigin={anchorOrigin}
                transformOrigin={transformOrigin}
                sx={{ top: 0 }}
                slotProps={{ 
                    root: { 
                        sx: { top: '4rem' },
                        slotProps: { 
                            backdrop: { 
                                invisible: false,
                                sx: { top: '4rem' }
                            }
                        } 
                    },
                    paper: { 
                        className: 'library-paper',
                        sx: { backgroundColor: '#141519' }
                    }
                }}
                container={player?.playerRef.current}
            >
                <h2>Files</h2>
                <ul>
                    { player.files.map(file =>
                    <li key={file} onClick={() => {
                        if (!player?.mpvPlayer) return;
                        player.mpvPlayer.loadFile(file);
                        setLibraryMenu(false);
                        player.setTitle(file);
                    }}>
                        {file}
                    </li>
                    ) }
                </ul>
            </Popover> */}
            { player.shaderCount > 0 && <>
            <div className='navbar' onClick={() => player.mpvPlayer?.module.addShaders()}>
                <span>Add Shaders</span>
            </div>
            <div className='navbar' onClick={() => player.mpvPlayer?.module.clearShaders()}>
                <span>Clear Shaders</span>
            </div>
            </> }
            </> }
        </header>
    );
}

export default Header;