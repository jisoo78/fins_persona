import React, { useState } from 'react';
import { Persona, RoleType } from '../types';
import { X, Plus, Sparkles, Shield, Brain, Users } from 'lucide-react';

interface NewPersonaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddPersona: (newPersona: Persona) => void | Promise<void>;
}

export const NewPersonaModal: React.FC<NewPersonaModalProps> = ({
  isOpen,
  onClose,
  onAddPersona
}) => {
  const [name, setName] = useState('');
  const [role, setRole] = useState<RoleType>('전략');
  const [badge, setBadge] = useState('');
  const [description, setDescription] = useState('');
  const [decisionStyle, setDecisionStyle] = useState('');
  const [coreValues, setCoreValues] = useState('');
  const [strengths, setStrengths] = useState('');
  const [weaknesses, setWeaknesses] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim() || isSaving) return;

    setIsSaving(true);
    setSaveError('');

    const valuesList = coreValues.split(',').map(v => v.trim()).filter(Boolean);
    const strList = strengths.split(',').map(v => v.trim()).filter(Boolean);
    const wkList = weaknesses.split(',').map(v => v.trim()).filter(Boolean);

    const newP: Persona = {
      id: `p-${Date.now()}`,
      name,
      role,
      iconName: 'Sparkles',
      badge: badge || '신규 임원',
      description,
      status: 'active',
      createdAt: new Date().toLocaleDateString('ko-KR').replace(/\.\s*/g, '.').slice(0, -1),
      updatedAt: '방금 전',
      decisionStyle: decisionStyle || '확인 필요',
      coreValues: valuesList,
      strengths: strList,
      weaknesses: wkList,
      communicationStyle: '확인 필요',
      sampleConversations: [],
      colorClass: 'text-violet-600 dark:text-violet-400',
      bgClass: 'bg-violet-50 dark:bg-violet-950/40 border-violet-200 dark:border-violet-800'
    };

    try {
      await onAddPersona(newP);
      onClose();
      // Reset
      setName('');
      setDescription('');
      setBadge('');
      setDecisionStyle('');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '페르소나 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl flex flex-col">
        <div className="p-6 px-8 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600 text-white">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">새 AI 페르소나 생성</h2>
              <span className="text-[11px] text-slate-500 font-medium">경영진의 고유한 사고방식을 대변할 가상 이사회 임원을 탄생시킵니다.</span>
            </div>
          </div>
            <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6 overflow-y-auto max-h-[75vh]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">페르소나 이름 *</label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="예: 글로벌 마케팅 파괴자"
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">전문 도메인 역할 *</label>
              <select
                value={role}
                onChange={e => setRole(e.target.value as RoleType)}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="전략">전략 (Strategy)</option>
                <option value="재무">재무 (Finance)</option>
                <option value="인사">인사 (HR)</option>
                <option value="운영">운영 (Operations)</option>
                <option value="레드팀">레드팀 (Red Team)</option>
                <option value="커스텀">커스텀 (Custom Executive)</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">핵심 관점 태그 / 배지</label>
            <input
              type="text"
              value={badge}
              onChange={e => setBadge(e.target.value)}
              placeholder="예: 해외 리테일 확장 우선"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">알고리즘 상세 설명 *</label>
            <textarea
              required
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="예: 해외 신규 브랜드 인수합병 시 마진 구조와 현지 리테일 유통망의 확장성을 최우선으로 검증하는 임원입니다."
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-normal text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">고유 의사결정 스타일 (Decision Style)</label>
            <input
              type="text"
              value={decisionStyle}
              onChange={e => setDecisionStyle(e.target.value)}
              placeholder="예: AB 테스트 기반의 빠른 초기 검증 후 스케일업 원칙"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">판단 기준 핵심 가치 (콤마로 구분)</label>
            <input
              type="text"
              value={coreValues}
              onChange={e => setCoreValues(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-emerald-600 dark:text-emerald-400">주요 강점 (콤마 구분)</label>
              <input
                type="text"
                value={strengths}
                onChange={e => setStrengths(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-rose-600 dark:text-rose-400">사각지대 및 약점 (콤마 구분)</label>
              <input
                type="text"
                value={weaknesses}
                onChange={e => setWeaknesses(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3">
            {saveError && (
              <div className="mr-auto rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300">
                {saveError}
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white font-black text-xs shadow-lg shadow-indigo-500/25 transition-all flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>{isSaving ? '저장 중...' : '페르소나 즉시 론칭'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
