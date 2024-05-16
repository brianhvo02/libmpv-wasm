import './Home.scss';
import { Link } from 'react-router-dom';
import { useState } from 'react';

const Home = () => {
    const [skipFirstPlay, setSkipFirstPlay] = useState(false); 
    
    return (
        <ul>
            <li>
                <label>Skip First Play
                    <input type='checkbox' checked={skipFirstPlay} onChange={e => setSkipFirstPlay(e.target.checked)} />
                </label>
            </li>
            {/* {
                data?.map(discId => (
                    <li key={discId}>
                        <Link to={`/player/${discId}${skipFirstPlay ? '?skipFirstPlay=true' : ''}`}>{discId}</Link>
                    </li>
                ))
            } */}
        </ul>
    );
}

export default Home;