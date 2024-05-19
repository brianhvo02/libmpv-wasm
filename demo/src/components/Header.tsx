import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import './Header.scss';
import { useContext, useRef, useState } from 'react';
import { faChevronDown } from '@fortawesome/free-solid-svg-icons';
import { Button, CircularProgress, Modal, Paper, Popover, PopoverOrigin, SxProps, Theme } from '@mui/material';
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
    const [error, setError] = useState<string | null>(null);

    const headerRef = useRef<HTMLElement>(null);
    const libraryRef = useRef<HTMLDivElement>(null);

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
            <div className='navbar' onClick={() => player.mpvPlayer?.uploadFiles()}>
                <span>Upload</span>
            </div>
            <div className='navbar' ref={libraryRef} style={
                libraryMenu ? { backgroundColor: '#141519' } : {}
            } onClick={() => setLibraryMenu(prev => !prev)}>
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
                        player.mpvPlayer.module.loadFile(file);
                        setLibraryMenu(false);
                        player.setTitle(file);
                    }}>
                        {file}
                    </li>
                    ) }
                </ul>
            </Popover>
            </> }
        </header>
    );
}

export default Header;