import './App.scss';
import Player from './components/Player';
import Header from './components/Header';
import { useEffect, useRef, useState } from 'react';
import libmpvLoader from './libmpv';

const App = () => {
    const [libmpv, setLibmpv] = useState<any>();
    const [title, setTitle] = useState('');
    const [idle, setIdle] = useState(false);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const playerRef = useRef<HTMLDivElement>(null);
    const ranOnce = useRef(false);

    useEffect(() => {
        if (!canvasRef.current || ranOnce.current) return;

        libmpvLoader({
            canvas: canvasRef.current,
            mainScriptUrlOrBlob: '/static/js/libmpv.js',
        }).then(setLibmpv);

        // const onFullscreenChange = () => setIsFullscreen(prev => !prev);
        // document.addEventListener('fullscreenchange', onFullscreenChange);

        ranOnce.current = true;
    }, []);

    return (
        <div className="app">
            <Header libmpv={libmpv} setTitle={setTitle} playerRef={playerRef} idle={idle} />
            <Player libmpv={libmpv} title={title} canvasRef={canvasRef} playerRef={playerRef} setIdle={setIdle} />
        </div>
    );
}
    

export default App;
