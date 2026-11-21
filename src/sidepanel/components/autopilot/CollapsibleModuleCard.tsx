import React from 'react';

const ChevronIcon: React.FC = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

export interface CollapsibleModuleProps {
  id: string;
  variant: string;
  kanji: string;
  kanjiTone: string;
  title: string;
  summary: string;
  switchId: string;
  checked: boolean;
  expanded: boolean;
  onToggleExpand: (id: string) => void;
  onToggleSwitch: (checked: boolean) => void;
  children: React.ReactNode;
}

/** Shared accordion module card used across the Autopilot cockpit. */
export const CollapsibleModuleCard: React.FC<CollapsibleModuleProps> = ({
  id, variant, kanji, kanjiTone, title, summary, switchId,
  checked, expanded, onToggleExpand, onToggleSwitch, children
}) => (
  <div className={`module-card module-card--${variant} ${expanded ? 'is-expanded' : ''}`}>
    <div className="switch-row module-card__head">
      <button type="button" className="module-card__toggle" aria-expanded={expanded} onClick={() => onToggleExpand(id)}>
        <span className={`kanji-box kanji-box--${kanjiTone}`} aria-hidden="true">{kanji}</span>
        <span className="module-card__titles">
          <span className="module-card__title">{title}</span>
          <span className="module-card__summary mono-stat">{summary}</span>
        </span>
      </button>
      <div className="module-card__controls">
        <button type="button" className={`module-card__toggle-btn ${expanded ? 'is-open' : ''}`} aria-expanded={expanded} onClick={() => onToggleExpand(id)}>
          <span>Options</span><ChevronIcon />
        </button>
        <input type="checkbox" role="switch" id={switchId} aria-label={title} className="switch switch--sm" checked={checked} onChange={(e) => onToggleSwitch(e.target.checked)} />
      </div>
    </div>
    {expanded && <div className="module-card__body">{children}</div>}
  </div>
);
