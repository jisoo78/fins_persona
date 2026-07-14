import type { ATrackSection, BTrackSection, TabType } from '../types';

export type TrackNavigationState = {
  activeTab: TabType;
  aTrack: ATrackSection;
  bTrack: BTrackSection;
};

export const defaultTrackNavigation: TrackNavigationState = {
  activeTab: 'dashboard',
  aTrack: 'pre-interview',
  bTrack: 'main-prompt',
};

const tabs: TabType[] = ['dashboard', 'a-track', 'b-track', 'settings'];
const aTrackSections: ATrackSection[] = ['pre-interview', 'deep-interview', 'personas'];
const bTrackSections: BTrackSection[] = ['main-prompt', 'question-review', 'evaluation-run', 'reports'];

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

export const normalizeTrackNavigation = (value: unknown): TrackNavigationState => {
  if (!isRecord(value)) return { ...defaultTrackNavigation };

  return {
    activeTab: tabs.includes(value.activeTab as TabType)
      ? value.activeTab as TabType
      : defaultTrackNavigation.activeTab,
    aTrack: aTrackSections.includes(value.aTrack as ATrackSection)
      ? value.aTrack as ATrackSection
      : defaultTrackNavigation.aTrack,
    bTrack: bTrackSections.includes(value.bTrack as BTrackSection)
      ? value.bTrack as BTrackSection
      : defaultTrackNavigation.bTrack,
  };
};

export const migrateLegacyTab = (value: unknown): Partial<TrackNavigationState> => {
  switch (value) {
    case 'pre-interview':
      return { activeTab: 'a-track', aTrack: 'pre-interview' };
    case 'interview':
      return { activeTab: 'a-track', aTrack: 'deep-interview' };
    case 'personas':
    case 'persona-detail':
      return { activeTab: 'a-track', aTrack: 'personas' };
    case 'evaluation-review':
      return { activeTab: 'b-track', bTrack: 'question-review' };
    case 'evaluation':
      return { activeTab: 'b-track', bTrack: 'evaluation-run' };
    case 'settings':
    case 'dashboard':
      return { activeTab: value };
    default:
      return {};
  }
};
