import { Dispatch, SetStateAction, useContext, useEffect, useState } from 'react';
import './FileExplorer.scss';
import { Avatar, Button, CircularProgress, IconButton, List, ListItem, ListItemAvatar, ListItemButton, ListItemText, Modal, Paper, SxProps, TextField, Theme } from '@mui/material';
import { Folder, Delete, FilePresent } from '@mui/icons-material';
import { PlayerContext } from '../MpvPlayerHooks';

const paperStyle: SxProps<Theme> = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',

    display: 'flex',
    flexDirection: 'column',
    // alignItems: 'center',
    // justifyContent: 'center',

    gap: '1rem',
    padding: '1.5rem',

    width: '40%',
    height: '65%',

    color: '#dadada',
    backgroundColor: '#141519', 

    outline: 'none'
}

const newFolderStyle: SxProps<Theme> = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',

    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',

    gap: '1rem',

    width: '20rem',
    height: '25rem',

    color: '#dadada',
    backgroundColor: '#141519', 

    outline: 'none'
}

interface FileExplorerProps {
    onFileClick: (path: string) => void;
    openFileExplorer: boolean;
    setOpenFileExplorer: Dispatch<SetStateAction<boolean>>;
}

type FileTree = Record<string, FileSystemDirectoryHandle | FileSystemFileHandle>;

