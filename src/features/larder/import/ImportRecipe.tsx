import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Link2, RefreshCw, Search as SearchIcon, Sparkles, WifiOff } from 'lucide-react';
import { aiErrorMessage, extractRecipe } from '../../../ai/client';
import type { AiInput } from '../../../ai/client';
import { useSession } from '../../../auth/session';
import { PageHeader } from '../../../components/PageHeader';
import { BackArrow, Button, Segmented, TextField } from '../../../components/ui';
import { useIsDesktop } from '../../../hooks/useMediaQuery';
import type { AiStatus, AnyRecipe } from '../../../domain/types';
import type { ImportedRecipe } from '../../../../server/import';
import type { WebRecipeHit } from '../../../../server/search';
import { i18n } from '../../../i18n';
import { useKitchen } from '../KitchenContext';
import { RecipeList, RecipeRow } from '../recipe/RecipeCard';
import { recipePath, recipeView } from '../recipe/recipeView';
import { fromImported } from './imported';
import s from './ImportRecipe.module.css';
import { PreviewCard } from './PreviewCard';
import type { Preview } from './PreviewCard';
import { searchOnline } from './webSearch';
import { WebResults } from './WebResults';

type Status =
  | { kind: 'idle' }
  | { kind: 'loading'; ai?: boolean }
  | { kind: 'ok'; site?: string; ai?: boolean }
  // offerAi: the page the importer found no recipe in, which "Read it with AI" can read.
  | { kind: 'error'; message: string; offline?: boolean; offerWrite?: boolean; offerAi?: string };

