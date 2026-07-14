/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { TabType, Persona, ChatMessage, DecisionRecord, UserSettings } from './types';
import { 
  initialPersonas, 
  initialChatMessages, 
  initialDecisions, 
  initialSettings 
} from './data/mockData';

import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { DashboardView } from './components/DashboardView';
import { InterviewView } from './components/InterviewView';
import { DeepInterviewView } from './components/DeepInterviewView';
import { PersonasView } from './components/PersonasView';
import { PersonaDetailModal } from './components/PersonaDetailModal';
import { EvaluationView } from './components/EvaluationView';
import { EvaluationQuestionReviewView } from './components/EvaluationQuestionReviewView';
import { SettingsView } from './components/SettingsView';
import { NewPersonaModal } from './components/NewPersonaModal';

const activeTabStorageKey = 'decision-active-tab';
const personasStorageKey = 'decision-personas';

const getInitialActiveTab = (): TabType => {
  if (typeof window === 'undefined') return 'dashboard';

  const savedTab = window.localStorage.getItem(activeTabStorageKey) as TabType | null;
  const validTabs: TabType[] = [
    'dashboard',
    'pre-interview',
    'interview',
    'personas',
    'persona-detail',
    'evaluation-review',
    'evaluation',
    'settings',
  ];

  return savedTab && validTabs.includes(savedTab) ? savedTab : 'dashboard';
};

const loadStoredPersonas = (): Persona[] => {
  if (typeof window === 'undefined') return initialPersonas;

  try {
    const raw = window.localStorage.getItem(personasStorageKey);
    return raw ? JSON.parse(raw) as Persona[] : initialPersonas;
  } catch {
    window.localStorage.removeItem(personasStorageKey);
    return initialPersonas;
  }
};

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>(() => getInitialActiveTab());

  // Application Global State
  const [personas, setPersonas] = useState<Persona[]>(() => loadStoredPersonas());
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(initialChatMessages);
  const [decisions, setDecisions] = useState<DecisionRecord[]>(initialDecisions);
  const [settings, setSettings] = useState<UserSettings>(initialSettings);

  // Modal States
  const [detailPersona, setDetailPersona] = useState<Persona | null>(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(activeTabStorageKey, activeTab);
  }, [activeTab]);

  useEffect(() => {
    window.localStorage.setItem(personasStorageKey, JSON.stringify(personas));
  }, [personas]);

  // Handlers
  const handleOpenDetailModal = (persona: Persona) => {
    setDetailPersona(persona);
  };

  const handleCloseDetailModal = () => {
    setDetailPersona(null);
  };

  const handleAddPersona = async (newP: Persona) => {
    setPersonas(prev => [newP, ...prev.filter((persona) => persona.id !== newP.id)]);
  };

  const handleDeletePersona = async (id: string) => {
    if (window.confirm('정말 이 AI 페르소나를 이사회 구성에서 삭제하시겠습니까?')) {
      setPersonas(prev => prev.filter(p => p.id !== id));
    }
  };

  const handleCreateAmyHoodPersona = async () => {
    const response = await fetch('/api/reference-personas/amy-hood-rag', { method: 'POST' });
    const result = await response.json();

    if (!response.ok || !result.ok || !result.persona) {
      throw new Error(result.message ?? 'Amy Hood RAG 페르소나 생성에 실패했습니다.');
    }

    setPersonas(prev => [result.persona, ...prev.filter((persona) => persona.id !== result.persona.id)]);
    return result.persona as Persona;
  };

  const handleAddDecision = (newDec: DecisionRecord) => {
    setDecisions(prev => [newDec, ...prev]);
  };

  return (
    <div id="app-root" className="flex min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans antialiased selection:bg-indigo-500 selection:text-white">
      {/* Sidebar Navigation */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <Topbar />

        {/* Dynamic Route View Content */}
        <main className="flex-1 overflow-y-auto">
          {activeTab === 'dashboard' && (
            <DashboardView
              personas={personas}
              setActiveTab={setActiveTab}
              onOpenNewPersonaModal={() => setIsNewModalOpen(true)}
            />
          )}

          {activeTab === 'pre-interview' && (
            <InterviewView
              messages={chatMessages}
              setMessages={setChatMessages}
              decisions={decisions}
              onCreatePersona={handleAddPersona}
              onAddHistoryRecord={handleAddDecision}
              onGoToPersonas={() => setActiveTab('personas')}
            />
          )}

          {activeTab === 'interview' && (
            <DeepInterviewView setActiveTab={setActiveTab} />
          )}

          {activeTab === 'personas' && (
            <PersonasView
              personas={personas}
              onOpenDetail={handleOpenDetailModal}
              onOpenNewModal={() => setIsNewModalOpen(true)}
              onDeletePersona={handleDeletePersona}
              onCreateAmyHoodPersona={handleCreateAmyHoodPersona}
            />
          )}

          {activeTab === 'evaluation' && (
            <EvaluationView />
          )}

          {activeTab === 'evaluation-review' && (
            <EvaluationQuestionReviewView />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              settings={settings}
              setSettings={setSettings}
            />
          )}
        </main>
      </div>

      {/* Modals */}
      <PersonaDetailModal
        persona={detailPersona}
        onClose={handleCloseDetailModal}
      />

      <NewPersonaModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onAddPersona={handleAddPersona}
      />
    </div>
  );
}
