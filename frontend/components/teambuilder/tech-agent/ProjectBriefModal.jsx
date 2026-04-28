import { Download, Copy, X } from 'lucide-react';
import { TECH_AGENT_UI, formatTechAgentText } from './i18n';

const copy = TECH_AGENT_UI;

const PHASES = [
  { key: 'discovery', label: copy.phases.discovery, icon: '🌱' },
  { key: 'stack', label: copy.phases.stack, icon: '🧱' },
  { key: 'architecture', label: copy.phases.architecture, icon: '🏗️' },
  { key: 'roadmap', label: copy.phases.roadmap, icon: '🗺️' },
  { key: 'cost_feasibility', label: copy.phases.cost_feasibility, icon: '💰' },
  { key: 'security', label: copy.phases.security, icon: '🔒' },
];

function normalizeRows(value) {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value)
    .filter(([key, item]) => key !== 'phase_summary' && item !== null && item !== undefined && String(item).trim() !== '')
    .map(([key, item]) => ({ key, value: typeof item === 'string' ? item : JSON.stringify(item) }));
}

function buildFromA2aPayload(brief, lines) {
  const fc = brief.founder_context || {};
  lines.push(`## ${copy.brief.founderContext}`);
  lines.push(`- ${copy.brief.industry}: ${fc.industry || '-'}`);
  lines.push(`- ${copy.brief.phase}: ${fc.phase || '-'}`);
  lines.push(`- ${copy.brief.teamSize}: ${fc.team_size ?? '-'}`);
  lines.push(`- ${copy.brief.budget}: ${fc.budget_usd != null ? `$${fc.budget_usd}` : '-'}`);
  lines.push(`- ${copy.brief.region}: ${fc.target_region || '-'}`);
  lines.push('');

  const stack = brief.stack || {};
  lines.push(`## 🧱 ${copy.brief.techStack}`);
  ['frontend', 'backend', 'database', 'hosting', 'ai_ml'].forEach((k) => {
    if (stack[k]) lines.push(`- ${k}: ${stack[k]}`);
  });
  lines.push('');

  const arch = brief.architecture || {};
  if (arch.components?.length) {
    lines.push(`## 🏗️ ${copy.brief.architecture}`);
    (arch.components || []).forEach((c) => lines.push(`- ${c}`));
    lines.push('');
  }

  const roadmap = brief.roadmap || {};
  if (roadmap.mvp_milestones?.length || roadmap.v1_milestones?.length) {
    lines.push(`## 🗺️ ${copy.brief.roadmap}`);
    (roadmap.mvp_milestones || []).forEach((m) => lines.push(`- ${copy.brief.mvp}: ${m}`));
    (roadmap.v1_milestones || []).forEach((m) => lines.push(`- ${copy.brief.v1}: ${m}`));
    (roadmap.scale_milestones || []).forEach((m) => lines.push(`- ${copy.brief.scale}: ${m}`));
    lines.push('');
  }

  const cost = brief.cost_estimate || {};
  if (cost.mvp_monthly_usd != null || cost.v1_monthly_usd != null) {
    lines.push(`## 💰 ${copy.brief.cost}`);
    if (cost.mvp_monthly_usd != null) lines.push(`- ${copy.brief.mvp}: $${cost.mvp_monthly_usd}/mo`);
    if (cost.v1_monthly_usd != null) lines.push(`- ${copy.brief.v1}: $${cost.v1_monthly_usd}/mo`);
    if (cost.scale_monthly_usd != null) lines.push(`- ${copy.brief.scale}: $${cost.scale_monthly_usd}/mo`);
    lines.push('');
  }

  const security = brief.security || {};
  if (security.standards?.length || security.priority_controls?.length) {
    lines.push(`## 🔒 ${copy.brief.security}`);
    (security.standards || []).forEach((s) => lines.push(`- ${copy.brief.standard}: ${s}`));
    (security.priority_controls || []).forEach((c) => lines.push(`- ${copy.brief.control}: ${c}`));
    lines.push('');
  }

  const team = brief.team || {};
  if (team.recommended_roles?.length) {
    lines.push(`## 👥 ${copy.brief.team}`);
    team.recommended_roles.forEach((r) => {
      lines.push(`- #${r.priority} ${r.title} (${r.seniority})`);
    });
    if (team.hiring_sequence) lines.push(`\n${team.hiring_sequence}`);
    lines.push('');
  }
}

