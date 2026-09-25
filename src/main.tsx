import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/newsreader/wght.css';
import '@fontsource-variable/newsreader/wght-italic.css';
import '@fontsource/hanken-grotesk/400.css';
import '@fontsource/hanken-grotesk/500.css';
import '@fontsource/hanken-grotesk/600.css';
import '@fontsource/hanken-grotesk/700.css';
import { App } from './app/App';
import { SessionProvider } from './auth/session';
import { ThemeProvider } from './components/theme/theme';
// Global sheets load after the CSS modules pulled in above, as they always
// have: tokens.css's base rules win ties with a module's class.
import './styles/tokens.css';
import './styles/global.css';
import './features/board/board.css';
import './auth/auth.css';

// No StrictMode: its double-mount would run the session seed twice.
const container = document.getElementById('root');
if (container === null) throw new Error('#root is missing from index.html');

createRoot(container).render(
  <ThemeProvider>
    <BrowserRouter>
      <SessionProvider>
        <App />
      </SessionProvider>
    </BrowserRouter>
  </ThemeProvider>,
);
