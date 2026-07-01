/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { TabType, Persona, ChatMessage, DecisionRecord, UserSettings, PreInterviewContext } from './types';
import { 
  initialPersonas, 
  initialChatMessages, 
  initialDecisions, 
  initialSettings 
} from './data/mockData';

import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { DashboardView } from './components/DashboardView';
import { PreQuestionView } from './components/PreQuestionView';
import { InterviewView } from './components/InterviewView';
import { PersonasView } from './components/PersonasView';
import { PersonaDetailModal } from './components/PersonaDetailModal';
import { HistoryView } from './components/HistoryView';
import { SettingsView } from './components/SettingsView';
import { NewPersonaModal } from './components/NewPersonaModal';

const activeTabStorageKey = 'decision-active-tab';

const getInitialActiveTab = (): TabType => {
  if (typeof window === 'undefined') return 'dashboard';

  const savedTab = window.localStorage.getItem(activeTabStorageKey) as TabType | null;
  const validTabs: TabType[] = ['dashboard', 'pre-question', 'interview', 'personas', 'persona-detail', 'history', 'settings'];

  return savedTab && validTabs.includes(savedTab) ? savedTab : 'dashboard';
};

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>(() => getInitialActiveTab());

  // Application Global State
  const [personas, setPersonas] = useState<Persona[]>(initialPersonas);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(initialChatMessages);
  const [decisions, setDecisions] = useState<DecisionRecord[]>(initialDecisions);
  const [settings, setSettings] = useState<UserSettings>(initialSettings);
  const [selectedDecisionId, setSelectedDecisionId] = useState<string | null>(null);
  const [preInterviewContext, setPreInterviewContext] = useState<PreInterviewContext | null>(null);

  // Modal States
  const [detailPersona, setDetailPersona] = useState<Persona | null>(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(activeTabStorageKey, activeTab);
  }, [activeTab]);

  const loadDatabaseData = useCallback(async () => {
    try {
      const [historyResponse, personasResponse] = await Promise.all([
        fetch('/api/history-records'),
        fetch('/api/personas'),
      ]);
      const historyResult = await historyResponse.json();
      const personasResult = await personasResponse.json();

      if (historyResponse.ok && historyResult.ok) {
        setDecisions((current) => {
          const seenIds = new Set<string>();
          const merged = [...historyResult.records, ...current].filter((record: DecisionRecord) => {
            if (seenIds.has(record.id)) return false;
            seenIds.add(record.id);
            return true;
          });

          return merged;
        });
      }

      if (personasResponse.ok && personasResult.ok) {
        setPersonas((current) => {
          const seenIds = new Set<string>();
          const merged = [...personasResult.personas, ...current].filter((persona: Persona) => {
            if (seenIds.has(persona.id)) return false;
            seenIds.add(persona.id);
            return true;
          });

          return merged;
        });
      }
    } catch (error) {
      console.warn('Failed to load database records', error);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadInitialData = async () => {
      if (cancelled) return;
      await loadDatabaseData();
    };

    void loadInitialData();

    return () => {
      cancelled = true;
    };
  }, [loadDatabaseData]);

  // Handlers
  const handleOpenDetailModal = (persona: Persona) => {
    setDetailPersona(persona);
  };

  const handleCloseDetailModal = () => {
    setDetailPersona(null);
  };

  const handleAddPersona = async (newP: Persona) => {
    const response = await fetch('/api/personas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newP),
    });
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.message ?? '페르소나 DB 저장에 실패했습니다.');
    }

    setPersonas(prev => [result.persona, ...prev.filter((persona) => persona.id !== result.persona.id)]);
  };

  const handleDeletePersona = async (id: string) => {
    if (window.confirm('정말 이 AI 페르소나를 이사회 구성에서 삭제하시겠습니까?')) {
      if (!id.startsWith('p-')) {
        try {
          await fetch(`/api/personas/${id}`, { method: 'DELETE' });
        } catch (error) {
          console.warn('Failed to delete persona from database', error);
        }
      }

      setPersonas(prev => prev.filter(p => p.id !== id));
    }
  };

  const handleAddDecision = (newDec: DecisionRecord) => {
    setDecisions(prev => [newDec, ...prev]);
  };

  const handleOpenDecisionRecord = (decisionId: string) => {
    setSelectedDecisionId(decisionId);
    setActiveTab('history');
    void loadDatabaseData();
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
              decisions={decisions}
              setActiveTab={setActiveTab}
              onOpenNewPersonaModal={() => setIsNewModalOpen(true)}
              onOpenDecisionRecord={handleOpenDecisionRecord}
            />
          )}

          {activeTab === 'pre-question' && (
            <PreQuestionView
              completedContext={preInterviewContext}
              onComplete={(context) => setPreInterviewContext(context)}
              onStartDeepInterview={() => setActiveTab('interview')}
            />
          )}

          {activeTab === 'interview' && (
            <InterviewView
              messages={chatMessages}
              setMessages={setChatMessages}
              decisions={decisions}
              preInterviewContext={preInterviewContext}
              onGoToPreQuestion={() => setActiveTab('pre-question')}
              onCreatePersona={handleAddPersona}
              onAddHistoryRecord={handleAddDecision}
              onGoToPersonas={() => setActiveTab('personas')}
            />
          )}

          {activeTab === 'personas' && (
            <PersonasView
              personas={personas}
              onOpenDetail={handleOpenDetailModal}
              onOpenNewModal={() => setIsNewModalOpen(true)}
              onDeletePersona={handleDeletePersona}
            />
          )}

          {activeTab === 'history' && (
            <HistoryView
              decisions={decisions}
              selectedDecisionId={selectedDecisionId}
              onClearSelectedDecision={() => setSelectedDecisionId(null)}
            />
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
