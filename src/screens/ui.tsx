import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { errorMessage } from '../lib/api';
import type { JobStatus } from '../domain/types';

export const statusTone: Record<JobStatus, string> = {
  CHECKED_IN: 'blue',
  INSPECTION: 'purple',
  AWAITING_APPROVAL: 'amber',
  IN_PROGRESS: 'blue',
  QUALITY_CHECK: 'purple',
  READY_FOR_PICKUP: 'green',
  COMPLETED: 'green',
  ON_HOLD: 'orange',
  CANCELLED: 'red',
};

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Empty({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="empty">
      <span className="empty-mark" aria-hidden="true">
        <Inbox />
      </span>
      <h3>{title}</h3>
      <p>{copy}</p>
    </div>
  );
}

export function ErrorText({ error }: { error: string }) {
  return error ? (
    <p className="notice red" role="alert">
      {error}
    </p>
  ) : null;
}

export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, setError, run };
}

export function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          close();
      }}
    >
      <div className="modal-head">
        <h3 id={titleId}>{title}</h3>
        <button type="button" aria-label="Close dialog" onClick={close}>
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
