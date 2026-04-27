import { X } from 'lucide-react';

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
          <button className="tech-btn tech-btn-icon" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>

        <div className="decision-summary">
          {summary || 'No summary captured yet for this phase.'}
        </div>

        <div className="decision-grid">
          {entries.length > 0 ? entries.map((entry) => (
            <div className="decision-row" key={`${phaseKey}-${entry.key}`}>
              <span className="decision-key">{entry.key.replace(/_/g, ' ')}</span>
              <span className="decision-value">{entry.value}</span>
            </div>
          )) : <div className="tech-empty-note">No decisions captured yet.</div>}
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="tech-btn tech-btn-primary" onClick={() => onRevisit?.(phaseKey)}>
            Revisit this phase
          </button>
          <button className="tech-btn" onClick={() => onExport?.(phaseKey)}>
            Export decisions
          </button>
        </div>
      </aside>
    </div>
  );
}
