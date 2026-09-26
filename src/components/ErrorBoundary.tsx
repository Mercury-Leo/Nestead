import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState } from './ui';

/**
 * Keeps one broken screen from blanking the whole app. The usual cause is a
 * tab left open across a deploy, whose lazily loaded screens no longer exist
 * on the server; reloading picks up the new build.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Screen failed to render:', error, info.componentStack);
  }

  componentDidUpdate(previous: { resetKey?: string }): void {
    // Moving to another screen gives it a fresh chance.
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return <Failed />;
  }
}

/** A function component, so it can use the translation hook. */
function Failed(): JSX.Element {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={TriangleAlert}
      title={t('errorBoundary.title')}
      actions={
        <Button variant="primary" size="lg" icon={RefreshCw} onClick={() => window.location.reload()}>
          {t('errorBoundary.reload')}
        </Button>
      }
    >
      <p>{t('errorBoundary.body')}</p>
    </EmptyState>
  );
}
