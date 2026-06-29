import React from 'react';
import { UserSettings } from '../types';
import { 
  Settings, 
  User, 
  Sliders, 
  Share2, 
  Globe, 
  CreditCard, 
  Save, 
  Check, 
  Crown,
  ShieldCheck
} from 'lucide-react';

interface SettingsViewProps {
  settings: UserSettings;
  setSettings: React.Dispatch<React.SetStateAction<UserSettings>>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ settings, setSettings }) => {
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    alert('설정이 성공적으로 저장되었습니다.');
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-10 animate-fade-in">
      {/* Title Header */}
      <div className="pb-6 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
          <Settings className="w-7 h-7 text-indigo-500" />
          <span>환경 설정 및 의사결정 OS 관리</span>
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
          대표님의 프로필 정보, AI 이사회 알고리즘 가중치 및 Enterprise 구독을 구성합니다.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-10">
        
        {/* Section 1: Profile */}
        <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          <h2 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
            <User className="w-4 h-4 text-indigo-500" />
            <span>임원 프로필 정보</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400">이름</label>
              <input
                type="text"
                value={settings.name}
                onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400">직책 및 직급</label>
              <input
                type="text"
                value={settings.role}
                onChange={(e) => setSettings({ ...settings, role: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400">회사명</label>
              <input
                type="text"
                value={settings.company}
                onChange={(e) => setSettings({ ...settings, company: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400">업무 이메일</label>
              <input
                type="email"
                disabled
                value={settings.email}
                className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-500 cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* Section 2: AI Preferences */}
        <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          <h2 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Sliders className="w-4 h-4 text-emerald-500" />
            <span>AI 가상 이사회 추론 파라미터 (AI Preferences)</span>
          </h2>

          <div className="space-y-6">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400">활성 추론 모델 엔진</label>
              <select
                value={settings.aiModel}
                onChange={(e) => setSettings({ ...settings, aiModel: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="Gemini 2.5 Pro Executive Enterprise">Gemini 2.5 Pro Executive Enterprise (최고성능 의사결정 특화)</option>
                <option value="Gemini 2.5 Flash Strategy">Gemini 2.5 Flash Strategy (고속 린 분석)</option>
              </select>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-slate-700 dark:text-slate-300">비대칭 시나리오 창의성 가중치 (Creativity Level)</span>
                <span className="text-indigo-600 dark:text-indigo-400">{settings.creativityLevel}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                value={settings.creativityLevel}
                onChange={(e) => setSettings({ ...settings, creativityLevel: Number(e.target.value) })}
                className="w-full accent-indigo-600 cursor-pointer"
              />
              <span className="text-[10px] text-slate-400 block">낮을수록 정량적 엑셀 데이터 준수, 높을수록 파괴적 대안 발굴</span>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-slate-700 dark:text-slate-300">경영 리스크 감수 한계선 (Risk Tolerance)</span>
                <span className="text-emerald-600 dark:text-emerald-400">{settings.riskTolerance}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={settings.riskTolerance}
                onChange={(e) => setSettings({ ...settings, riskTolerance: Number(e.target.value) })}
                className="w-full accent-emerald-600 cursor-pointer"
              />
              <span className="text-[10px] text-slate-400 block">레드팀의 비판 강도를 조절합니다.</span>
            </div>
          </div>
        </div>

        {/* Section 3: Connected SNS & Integrations */}
        <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          <h2 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Share2 className="w-4 h-4 text-blue-500" />
            <span>외부 워크스페이스 연동 (Connected SNS & Tools)</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { id: 'linkedin', label: 'LinkedIn Executive Network', desc: '경영 업계 트렌드 동기화', key: 'linkedin' as const },
              { id: 'slack', label: 'Slack Workspace Board Alert', desc: '이사회 소집 알림 봇 연동', key: 'slack' as const },
              { id: 'notion', label: 'Notion Strategy Wiki Sync', desc: '페르소나 가치관 자동 동기화', key: 'notion' as const },
              { id: 'googleWorkspace', label: 'Google Workspace Docs & Drive', desc: '재무 시트 실시간 읽기', key: 'googleWorkspace' as const }
            ].map((item) => {
              const checked = settings.connectedSNS[item.key];
              return (
                <div key={item.id} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white block">{item.label}</span>
                    <span className="text-[10px] text-slate-400">{item.desc}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSettings({
                      ...settings,
                      connectedSNS: { ...settings.connectedSNS, [item.key]: !checked }
                    })}
                    className={`w-11 h-6 rounded-full transition-colors relative px-1 ${
                      checked ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`}></div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 4: Subscription & Plan */}
        <div className="p-8 rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white shadow-xl border border-indigo-500/30 space-y-6 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-amber-400 fill-amber-400" />
              <h2 className="text-base font-black text-white tracking-tight">현재 플랜: Pro Enterprise Board Edition</h2>
            </div>
            <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold uppercase">
              결제 활성됨
            </span>
          </div>

          <p className="text-xs text-indigo-200/80 max-w-xl leading-relaxed">
            무제한 페르소나 생성, AI 5인 가상 이사회 회의 가동(Pro), SOC2 감사 로그 보관 및 Google Stitch 전용 전용 인프라 할당이 포함되어 있습니다.
          </p>

          <div className="pt-2 flex items-center justify-between border-t border-white/10 text-xs">
            <span className="text-slate-400">다음 결제일: 2026년 7월 28일 (₩290,000 / 월)</span>
            <button type="button" className="text-amber-400 hover:underline font-bold">
              구독 플랜 변경 및 영수증 다운로드
            </button>
          </div>
        </div>

        {/* Save Actions Bottom */}
        <div className="flex justify-end pt-4">
          <button
            type="submit"
            className="px-8 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs shadow-lg shadow-indigo-500/25 transition-all flex items-center gap-2 hover:scale-[1.02]"
          >
            <Save className="w-4 h-4" />
            <span>변경사항 저장하기</span>
          </button>
        </div>
      </form>
    </div>
  );
};
