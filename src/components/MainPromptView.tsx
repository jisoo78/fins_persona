import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Power, Save } from 'lucide-react';

import type { PromptVersionDetail, PromptVersionManifest } from '../../shared/amyHoodPromptVersion';
import {
  activatePromptVersion,
  buildPromptVersionOptions,
  getPromptVersion,
  listPromptVersions,
  savePromptVersion,
} from '../services/promptVersionApi';

export const MainPromptView: React.FC = () => {
  const [manifest, setManifest] = useState<PromptVersionManifest | null>(null);
  const [active, setActive] = useState<PromptVersionDetail | null>(null);
  const [editor, setEditor] = useState('');
  const [leftVersionId, setLeftVersionId] = useState('');
  const [rightVersionId, setRightVersionId] = useState('');
  const [leftContent, setLeftContent] = useState('');
  const [rightContent, setRightContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const options = useMemo(
    () => manifest ? buildPromptVersionOptions(manifest) : [],
    [manifest],
  );

  const refresh = useCallback(async () => {
    const response = await listPromptVersions();
    setManifest(response.manifest);
    setActive(response.active);
    setEditor(response.active.content);
    setLeftVersionId((current) => current || response.active.versionId);
    setRightVersionId((current) => current || response.manifest.versions.at(-1)?.versionId || response.active.versionId);
  }, []);

  useEffect(() => {
    setBusy(true);
    refresh()
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Main Prompt를 불러오지 못했습니다.'))
      .finally(() => setBusy(false));
  }, [refresh]);

  useEffect(() => {
    if (!leftVersionId) return;
    getPromptVersion(leftVersionId)
      .then((response) => setLeftContent(response.version.content))
      .catch((caught) => setError(caught instanceof Error ? caught.message : '왼쪽 버전을 불러오지 못했습니다.'));
  }, [leftVersionId]);

  useEffect(() => {
    if (!rightVersionId) return;
    getPromptVersion(rightVersionId)
      .then((response) => setRightContent(response.version.content))
      .catch((caught) => setError(caught instanceof Error ? caught.message : '오른쪽 버전을 불러오지 못했습니다.'));
  }, [rightVersionId]);

  const saveVersion = async () => {
    if (!active || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await savePromptVersion({
        content: editor,
        basedOnVersionId: active.versionId,
      });
      setNotice(`새 버전 ${response.version.versionId}을 저장했습니다. 활성 버전은 변경되지 않았습니다.`);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '새 프롬프트 버전을 저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const activateVersion = async (versionId: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await activatePromptVersion(versionId);
      setNotice(`${versionId}을 활성화했습니다.`);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '프롬프트 버전을 활성화하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {error && (
          <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}
        {notice && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> {notice}
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white">Amy Hood Main Prompt</h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                저장은 새 불변 버전을 만들며, 활성화는 별도 버튼으로만 변경됩니다.
              </p>
              {active && <p className="mt-2 text-xs font-bold text-indigo-600 dark:text-indigo-400">활성 버전: {active.versionId}</p>}
            </div>
            <button
              type="button"
              onClick={() => void saveVersion()}
              disabled={busy || !active}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              새 버전 저장
            </button>
          </div>
          <textarea
            aria-label="Amy Hood Main Prompt 편집기"
            value={editor}
            onChange={(event) => setEditor(event.target.value)}
            disabled={!active}
            spellCheck={false}
            className="mt-5 min-h-[560px] w-full rounded-xl border border-slate-300 bg-slate-50 p-4 font-mono text-xs leading-6 text-slate-800 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-black text-slate-900 dark:text-white">버전 목록</h2>
          <div className="mt-4 space-y-2">
            {options.map((option) => (
              <div key={option.versionId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  <span className="font-bold">{option.versionId}</span>
                  {option.active && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-1 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">활성</span>}
                  <span className="ml-3 text-slate-400">{new Date(option.createdAt).toLocaleString('ko-KR')}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void activateVersion(option.versionId)}
                  disabled={busy || option.active}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200"
                >
                  <Power className="h-3.5 w-3.5" /> 활성화
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-black text-slate-900 dark:text-white">버전 본문 비교</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {[
              { value: leftVersionId, setValue: setLeftVersionId, content: leftContent, label: '왼쪽 버전' },
              { value: rightVersionId, setValue: setRightVersionId, content: rightContent, label: '오른쪽 버전' },
            ].map((side) => (
              <div key={side.label}>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  {side.label}
                  <select
                    value={side.value}
                    onChange={(event) => side.setValue(event.target.value)}
                    className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs dark:border-slate-700 dark:bg-slate-950"
                  >
                    {options.map((option) => <option key={option.versionId} value={option.versionId}>{option.versionId}{option.active ? ' · 활성' : ''}</option>)}
                  </select>
                </label>
                <pre className="mt-3 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-200">{side.content}</pre>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
