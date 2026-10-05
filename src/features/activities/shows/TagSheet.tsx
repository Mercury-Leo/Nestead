import { useMemo, useState } from 'react';
import { Check, Plus, Tag as TagIcon } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { useSession } from '../../../auth/session';
import { Button, Chip, Sheet, TextField } from '../../../components/ui';
import { MAX_TAGS, MAX_TAG_LENGTH, familyTags, sameTag, tidyTag, withTag } from '../../../domain/shows';
import type { Show } from '../../../domain/types';
import { setTags } from './actions';
import s from './TagSheet.module.css';

/**
 * One show's tags: every tag the family uses, pressed for this show's, and a
 * field that narrows them or adds a new one (Enter, or the Add chip). Each
 * press saves at once; Done only closes. The tags offered are the family's
 * when the sheet opened plus any added since, so a tag taken off its last
 * show stays here until the sheet closes and can be put back.
 */
export function TagSheet({ show, shows, onClose }: { show: Show; shows: readonly Show[]; onClose: () => void }): JSX.Element {
  const { t, i18n } = useTranslation();
  const { store } = useSession();
  const [typed, setTyped] = useState('');
  const [offered, setOffered] = useState<string[]>(() => familyTags(shows));

  const tags = show.tags ?? [];
  // The family's spelling is the one offered, so a show holding another ("bad movie" for "Bad movie") has the tag too.
  const has = (tag: string): boolean => tags.some((own) => sameTag(own, tag));
  const full = tags.length >= MAX_TAGS;
  const tidy = tidyTag(typed);
  const known = offered.some((tag) => sameTag(tag, tidy));
  const collator = useMemo(() => new Intl.Collator(i18n.language, { sensitivity: 'base', numeric: true }), [i18n.language]);
  const listed = offered.filter((tag) => tag.toLocaleLowerCase().includes(tidy.toLocaleLowerCase())).sort(collator.compare);

  const save = (next: readonly string[]): void => {
    if (next !== tags) void setTags(store, show, next).catch(() => undefined);
  };
  const toggle = (tag: string): void => save(has(tag) ? tags.filter((own) => !sameTag(own, tag)) : withTag(tags, tag, offered));
  const add = (): void => {
    if (tidy === '' || full) return;
    if (!known) setOffered((current) => [...current, tidy]);
    save(withTag(tags, tidy, offered));
    setTyped('');
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={<Trans i18nKey="shows.tags.sheetTitle" components={{ item: <bdi>{show.title}</bdi> }} />}
      footer={
        <div className={s.footer}>
          <Button variant="primary" onClick={onClose}>
            {t('shows.tags.done')}
          </Button>
        </div>
      }
    >
      <p className={s.hint}>{offered.length === 0 ? t('shows.tags.firstHint') : t('shows.tags.hint')}</p>
      <form
        className={s.add}
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <TextField
          label={t('shows.tags.field')}
          icon={TagIcon}
          dir="auto"
          value={typed}
          maxLength={MAX_TAG_LENGTH}
          placeholder={t('shows.tags.placeholder')}
          disabled={full}
          enterKeyHint="done"
          onChange={(event) => setTyped(event.target.value)}
        />
      </form>
      {full && <p className={s.hint}>{t('shows.tags.full', { max: MAX_TAGS })}</p>}
      {(listed.length > 0 || (tidy !== '' && !known)) && (
        <div className={s.options} role="group" aria-label={t('shows.tags.label')}>
          {tidy !== '' && !known && !full && (
            <Chip icon={Plus} onClick={add} className={s.new}>
              <span>{t('shows.tags.add', { tag: tidy })}</span>
            </Chip>
          )}
          {listed.map((tag) => {
            const on = has(tag);
            return (
              <Chip key={tag} selected={on} icon={on ? Check : Plus} onClick={() => toggle(tag)}>
                <bdi>{tag}</bdi>
              </Chip>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}
