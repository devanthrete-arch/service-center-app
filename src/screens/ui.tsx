import { useCallback, useState, type ReactNode } from 'react';
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
      <h3>{title}</h3>
      <p>{copy}</p>
    </div>
  );
}

export function ErrorText({ error }: { error: string }) {
  return error ? <p className="notice red">{error}</p> : null;
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
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <div className="modal">
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" onClick={close}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
