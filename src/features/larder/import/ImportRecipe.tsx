import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Check, Link2, RefreshCw, Search as SearchIcon, WifiOff } from 'lucide-react';
import { PageHeader } from '../../../components/PageHeader';
import { Button, Segmented, TextField } from '../../../components/ui';
import { useIsDesktop } from '../../../hooks/useMediaQuery';
import type { AnyRecipe } from '../../../domain/types';
import type { ImportedRecipe } from '../../../../server/import';
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
  | { kind: 'error'; message: string; offerWrite?: boolean };

const OFFLINE = 'You’re offline — importing needs a connection';

function errorMessage(code: string): { message: string; offerWrite?: boolean } {
  switch (code) {
    case 'invalid-url':
      return { message: 'That doesn’t look like a web address — check the link and try again.' };
    case 'blocked':
      return { message: 'That address can’t be fetched. Use a link to a public recipe page.' };
    case 'timeout':
      return { message: 'That page took too long to answer — try again in a moment.' };
    case 'too-large':
      return { message: 'That page is too big to read. Try the recipe’s own page.' };
    default:
      return { message: 'Couldn’t find a recipe on that page — try another link or write it yourself', offerWrite: true };
  }
}

export default function ImportRecipe(): JSX.Element {
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
      setStatus({ kind: 'error', message: OFFLINE });
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
      setStatus({ kind: 'error', message: navigator.onLine ? errorMessage('fetch-failed').message : OFFLINE });
    }
  };

  const runSearch = async (): Promise<void> => {
    if (!navigator.onLine) {
      setStatus({ kind: 'error', message: OFFLINE });
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
          <ArrowLeft size={18} strokeWidth={2} aria-hidden /> Library
        </Link>
      )}
      <PageHeader title="Add a recipe" />
      <Segmented
        label="How to add"
        className={s.tabs}
        value="import"
        onChange={(value) => {
          if (value === 'write') navigate('/add');
        }}
        options={[
          { value: 'write', label: 'Write my own' },
          { value: 'import', label: 'Import from web' },
        ]}
      />

      <section className={s.card}>
        <div className={s.cardTop}>
          <Segmented
            label="Import by"
            value={mode}
            onChange={(value) => {
              setMode(value);
              setStatus({ kind: 'idle' });
            }}
            options={[
              { value: 'link', label: 'Paste a link' },
              { value: 'search', label: 'Search online' },
            ]}
          />
          {desktop && <span className={s.muted}>Works with most recipe sites</span>}
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
              label="Recipe link"
              icon={Link2}
              type="url"
              inputMode="url"
              placeholder="https://…"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              wrapClassName={s.urlField}
            />
            <Button type="submit" variant={status.kind === 'ok' ? 'secondary' : 'primary'} size="lg" icon={RefreshCw} disabled={url.trim() === '' || status.kind === 'loading'}>
              {status.kind === 'loading' ? 'Fetching…' : status.kind === 'ok' ? 'Fetch again' : 'Fetch recipe'}
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
              label="Search recipes online"
              icon={SearchIcon}
              type="search"
              placeholder="e.g. gnocchi, chicken soup"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              wrapClassName={s.urlField}
            />
            <Button type="submit" variant="primary" size="lg" icon={SearchIcon}>
              Search
            </Button>
          </form>
        )}

        <div aria-live="polite">
          {status.kind === 'ok' && (
            <p className={s.ok}>
              <Check size={18} strokeWidth={2.4} aria-hidden /> Recipe found and read from {status.site}
            </p>
          )}
          {status.kind === 'error' && (
            <p className={s.fail}>
              {status.message === OFFLINE ? <WifiOff size={18} strokeWidth={2.2} aria-hidden /> : <AlertTriangle size={18} strokeWidth={2.2} aria-hidden />}
              <span>
                {status.message}
                {status.offerWrite === true && (
                  <>
                    {' '}
                    — <Link to="/add">write it yourself</Link>
                  </>
                )}
              </span>
            </p>
          )}
        </div>

        {mode === 'search' && results !== null && (
          <div className={s.results}>
            {results.length === 0 ? (
              <p className={s.muted}>No recipes found for “{query}”.</p>
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
