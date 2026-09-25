import { useLocation } from 'react-router-dom';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { cx } from '../components/ui';
import { TimerHost } from '../features/larder/timers/TimerHost';
import { AppRoutes } from './AppRoutes';
import { Sidebar, TabBar } from './Nav';
import s from './Shell.module.css';

/** The frame around every screen: sidebar or tab bar, the page, and cook-mode timers. */
export function Shell(): JSX.Element {
  const { pathname } = useLocation();
  const cooking = /^\/recipe\/[^/]+\/cook/.test(pathname);
  // Recipe pages have their own sticky actions, so the tab bar steps aside.
  const noTabBar = cooking || pathname.startsWith('/recipe/');

  return (
    <div className={cx(s.shell, cooking && s.fullscreen, noTabBar && s.noTabBar)}>
      {!cooking && <Sidebar />}
      <main className={s.main} id="main">
        <ErrorBoundary resetKey={pathname}>
          <AppRoutes />
        </ErrorBoundary>
      </main>
      {!noTabBar && <TabBar />}
      <TimerHost />
    </div>
  );
}
