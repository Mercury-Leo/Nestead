import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton } from './Button';
import { cx } from './cx';
import s from './Sheet.module.css';

/**
 * Gives focus back to what opened a sheet as it closes, but only when focus
 * would otherwise be lost: still inside the sheet, or dropped to the page. If
 * something else has taken focus since (a card brought into view, say), it
 * keeps it. Nothing is moved when nothing had focus as the sheet opened, as
 * after a tap on a phone.
 */
function giveFocusBack(dialog: HTMLDialogElement, opener: MutableRefObject<HTMLElement | null>): void {
  const target = opener.current;
  opener.current = null;
  if (target === null || !target.isConnected) return;
  const active = document.activeElement;
  if (active !== null && active !== document.body && !dialog.contains(active)) return;
  target.focus();
}

/**
 * A modal: a bottom sheet on phones, a centred dialog on desktop. Built on
 * <dialog>, which gives focus trapping, Esc to close and a top layer for free.
 * Closing gives focus back to what opened it, whether the sheet stays on the
 * page with `open` false or the page stops rendering it (`giveFocusBack()`).
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}): JSX.Element {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      const active = document.activeElement;
      opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
      dialog.showModal();
    }
    if (!open && dialog.open) {
      dialog.close();
      giveFocusBack(dialog, opener);
    }
  }, [open]);

  // A page that renders the sheet only while it is open (Add show, the Tags
  // sheet) removes it still open. Close it here, while the dialog is still in
  // the page, so focus goes back as it does for a sheet that stays.
  useLayoutEffect(() => {
    const dialog = ref.current;
    return () => {
      if (dialog === null || !dialog.open) return;
      dialog.close();
      giveFocusBack(dialog, opener);
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={cx(s.sheet, className)}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {open && (
        <div className={s.sheetInner}>
          <span className={s.sheetHandle} aria-hidden />
          <header className={s.sheetHead}>
            <h2 id={titleId} className={s.sheetTitle}>
              {title}
            </h2>
            <IconButton label={t('common.close')} icon={X} variant="secondary" size={52} onClick={onClose} />
          </header>
          <div className={s.sheetBody}>{children}</div>
          {footer !== undefined && <footer className={s.sheetFoot}>{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
