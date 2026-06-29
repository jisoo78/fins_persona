import React, { useState } from 'react';
import { Persona, DecisionRecord } from '../types';
import { 
  Sparkles, 
  Send, 
  Users, 
  CheckCircle2, 
  AlertOctagon, 
  Crown, 
  RefreshCw,
  MessageSquare,
  ArrowRight,
  Lightbulb
} from 'lucide-react';

interface AIMeetingViewProps {
  personas: Persona[];
  onAddDecision: (record: DecisionRecord) => void;
}

export const AIMeetingView: React.FC<AIMeetingViewProps> = ({ personas, onAddDecision }) => {
  const [question, setQuestion] = useState('');
  const [meetingState, setMeetingState] = useState<'idle' | 'simulating' | 'concluded'>('idle');
  const [activeParticipants, setActiveParticipants] = useState<string[]>(
    personas.slice(0, 5).map(p => p.name)
  );

  // Mock Result State
  const [resultRecord, setResultRecord] = useState<DecisionRecord | null>(null);

  const handleStartMeeting = () => {
    if (!question.trim()) return;
    setMeetingState('simulating');

    setTimeout(() => {
      const newRec: DecisionRecord = {
        id: `rec-${Date.now()}`,
        date: new Date().toLocaleDateString('ko-KR').replace(/\.\s*/g, '.').slice(0, -1),
        question: question,
        category: '전략 및 리소스 할당',
        participants: activeParticipants,
        timeline: [
          { time: '00:03', speaker: '전략의 마에스트로', role: '전략', content: `"${question}"에 대한 전략적 정답은 시장 점유율 확대를 위한 선제적 공격 베팅입니다. 경쟁사들이 주춤할 때 리드 타임을 2개월 단축해야 합니다.` },
          { time: '00:07', speaker: '냉철한 재무 수호자', role: '재무', content: '공격적 베팅의 현금 소진 속도(Burn rate)가 월 1.5억 원을 초과할 위험이 있습니다. 손익분기점 도출 전까지 예산의 30%는 유보금으로 동결할 것을 조건부 찬성합니다.' },
          { time: '00:11', speaker: '사람 중심 조직 조율사', role: '인사', content: '급격한 일정 단축은 현재 핵심 엔지니어들의 번아웃 임계점을 돌파하게 됩니다. 신규 보상 패키지 혹은 리프레시 휴가 보장안이 선행되어야 합니다.' },
          { time: '00:16', speaker: '무결점 운영 엔지니어', role: '운영', content: '인프라 관점에서 병목은 없습니다. 단, 자동 배포 파이프라인 정비에 1주 소요되므로 실제 액션 개시일은 다음 주 화요일이 타당합니다.' },
          { time: '00:21', speaker: '악마의 대변인 레드팀', role: '레드팀', content: '해당 아키텍처 변경 시 기존 고객 데이터 마이그레이션 중 0.5%의 유실 가능성이 존재합니다. 롤백 시나리오 검증 없이 추진하는 것은 자살행위입니다.' }
        ],
        agreementPoints: [
          '시장 선점 타이밍 자체의 중요성에 대해서는 참석 임원진 전원 공감대 형성',
          '실행 시 인프라 안정성 및 롤백 검증 테스트를 반드시 1주 선행하기로 합의'
        ],
        disagreements: [
          '초기 마케팅 예산 전액 집행(전략) vs 30% 유보금 동결(재무) 간의 자금 운용 시각차',
          '일정 압축에 따른 실무진 보상안 즉시 발표 여부'
        ],
        finalConclusion: '1주일간 데이터 마이그레이션 안전성 테스트와 실무진 인센티브 안을 확정한 뒤, 예산의 80%만 1차 집행하는 단계적 추진안을 채택한다.',
        recommendation: '과감한 비전을 품되 치명적인 하방 리스크(Downside risk)를 완벽하게 헤지한 최적의 이사회 결론입니다. 추진 2주 차 핵심 KPI 달성률이 85% 미만일 경우 즉시 플랜 B 모드로 전환하십시오.',
        impactScore: 'Critical'
      };

      setResultRecord(newRec);
      onAddDecision(newRec);
      setMeetingState('concluded');
    }, 2800);
  };

  const toggleParticipant = (name: string) => {
    setActiveParticipants(prev => 
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-10 animate-fade-in">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/15 to-orange-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-black mb-3 uppercase tracking-wider">
            <Crown className="w-3.5 h-3.5 fill-amber-500" />
            <span>Flagship Pro Feature</span>
          </div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <span>AI 가상 이사회 의사결정 회의</span>
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 font-medium">
            핵심 아젠다를 제시하면 대표님의 사고방식으로 학습된 5대 임원진이 실시간 논쟁과 합의를 도출합니다.
          </p>
        </div>

        {meetingState === 'concluded' && (
          <button
            onClick={() => { setMeetingState('idle'); setQuestion(''); setResultRecord(null); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all"
          >
            <RefreshCw className="w-4 h-4" /> 새로운 아젠다 상정하기
          </button>
        )}
      </div>

      {/* Agenda Input Box */}
      <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-lg relative overflow-hidden">
        <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-amber-500" />
          <span>이번 가상 이사회에 상정할 핵심 질문 및 고민</span>
        </h2>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            disabled={meetingState === 'simulating'}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleStartMeeting()}
            placeholder="예: 신제품 론칭 시점을 한 달 앞당겨 경쟁사를 압도해야 할까요, 아니면 품질 안정화를 위해 예정대로 갈까요?"
            className="flex-1 px-5 py-4 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white placeholder:text-slate-400 transition-all"
          />
          <button
            onClick={handleStartMeeting}
            disabled={!question.trim() || meetingState === 'simulating'}
            className="px-8 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 text-white font-extrabold text-sm shadow-xl shadow-indigo-500/25 flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] shrink-0"
          >
            <Sparkles className="w-4 h-4 text-amber-300 animate-spin" style={{ animationDuration: '4s' }} />
            <span>회의 소집 및 추론</span>
          </button>
        </div>

        {/* Participant Selection Bar */}
        <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
            <Users className="w-4 h-4 text-indigo-500" />
            <span>참석 임원진 선택 ({activeParticipants.length}명 활성):</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {personas.slice(0, 5).map((p) => {
              const active = activeParticipants.includes(p.name);
              return (
                <button
                  key={p.id}
                  onClick={() => toggleParticipant(p.name)}
                  disabled={meetingState === 'simulating'}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 ${
                    active
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-400 text-indigo-600 dark:text-indigo-300 shadow-sm'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-indigo-500' : 'bg-slate-300'}`}></span>
                  <span>{p.role} ({p.name.split(' ')[0]})</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Simulating Animation State */}
      {meetingState === 'simulating' && (
        <div className="py-20 text-center bg-white dark:bg-slate-900/50 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-6 animate-pulse">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-600/10 flex items-center justify-center text-indigo-500">
            <RefreshCw className="w-8 h-8 animate-spin" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-800 dark:text-slate-100">
              5대 AI 임원진이 대표님의 가치관 알고리즘을 대조하며 논의 중입니다...
            </h3>
            <p className="text-xs text-slate-500 mt-2 max-w-md mx-auto">
              전략적 리스크, 손익분기 시뮬레이션, 인적 자본 리텐션 및 보안 규제 쟁점을 종합 연산하고 있습니다.
            </p>
          </div>

          {/* Participant Cards Pulse Preview */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 max-w-4xl mx-auto px-6 pt-4">
            {activeParticipants.map((name, i) => (
              <div key={i} className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-[11px] font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                🗣️ {name.split(' ')[0]} 발언 준비 중
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Discussion Results Output */}
      {meetingState === 'concluded' && resultRecord && (
        <div className="space-y-8 animate-fade-in">
          
          {/* Highlighted Final Recommendation Card (Stitch Flagship Req) */}
          <div className="p-1 rounded-3xl bg-gradient-to-r from-amber-500 via-indigo-500 to-violet-600 shadow-2xl">
            <div className="bg-white dark:bg-slate-900 p-8 sm:p-10 rounded-[22px] space-y-4">
              <div className="flex items-center justify-between">
                <span className="px-3 py-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                  <Crown className="w-3.5 h-3.5 fill-white" /> AI 이사회 최종 권고안
                </span>
                <span className="text-xs font-bold text-slate-400">집단 지성 신뢰도 98.4%</span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-snug pt-2">
                "{resultRecord.finalConclusion}"
              </h2>

              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 font-medium leading-relaxed bg-slate-50 dark:bg-slate-800/60 p-5 rounded-2xl border border-slate-100 dark:border-slate-800">
                💡 <strong className="text-slate-900 dark:text-white">실행 가이드라인: </strong> {resultRecord.recommendation}
              </p>
            </div>
          </div>

          {/* Agreement vs Disagreements Bento Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Agreements */}
            <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 p-6 rounded-3xl space-y-4">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-400 font-extrabold text-sm">
                <CheckCircle2 className="w-5 h-5" />
                <h3>임원진 전원 만장일치 합의 사항</h3>
              </div>
              <ul className="space-y-3">
                {resultRecord.agreementPoints.map((pt, idx) => (
                  <li key={idx} className="bg-white dark:bg-slate-900/80 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-900/40 text-xs font-bold text-slate-800 dark:text-slate-200 shadow-sm flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-300 flex items-center justify-center shrink-0 mt-0.5 text-[10px]">✓</span>
                    <span className="leading-relaxed">{pt}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Disagreements */}
            <div className="bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 p-6 rounded-3xl space-y-4">
              <div className="flex items-center gap-2 text-rose-800 dark:text-rose-400 font-extrabold text-sm">
                <AlertOctagon className="w-5 h-5" />
                <h3>첨예하게 대립한 쟁점 및 갈등 포인트</h3>
              </div>
              <ul className="space-y-3">
                {resultRecord.disagreements.map((dis, idx) => (
                  <li key={idx} className="bg-white dark:bg-slate-900/80 p-4 rounded-2xl border border-rose-100 dark:border-rose-900/40 text-xs font-bold text-slate-800 dark:text-slate-200 shadow-sm flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-rose-100 dark:bg-rose-900 text-rose-600 dark:text-rose-300 flex items-center justify-center shrink-0 mt-0.5 text-[10px]">⚡</span>
                    <span className="leading-relaxed">{dis}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Discussion Timeline */}
          <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
            <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-indigo-500" />
              <span>실시간 의사결정 발언 타임라인</span>
            </h3>

            <div className="space-y-4 relative before:absolute before:inset-0 before:left-6 before:w-0.5 before:bg-slate-100 dark:before:bg-slate-800">
              {resultRecord.timeline.map((t, idx) => (
                <div key={idx} className="relative flex items-start gap-4 pl-3">
                  <div className="w-7 h-7 rounded-full bg-indigo-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0 z-10 ring-4 ring-white dark:ring-slate-900 shadow-sm">
                    {t.role.slice(0, 1)}
                  </div>

                  <div className="flex-1 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 hover:border-indigo-300 transition-colors">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold text-slate-900 dark:text-white">{t.speaker}</span>
                        <span className="px-1.5 py-0.2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-[9px] font-bold">
                          {t.role}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">{t.time}</span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                      {t.content}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
