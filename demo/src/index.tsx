import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import './reset.scss';
import './index.scss';
import App from './App';
import { ThemeProvider, createTheme } from '@mui/material';

const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement
);

const theme = createTheme({
    palette: {
        mode: 'dark',
        primary: {
            main: '#73467d'
        },
        text: {
            primary: '#FFFFFF'
        }
    }
})

root.render(
    <StrictMode>
        <ThemeProvider theme={theme}>
            <App />
        </ThemeProvider>
    </StrictMode>
);