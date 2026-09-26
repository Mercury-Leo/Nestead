import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton } from './Button';
import { cx } from './cx';
import s from './Sheet.module.css';

/**
 * A modal: a bottom sheet on phones, a centred dialog on desktop. Built on
 * <dialog>, which gives focus trapping, Esc to close and a top layer for free.
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
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

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
