import { Dispatch, SetStateAction, useContext, useEffect, useState } from 'react';
import './FileExplorer.scss';
import { Avatar, Box, Button, CircularProgress, IconButton, List, ListItem, ListItemAvatar, ListItemButton, ListItemText, Modal, Paper, SxProps, Theme } from '@mui/material';
import { Folder, Delete, FilePresent } from '@mui/icons-material';
import { PlayerContext } from '../MpvPlayerHooks';

const boxStyle: SxProps<Theme> = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',

    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',

    gap: '1rem',
    padding: '1.5rem',

    width: '40%',
    height: '65%',

    outline: 'none'
}

const paperStyle: SxProps<Theme> = {
    ...boxStyle,
    alignItems: 'auto',
    justifyContent: 'auto',
    color: '#dadada',
    backgroundColor: '#141519', 
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
    const [path, setPath] = useState('/');
    const [rootTree, setRootTree] = useState<Record<string, FileSystemDirectoryHandle>>({});
    const [tree, setTree] = useState<FileTree>({});
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        player?.mpvPlayer?.getDirectories().then(directories => {
            const tree = Object.fromEntries(directories.map(handle => [handle.name, handle]));
            setRootTree(tree);
        });
    }, [player?.mpvPlayer]);

    useEffect(() => {
        if (!Object.keys(rootTree).length)
            return;
        
        if (!history.length) {
            setPath('/');
            return setTree(rootTree);
        }

        const parent = history[history.length - 1];
        setPath('/' + history.map(handle => handle.name).join('/'));
        
        Promise.all([
            Array.fromAsync(parent.keys()),
            Array.fromAsync(parent.values()),
        ]).then(async ([names, handles]) => {
            const newTree: FileTree = {};
            await Promise.all(names.map(async (name, i) => { newTree[name] = handles[i]; }));
            setTree(newTree);
        });
    }, [history, rootTree]);

    const handleBackClick = async () => {
        if (!history.length) return;

        setHistory(prev => prev.slice(0, -1));
    }

    return (
        <Modal open={openFileExplorer} onClose={() => setOpenFileExplorer(false)}>
            <Paper sx={paperStyle} className='file-explorer'>
                <Modal open={loading}>
                    <Box sx={boxStyle}>
                        <CircularProgress />
                    </Box>
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
                    { Object.entries(tree).sort(([name1, handle1], [name2, handle2]) => 
                        handle1.kind === handle2.kind
                            ? name1.localeCompare(name2)
                            : handle1.kind === 'directory' 
                                ? -1 : 1
                    ).map(([name, handle]) => (
                        <ListItem
                            key={name}
                            secondaryAction={ !history.length &&
                                <IconButton edge='end' aria-label='delete' onClick={async e => {
                                    e.stopPropagation();
                                    await player?.mpvPlayer?.module.ExternalFS.removeHandle(name);
                                    const newTree = { ...rootTree };
                                    delete newTree[name];
                                    setRootTree(newTree);
                                }} >
                                    <Delete />
                                </IconButton>
                            }
                        >
                            <ListItemButton onClick={async () => {
                                if (handle.kind === 'file')
                                    return onFileClick(`${path}/${handle.name}`);

                                if (await player?.mpvPlayer?.module.ExternalFS.permitHandle(handle))
                                    setHistory(prev => [...prev, handle]);
                            }}>
                                <ListItemAvatar>
                                    <Avatar>
                                        { handle.kind === 'directory' ?
                                            <Folder /> :
                                            <FilePresent /> }
                                    </Avatar>
                                </ListItemAvatar>
                                <ListItemText primary={name} />
                            </ListItemButton>
                        </ListItem>
                    )) }
                </List>
                <div className='footer'>
                    <Button onClick={() => player?.mpvPlayer?.mountFolder()
                        .then(res => setRootTree(prev => ({ ...prev, ...res })))
                    } variant='contained'>Mount Folder</Button>
                    <Button onClick={() => {
                        setLoading(true);
                        player?.mpvPlayer?.loadBluray(path)
                            .then(() => {
                                setLoading(false);
                                setOpenFileExplorer(false);
                            });
                    }} variant='contained'>
                        Open as Disc
                    </Button>
                </div>
            </Paper>
        </Modal>
    );
}

export default FileExplorer;