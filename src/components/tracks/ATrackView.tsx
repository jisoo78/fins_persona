import React from 'react';

import type { ATrackSection, ChatMessage, DecisionRecord, Persona } from '../../types';
import { DeepInterviewView } from '../DeepInterviewView';
import { InterviewView } from '../InterviewView';
import { PersonasView } from '../PersonasView';
import { TrackWorkspaceView } from './TrackWorkspaceView';

type ATrackViewProps = {
  section: ATrackSection;
  onSectionChange: (section: ATrackSection) => void;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  decisions: DecisionRecord[];
  personas: Persona[];
  onCreatePersona: (persona: Persona) => void | Promise<void>;
  onAddHistoryRecord: (record: DecisionRecord) => void;
  onOpenDetail: (persona: Persona) => void;
  onOpenNewModal: () => void;
  onDeletePersona: (id: string) => void;
  onCreateAmyHoodPersona: () => Promise<Persona>;
};

const sections = [
  { id: 'pre-interview', label: '사전 질문' },
  { id: 'deep-interview', label: '심층 인터뷰' },
  { id: 'personas', label: '페르소나' },
] satisfies { id: ATrackSection; label: string }[];

export const ATrackView: React.FC<ATrackViewProps> = ({
  section,
  onSectionChange,
  messages,
  setMessages,
  decisions,
  personas,
  onCreatePersona,
  onAddHistoryRecord,
  onOpenDetail,
  onOpenNewModal,
  onDeletePersona,
  onCreateAmyHoodPersona,
}) => (
  <TrackWorkspaceView
    title="A Track"
    description="사전 질문과 심층 인터뷰를 통해 개인 의사결정 트윈을 구성합니다."
    activeSection={section}
    sections={sections}
    onSectionChange={onSectionChange}
  >
    {section === 'pre-interview' && (
      <InterviewView
        messages={messages}
        setMessages={setMessages}
        decisions={decisions}
        onCreatePersona={onCreatePersona}
        onAddHistoryRecord={onAddHistoryRecord}
        onGoToPersonas={() => onSectionChange('personas')}
      />
    )}
    {section === 'deep-interview' && (
      <DeepInterviewView onBackToPreInterview={() => onSectionChange('pre-interview')} />
    )}
    {section === 'personas' && (
      <PersonasView
        personas={personas}
        onOpenDetail={onOpenDetail}
        onOpenNewModal={onOpenNewModal}
        onDeletePersona={onDeletePersona}
        onCreateAmyHoodPersona={onCreateAmyHoodPersona}
      />
    )}
  </TrackWorkspaceView>
);
