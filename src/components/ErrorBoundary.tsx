import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';
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
    return (
      <EmptyState
        icon={TriangleAlert}
        title="Something went wrong"
        actions={
          <Button variant="primary" size="lg" icon={RefreshCw} onClick={() => window.location.reload()}>
            Reload
          </Button>
        }
      >
        <p>This screen couldn’t load. Reloading usually fixes it; nothing you saved is lost.</p>
      </EmptyState>
    );
  }
}
