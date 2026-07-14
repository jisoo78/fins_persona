import React, { useEffect, useRef, useState } from 'react';
import { Check, Clipboard, X } from 'lucide-react';

import { copyTextToClipboard } from '../../utils/clipboard';

type CopyState = 'idle' | 'copied' | 'failed';

type Props = {
  runId: string;
  disabled?: boolean;
};

export const CopyRunIdButton: React.FC<Props> = ({ runId, disabled = false }) => {
  const [state, setState] = useState<CopyState>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const copy = async () => {
    if (disabled || !runId) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    const copied = await copyTextToClipboard(runId);
    setState(copied ? 'copied' : 'failed');
    timerRef.current = setTimeout(() => setState('idle'), 2000);
  };

  const label = state === 'copied' ? '복사됨' : state === 'failed' ? '복사 실패' : '실행 ID 복사';
  const Icon = state === 'copied' ? Check : state === 'failed' ? X : Clipboard;

  return (
    <button
      type="button"
      onClick={() => void copy()}
      disabled={disabled || !runId}
      title={runId || undefined}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
};
