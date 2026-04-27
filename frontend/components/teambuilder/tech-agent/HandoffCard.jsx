function pickValue(value, fallback = '-') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

export default function HandoffCard({ founderContext, projectState, teamRoles = [], onPostJobs, onFindCandidates }) {
  const discovery = projectState?.decisions?.discovery || {};
  const stack = projectState?.decisions?.stack || {};

  const industry = pickValue(discovery.industry || founderContext?.industry);
  const phase = pickValue(discovery.phase || founderContext?.phase);
  const teamSize = pickValue(discovery.team_size || founderContext?.team_size);

  const stackSummary = [stack.frontend, stack.backend, stack.database]
    .filter(Boolean)
    .join(' + ');

  const hasRoles = Array.isArray(teamRoles) && teamRoles.length > 0;
  const roleCount = hasRoles ? teamRoles.length : 0;

  // Collect unique skills across all recommended roles
  const skillSet = hasRoles
    ? [...new Set(teamRoles.flatMap((r) => Array.isArray(r.key_skills) ? r.key_skills : []))]
    : [];

  return (
    <div className="handoff-card">
      <div className="handoff-title">Project blueprint complete</div>
      <div className="handoff-summary">
        Industry: {industry} &nbsp;·&nbsp; Stack: {pickValue(stackSummary)}<br />
        Phase: {phase} &nbsp;·&nbsp; Team size needed: {teamSize}
      </div>

      {/* Role chips — visible once team_building data arrives */}
      {hasRoles && (
        <div className="handoff-roles">
          {teamRoles.map((role, i) => (
            <span key={i} className="handoff-role-chip">
              <span className={`handoff-role-seniority handoff-seniority-${role.seniority || 'mid'}`}>
                {role.seniority || 'mid'}
              </span>
              {role.title}
            </span>
          ))}
        </div>
      )}

      {!hasRoles && (
        <div className="handoff-waiting">
          <span className="handoff-waiting-dot" />
          Continue the conversation to generate your team blueprint…
        </div>
      )}

      <div className="handoff-actions">
        <button
          className="tech-btn tech-btn-primary"
          disabled={!hasRoles}
          title={hasRoles ? `Post ${roleCount} role${roleCount !== 1 ? 's' : ''} as open job listings` : 'Finish the Team Building phase to unlock'}
          onClick={() => hasRoles && onPostJobs?.(teamRoles)}
        >
          {hasRoles ? `Post ${roleCount} Job Listing${roleCount !== 1 ? 's' : ''} →` : 'Post Job Listings'}
        </button>

        <button
          className="tech-btn tech-btn-secondary"
          disabled={!hasRoles}
          title={hasRoles ? `Search candidates matching ${skillSet.length} skills` : 'Finish the Team Building phase to unlock'}
          onClick={() => hasRoles && onFindCandidates?.(teamRoles)}
        >
          {hasRoles ? `Find Candidates (${skillSet.length} skills) →` : 'Find Matching Candidates'}
        </button>
      </div>

      <style>{`
        .handoff-card {
          margin-top: 10px;
          padding: 16px 18px;
          border-radius: 12px;
          border: 1px solid var(--tech-border);
          background: var(--tech-bg-alt);
        }

        .handoff-title {
          font-size: 13px;
          font-weight: 700;
          color: var(--tech-text);
          margin-bottom: 6px;
        }

        .handoff-summary {
          font-size: 12px;
          color: var(--tech-text-muted);
          line-height: 1.6;
          margin-bottom: 12px;
        }

        .handoff-roles {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 14px;
        }

        .handoff-role-chip {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          font-weight: 500;
          padding: 3px 10px 3px 4px;
          border-radius: 999px;
          border: 1px solid var(--tech-border);
          background: var(--tech-bg);
          color: var(--tech-text);
          white-space: nowrap;
        }

        .handoff-role-seniority {
          font-size: 9px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 999px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .handoff-seniority-junior  { background: #16a34a; color: #fff; }
        .handoff-seniority-mid     { background: #ca8a04; color: #fff; }
        .handoff-seniority-senior  { background: #dc2626; color: #fff; }

        .handoff-waiting {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 11px;
          color: var(--tech-text-muted);
          margin-bottom: 14px;
          opacity: 0.7;
        }

        .handoff-waiting-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--tech-text-muted);
          animation: handoffPulse 1.6s ease-in-out infinite;
          flex-shrink: 0;
        }

        @keyframes handoffPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.8); }
        }

        .handoff-actions {
          display: flex;
          gap: 8px;
        }

        .handoff-actions .tech-btn {
          flex: 1;
        }

        .handoff-actions .tech-btn:disabled {
          opacity: 0.38;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
