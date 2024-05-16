import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import './Header.scss';
import { Dispatch, RefObject, SetStateAction, useEffect, useRef, useState } from 'react';
import { faChevronDown } from '@fortawesome/free-solid-svg-icons';
import { MainModule } from '../types/interface';
import { CircularProgress, Modal, Paper, Popover, PopoverOrigin, SxProps, Theme } from '@mui/material';
import { showOpenFilePicker } from 'native-file-system-adapter';

const anchorOrigin: PopoverOrigin = {
    vertical: 'bottom',
    horizontal: 'left'
}

const transformOrigin: PopoverOrigin = {
    vertical: 'top',
    horizontal: 'left'
}

interface HeaderProps {
    libmpv?: MainModule;
    setTitle: Dispatch<SetStateAction<string>>
    playerRef: RefObject<HTMLDivElement>;
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

const Header = ({ libmpv, setTitle, playerRef }: HeaderProps) => {
    const [files, setFiles] = useState<string[]>([]);
    const [updateFiles, setUpdateFiles] = useState(0);
    const [libraryMenu, setLibraryMenu] = useState(false);
    const [uploading, setUploading] = useState(false);

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
        if (!libmpv || workerRef.current) return;

        const pthreads = libmpv.PThread.unusedWorkers.concat(libmpv.PThread.runningWorkers);
        const worker = pthreads.find((worker: any) => worker.workerID === pthreads.length - 1);

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
    }, [libmpv, setTitle]);

    const handleUpload = async () => {
        if (!workerRef.current) return;

        const files = await showOpenFilePicker()
            .then(files => Promise.all(files.map(file => file.getFile())))
            .catch(e => console.error(e));

        if (!files?.length)
            return;

        workerRef.current.postMessage(files);
        setUploading(true);
    }

    return (
        <header ref={headerRef}>
            <Modal open={uploading}>
                <Paper sx={paperStyle}>
                    <CircularProgress />
                    <h2 >Uploading files...</h2>
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