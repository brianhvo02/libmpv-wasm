import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import './Header.scss';
import { useContext, useEffect, useRef, useState } from 'react';
import { faChevronDown } from '@fortawesome/free-solid-svg-icons';
import { Button, CircularProgress, Modal, Paper, Popover, PopoverOrigin, SxProps, TextField, Theme } from '@mui/material';
import { PlayerContext } from '../MpvPlayerHooks';

const anchorOrigin: PopoverOrigin = {
    vertical: 'bottom',
    horizontal: 'left'
}

const transformOrigin: PopoverOrigin = {
    vertical: 'top',
    horizontal: 'left'
}

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

const Header = () => {
    const player = useContext(PlayerContext);
    const [libraryMenu, setLibraryMenu] = useState(false);
    const [openUrlMenu, setOpenUrlMenu] = useState(false);
    const [url, setUrl] = useState('');
    const [error, setError] = useState<string | null>(null);

    const headerRef = useRef<HTMLElement>(null);
    const libraryRef = useRef<HTMLDivElement>(null);
    const openUrlRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!openUrlMenu)
            setUrl('');
    }, [openUrlMenu]);

    const handleUrlLoadClick = () => {
        if (!player?.mpvPlayer) return;
        player.mpvPlayer.module.loadFile(url);
        setOpenUrlMenu(false);
        player.setTitle(url);
    }

    return (
        <header ref={headerRef}>
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
            <Modal open={player.uploading}>
                <Paper sx={paperStyle}>
                    <CircularProgress />
                    <h2>Uploading files...</h2>
                </Paper>
            </Modal>
            <label className='navbar' onClick={() => 
                typeof showOpenFilePicker !== 'undefined' &&
                player.mpvPlayer?.uploadFiles()
            }>
                <span>Upload</span>
                { typeof showOpenFilePicker === 'undefined' &&
                <input type='file' onChange={e => player.mpvPlayer?.uploadFiles(Array.from(e.target.files ?? []))} />}
            </label>
            <div className='navbar' ref={openUrlRef} style={
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
            </Popover>
            <div className='navbar' ref={libraryRef} style={
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
                        player.mpvPlayer.module.loadFile('/opfs/mnt/' + file);
                        setLibraryMenu(false);
                        player.setTitle(file);
                    }}>
                        {file}
                    </li>
                    ) }
                </ul>
            </Popover>
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