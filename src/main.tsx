import {createRoot} from 'react-dom/client';
import {App} from './ui/App.tsx';
import {installRandomUUID} from './platform/browserCompat.ts';
import './ui/style.css';
import './ui/commander-hud.css';
installRandomUUID();
createRoot(document.getElementById('root')!).render(<App/>);