/** Pages found online, or, where this build has no online search, the bundled index. */
type Results = { kind: 'web'; query: string; hits: WebRecipeHit[] } | { kind: 'bundled'; query: string; recipes: AnyRecipe[] };

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
  // Set for real accounts only: demo mode has no AI to read with.
  const { ai } = useSession();
  const [mode, setMode] = useState<'link' | 'search' | 'text'>('link');
  const [url, setUrl] = useState('');
  const [pasted, setPasted] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Results | null>(null);
  const [searching, setSearching] = useState(false);
  // The hit being read, by its URL.
  const [opening, setOpening] = useState<string | null>(null);
  // Counts searches, so an answer to an older one is dropped.
  const searchRun = useRef(0);
  const previewAt = useRef<HTMLDivElement>(null);
  // Bumped when a result is chosen, to bring its preview into view.
  const [reveal, setReveal] = useState(0);
  // The family's free reads left or its own key, shown under the paste box.
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  // Counts AI reads, so each one starts a fresh preview.
  const [reads, setReads] = useState(0);

  useEffect(() => {
    if (reveal > 0) previewAt.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [reveal]);

  const refreshAiStatus = useCallback(() => {
    void ai?.status().then(setAiStatus, () => setAiStatus(null));
  }, [ai]);
  useEffect(() => {
    if (mode === 'text') refreshAiStatus();
  }, [mode, refreshAiStatus]);

  /** Reads the recipe at `target` into the preview. True when there is one to show. */
  const fetchRecipe = async (target: string): Promise<boolean> => {
    if (!navigator.onLine) {
      setStatus({ kind: 'error', ...offline() });
      return false;
    }
    setStatus({ kind: 'loading' });
    try {
      const response = await fetch('/api/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: target.trim() }),
      });
      const body = (await response.json().catch(() => ({ error: 'fetch-failed' }))) as {
        recipe?: ImportedRecipe;
        report?: { missing: string[] };
        error?: string;
      };
      if (body.recipe === undefined) {
        setPreview(null);
        // AI cannot read a page that could not be fetched, only one with no recipe data in it.
        const code = body.error ?? 'not-found';
        setStatus({ kind: 'error', ...errorMessage(code), ...(code === 'not-found' && ai !== undefined ? { offerAi: target.trim() } : {}) });
        return false;
      }
      const missing = body.report?.missing ?? [];
      setPreview({
        recipe: fromImported(body.recipe),
        stated: { photo: !missing.includes('photo'), servings: !missing.includes('servings'), times: !missing.includes('times') },
      });
      setStatus({ kind: 'ok', site: body.recipe.site });
      return true;
    } catch {
      setPreview(null);
      setStatus({ kind: 'error', ...(navigator.onLine ? { message: errorMessage('fetch-failed').message } : offline()) });
      return false;
    }
  };

  /** One AI read of pasted text or a page, into the same preview an import fills. */
  const readWithAi = async (input: AiInput): Promise<void> => {
    if (ai === undefined) return;
    setStatus({ kind: 'loading', ai: true });
    const outcome = await extractRecipe(ai, input);
    refreshAiStatus();
    if (outcome.kind === 'error') {
      setPreview(null);
      const { message, offerWrite } = aiErrorMessage(outcome.code, {
        input: 'text' in input ? 'text' : 'url',
        ...(outcome.scope !== undefined ? { scope: outcome.scope } : {}),
      });
      setStatus({ kind: 'error', message, ...(offerWrite === true ? { offerWrite } : {}), ...(outcome.code === 'offline' ? { offline: true } : {}) });
      return;
    }
    const missing = outcome.report.missing;
    setReads((count) => count + 1);
    setPreview({
      recipe: fromImported(outcome.recipe),
      stated: { photo: !missing.includes('photo'), servings: !missing.includes('servings'), times: !missing.includes('times'), ai: true },
    });
    setStatus({ kind: 'ok', ai: true, ...(outcome.recipe.site !== undefined ? { site: outcome.recipe.site } : {}) });
    setReveal((count) => count + 1);
  };

  const runSearch = async (): Promise<void> => {
    const text = query.trim();
    if (text === '') return;
    if (!navigator.onLine) {
      setStatus({ kind: 'error', ...offline() });
      return;
    }
    searchRun.current += 1;
    const run = searchRun.current;
    setStatus({ kind: 'idle' });
    setSearching(true);
    const outcome = await searchOnline(text);
    const found: Results | null =
      outcome.kind === 'hits'
        ? { kind: 'web', query: text, hits: outcome.hits }
        : outcome.kind === 'unavailable'
          ? { kind: 'bundled', query: text, recipes: await kitchen.provider.search(text) }
          : null;
    if (run !== searchRun.current) return;
    setSearching(false);
    setResults(found);
    if (outcome.kind === 'failed') setStatus({ kind: 'error', message: t(outcome.limit ? 'import.error.searchLimit' : 'import.error.searchFailed') });
  };

  const openHit = async (hit: WebRecipeHit): Promise<void> => {
    setOpening(hit.url);
    const shown = await fetchRecipe(hit.url);
    setOpening(null);
    if (shown) setReveal((count) => count + 1);
  };

  const choose = (recipe: AnyRecipe): void => {
    setPreview({ recipe, stated: { photo: recipe.photoUrl !== undefined, servings: true, times: true } });
    setReveal((count) => count + 1);
  };

  // What the next read costs: the family's own key, or one of the free reads left today.
  const aiLine =
    aiStatus === null
      ? null
      : aiStatus.key !== undefined
        ? t('import.aiFamilyKey')
        : t('import.aiFree', { left: aiStatus.free.left, limit: aiStatus.free.limit });

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
              ...(ai !== undefined ? [{ value: 'text' as const, label: t('import.pasteText') }] : []),
            ]}
          />
        </div>

        {mode === 'link' ? (
          <form
            className={s.fetchRow}
            onSubmit={(event) => {
              event.preventDefault();
              void fetchRecipe(url);
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
              {status.kind === 'loading' ? t(status.ai === true ? 'import.reading' : 'import.fetching') : status.kind === 'ok' ? t('import.fetchAgain') : t('import.fetch')}
            </Button>
          </form>
        ) : mode === 'search' ? (
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
            <Button type="submit" variant="primary" size="lg" icon={SearchIcon} disabled={query.trim() === '' || searching}>
              {searching ? t('import.searching') : t('import.search')}
            </Button>
          </form>
        ) : (
          <form
            className={s.textForm}
            onSubmit={(event) => {
              event.preventDefault();
              void readWithAi({ text: pasted });
            }}
          >
            <label className="visually-hidden" htmlFor="import-text">
              {t('import.textLabel')}
            </label>
            <textarea
              id="import-text"
              className={s.textArea}
              dir="auto"
              maxLength={20_000}
              rows={10}
              placeholder={t('import.textPlaceholder')}
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
            />
            <p className={s.muted}>
              {aiLine} {t('import.aiSent')}
            </p>
            <Button type="submit" variant="primary" size="lg" icon={Sparkles} disabled={pasted.trim() === '' || status.kind === 'loading'}>
              {status.kind === 'loading' ? t('import.reading') : t('import.readWithAi')}
            </Button>
          </form>
        )}

        <div aria-live="polite">
          {status.kind === 'ok' && (
            <p className={s.ok}>
              <Check size={18} strokeWidth={2.4} aria-hidden />{' '}
              {status.ai === true
                ? status.site !== undefined
                  ? t('import.readByAiFrom', { site: status.site })
                  : t('import.readByAi')
                : t('import.found', { site: status.site ?? '' })}
            </p>
          )}
          {status.kind === 'error' && (
            <p className={s.fail}>
              {status.offline === true ? <WifiOff size={18} strokeWidth={2.2} aria-hidden /> : <AlertTriangle size={18} strokeWidth={2.2} aria-hidden />}
              <span>
                {status.message}
                {status.offerWrite === true && <Trans i18nKey="import.writeYourself" components={{ link: <Link to="/add" /> }} />}
                {status.offerAi !== undefined && (
                  <span className={s.offer}>
                    <Button variant="secondary" icon={Sparkles} onClick={() => void readWithAi({ url: status.offerAi as string })}>
                      {t('import.readItWithAi')}
                    </Button>
                  </span>
                )}
              </span>
            </p>
          )}
        </div>

        {mode === 'search' && results !== null && (
          <div className={s.results}>
            {results.kind === 'bundled' && <p className={s.muted}>{t('import.bundledNote')}</p>}
            {(results.kind === 'web' ? results.hits.length : results.recipes.length) === 0 ? (
              <p className={s.muted}>
                <Trans i18nKey="import.noneFound" values={{ query: results.query }} />
              </p>
            ) : results.kind === 'web' ? (
              <WebResults hits={results.hits} opening={opening} onChoose={(hit) => void openHit(hit)} />
            ) : (
              <RecipeList>
                {results.recipes.map((recipe) => (
                  <RecipeRow key={recipe.id} view={recipeView(recipe, kitchen.pantry, kitchen.profile)} onChoose={() => choose(recipe)} />
                ))}
              </RecipeList>
            )}
          </div>
        )}
      </section>

      <div ref={previewAt} className={s.previewAt}>
        {preview !== null && <PreviewCard key={`${preview.recipe.id}:${reads}`} preview={preview} onSaved={(id) => navigate(recipePath({ id }), { replace: true })} />}
      </div>
    </div>
  );
}
