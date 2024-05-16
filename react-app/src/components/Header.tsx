import './Header.scss';
// import { useNavigate } from 'react-router-dom';
import { useRef } from 'react';

const Header = () => {
    // const navigate = useNavigate();
    const headerRef = useRef<HTMLElement>(null);

    return (
        <header ref={headerRef}>
            <div className='logo' 
                // onClick={() => navigate('/')}
            >
                <img src='/logo512.png' alt='nigiri logo' />
                <h1>nigiri</h1>
            </div>
        </header>
    );
}

export default Header;