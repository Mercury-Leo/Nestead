import { CloudOff, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState } from './ui';

/**
 * In place of Loading when a screen's first read failed, so the family sees
 * that their rows did not arrive rather than an empty list. The cache is
 * already retrying; Try again does it at once.
 */
export function LoadFailed({ onRetry }: { onRetry: () => void }): JSX.Element {
  const { t } = useTranslation();
  return (
    <div role="alert">
      <EmptyState
        icon={CloudOff}
        title={t('loadFailed.title')}
        actions={
          <Button variant="primary" size="lg" icon={RefreshCw} onClick={onRetry}>
            {t('loadFailed.retry')}
          </Button>
        }
      >
        <p>{t('loadFailed.body')}</p>
      </EmptyState>
    </div>
  );
}
