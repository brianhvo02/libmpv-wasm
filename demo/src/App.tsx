import './App.scss';
import Player from './components/Player';
import Header from './components/Header';
import { PlayerContext, useMpvPlayer } from './MpvPlayerHooks';

const App = () => {
    const player = useMpvPlayer();

    return (
        <div className="app">
            <PlayerContext.Provider value={player}>
                <Header />
                <Player />
            </PlayerContext.Provider>
        </div>
    );
}
    

export default App;
