import React from 'react';

import type { BTrackSection } from '../../types';
import { EvaluationQuestionReviewView } from '../EvaluationQuestionReviewView';
import { EvaluationReportView } from '../EvaluationReportView';
import { EvaluationView } from '../EvaluationView';
import { MainPromptView } from '../MainPromptView';
import { TrackWorkspaceView } from './TrackWorkspaceView';

type BTrackViewProps = {
  section: BTrackSection;
  onSectionChange: (section: BTrackSection) => void;
};

const sections = [
  { id: 'main-prompt', label: 'Main Prompt' },
  { id: 'question-review', label: '평가 문항 검토' },
  { id: 'evaluation-run', label: '평가 실행' },
  { id: 'reports', label: '평가 리포트' },
] satisfies { id: BTrackSection; label: string }[];

export const BTrackView: React.FC<BTrackViewProps> = ({ section, onSectionChange }) => (
  <TrackWorkspaceView
    title="B Track"
    description="공개 자료로 구성한 Amy Hood 페르소나의 Main Prompt와 평가를 관리합니다."
    activeSection={section}
    sections={sections}
    onSectionChange={onSectionChange}
  >
    {section === 'main-prompt' && <MainPromptView />}
    {section === 'question-review' && <EvaluationQuestionReviewView />}
    {section === 'evaluation-run' && <EvaluationView />}
    {section === 'reports' && <EvaluationReportView />}
  </TrackWorkspaceView>
);
