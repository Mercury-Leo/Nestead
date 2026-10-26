import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/newsreader/wght.css';
import '@fontsource-variable/newsreader/wght-italic.css';
import '@fontsource/hanken-grotesk/400.css';
import '@fontsource/hanken-grotesk/500.css';
import '@fontsource/hanken-grotesk/600.css';
import '@fontsource/hanken-grotesk/700.css';
import './styles/fonts.css';
import { App } from './app/App';
import { startOfflineCopy } from './app/offline';
import { UpdateWatcher } from './app/UpdateWatcher';
import { captureInvite } from './auth/invite';
import { SessionProvider } from './auth/session';
import { LocaleProvider, localeReady } from './i18n';
import { ThemeProvider } from './components/theme/theme';
// Global sheets load after the CSS modules pulled in above, as they always
// have: tokens.css's base rules win ties with a module's class.
import './styles/tokens.css';
import './styles/global.css';
import './features/board/board.css';
import './auth/auth.css';

// No StrictMode: its double-mount would run the session seed twice.
// Before the router reads the address: /join/<code> is not a route.
captureInvite();
// So the next launch opens even when the network hangs (src/app/shellCache.ts).
startOfflineCopy();

const container = document.getElementById('root');
if (container === null) throw new Error('#root is missing from index.html');

// Only waits when the chosen language is not English and not yet fetched, and
// then for LOCALE_WAIT_MS at most (src/i18n/i18n.ts).
void localeReady.then(() => {
  createRoot(container).render(
    <LocaleProvider>
      <ThemeProvider>
        <BrowserRouter>
          <UpdateWatcher />
          <SessionProvider>
            <App />
          </SessionProvider>
        </BrowserRouter>
      </ThemeProvider>
    </LocaleProvider>,
  );
});
