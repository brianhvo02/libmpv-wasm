import { Dispatch, SetStateAction, useContext, useEffect, useRef, useState } from 'react';
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

const resolvePath = async (ancestor?: FileSystemDirectoryHandle, descendant?: FileSystemDirectoryHandle | FileSystemFileHandle) => {
    if (!ancestor || !descendant) return '';
    const segments = await ancestor.resolve(descendant);
    if (!segments) return '';

    return '/' + segments.join('/');
}

interface FileExplorerProps {
    onFileClick: (path: Promise<string>) => void;
    openFileExplorer: boolean;
    setOpenFileExplorer: Dispatch<SetStateAction<boolean>>;
}

type FileTree = Record<string, FileSystemDirectoryHandle | FileSystemFileHandle>;

const FileExplorer = ({ onFileClick, openFileExplorer, setOpenFileExplorer }: FileExplorerProps) => {
    const player = useContext(PlayerContext);

    const rootDir = useRef<FileSystemDirectoryHandle>();
    const history = useRef<FileSystemDirectoryHandle[]>([]);
    const [parent, setParent] = useState<FileSystemDirectoryHandle>();
    const [path, setPath] = useState('');
    const [tree, setTree] = useState<FileTree>({});
    const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
    const [showNewFolder, setShowNewFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [newFolderLoading, setNewFolderLoading] = useState(false);

    const [isRootDir, setIsRootDir] = useState(true);

    useEffect(() => {
        navigator.storage.getDirectory()
            .then(root => {
                if (rootDir.current) return;
                rootDir.current = root;
                history.current.push(root);
                setParent(root);
            });
    }, []);

    useEffect(() => {
        if (!rootDir.current || !parent) return;

        history.current[history.current.length - 1].isSameEntry(parent)
            .then(isSame => !isSame && history.current.push(parent));

        rootDir.current.isSameEntry(parent)
            .then(setIsRootDir);

        rootDir.current.resolve(parent)
            .then(segments => segments && setPath('/' + segments.join('/')));
        
        Array.fromAsync(parent.entries())
            .then(async entries => {
                const newTree: FileTree = {};
                const newThumbnails: Record<string, string> = {};

                await Promise.all(
                    entries.map(async ([name, handle]) => {
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
    }, [parent, player?.uploading, newFolderLoading]);

    const handleNewFolderClick = async () => {
        if (!parent) return;

        setNewFolderLoading(true);
        await parent.getDirectoryHandle(newFolderName, { create: true });
        setNewFolderLoading(false);
        setShowNewFolder(false);
    }

    const handleBackClick = async () => {
        if (isRootDir) return;

        history.current.pop();
        setParent(history.current[history.current.length - 1]);
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
                    { !isRootDir &&
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
                        return handle1.kind === 'directory' || thumbnails[basename1] ? -1 : 1;
                    }).map(([name, handle]) => {
                        const basename = name.slice(0, name.lastIndexOf('.'));

                        return (
                            <ListItem
                                key={name}
                                secondaryAction={
                                <IconButton edge='end' aria-label='delete' onClick={async e => {
                                    e.stopPropagation();
                                    await parent?.removeEntry(handle.name, { recursive: true });
                                    const newTree = { ...tree };
                                    delete newTree[handle.name];
                                    setTree(newTree);
                                }} >
                                    <Delete />
                                </IconButton>
                                }
                            >
                                <ListItemButton onClick={() => handle.kind === 'directory'
                                    ? setParent(handle)
                                    : onFileClick(resolvePath(rootDir.current, handle))
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
                </div>
            </Paper>
        </Modal>
    );
}

export default FileExplorer;