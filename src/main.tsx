import { createRoot } from 'react-dom/client';
import { App } from './App';
import { SessionProvider } from './auth/session';
import './styles.css';

// No StrictMode: its double-mount would run the session seed twice.
const container = document.getElementById('root');
if (container === null) throw new Error('#root is missing from index.html');

createRoot(container).render(
  <SessionProvider>
    <App />
  </SessionProvider>,
);
