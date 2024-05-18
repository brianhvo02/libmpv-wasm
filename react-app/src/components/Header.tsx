import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import './Header.scss';
import { Dispatch, RefObject, SetStateAction, useEffect, useRef, useState } from 'react';
import { faChevronDown } from '@fortawesome/free-solid-svg-icons';
import { Button, CircularProgress, Modal, Paper, Popover, PopoverOrigin, SxProps, Theme } from '@mui/material';
import { showOpenFilePicker } from 'native-file-system-adapter';

const LIMIT = 4 * 1024 * 1024 * 1024;

const anchorOrigin: PopoverOrigin = {
    vertical: 'bottom',
    horizontal: 'left'
}

const transformOrigin: PopoverOrigin = {
    vertical: 'top',
    horizontal: 'left'
}

interface HeaderProps {
    libmpv?: any;
    setTitle: Dispatch<SetStateAction<string>>
    playerRef: RefObject<HTMLDivElement>;
    idle: boolean;
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

const Header = ({ libmpv, setTitle, playerRef, idle }: HeaderProps) => {
    const [files, setFiles] = useState<string[]>([]);
    const [updateFiles, setUpdateFiles] = useState(0);
    const [libraryMenu, setLibraryMenu] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const headerRef = useRef<HTMLElement>(null);
    const libraryRef = useRef<HTMLDivElement>(null);
    const workerRef = useRef<Worker>();

    useEffect(() => {
        navigator.storage.getDirectory()
            .then(opfsRoot => opfsRoot.getDirectoryHandle('mnt', { create: true }))
            .then(dirHandle => Array.fromAsync(dirHandle.keys()))
            .then(setFiles);
    }, [updateFiles]);

    useEffect(() => {
        if (!libmpv || workerRef.current || !idle) return;
        
        const threadId = libmpv.getFsThread();
        const worker = (libmpv.PThread.pthreads as Record<number, Worker>)[threadId];

        const listener = (e: MessageEvent) => {
            const payload = JSON.parse(e.data);
            switch (payload.type) {
                case 'upload':
                    console.log('Upload finished');
                    setUpdateFiles(prev => prev + 1);
                    setUploading(false);
                    break;
                default:
                    console.log('Recieved payload:', payload);
            }
        }

        worker.addEventListener('message', listener);

        workerRef.current = worker;
    }, [libmpv, setTitle, idle]);

    const handleUpload = async () => {
        if (!workerRef.current) return;

        const files = await showOpenFilePicker()
            .then(files => Promise.all(files.map(file => file.getFile())))
            .catch(e => console.error(e));

        if (!files?.length)
            return;

        for (const file of files) {
            if (file.size < LIMIT)
                continue;

            return setError('File size exceeds 4GB file limit.');
        }

        workerRef.current.postMessage(files);
        setUploading(true);
    }

    return (
        <header ref={headerRef}>
            <Modal open={!!error}>
                <Paper sx={paperStyle}>
                    <h2>Error!</h2>
                    <p>{error}</p>
                    <Button onClick={() => setError(null)}>Close</Button>
                </Paper>
            </Modal>
            <Modal open={uploading}>
                <Paper sx={paperStyle}>
                    <CircularProgress />
                    <h2>Uploading files...</h2>
                </Paper>
            </Modal>
            <div className='logo'>
                <img src='/logo512.png' alt='nigiri logo' />
                <h1>nigiri</h1>
            </div>
            { libmpv && <>
            <div className='navbar' onClick={handleUpload}>
                <span>Upload</span>
            </div>
            <div className='navbar' onClick={() => libmpv.crc32Gen()}>
                <span>Debug</span>
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
                container={playerRef.current}
            >
                <h2>Files</h2>
                <ul>
                    { files.map(file =>
                    <li key={file} onClick={() => {
                        libmpv.loadFile('/share/mnt/' + file);
                        setLibraryMenu(false);
                        setTitle(file);
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