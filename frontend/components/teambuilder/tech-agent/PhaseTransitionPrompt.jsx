export default function PhaseTransitionPrompt({
  title,
  summary,
  nextPhaseLabel,
  onContinue,
  onDismiss,
}) {
  return (
    <div className="phase-prompt-card">
      <div className="phase-prompt-title">{title || 'Phase complete!'}</div>
      <div className="phase-prompt-summary">{summary || 'The current phase is complete and the next phase is ready.'}</div>
      <div className="phase-prompt-actions">
        <button className="tech-btn tech-btn-primary" onClick={onContinue}>
          Continue to {nextPhaseLabel || 'next phase'} →
        </button>
        <button className="tech-btn" onClick={onDismiss}>Not yet</button>
      </div>
    </div>
  );
}
