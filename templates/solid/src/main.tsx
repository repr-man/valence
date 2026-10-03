import { render } from '@solidjs/web';
import App from './App';
import './style.css';

const root = document.getElementById('root');
if (!root) throw new Error('The application root element is missing.');
render(() => <App />, root);
