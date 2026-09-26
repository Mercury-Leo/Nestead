import { useEffect, useState } from 'react';
import { Check, Copy, Link2, RefreshCw, Share2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { inviteLink } from '../../auth/invite';
import { useSession } from '../../auth/session';
import { PageHeader } from '../../components/PageHeader';
import { ThemeToggle } from '../../components/theme/ThemeToggle';
import { Button, SelectButton, Sheet } from '../../components/ui';
import { LOCALES, formatNumber, useLocale } from '../../i18n';
import s from './FamilyPage.module.css';

/**
 * Who is in the family, and the link and code that let somebody else in. They
 * are always here, unlike the board's banner, which only shows while you are
 * alone.
 */

/** The share sheet where there is one (phones, mostly); otherwise the link is copied. */
const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
export function FamilyPage(): JSX.Element {
  const { t } = useTranslation();
  const { locale, setLocale } = useLocale();
  const { me, members, family, rotateJoinCode, refreshFamily } = useSession();

  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Someone else may have rotated the code since this session loaded it.
  useEffect(() => {
    void refreshFamily?.().catch(() => {
      // Keep showing the code we have; rotating will still report failures.
    });
  }, [refreshFamily]);

  useEffect(() => {
    if (copied === null) return;
    const timer = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async (what: 'code' | 'link', text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      // Clipboard blocked: the code and link are on screen to select.
    }
  };

  const share = async (name: string, link: string): Promise<void> => {
    try {
      await navigator.share({ title: t('family.invite.shareTitle', { family: name }), text: t('family.invite.shareText', { family: name }), url: link });
    } catch (failed) {
      // Closing the share sheet is not a failure; anything else falls back to copying.
      if (!(failed instanceof DOMException && failed.name === 'AbortError')) await copy('link', link);
    }
  };

  const rotate = async (): Promise<void> => {
    if (rotateJoinCode === undefined) return;
    setRotating(true);
    setError(null);
    try {
      await rotateJoinCode();
      setConfirming(false);
      setCopied(null);
    } catch (failed) {
      setError(failed instanceof Error ? failed.message : t('family.confirm.failed'));
    } finally {
      setRotating(false);
    }
  };

  return (
    <div>
      <PageHeader title={t('family.title')} subtitle={family !== undefined ? <bdi>{family.name}</bdi> : t('family.subtitle')} />

      <div className={s.layout}>
        <section className={s.card} aria-labelledby="invite-title">
          <h2 id="invite-title" className={s.cardTitle}>
            {t('family.invite.title')}
          </h2>

          {family === undefined ? (
            <p className={s.muted}>{t('family.invite.demo')}</p>
          ) : (
            <>
              <p className={s.muted}>{t('family.invite.howTo')}</p>

              <div className={s.linkBlock}>
                <p className={s.link} aria-label={t('family.invite.linkLabel')}>
                  <Link2 size={16} strokeWidth={2} aria-hidden />
                  <bdi dir="ltr">{inviteLink(family.joinCode)}</bdi>
                </p>
                <div className={s.linkActions}>
                  {canShare && (
                    <Button variant="primary" icon={Share2} onClick={() => void share(family.name, inviteLink(family.joinCode))}>
                      {t('family.invite.share')}
                    </Button>
                  )}
                  <Button
                    variant={canShare ? 'secondary' : 'primary'}
                    icon={copied === 'link' ? Check : Copy}
                    onClick={() => void copy('link', inviteLink(family.joinCode))}
                  >
                    {copied === 'link' ? t('family.invite.linkCopied') : t('family.invite.copyLink')}
                  </Button>
                </div>
              </div>

              <p className={s.muted}>{t('family.invite.orCode')}</p>
              <div className={s.codeRow}>
                <code className={s.code} aria-label={t('family.invite.codeLabel', { spelled: family.joinCode.split('').join(' ') })}>
                  {family.joinCode}
                </code>
                <Button icon={copied === 'code' ? Check : Copy} onClick={() => void copy('code', family.joinCode)}>
                  {copied === 'code' ? t('family.invite.copied') : t('family.invite.copy')}
                </Button>
              </div>

              {rotateJoinCode !== undefined && (
                <div className={s.rotate}>
                  <p className={s.muted}>{t('family.invite.rotateHint')}</p>
                  <Button
                    variant="ghost"
                    icon={RefreshCw}
                    onClick={() => {
                      setError(null);
                      setConfirming(true);
                    }}
                  >
                    {t('family.invite.newCode')}
                  </Button>
                </div>
              )}
            </>
          )}
        </section>

        <section className={s.card} aria-labelledby="members-title">
          <h2 id="members-title" className={s.cardTitle}>
            {t('family.members')} <span className={s.count}>{formatNumber(members.length)}</span>
          </h2>
          <ul className={s.members}>
            {members.map((member) => (
              <li key={member.id} className={s.member}>
                <span className={s.dot} style={{ background: member.color }} aria-hidden />
                <span className={s.memberName} dir="auto">
                  {member.name}
                </span>
                {member.id === me.id && <span className={s.you}>{t('family.you')}</span>}
              </li>
            ))}
          </ul>
        </section>

        <section className={s.card} aria-labelledby="theme-title">
          <h2 id="theme-title" className={s.cardTitle}>
            {t('theme.label')}
          </h2>
          <p className={s.muted}>{t('family.themeNote')}</p>
          <ThemeToggle className={s.theme} />
        </section>

        {/* A build with a single language has nothing to choose. */}
        {LOCALES.length > 1 && (
          <section className={s.card} aria-labelledby="locale-title">
            <h2 id="locale-title" className={s.cardTitle}>
              {t('locale.title')}
            </h2>
            <p className={s.muted}>{t('locale.note')}</p>
            <SelectButton
              label={t('locale.label')}
              shape="field"
              className={s.theme}
              value={locale}
              onChange={setLocale}
              options={LOCALES.map((option) => ({ value: option.code, label: option.name }))}
            />
          </section>
        )}
      </div>

      <Sheet
        open={confirming}
        onClose={() => {
          if (!rotating) setConfirming(false);
        }}
        title={t('family.confirm.title')}
        footer={
          <>
            <Button size="lg" disabled={rotating} onClick={() => setConfirming(false)}>
              {t('family.confirm.keep')}
            </Button>
            <Button variant="primary" size="lg" icon={RefreshCw} disabled={rotating} onClick={() => void rotate()}>
              {rotating ? t('family.confirm.changing') : t('family.invite.newCode')}
            </Button>
          </>
        }
      >
        <p className={s.sheetText}>{t('family.confirm.body')}</p>
        {error !== null && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
      </Sheet>
    </div>
  );
}
