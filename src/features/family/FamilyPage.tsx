import { useEffect, useState } from 'react';
import { Check, Copy, RefreshCw } from 'lucide-react';
import { useSession } from '../../auth/session';
import { PageHeader } from '../../components/PageHeader';
import { ThemeToggle } from '../../components/theme/ThemeToggle';
import { Button, Sheet } from '../../components/ui';
import s from './FamilyPage.module.css';

/**
 * Who is in the family, and the code that lets somebody else in. The code is
 * always here, unlike the board's banner, which only shows while you are alone.
 */
export function FamilyPage(): JSX.Element {
  const { me, members, family, rotateJoinCode, refreshFamily } = useSession();

  const [copied, setCopied] = useState(false);
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
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async (code: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // Clipboard blocked: the code is on screen to read out or select.
    }
  };

  const rotate = async (): Promise<void> => {
    if (rotateJoinCode === undefined) return;
    setRotating(true);
    setError(null);
    try {
      await rotateJoinCode();
      setConfirming(false);
      setCopied(false);
    } catch (failed) {
      setError(failed instanceof Error ? failed.message : 'Could not change the code');
    } finally {
      setRotating(false);
    }
  };

  return (
    <div>
      <PageHeader title="Family" subtitle={family !== undefined ? family.name : 'Who shares this board and kitchen.'} />

      <div className={s.layout}>
        <section className={s.card} aria-labelledby="invite-title">
          <h2 id="invite-title" className={s.cardTitle}>
            Invite someone
          </h2>

          {family === undefined ? (
            <p className={s.muted}>Join codes come with real accounts. In demo mode everyone is already here.</p>
          ) : (
            <>
              <p className={s.muted}>
                They sign up with their own account, choose “I have a join code” and enter this. It lets them in; it is
                not a password.
              </p>

              <div className={s.codeRow}>
                <code className={s.code} aria-label={`Join code ${family.joinCode.split('').join(' ')}`}>
                  {family.joinCode}
                </code>
                <Button icon={copied ? Check : Copy} onClick={() => void copy(family.joinCode)}>
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>

              {rotateJoinCode !== undefined && (
                <div className={s.rotate}>
                  <p className={s.muted}>Shared it somewhere you shouldn’t have? Swap it for a new one.</p>
                  <Button
                    variant="ghost"
                    icon={RefreshCw}
                    onClick={() => {
                      setError(null);
                      setConfirming(true);
                    }}
                  >
                    New code
                  </Button>
                </div>
              )}
            </>
          )}
        </section>

        <section className={s.card} aria-labelledby="members-title">
          <h2 id="members-title" className={s.cardTitle}>
            Members <span className={s.count}>{members.length}</span>
          </h2>
          <ul className={s.members}>
            {members.map((member) => (
              <li key={member.id} className={s.member}>
                <span className={s.dot} style={{ background: member.color }} aria-hidden />
                <span className={s.memberName}>{member.name}</span>
                {member.id === me.id && <span className={s.you}>You</span>}
              </li>
            ))}
          </ul>
        </section>

        <section className={s.card} aria-labelledby="theme-title">
          <h2 id="theme-title" className={s.cardTitle}>
            Theme
          </h2>
          <p className={s.muted}>Just for this device. System follows its light or dark setting.</p>
          <ThemeToggle className={s.theme} />
        </section>
      </div>

      <Sheet
        open={confirming}
        onClose={() => {
          if (!rotating) setConfirming(false);
        }}
        title="Get a new join code?"
        footer={
          <>
            <Button size="lg" disabled={rotating} onClick={() => setConfirming(false)}>
              Keep this one
            </Button>
            <Button variant="primary" size="lg" icon={RefreshCw} disabled={rotating} onClick={() => void rotate()}>
              {rotating ? 'Changing…' : 'New code'}
            </Button>
          </>
        }
      >
        <p className={s.sheetText}>
          The current code stops working straight away. Everyone already in the family stays in; only people who have
          not joined yet will need the new code.
        </p>
        {error !== null && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
      </Sheet>
    </div>
  );
}
