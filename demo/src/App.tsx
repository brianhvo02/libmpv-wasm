import './App.scss';
import Player from './components/Player';
import Header from './components/Header';
import { PlayerContext, useMpvPlayer } from './MpvPlayerHooks';
import { useEffect, useRef, useState } from 'react';

const App = () => {
    const player = useMpvPlayer();
    const { mpvPlayer, setTitle, fileEnd } = player;
    const [openHeader, setOpenHeader] = useState(true);
    const [hideHeader, setHideHeader] = useState(false);
    const screenWidth = useRef(window.screen.width);
    const screenHeight = useRef(window.screen.height);
    const headerTimeout = useRef<number>();

    useEffect(() => {
        if (!mpvPlayer?.module) return;

        const onResize = () => {
            const { width, height } = window.screen;
            if (screenWidth.current === width && screenHeight.current === height)
                return;

            screenWidth.current = width;
            screenWidth.current = height;
            mpvPlayer.module.matchWindowScreenSize();
        }

        // @ts-ignore
        window.screen?.addEventListener('change', onResize);

        return () => {
            // @ts-ignore
            window.screen?.removeEventListener('resize', onResize);
        }
    }, [mpvPlayer]);

    useEffect(() => {
        if (!openHeader) return;
        setHideHeader(false);
    }, [openHeader]);

    useEffect(() => {
        if (hideHeader) {
            headerTimeout.current = window.setTimeout(() => {
                setOpenHeader(false);
            }, 2000);
        } else {
            clearTimeout(headerTimeout.current);
        }
    }, [hideHeader]);

    useEffect(() => {
        if (!fileEnd) return;
        setTitle('');
        setOpenHeader(true);
    }, [fileEnd, setTitle]);

    return (
        <div className="app">
            <PlayerContext.Provider value={player}>
                <Header openHeader={openHeader} setHideHeader={setHideHeader} />
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
