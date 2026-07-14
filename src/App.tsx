/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { TabType, Persona, ChatMessage, DecisionRecord, UserSettings, ATrackSection, BTrackSection } from './types';
import { 
  initialPersonas, 
  initialChatMessages, 
  initialDecisions, 
  initialSettings 
} from './data/mockData';

import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { DashboardView } from './components/DashboardView';
import { PersonaDetailModal } from './components/PersonaDetailModal';
import { SettingsView } from './components/SettingsView';
import { NewPersonaModal } from './components/NewPersonaModal';
import { ATrackView } from './components/tracks/ATrackView';
import { BTrackView } from './components/tracks/BTrackView';
import {
  defaultTrackNavigation,
  migrateLegacyTab,
  normalizeTrackNavigation,
} from './navigation/trackNavigation';

const activeTabStorageKey = 'decision-active-tab';
const trackNavigationStorageKey = 'decision-track-navigation';
const personasStorageKey = 'decision-personas';

const getInitialNavigation = () => {
  if (typeof window === 'undefined') return defaultTrackNavigation;

  try {
    const saved = window.localStorage.getItem(trackNavigationStorageKey);
    if (saved) return normalizeTrackNavigation(JSON.parse(saved));
  } catch {
    window.localStorage.removeItem(trackNavigationStorageKey);
  }

  return normalizeTrackNavigation({
    ...defaultTrackNavigation,
    ...migrateLegacyTab(window.localStorage.getItem(activeTabStorageKey)),
  });
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
  const [initialNavigation] = useState(() => getInitialNavigation());
  const [activeTab, setActiveTab] = useState<TabType>(initialNavigation.activeTab);
  const [aTrackSection, setATrackSection] = useState<ATrackSection>(initialNavigation.aTrack);
  const [bTrackSection, setBTrackSection] = useState<BTrackSection>(initialNavigation.bTrack);

  // Application Global State
  const [personas, setPersonas] = useState<Persona[]>(() => loadStoredPersonas());
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(initialChatMessages);
  const [decisions, setDecisions] = useState<DecisionRecord[]>(initialDecisions);
  const [settings, setSettings] = useState<UserSettings>(initialSettings);

  // Modal States
  const [detailPersona, setDetailPersona] = useState<Persona | null>(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(trackNavigationStorageKey, JSON.stringify({
      activeTab,
      aTrack: aTrackSection,
      bTrack: bTrackSection,
    }));
  }, [activeTab, aTrackSection, bTrackSection]);

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

  const handleOpenATrack = (section: ATrackSection) => {
    setATrackSection(section);
    setActiveTab('a-track');
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
              onOpenATrack={handleOpenATrack}
              onOpenNewPersonaModal={() => setIsNewModalOpen(true)}
            />
          )}

          {activeTab === 'a-track' && (
            <ATrackView
              section={aTrackSection}
              onSectionChange={setATrackSection}
              messages={chatMessages}
              setMessages={setChatMessages}
              decisions={decisions}
              personas={personas}
              onCreatePersona={handleAddPersona}
              onAddHistoryRecord={handleAddDecision}
              onOpenDetail={handleOpenDetailModal}
              onOpenNewModal={() => setIsNewModalOpen(true)}
              onDeletePersona={handleDeletePersona}
              onCreateAmyHoodPersona={handleCreateAmyHoodPersona}
            />
          )}

          {activeTab === 'b-track' && (
            <BTrackView section={bTrackSection} onSectionChange={setBTrackSection} />
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
