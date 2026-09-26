import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Link2, RefreshCw, Search as SearchIcon, WifiOff } from 'lucide-react';
import { PageHeader } from '../../../components/PageHeader';
import { BackArrow, Button, Segmented, TextField } from '../../../components/ui';
import { useIsDesktop } from '../../../hooks/useMediaQuery';
import type { AnyRecipe } from '../../../domain/types';
import type { ImportedRecipe } from '../../../../server/import';
import { i18n } from '../../../i18n';
import { useKitchen } from '../KitchenContext';
import { RecipeList, RecipeRow } from '../recipe/RecipeCard';
import { recipePath, recipeView } from '../recipe/recipeView';
import { fromImported } from './imported';
import s from './ImportRecipe.module.css';
import { PreviewCard } from './PreviewCard';
import type { Preview } from './PreviewCard';

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; site: string }
  | { kind: 'error'; message: string; offline?: boolean; offerWrite?: boolean };

function offline(): { message: string; offline: true } {
  return { message: i18n.t('import.offline'), offline: true };
}

/** The import endpoint's error codes (server/import) in words. */
function errorMessage(code: string): { message: string; offerWrite?: boolean } {
  switch (code) {
    case 'invalid-url':
      return { message: i18n.t('import.error.invalidUrl') };
    case 'blocked':
      return { message: i18n.t('import.error.blocked') };
    case 'timeout':
      return { message: i18n.t('import.error.timeout') };
    case 'too-large':
      return { message: i18n.t('import.error.tooLarge') };
    default:
      return { message: i18n.t('import.error.notFound'), offerWrite: true };
  }
}

export default function ImportRecipe(): JSX.Element {
  const { t } = useTranslation();
  const kitchen = useKitchen();
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const [mode, setMode] = useState<'link' | 'search'>('link');
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AnyRecipe[] | null>(null);

  const fetchRecipe = async (): Promise<void> => {
    if (!navigator.onLine) {
      setStatus({ kind: 'error', ...offline() });
      return;
    }
    setStatus({ kind: 'loading' });
    try {
      const response = await fetch('/api/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const body = (await response.json().catch(() => ({ error: 'fetch-failed' }))) as {
        recipe?: ImportedRecipe;
        report?: { missing: string[] };
        error?: string;
      };
      if (body.recipe === undefined) {
        setPreview(null);
        setStatus({ kind: 'error', ...errorMessage(body.error ?? 'not-found') });
        return;
      }
      const missing = body.report?.missing ?? [];
      setPreview({
        recipe: fromImported(body.recipe),
        stated: { photo: !missing.includes('photo'), servings: !missing.includes('servings'), times: !missing.includes('times') },
      });
      setStatus({ kind: 'ok', site: body.recipe.site });
    } catch {
      setPreview(null);
      setStatus({ kind: 'error', ...(navigator.onLine ? { message: errorMessage('fetch-failed').message } : offline()) });
    }
  };

  const runSearch = async (): Promise<void> => {
    if (!navigator.onLine) {
      setStatus({ kind: 'error', ...offline() });
      return;
    }
    setStatus({ kind: 'idle' });
    setResults(await kitchen.provider.search(query));
  };

  const choose = (recipe: AnyRecipe): void => {
    setPreview({ recipe, stated: { photo: recipe.photoUrl !== undefined, servings: true, times: true } });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div>
      {desktop && (
        <Link to="/library" className={s.back}>
          <BackArrow size={18} strokeWidth={2} aria-hidden /> {t('common.library')}
        </Link>
      )}
      <PageHeader title={t('import.title')} />
      <Segmented
        wrap
        label={t('add.howToAdd')}
        className={s.tabs}
        value="import"
        onChange={(value) => {
          if (value === 'write') navigate('/add');
        }}
        options={[
          { value: 'write', label: t('add.writeOwn') },
          { value: 'import', label: t('add.importWeb') },
        ]}
      />

      <section className={s.card}>
        <div className={s.cardTop}>
          <Segmented
            wrap
            label={t('import.importBy')}
            value={mode}
            onChange={(value) => {
              setMode(value);
              setStatus({ kind: 'idle' });
            }}
            options={[
              { value: 'link', label: t('import.pasteLink') },
              { value: 'search', label: t('import.searchOnline') },
            ]}
          />
          {desktop && <span className={s.muted}>{t('import.worksWith')}</span>}
        </div>

        {mode === 'link' ? (
          <form
            className={s.fetchRow}
            onSubmit={(event) => {
              event.preventDefault();
              void fetchRecipe();
            }}
          >
            <TextField
              label={t('import.link')}
              icon={Link2}
              type="url"
              inputMode="url"
              // i18n: the shape of a web address, not words.
              placeholder="https://…"
              dir="ltr"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              wrapClassName={s.urlField}
            />
            <Button type="submit" variant={status.kind === 'ok' ? 'secondary' : 'primary'} size="lg" icon={RefreshCw} disabled={url.trim() === '' || status.kind === 'loading'}>
              {status.kind === 'loading' ? t('import.fetching') : status.kind === 'ok' ? t('import.fetchAgain') : t('import.fetch')}
            </Button>
          </form>
        ) : (
          <form
            className={s.fetchRow}
            onSubmit={(event) => {
              event.preventDefault();
              void runSearch();
            }}
          >
            <TextField
              label={t('import.searchLabel')}
              icon={SearchIcon}
              type="search"
              placeholder={t('import.searchPlaceholder')}
              dir="auto"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              wrapClassName={s.urlField}
            />
            <Button type="submit" variant="primary" size="lg" icon={SearchIcon}>
              {t('import.search')}
            </Button>
          </form>
        )}

        <div aria-live="polite">
          {status.kind === 'ok' && (
            <p className={s.ok}>
              <Check size={18} strokeWidth={2.4} aria-hidden /> {t('import.found', { site: status.site })}
            </p>
          )}
          {status.kind === 'error' && (
            <p className={s.fail}>
              {status.offline === true ? <WifiOff size={18} strokeWidth={2.2} aria-hidden /> : <AlertTriangle size={18} strokeWidth={2.2} aria-hidden />}
              <span>
                {status.message}
                {status.offerWrite === true && <Trans i18nKey="import.writeYourself" components={{ link: <Link to="/add" /> }} />}
              </span>
            </p>
          )}
        </div>

        {mode === 'search' && results !== null && (
          <div className={s.results}>
            {results.length === 0 ? (
              <p className={s.muted}>
                <Trans i18nKey="import.noneFound" values={{ query }} />
              </p>
            ) : (
              <RecipeList>
                {results.map((recipe) => (
                  <RecipeRow key={recipe.id} view={recipeView(recipe, kitchen.pantry, kitchen.profile)} onChoose={() => choose(recipe)} />
                ))}
              </RecipeList>
            )}
          </div>
        )}
      </section>

      {preview !== null && <PreviewCard key={preview.recipe.id} preview={preview} onSaved={(id) => navigate(recipePath({ id }), { replace: true })} />}
    </div>
  );
}
