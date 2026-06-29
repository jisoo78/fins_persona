/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
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
import { DecisionChatView } from './components/DecisionChatView';
import { InterviewView } from './components/InterviewView';
import { PersonasView } from './components/PersonasView';
import { PersonaDetailModal } from './components/PersonaDetailModal';
import { AIMeetingView } from './components/AIMeetingView';
import { HistoryView } from './components/HistoryView';
import { SettingsView } from './components/SettingsView';
import { NewPersonaModal } from './components/NewPersonaModal';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');

  // Application Global State
  const [personas, setPersonas] = useState<Persona[]>(initialPersonas);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(initialChatMessages);
  const [decisions, setDecisions] = useState<DecisionRecord[]>(initialDecisions);
  const [settings, setSettings] = useState<UserSettings>(initialSettings);

  // Modal States
  const [detailPersona, setDetailPersona] = useState<Persona | null>(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);

  // Handlers
  const handleOpenDetailModal = (persona: Persona) => {
    setDetailPersona(persona);
  };

  const handleCloseDetailModal = () => {
    setDetailPersona(null);
  };

  const handleAddPersona = (newP: Persona) => {
    setPersonas(prev => [newP, ...prev]);
  };

  const handleDeletePersona = (id: string) => {
    if (window.confirm('정말 이 AI 페르소나를 이사회 구성에서 삭제하시겠습니까?')) {
      setPersonas(prev => prev.filter(p => p.id !== id));
    }
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
        <Topbar settings={settings} />

        {/* Dynamic Route View Content */}
        <main className="flex-1 overflow-y-auto">
          {activeTab === 'dashboard' && (
            <DashboardView
              personas={personas}
              decisions={decisions}
              setActiveTab={setActiveTab}
              onOpenNewPersonaModal={() => setIsNewModalOpen(true)}
            />
          )}

          {activeTab === 'decision-chat' && (
            <DecisionChatView personas={personas} />
          )}

          {activeTab === 'interview' && (
            <InterviewView
              messages={chatMessages}
              setMessages={setChatMessages}
              decisions={decisions}
              onCreatePersona={handleAddPersona}
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

          {activeTab === 'ai-meeting' && (
            <AIMeetingView
              personas={personas}
              onAddDecision={handleAddDecision}
            />
          )}

          {activeTab === 'history' && (
            <HistoryView decisions={decisions} />
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
