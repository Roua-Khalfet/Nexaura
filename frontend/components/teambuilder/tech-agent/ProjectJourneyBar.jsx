import { useEffect, useMemo, useState } from 'react';
import { Sprout, Layers, Network, Map, DollarSign, ShieldCheck, Users, CheckCircle2 } from 'lucide-react';
import { TECH_AGENT_UI, formatTechAgentText } from './i18n';

const copy = TECH_AGENT_UI;

const PHASES = [
  { key: 'discovery',       label: copy.phases.discovery,        Icon: Sprout      },
  { key: 'stack',           label: copy.phases.stack,           Icon: Layers      },
  { key: 'architecture',    label: copy.phases.architecture,    Icon: Network     },
  { key: 'roadmap',         label: copy.phases.roadmap,         Icon: Map         },
  { key: 'cost_feasibility',label: copy.phases.cost_feasibility,Icon: DollarSign  },
  { key: 'security',        label: copy.phases.security,        Icon: ShieldCheck },
  { key: 'handoff',         label: copy.phases.handoff,         Icon: Users       },
];

function toText(value, fallback = '') {
  const txt = String(value ?? '').trim();
  return txt || fallback;
}

export default function ProjectJourneyBar({
  projectState,
  onCompletedPhaseClick,
  onActivePhaseClick,
  highlightedPhase,
}) {
  const state       = projectState && typeof projectState === 'object' ? projectState : {};
  const completedPhases = Array.isArray(state.completed_phases) ? state.completed_phases : [];
  const completedSet    = useMemo(() => new Set(completedPhases), [completedPhases]);
  const currentPhase    = toText(state.current_phase, 'discovery');
  const progress        = Number.isFinite(Number(state.progress)) ? Number(state.progress) : completedPhases.length;
  const totalPhases     = Number.isFinite(Number(state.total_phases)) ? Number(state.total_phases) : PHASES.length;
  const targetPercent   = Math.max(0, Math.min(100, Math.round((progress / Math.max(1, totalPhases)) * 100)));

  const [displayPercent, setDisplayPercent] = useState(targetPercent);

  useEffect(() => {
    const timer = window.setTimeout(() => setDisplayPercent(targetPercent), 620);
    return () => window.clearTimeout(timer);
  }, [targetPercent]);

  const title = toText(state.project_title, copy.untitledProject);
  const progressLabel = formatTechAgentText(copy.journey.progress, {
    progress,
    total: totalPhases,
    percent: displayPercent,
  });

  return (
    <div className="journey-wrap">

      {/* Title row */}
      <div className="journey-topline">
        <span className="journey-title">{title}</span>
        <span className="journey-progress-fraction">{progressLabel}</span>
      </div>

      {/* Stepper */}
      <div className="journey-stepper">
        {PHASES.map((phase, index) => {
          const isCompleted    = completedSet.has(phase.key);
          const isActive       = phase.key === currentPhase;
          const unlockBoundary = completedPhases.length;
          const isLocked       = !isCompleted && !isActive && index > unlockBoundary;
          const canOpenSummary = isCompleted;
          const statusLabel    = isCompleted ? copy.phaseStatus.done : isActive ? copy.phaseStatus.active : copy.phaseStatus.locked;
          const tooltipSummary = toText(state?.decisions?.[phase.key]?.phase_summary);
          const stateClass     = isCompleted ? 'completed' : isActive ? 'active' : isLocked ? 'locked' : '';
          const isLast         = index === PHASES.length - 1;

          return (
            <div key={phase.key} className={`journey-step-item${isLast ? ' last' : ''}`}>

              {/* Node + label */}
              <button
                type="button"
                className={`journey-node-btn${highlightedPhase === phase.key ? ' just-completed' : ''}`}
                title={`${phase.label} • ${statusLabel}${tooltipSummary ? ` • ${tooltipSummary}` : ''}`}
                onClick={() => {
                  if (canOpenSummary) { onCompletedPhaseClick?.(phase.key); return; }
                  if (isActive)       { onActivePhaseClick?.(phase.key); }
                }}
                disabled={isLocked}
              >
                <div className={`journey-node-circle ${stateClass}`}>
                  {isCompleted
                    ? <CheckCircle2 size={15} />
                    : <phase.Icon size={15} />}
                  {isActive && <span className="journey-active-ring" />}
                </div>
                <span className={`journey-node-label ${stateClass}`}>{phase.label}</span>
              </button>

              {/* Connector between this node and the next */}
              {!isLast && (
                <div className="journey-connector">
                  <span
                    className="journey-connector-fill"
                    style={{ width: isCompleted ? '100%' : '0%' }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        .journey-wrap {
          padding: 14px 24px 16px;
          border-bottom: 1px solid var(--tech-border);
          background: transparent;
          flex-shrink: 0;
        }

        /* ── Topline ── */
        .journey-topline {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }

        .journey-title {
          font-size: 12px;
          font-weight: 600;
          color: var(--tech-text);
          letter-spacing: 0.01em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 55%;
        }

        .journey-progress-fraction {
          font-size: 11px;
          color: var(--tech-text-muted);
          font-variant-numeric: tabular-nums;
        }

        /* ── Stepper row ── */
        .journey-stepper {
          display: flex;
          align-items: flex-start;
          width: 100%;
        }

        /* Each item = node-btn + connector (except last) */
        .journey-step-item {
          display: flex;
          align-items: flex-start;
          flex: 1;
        }

        .journey-step-item.last {
          flex: 0 0 auto;
        }

        /* ── Node button ── */
        .journey-node-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 5px;
          background: none;
          border: none;
          padding: 0;
          cursor: default;
          flex-shrink: 0;
        }

        .journey-node-btn.just-completed .journey-node-circle {
          animation: nodePop 0.4s ease;
        }

        @keyframes nodePop {
          0%   { transform: scale(1); }
          50%  { transform: scale(1.14); }
          100% { transform: scale(1); }
        }

        /* ── Circle icon ── */
        .journey-node-circle {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1.5px solid var(--tech-border);
          background: var(--tech-bg-alt);
          color: var(--tech-text-muted);
          transition: border-color 0.2s, background 0.2s, color 0.2s, box-shadow 0.2s;
          position: relative;
          flex-shrink: 0;
        }

        .journey-node-circle.active {
          border-color: rgba(99,102,241,0.55);
          background: rgba(99,102,241,0.09);
          color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.12);
        }

        .journey-node-circle.completed {
          border-color: rgba(16,185,129,0.45);
          background: rgba(16,185,129,0.09);
          color: #059669;
          cursor: pointer;
        }

        .journey-node-btn:not([disabled]):hover .journey-node-circle.completed {
          border-color: rgba(16,185,129,0.7);
          background: rgba(16,185,129,0.14);
        }

        .journey-node-circle.locked {
          opacity: 0.32;
        }

        /* Pulsing ring on the active node */
        .journey-active-ring {
          position: absolute;
          inset: -4px;
          border-radius: 13px;
          border: 1.5px solid rgba(99,102,241,0.4);
          animation: ringPulse 2s ease infinite;
          pointer-events: none;
        }

        @keyframes ringPulse {
          0%, 100% { opacity: 1;   transform: scale(1);    }
          50%       { opacity: 0.4; transform: scale(1.08); }
        }

        /* ── Label ── */
        .journey-node-label {
          font-size: 9px;
          font-weight: 500;
          color: var(--tech-text-muted);
          text-align: center;
          white-space: nowrap;
          line-height: 1.2;
          transition: color 0.2s;
        }

        .journey-node-label.active {
          color: #6366f1;
          font-weight: 600;
        }

        .journey-node-label.completed {
          color: #059669;
        }

        .journey-node-label.locked {
          opacity: 0.35;
        }

        /* ── Connector line ── */
        /*
          margin-top = (circle_height / 2) - (line_height / 2) = (34 / 2) - (2 / 2) = 16px
          This aligns the line horizontally with the circle centers.
        */
        .journey-connector {
          flex: 1;
          height: 2px;
          margin-top: 16px;
          margin-left: 6px;
          margin-right: 6px;
          background: var(--tech-border);
          border-radius: 999px;
          position: relative;
          overflow: hidden;
        }

        .journey-connector-fill {
          display: block;
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, #059669, #34d399);
          border-radius: inherit;
          transition: width 0.7s cubic-bezier(0.4, 0, 0.2, 1);
        }
      `}</style>
    </div>
  );
}
