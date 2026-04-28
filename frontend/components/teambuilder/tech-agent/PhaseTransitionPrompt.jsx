import { TECH_AGENT_UI, formatTechAgentText } from './i18n';

const copy = TECH_AGENT_UI;

export default function PhaseTransitionPrompt({
  title,
  summary,
  nextPhaseLabel,
  onContinue,
  onDismiss,
}) {
  return (
    <div className="phase-prompt-card">
      <div className="phase-prompt-title">{title || copy.phasePrompt.title}</div>
      <div className="phase-prompt-summary">{summary || copy.phasePrompt.summary}</div>
      <div className="phase-prompt-actions">
        <button className="tech-btn tech-btn-primary" onClick={onContinue}>
          {formatTechAgentText(copy.buttons.continueTo, { phase: nextPhaseLabel || copy.header.phaseLabel })}
        </button>
        <button className="tech-btn" onClick={onDismiss}>{copy.buttons.notYet}</button>
      </div>
    </div>
  );
}
