import './App.scss';
import Player from './components/Player';
import Header from './components/Header';
import { PlayerContext, useMpvPlayer } from './MpvPlayerHooks';
import { useEffect, useRef, useState } from 'react';

const App = () => {
    const player = useMpvPlayer();
    const [openHeader, setOpenHeader] = useState(true);
    const [hideHeader, setHideHeader] = useState(false);
    const headerTimeout = useRef<NodeJS.Timeout>();

    useEffect(() => {
        if (!openHeader) return;
        setHideHeader(false);
    }, [openHeader]);

    useEffect(() => {
        if (hideHeader) {
            headerTimeout.current = setTimeout(() => {
                setOpenHeader(false);
            }, 2000);
        } else {
            clearTimeout(headerTimeout.current);
        }
    }, [hideHeader]);

    return (
        <div className="app">
            <PlayerContext.Provider value={player}>
                <Header openHeader={openHeader} />
                <div className='header-detector' onMouseEnter={() => {
                    setOpenHeader(true);
                    setHideHeader(false);
                }} />
                <Player setHideHeader={setHideHeader} />
            </PlayerContext.Provider>
        </div>
    );
}
    

export default App;
