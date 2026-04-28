import { X } from 'lucide-react';
import { TECH_AGENT_UI } from './i18n';

const copy = TECH_AGENT_UI;

function normalizeEntries(phaseData) {
  if (!phaseData || typeof phaseData !== 'object') return [];
  return Object.entries(phaseData)
    .filter(([key, value]) => key !== 'phase_summary' && value !== null && value !== undefined && String(value).trim() !== '')
    .map(([key, value]) => ({ key, value: typeof value === 'string' ? value : JSON.stringify(value) }));
}

export default function DecisionSummaryDrawer({
  open,
  phaseKey,
  phaseLabel,
  phaseData,
  onClose,
  onRevisit,
  onExport,
}) {
  const entries = normalizeEntries(phaseData);
  const summary = typeof phaseData?.phase_summary === 'string' ? phaseData.phase_summary : '';

  return (
    <div className={`decision-drawer-backdrop ${open ? 'open' : ''}`} onClick={onClose}>
      <aside className="decision-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="decision-drawer-head">
          <div className="decision-drawer-title">{phaseLabel || phaseKey}</div>
          <button className="tech-btn tech-btn-icon" onClick={onClose} title={copy.buttons.close}>
            <X size={16} />
          </button>
        </div>

        <div className="decision-summary">
          {summary || copy.errors.noDecisions}
        </div>

        <div className="decision-grid">
          {entries.length > 0 ? entries.map((entry) => (
            <div className="decision-row" key={`${phaseKey}-${entry.key}`}>
              <span className="decision-key">{entry.key.replace(/_/g, ' ')}</span>
              <span className="decision-value">{entry.value}</span>
            </div>
          )) : <div className="tech-empty-note">{copy.errors.noDecisions}</div>}
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="tech-btn tech-btn-primary" onClick={() => onRevisit?.(phaseKey)}>
            {copy.buttons.revisit}
          </button>
          <button className="tech-btn" onClick={() => onExport?.(phaseKey)}>
            {copy.buttons.export}
          </button>
        </div>
      </aside>
    </div>
  );
}