const FileExplorer = ({ onFileClick, openFileExplorer, setOpenFileExplorer }: FileExplorerProps) => {
    const player = useContext(PlayerContext);

    const [history, setHistory] = useState<FileSystemDirectoryHandle[]>([]);
    const [path, setPath] = useState('');
    const [opfs, setOpfs] = useState<FileSystemDirectoryHandle>();
    const [extfs, setExtfs] = useState<FileSystemDirectoryHandle>();
    const [tree, setTree] = useState<FileTree>({});
    const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
    const [showNewFolder, setShowNewFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [newFolderLoading, setNewFolderLoading] = useState(false);

    useEffect(() => {
        navigator.storage.getDirectory()
            .then(setOpfs);
    }, []);

    useEffect(() => {
        if (!opfs) return;

        if (!history.length) {
            const tree: FileTree = {};
            if (opfs) tree['opfs'] = opfs;
            if (extfs) tree['extfs'] = extfs;
            setPath('/');
            return setTree(tree);
        }

        const parent = history[history.length - 1];
        new Promise<void>(async resolve => {
            const segments = [];
            for (const handle of history) {
                if (await handle.isSameEntry(opfs)) 
                    segments.push('opfs');
                else if (extfs && await handle.isSameEntry(extfs)) 
                    segments.push('extfs');
                else segments.push(handle.name)
            }
            setPath('/' + segments.join('/'));
            resolve();
        })
        
        Promise.all([
            Array.fromAsync(parent.keys()),
            Array.fromAsync(parent.values()),
        ]).then(async ([names, handles]) => {
            const newTree: FileTree = {};
            const newThumbnails: Record<string, string> = {};

            await Promise.all(
                names.map(async (name, i) => {
                    const handle = handles[i];
                    if (handle.kind === 'directory' || name.slice(-4) !== '.png') {
                        newTree[name] = handle;
                        return;
                    }
                    
                    const file = await handle.getFile();
                    newThumbnails[name.slice(0, -4)] = URL.createObjectURL(file);
                })
            );
            
            setTree(newTree);
            setThumbnails(newThumbnails);
        });
}, [opfs, history, player?.uploading, newFolderLoading, extfs]);

    const handleNewFolderClick = async () => {
        if (!history.length) return;

        setNewFolderLoading(true);
        await history[history.length - 1].getDirectoryHandle(newFolderName, { create: true });
        setNewFolderLoading(false);
        setShowNewFolder(false);
    }

    const handleBackClick = async () => {
        if (!history.length) return;

        setHistory(prev => prev.slice(0, -1));
    }

    return (
        <Modal open={openFileExplorer} onClose={() => !newFolderLoading && !player?.uploading && setOpenFileExplorer(false)}>
            <Paper sx={paperStyle} className='file-explorer'>
                <Modal open={showNewFolder} onClose={() => !newFolderLoading && setShowNewFolder(false)}>
                    <Paper sx={newFolderStyle}>
                        <h2>Create new folder</h2>
                        { newFolderLoading ? <CircularProgress /> : <>
                        <TextField onChange={e => setNewFolderName(e.target.value)}
                            label='Name' placeholder='New folder' variant='outlined' />
                        <Button onClick={handleNewFolderClick}
                            variant='contained'>Create</Button>
                        </> }
                    </Paper>
                </Modal>
                <h2 className='header'>{path}</h2>
                <List className='files'>
                    { !!history.length &&
                    <ListItem>
                        <ListItemButton onClick={handleBackClick}>
                            <ListItemAvatar>
                                <Avatar>
                                    <Folder />
                                </Avatar>
                            </ListItemAvatar>
                            <ListItemText className='back-folder' primary='...' />
                        </ListItemButton>
                    </ListItem> }
                    { Object.entries(tree).sort(([name1, handle1], [name2, handle2]) => {
                        const basename1 = name1.slice(0, name1.lastIndexOf('.'));
                        const basename2 = name2.slice(0, name2.lastIndexOf('.'));

                        if (handle1.kind === handle2.kind && (
                            (thumbnails[basename1] && thumbnails[basename2]) ||
                            (!thumbnails[basename1] && !thumbnails[basename2])
                        )) return name1.localeCompare(name2);
                        return handle1.kind === 'directory' || !thumbnails[basename1] ? -1 : 1;
                    }).map(([name, handle]) => {
                        const basename = name.slice(0, name.lastIndexOf('.'));

                        return (
                            <ListItem
                                key={name}
                                secondaryAction={ path.includes('opfs') &&
                                <IconButton edge='end' aria-label='delete' onClick={async e => {
                                    e.stopPropagation();
                                    await history[history.length - 1].removeEntry(handle.name, { recursive: true });
                                    try {
                                        const thumbnail = handle.name.slice(
                                            0, handle.name.lastIndexOf('.')
                                        ) + '.png';
                                        await history[history.length - 1].getFileHandle(thumbnail);
                                        await history[history.length - 1].removeEntry(thumbnail);
                                    } catch (e) {
                                        console.log(handle.name, 'had no thumbnail');
                                    }
                                    const newTree = { ...tree };
                                    delete newTree[handle.name];
                                    setTree(newTree);
                                }} >
                                    <Delete />
                                </IconButton>
                                }
                            >
                                <ListItemButton onClick={() => handle.kind === 'directory'
                                    ? setHistory(prev => [...prev, handle])
                                    : onFileClick(`${path}/${handle.name}`)
                                }>
                                    { (handle.kind === 'file' && thumbnails[basename]) ?
                                    <img className='thumbnail' 
                                        src={thumbnails[basename]} alt={name + ' thumbnail'} /> :
                                    <ListItemAvatar>
                                        <Avatar>
                                            { handle.kind === 'directory' ?
                                                <Folder /> :
                                                <FilePresent /> }
                                        </Avatar>
                                    </ListItemAvatar> }
                                    <ListItemText primary={name} />
                                </ListItemButton>
                            </ListItem>
                        );
                    }) }
                </List>
                <div className='footer'>
                    <Button onClick={() => setShowNewFolder(true)} variant='contained'>New folder</Button>
                    <label>
                        <Button onClick={() => player?.mpvPlayer?.uploadFiles(path)} variant='contained'>Upload files</Button>
                        { typeof showOpenFilePicker === 'undefined' &&
                        <input type='file' multiple onChange={e => player?.mpvPlayer?.uploadFiles('/', Array.from(e.target.files ?? []))} />}
                    </label>
                    <Button onClick={async () => {
                        const isInExtfs = extfs && await history[0].isSameEntry(extfs);
                        const mountHandle = await player?.mpvPlayer?.mountFolder();
                        if (!mountHandle) return;
                        if (isInExtfs) setHistory([]);
                        player?.mpvPlayer?.module.stop();
                        setExtfs(mountHandle);
                    }} variant='contained'>Mount Folder</Button>
                </div>
            </Paper>
        </Modal>
    );
}

export default FileExplorer;