export function buildProjectBriefMarkdown(projectState, founderContext, a2aProjectBrief) {
  // If a structured project_brief object is available from the A2A payload, use it as
  // the primary source — it is the authoritative, complete representation.
  if (a2aProjectBrief && typeof a2aProjectBrief === 'object') {
    const title = String(a2aProjectBrief.project_title || projectState?.project_title || copy.untitledProject).trim();
    const lines = [
      `# ${formatTechAgentText(copy.brief.heading, { title })}`,
      '',
    ];
    if (a2aProjectBrief.product_vision) {
      lines.push(a2aProjectBrief.product_vision, '');
    }
    buildFromA2aPayload(a2aProjectBrief, lines);
    return lines.join('\n').trim();
  }

  // Fallback: reconstruct from local React state (pre-team-building sessions).
  const title = String(projectState?.project_title || copy.untitledProject).trim();
  const lines = [
    `# ${formatTechAgentText(copy.brief.heading, { title })}`,
    '',
  ];

  lines.push(`## ${copy.brief.founderContext}`);
  lines.push(`- ${copy.brief.industry}: ${founderContext?.industry || '-'}`);
  lines.push(`- ${copy.brief.product}: ${founderContext?.product_description || '-'}`);
  lines.push(`- ${copy.brief.phase}: ${founderContext?.phase || '-'}`);
  lines.push(`- ${copy.brief.teamSize}: ${founderContext?.team_size || '-'}`);
  lines.push('');

  PHASES.forEach((phase) => {
    const data = projectState?.decisions?.[phase.key];
    if (!data || typeof data !== 'object') return;

    lines.push(`## ${phase.icon} ${phase.label}`);
    if (typeof data.phase_summary === 'string' && data.phase_summary.trim()) {
      lines.push(`- ${copy.brief.summary}: ${data.phase_summary.trim()}`);
    }

    normalizeRows(data).forEach((row) => {
      lines.push(`- ${row.key.replace(/_/g, ' ')}: ${row.value}`);
    });
    lines.push('');
  });

  return lines.join('\n').trim();
}

export default function ProjectBriefModal({
  open,
  onClose,
  projectState,
  founderContext,
  onCopy,
  onDownload,
}) {
  if (!open) return null;

  return (
    <div className="project-brief-backdrop" onClick={onClose}>
      <div className="project-brief-modal" onClick={(e) => e.stopPropagation()}>
        <div className="project-brief-head">
          <div>
            <strong>{copy.brief.title}</strong>
            <div className="tech-mini-muted">{projectState?.project_title || copy.untitledProject}</div>
          </div>
          <button className="tech-btn tech-btn-icon" onClick={onClose} title={copy.buttons.close}>
            <X size={16} />
          </button>
        </div>

        {PHASES.map((phase) => {
          const data = projectState?.decisions?.[phase.key];
          const rows = normalizeRows(data);
          if (!data || (!rows.length && !data.phase_summary)) return null;

          return (
            <section className="project-brief-section" key={phase.key}>
              <h4>{phase.icon} {phase.label}</h4>
              {data.phase_summary && <div style={{ marginBottom: '6px' }}>{data.phase_summary}</div>}
              <div className="project-brief-kv">
                {rows.map((row) => (
                  <div key={`${phase.key}-${row.key}`}>
                    <strong>{row.key.replace(/_/g, ' ')}:</strong> {row.value}
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <button className="tech-btn" onClick={onCopy}>
            <Copy size={14} /> {copy.buttons.copyMarkdown}
          </button>
          <button className="tech-btn" onClick={onDownload}>
            <Download size={14} /> {copy.buttons.download}
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <button
              className="tech-btn tech-btn-primary"
              disabled
              title={copy.buttons.comingSoon}
            >
              {copy.buttons.openTeamBuilder}
            </button>
            <span className="tech-mini-muted" style={{ fontSize: '11px' }}>{copy.buttons.comingSoon}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
