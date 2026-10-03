import { useCallback, useEffect, useState } from 'react';
import { KeyRound, RefreshCw, Trash2 } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { aiErrorMessage, saveFamilyKey } from '../../ai/client';
import type { SaveKeyOutcome } from '../../ai/client';
import { useSession } from '../../auth/session';
import { Button, Segmented, Sheet, TextField } from '../../components/ui';
import type { AiStatus } from '../../domain/types';
import { formatDate } from '../../i18n';
import s from './FamilyPage.module.css';

/**
 * The family's AI reading: free reads left, or the family's own OpenRouter
 * key (its last four characters, who added it) and the model. The key field
 * is write-only: it is sent once and cleared, and nothing shows it again.
 */

// The same pattern the server and the database check (server/ai/openrouter.ts, supabase/schema.sql).
const MODEL_ID = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9._-]*(:free)?$/;
const isModelId = (id: string): boolean => id.length <= 100 && MODEL_ID.test(id) && !id.startsWith('openrouter/');

export function AiCard(): JSX.Element {
  const { t } = useTranslation();
  const { ai } = useSession();
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [sheet, setSheet] = useState<'key' | 'remove' | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelMode, setModelMode] = useState<'free' | 'chosen'>('free');
  const [modelId, setModelId] = useState('');

  const refresh = useCallback(async (): Promise<void> => {
    if (ai === undefined) return;
    try {
      const next = await ai.status();
      setStatus(next);
      setModelMode(next.key?.model !== undefined ? 'chosen' : 'free');
      setModelId(next.key?.model ?? '');
    } catch {
      setStatus(null);
    }
  }, [ai]);

  // Not in realtime: another member's change shows on the next visit.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (ai === undefined) {
    return (
      <section className={s.card} aria-labelledby="ai-title">
        <h2 id="ai-title" className={s.cardTitle}>
          {t('family.ai.title')}
        </h2>
        <p className={s.muted}>{t('family.ai.demo')}</p>
      </section>
    );
  }

  const saveKey = async (): Promise<void> => {
    const typed = key;
    setKey(''); // Write-only: gone from the field and from state before the answer.
    setBusy(true);
    setError(null);
    let outcome: SaveKeyOutcome | null = null;
    try {
      outcome = await saveFamilyKey(ai, typed);
    } catch {
      // The member's token could not be read; saying so in words is all there is to do.
    }
    setBusy(false);
    if (outcome === null) {
      setError(t('family.ai.failed'));
      return;
    }
    if (outcome.kind === 'error') {
      setError(aiErrorMessage(outcome.code, { input: 'key' }).message);
      return;
    }
    setSheet(null);
    await refresh();
  };

  const remove = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await ai.clearKey();
      setSheet(null);
      await refresh();
    } catch {
      // Never the server's own words: they can carry more than the member should see.
      setError(t('family.ai.failed'));
    } finally {
      setBusy(false);
    }
  };

  const chosen = modelId.trim();
  const modelValid = modelMode === 'free' || isModelId(chosen);
  const saveModel = async (): Promise<void> => {
    if (!modelValid) return;
    setError(null);
    try {
      await ai.setModel(modelMode === 'free' ? null : chosen);
      await refresh();
    } catch {
      setError(t('family.ai.failed'));
    }
  };

  const familyKey = status?.key;
  return (
    <section className={s.card} aria-labelledby="ai-title">
      <h2 id="ai-title" className={s.cardTitle}>
        {t('family.ai.title')}
      </h2>
      {familyKey === undefined ? (
        <>
          {status !== null && <p className={s.muted}>{t('family.ai.free', { left: status.free.left, limit: status.free.limit })}</p>}
          <div>
            <Button
              variant="primary"
              icon={KeyRound}
              onClick={() => {
                setError(null);
                setSheet('key');
              }}
            >
              {t('family.ai.add')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className={s.muted}>
            {t('family.ai.keyLine', {
              hint: familyKey.hint,
              name: familyKey.setByName ?? t('family.ai.formerMember'),
              date: formatDate(familyKey.updatedAt, { day: 'numeric', month: 'short' }),
            })}
          </p>
          <div className={s.aiModel}>
            <Segmented
              wrap
              label={t('family.ai.model')}
              value={modelMode}
              onChange={setModelMode}
              options={[
                { value: 'free', label: t('family.ai.modelFree') },
                { value: 'chosen', label: t('family.ai.modelChosen') },
              ]}
            />
            {modelMode === 'chosen' && (
              <>
                <TextField
                  label={t('family.ai.modelId')}
                  showLabel
                  dir="ltr"
                  // i18n: an example model id, not words.
                  placeholder="google/gemini-2.5-flash"
                  value={modelId}
                  onChange={(event) => setModelId(event.target.value)}
                  aria-invalid={!modelValid && chosen !== ''}
                />
                <p className={s.muted}>
                  <Trans
                    i18nKey="family.ai.modelHelp"
                    components={{ a: <a href="https://openrouter.ai/models?supported_parameters=structured_outputs" target="_blank" rel="noreferrer" /> }}
                  />
                </p>
                {!modelValid && chosen !== '' && (
                  <p className={s.error} role="alert">
                    {t('family.ai.modelInvalid')}
                  </p>
                )}
              </>
            )}
            <div>
              <Button onClick={() => void saveModel()} disabled={!modelValid}>
                {t('family.ai.saveModel')}
              </Button>
            </div>
          </div>
          <div className={s.linkActions}>
            <Button
              icon={RefreshCw}
              onClick={() => {
                setError(null);
                setSheet('key');
              }}
            >
              {t('family.ai.replace')}
            </Button>
            <Button
              variant="ghost"
              icon={Trash2}
              onClick={() => {
                setError(null);
                setSheet('remove');
              }}
            >
              {t('family.ai.remove')}
            </Button>
          </div>
        </>
      )}
      {error !== null && sheet === null && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}

      <Sheet
        open={sheet === 'key'}
        onClose={() => {
          if (!busy) {
            setKey('');
            setSheet(null);
          }
        }}
        title={t('family.ai.keySheet.title')}
        footer={
          <>
            <Button
              size="lg"
              disabled={busy}
              onClick={() => {
                setKey('');
                setSheet(null);
              }}
            >
              {t('family.ai.keySheet.cancel')}
            </Button>
            <Button variant="primary" size="lg" icon={KeyRound} disabled={busy || key.trim() === ''} onClick={() => void saveKey()}>
              {busy ? t('family.ai.keySheet.saving') : t('family.ai.keySheet.save')}
            </Button>
          </>
        }
      >
        <TextField
          label={t('family.ai.keySheet.label')}
          showLabel
          type="password"
          autoComplete="off"
          spellCheck={false}
          dir="ltr"
          value={key}
          onChange={(event) => setKey(event.target.value)}
        />
        <p className={s.sheetText}>
          <Trans i18nKey="family.ai.keySheet.get" components={{ a: <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" /> }} />
        </p>
        <p className={s.sheetText}>{t('family.ai.keySheet.limit')}</p>
        {error !== null && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
      </Sheet>

      <Sheet
        open={sheet === 'remove'}
        onClose={() => {
          if (!busy) setSheet(null);
        }}
        title={t('family.ai.removeSheet.title')}
        footer={
          <>
            <Button size="lg" disabled={busy} onClick={() => setSheet(null)}>
              {t('family.ai.removeSheet.keep')}
            </Button>
            <Button variant="primary" size="lg" icon={Trash2} disabled={busy} onClick={() => void remove()}>
              {busy ? t('family.ai.removeSheet.removing') : t('family.ai.remove')}
            </Button>
          </>
        }
      >
        <p className={s.sheetText}>{t('family.ai.removeSheet.body')}</p>
        {error !== null && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
      </Sheet>
    </section>
  );
}
