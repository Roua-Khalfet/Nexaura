"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bot,
  ChevronDown,
  ChevronUp,
  Copy,
  List,
  Loader2,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
  User,
} from 'lucide-react';
import {
  getTechAgentProjectState,
  invokeTechAgentStream,
  submitTechAgentFeedback,
} from '@/lib/tech-agent/client';
import ProjectJourneyBar from './tech-agent/ProjectJourneyBar';
import DecisionSummaryDrawer from './tech-agent/DecisionSummaryDrawer';
import PhaseTransitionPrompt from './tech-agent/PhaseTransitionPrompt';
import HandoffCard from './tech-agent/HandoffCard';
import ProjectBriefModal, { buildProjectBriefMarkdown } from './tech-agent/ProjectBriefModal';

const LOCAL_STATE_KEY = 'tech_agent_chat_state_v2';

const STARTER_PROMPTS = [
  'I have an idea but I need help shaping it.',
  'Can you help me validate this startup concept?',
  'Ask me the right questions to structure the project.',
  'I am not sure where to start technically. Guide me.',
];

const DEFAULT_CONTEXT = {
  id: '',
  industry: '',
  product_description: '',
  phase: '',
  team_size: null,
  budget_usd: null,
  existing_stack: [],
  target_region: '',
  technical_level: '',
};

const JOURNEY_PHASES = [
  'discovery',
  'stack',
  'architecture',
  'roadmap',
  'cost_feasibility',
  'security',
  'handoff',
];

const PHASE_LABELS = {
  discovery: 'Discovery',
  stack: 'Tech Stack',
  architecture: 'Architecture',
  roadmap: 'Roadmap',
  cost_feasibility: 'Cost & Feasibility',
  security: 'Security',
  handoff: 'Team Building',
};

const INTENT_TO_PHASE = {
  stack: 'stack',
  stack_comparison: 'stack',
  architecture: 'architecture',
  roadmap: 'roadmap',
  cost: 'cost_feasibility',
  feasibility: 'cost_feasibility',
  security: 'security',
  libraries: 'stack',
  team_building: 'handoff',
  project_brief: 'handoff',
};

function nowIso() {
  return new Date().toISOString();
}

function inferProjectTitle(founderContext) {
  const description = String(founderContext?.product_description || '').trim();
  if (!description) return 'Untitled Project';
  const title = description.split('.')[0].trim() || description;
  return title.length > 80 ? `${title.slice(0, 77)}...` : title;
}

function createDefaultProjectState(founderContext = DEFAULT_CONTEXT) {
  return {
    current_phase: 'discovery',
    completed_phases: [],
    decisions: {
      discovery: null,
      stack: null,
      architecture: null,
      roadmap: null,
      cost_feasibility: null,
      security: null,
    },
    progress: 0,
    total_phases: JOURNEY_PHASES.length,
    revisiting: false,
    revisit_target: null,
    project_title: inferProjectTitle(founderContext),
    last_updated: nowIso(),
  };
}

function normalizeProjectState(value, founderContext = DEFAULT_CONTEXT) {
  const source = value && typeof value === 'object' ? value : {};
  const fallback = createDefaultProjectState(founderContext);

  const completed = Array.isArray(source.completed_phases)
    ? source.completed_phases
        .map((phase) => String(phase || '').trim())
        .filter((phase) => JOURNEY_PHASES.includes(phase))
    : [];

  const dedupedCompleted = [...new Set(completed)].sort(
    (a, b) => JOURNEY_PHASES.indexOf(a) - JOURNEY_PHASES.indexOf(b)
  );

  const decisions = source.decisions && typeof source.decisions === 'object'
    ? source.decisions
    : {};

  const normalizedDecisions = {
    discovery: decisions.discovery && typeof decisions.discovery === 'object' ? decisions.discovery : null,
    stack: decisions.stack && typeof decisions.stack === 'object' ? decisions.stack : null,
    architecture: decisions.architecture && typeof decisions.architecture === 'object' ? decisions.architecture : null,
    roadmap: decisions.roadmap && typeof decisions.roadmap === 'object' ? decisions.roadmap : null,
    cost_feasibility: decisions.cost_feasibility && typeof decisions.cost_feasibility === 'object' ? decisions.cost_feasibility : null,
    security: decisions.security && typeof decisions.security === 'object' ? decisions.security : null,
  };

  const rawCurrentPhase = String(source.current_phase || fallback.current_phase).trim();
  const currentPhase = JOURNEY_PHASES.includes(rawCurrentPhase) ? rawCurrentPhase : fallback.current_phase;

  const explicitProgress = Number(source.progress);
  const progress = Number.isFinite(explicitProgress)
    ? Math.max(0, Math.min(JOURNEY_PHASES.length, explicitProgress))
    : dedupedCompleted.length;

  const revisitTarget = JOURNEY_PHASES.includes(String(source.revisit_target || '').trim())
    ? String(source.revisit_target).trim()
    : null;

  return {
    ...fallback,
    ...source,
    current_phase: currentPhase,
    completed_phases: dedupedCompleted,
    decisions: normalizedDecisions,
    progress,
    total_phases: JOURNEY_PHASES.length,
    revisiting: Boolean(source.revisiting),
    revisit_target: revisitTarget,
    project_title: String(source.project_title || fallback.project_title).trim() || fallback.project_title,
    last_updated: String(source.last_updated || fallback.last_updated).trim() || fallback.last_updated,
  };
}

function mergeProjectState(localState, remoteState, founderContext = DEFAULT_CONTEXT) {
  const local = normalizeProjectState(localState, founderContext);
  const remote = normalizeProjectState(remoteState, founderContext);

  const mergedDecisions = {
    discovery: remote.decisions.discovery || local.decisions.discovery,
    stack: remote.decisions.stack || local.decisions.stack,
    architecture: remote.decisions.architecture || local.decisions.architecture,
    roadmap: remote.decisions.roadmap || local.decisions.roadmap,
    cost_feasibility: remote.decisions.cost_feasibility || local.decisions.cost_feasibility,
    security: remote.decisions.security || local.decisions.security,
  };

  return normalizeProjectState(
    {
      ...local,
      ...remote,
      decisions: mergedDecisions,
      completed_phases: remote.completed_phases,
      progress: Number.isFinite(Number(remote.progress)) ? Number(remote.progress) : local.progress,
      last_updated: remote.last_updated || local.last_updated,
    },
    founderContext,
  );
}

function phaseLabel(phaseKey) {
  return PHASE_LABELS[phaseKey] || String(phaseKey || 'Phase');
}

function getNextPhase(phaseKey) {
  const idx = JOURNEY_PHASES.indexOf(String(phaseKey || '').trim());
  if (idx < 0 || idx >= JOURNEY_PHASES.length - 1) return 'handoff';
  return JOURNEY_PHASES[idx + 1];
}

function derivePhaseFromPayload(payload, projectState) {
  if (projectState?.revisiting && projectState?.revisit_target) {
    return projectState.revisit_target;
  }

  const intent = String(payload?.intent || '').trim().toLowerCase();
  return INTENT_TO_PHASE[intent] || projectState?.current_phase || 'discovery';
}


function createDefaultMessage() {
  return {
    id: 'welcome',
    role: 'assistant',
    content:
      "Hello. I am the Tech Agent. Let's start with your idea: what problem are you solving, and for whom?",
    timestamp: Date.now(),
  };
}

function createSession() {
  const id = `local-${Date.now()}`;
  const founderContext = { ...DEFAULT_CONTEXT };
  return {
    id,
    title: 'New Conversation',
    updatedAt: Date.now(),
    sessionId: '',
    founderContext,
    projectState: createDefaultProjectState(founderContext),
    messages: [createDefaultMessage()],
  };
}

function normalizeFounderContext(value) {
  const source = value && typeof value === 'object' ? value : {};

  // Fix: Number(null) produces 0, which passes the >= 0 check and silently
  // stores 0 for users who never provided team_size. Guard with explicit null check.
  const teamSize = source.team_size !== null && source.team_size !== undefined
    ? Number(source.team_size)
    : null;
  const budget = source.budget_usd !== null && source.budget_usd !== undefined
    ? Number(source.budget_usd)
    : DEFAULT_CONTEXT.budget_usd;

  const existingStack = Array.isArray(source.existing_stack)
    ? source.existing_stack
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    : DEFAULT_CONTEXT.existing_stack;

  return {
    ...DEFAULT_CONTEXT,
    ...source,
    team_size: teamSize !== null && Number.isFinite(teamSize) && teamSize >= 0 ? teamSize : DEFAULT_CONTEXT.team_size,
    budget_usd: Number.isFinite(budget) ? budget : DEFAULT_CONTEXT.budget_usd,
    existing_stack: existingStack,
  };
}

function normalizeMessage(message, index) {
  const source = message && typeof message === 'object' ? message : {};
  const role = source.role === 'user' ? 'user' : 'assistant';
  const content = typeof source.content === 'string' ? source.content : '';
  const timestamp = Number(source.timestamp);

  return {
    ...source,
    id: typeof source.id === 'string' && source.id ? source.id : `msg-${Date.now()}-${index}`,
    role,
    content,
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
    agentSteps: Array.isArray(source.agentSteps) ? source.agentSteps : [],
  };
}

function normalizeSession(session, index) {
  if (!session || typeof session !== 'object') return null;

  const source = session;
  const founderContext = normalizeFounderContext(source.founderContext);
  const rawMessages = Array.isArray(source.messages) ? source.messages : [];
  const messages = rawMessages.map((msg, i) => normalizeMessage(msg, i)).filter(Boolean);

  return {
    ...source,
    id: typeof source.id === 'string' && source.id ? source.id : `local-${Date.now()}-${index}`,
    title: typeof source.title === 'string' && source.title.trim() ? source.title : 'New Conversation',
    updatedAt: Number.isFinite(Number(source.updatedAt)) ? Number(source.updatedAt) : Date.now(),
    sessionId: typeof source.sessionId === 'string' ? source.sessionId : '',
    founderContext,
    projectState: normalizeProjectState(source.projectState, founderContext),
    messages: messages.length ? messages : [createDefaultMessage()],
  };
}

function getInitialState() {
  try {
    const raw = localStorage.getItem(LOCAL_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const sessions = Array.isArray(parsed.sessions)
      ? parsed.sessions.map((session, index) => normalizeSession(session, index)).filter(Boolean)
      : [];

    if (!sessions.length) return null;

    const requestedKey = typeof parsed.activeSessionKey === 'string' ? parsed.activeSessionKey : '';
    const activeSessionKey = sessions.some((session) => session.id === requestedKey)
      ? requestedKey
      : sessions[0].id;

    return {
      activeSessionKey,
      sessions,
    };
  } catch {
    localStorage.removeItem(LOCAL_STATE_KEY);
    return null;
  }
}

function deriveSessionTitle(text) {
  const clean = String(text || '').trim().replace(/\s+/g, ' ');
  if (!clean) return 'New Conversation';
  return clean.length <= 42 ? clean : `${clean.slice(0, 39)}...`;
}

function extractIntent(payload) {
  if (!payload || typeof payload !== 'object') return 'general';
  if (typeof payload.intent === 'string' && payload.intent.trim()) return payload.intent;
  if (typeof payload.type === 'string' && payload.type.trim()) return payload.type;
  return 'general';
}

function extractKbSources(payload) {
  if (!payload || typeof payload !== 'object') return [];

  const candidates = [
    payload.kb_sources,
    payload.sources,
    payload.references,
    payload.docs,
  ];

  for (const item of candidates) {
    if (Array.isArray(item)) {
      return item
        .map((s) => (typeof s === 'string' ? s : s?.title || s?.source || ''))
        .filter(Boolean)
        .slice(0, 10);
    }
  }

  return [];
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderInlineMarkdown(text) {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(
    /\[(.*?)\]\((.*?)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer">$1</a>'
  );
  return html;
}

function splitTableCells(line) {
  const trimmed = String(line || '').trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => renderInlineMarkdown(cell.trim()));
}

function isTableSeparator(line) {
  const raw = String(line || '').trim();
  if (!raw.includes('|')) return false;
  const trimmed = raw.replace(/^\|/, '').replace(/\|$/, '');
  const cols = trimmed.split('|').map((c) => c.trim());
  if (!cols.length) return false;
  return cols.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function toList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') {
        return toText(item.title || item.name || item.label || item.value);
      }
      return '';
    })
    .filter(Boolean);
}

function sumNumeric(value) {
  const numeric = toNumber(value);
  if (numeric !== null) return numeric;

  if (Array.isArray(value)) {
    return value.reduce((acc, item) => acc + sumNumeric(item), 0);
  }

  if (value && typeof value === 'object') {
    return Object.values(value).reduce((acc, item) => acc + sumNumeric(item), 0);
  }

  return 0;
}

function formatNumber(value, digits = 2) {
  const num = toNumber(value);
  if (num === null) return '-';
  return num.toFixed(digits);
}

function formatUsd(value) {
  const num = toNumber(value);
  if (num === null) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(num);
}

function normalizeIntent(payload) {
  const raw = toText(payload?.intent || payload?.type).toLowerCase();
  return raw || 'general';
}

function normalizeStackModel(payload) {
  if (normalizeIntent(payload) !== 'stack') return null;
  const stack = payload?.stack && typeof payload.stack === 'object' ? payload.stack : {};

  return {
    rationale: toText(payload?.rationale),
    categories: [
      { label: 'Frontend', items: toList(stack.frontend) },
      { label: 'Backend', items: toList(stack.backend) },
      { label: 'Database', items: toList(stack.database) },
      { label: 'Hosting', items: toList(stack.hosting) },
    ],
  };
}

function normalizeArchitectureModel(payload) {
  if (normalizeIntent(payload) !== 'architecture') return null;
  return {
    components: toList(payload?.components),
    infrastructure: toList(payload?.infrastructure),
    risks: toList(payload?.risks),
    diagrams: toList(payload?.architecture_diagrams),
  };
}

function normalizeRoadmapModel(payload) {
  if (normalizeIntent(payload) !== 'roadmap') return null;
  const phases = payload?.phases && typeof payload.phases === 'object' ? payload.phases : {};
  return {
    phaseCards: [
      { key: 'mvp', title: 'MVP', items: toList(phases.mvp) },
      { key: 'v1', title: 'V1', items: toList(phases.v1) },
      { key: 'scale', title: 'Scale', items: toList(phases.scale) },
    ],
    milestones: toList(payload?.milestones),
  };
}

function normalizeCostModel(payload) {
  if (normalizeIntent(payload) !== 'cost') return null;
  const scenarios = payload?.monthly_costs && typeof payload.monthly_costs === 'object'
    ? payload.monthly_costs
    : {};

  const cards = ['mvp', 'v1', 'scale'].map((key) => {
    const raw = scenarios[key];
    const total = sumNumeric(raw);
    const breakdownEntries = raw && typeof raw === 'object'
      ? Object.entries(raw)
          .map(([k, v]) => ({ key: k, value: toNumber(v) }))
          .filter((item) => item.value !== null)
      : [];

    return {
      key,
      title: key.toUpperCase(),
      total,
      breakdownEntries,
    };
  });

  const assumptions = toList(payload?.assumptions);
  return { cards, assumptions };
}

function normalizeFeasibilityModel(payload) {
  if (normalizeIntent(payload) !== 'feasibility') return null;
  return {
    feasible: payload?.feasible,
    effort: toText(payload?.effort),
    risks: toList(payload?.risks),
    approach: toText(payload?.approach),
  };
}

function normalizeSecurityModel(payload) {
  if (normalizeIntent(payload) !== 'security') return null;
  return {
    standards: toList(payload?.standards),
    controls: toList(payload?.controls),
    gaps: toList(payload?.gaps),
  };
}

function normalizeLibrariesModel(payload) {
  if (normalizeIntent(payload) !== 'libraries') return null;
  const repos = Array.isArray(payload?.repos)
    ? payload.repos
        .map((repo) => {
          if (typeof repo === 'string') {
            return { name: repo, url: '', stars: null, description: '' };
          }
          if (repo && typeof repo === 'object') {
            return {
              name: toText(repo.name || repo.title),
              url: toText(repo.url),
              stars: toNumber(repo.stars),
              description: toText(repo.description),
            };
          }
          return null;
        })
        .filter((repo) => repo && repo.name)
    : [];

  return { repos };
}

function normalizeTeamBuildingModel(payload) {
  if (!payload || payload.intent !== 'team_building') return null;

  const roles = Array.isArray(payload.recommended_roles)
    ? payload.recommended_roles.map((role) => ({
        title: String(role.title || ''),
        seniority: String(role.seniority || 'mid'),
        priority: Number(role.priority || 1),
        reason: String(role.reason || ''),
        key_skills: Array.isArray(role.key_skills) ? role.key_skills : [],
      }))
    : [];

  return {
    roles,
    hiring_sequence: String(payload.hiring_sequence || ''),
  };
}

function cleanDiscoveryText(content) {
  const text = String(content || '');
  if (!text.trim()) return '';

  const filtered = text
    .split('\n')
    .filter((line) => {
      const low = line.trim().toLowerCase();
      if (!low) return true;
      if (low.startsWith('detected fields:')) return false;
      if (low.startsWith('still missing:')) return false;
      return true;
    })
    .join('\n')
    .trim();

  return stripUnknownsSections(filtered);
}

function stripUnknownsSections(content) {
  const source = String(content || '');
  if (!source.trim()) return '';

  return source
    .replace(
      /#{1,3}\s*(Key Unknowns|Open Questions|What We Still Need|What We Need|Unknowns)[\s\S]*?(?=#{1,3}|\z)/gi,
      ''
    )
    .trim();
}

function normalizeReferences(payload) {
  if (!payload || typeof payload !== 'object') return [];
  if (!Array.isArray(payload.references)) return [];
  return payload.references
    .map((ref) => {
      if (!ref || typeof ref !== 'object') return null;
      return {
        title: toText(ref.title || ref.source_file || ref.url || 'Source'),
        url: toText(ref.url),
        source: toText(ref.source),
      };
    })
    .filter(Boolean)
    .slice(0, 8);
}

function buildComparisonModel(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (String(payload.intent || '').toLowerCase() !== 'stack_comparison') return null;

  const optionAName =
    (payload.option_a && typeof payload.option_a === 'object' && payload.option_a.name)
    || payload.option_a_name
    || 'Option A';
  const optionBName =
    (payload.option_b && typeof payload.option_b === 'object' && payload.option_b.name)
    || payload.option_b_name
    || 'Option B';

  const rows = Array.isArray(payload.decision_matrix)
    ? payload.decision_matrix
        .map((row) => {
          if (!row || typeof row !== 'object') return null;
          const criterion = String(row.criterion || '').trim();
          if (!criterion) return null;

          const scoreA = toNumber(row.score_a);
          const scoreB = toNumber(row.score_b);
          const weight = toNumber(row.weight);

          if (scoreA === null || scoreB === null) return null;

          return {
            criterion,
            scoreA,
            scoreB,
            weight,
            weightedA: weight === null ? scoreA : scoreA * weight,
            weightedB: weight === null ? scoreB : scoreB * weight,
          };
        })
        .filter(Boolean)
    : [];

  if (!rows.length) return null;

  const computedTotalA = rows.reduce((sum, row) => sum + row.weightedA, 0);
  const computedTotalB = rows.reduce((sum, row) => sum + row.weightedB, 0);
  const totalScoreA = toNumber(payload.total_score_a) ?? computedTotalA;
  const totalScoreB = toNumber(payload.total_score_b) ?? computedTotalB;

  let winner = toText(payload.winner) || 'Tie';
  if (!winner || winner.toLowerCase() === 'tie') {
    winner = 'Tie';
    if (Math.abs(totalScoreA - totalScoreB) > 0.0001) {
      winner = totalScoreA > totalScoreB ? optionAName : optionBName;
    }
  }

  return {
    optionAName: String(optionAName),
    optionBName: String(optionBName),
    rows,
    totalScoreA,
    totalScoreB,
    winner,
    recommendation: String(payload.recommendation || '').trim(),
  };
}

function renderTeamBuildingDashboard(model, messageId, actions = {}) {
  if (!model) return null;

  const seniorityBadge = {
    junior: { background: '#16a34a', color: '#fff' },
    mid:    { background: '#ca8a04', color: '#fff' },
    senior: { background: '#dc2626', color: '#fff' },
  };

  const sorted = [...model.roles].sort((a, b) => a.priority - b.priority);

  return (
    <div className="tech-dashboard tech-card-pop" data-intent="team_building" key={`${messageId}-team`}>
      <div className="tech-dashboard-head">
        <strong>Team Blueprint</strong>
        <span className="tech-intent-pill">Team Building</span>
      </div>

      <div style={{ marginTop: '12px' }}>
        {sorted.map((role, i) => (
          <div key={i}>
            {i > 0 && (
              <div style={{ height: '1px', background: 'var(--tech-border, rgba(255,255,255,0.08))', margin: '0' }} />
            )}
            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', padding: '16px 4px' }}>
              {/* Priority anchor */}
              <div style={{
                fontSize: '2rem',
                fontWeight: 700,
                color: 'var(--tech-muted, #64748b)',
                lineHeight: 1,
                minWidth: '2.5rem',
                textAlign: 'center',
                flexShrink: 0,
                paddingTop: '2px',
              }}>
                {role.priority}
              </div>

              {/* Role body */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Title + seniority badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{role.title}</span>
                  <span style={{
                    ...(seniorityBadge[role.seniority] || { background: '#475569', color: '#fff' }),
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '999px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    flexShrink: 0,
                  }}>
                    {role.seniority}
                  </span>
                </div>

                {/* Reason */}
                {role.reason && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--tech-muted, #94a3b8)', marginBottom: '10px', lineHeight: 1.5 }}>
                    {role.reason}
                  </div>
                )}

                {/* Skill pills */}
                {role.key_skills.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {role.key_skills.map((skill, j) => (
                      <span key={j} style={{
                        fontSize: '0.75rem',
                        padding: '3px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--tech-border, rgba(255,255,255,0.12))',
                        color: 'var(--tech-text-secondary, #cbd5e1)',
                        background: 'var(--tech-bg-alt, rgba(255,255,255,0.04))',
                        whiteSpace: 'nowrap',
                      }}>
                        {skill}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {model.hiring_sequence && (
        <div style={{
          marginTop: '16px',
          padding: '14px 16px',
          borderRadius: '8px',
          background: 'var(--tech-bg-alt, rgba(255,255,255,0.04))',
          borderLeft: '3px solid var(--tech-accent, #6366f1)',
        }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--tech-muted, #64748b)', marginBottom: '6px' }}>
            Hiring Sequence
          </div>
          <div style={{ fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--tech-text-secondary, #cbd5e1)' }}>
            {model.hiring_sequence}
          </div>
        </div>
      )}

      {(actions.onPostJobs || actions.onFindCandidates) && (
        <div style={{ display: 'flex', gap: '10px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--tech-border, rgba(255,255,255,0.08))' }}>
          {actions.onPostJobs && (
            <button
              className="tech-btn tech-btn-primary"
              onClick={() => actions.onPostJobs(model.roles)}
              style={{ flex: 1 }}
            >
              Post {model.roles.length} Role{model.roles.length !== 1 ? 's' : ''} as Job Listings →
            </button>
          )}
          {actions.onFindCandidates && (
            <button
              className="tech-btn tech-btn-secondary"
              onClick={() => actions.onFindCandidates(model.roles)}
              style={{ flex: 1 }}
            >
              Find Matching Candidates →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function renderIntentDashboard(payload, messageId, actions = {}) {
  try {
    if (!payload || typeof payload !== 'object') return null;

    const intent = normalizeIntent(payload);
    const comparisonModel = buildComparisonModel(payload);
    const stackModel = normalizeStackModel(payload);
    const architectureModel = normalizeArchitectureModel(payload);
    const roadmapModel = normalizeRoadmapModel(payload);
    const costModel = normalizeCostModel(payload);
    const feasibilityModel = normalizeFeasibilityModel(payload);
    const securityModel = normalizeSecurityModel(payload);
    const librariesModel = normalizeLibrariesModel(payload);
    const references = normalizeReferences(payload);

    const renderReferences = references.length > 0 ? (
      <div className="tech-dashboard-section">
        <div className="tech-dashboard-section-title">References</div>
        <div className="tech-chip-list">
          {references.map((ref) => (
            <a
              key={`${messageId}-ref-${ref.title}-${ref.url}`}
              className="tech-chip tech-chip-link"
              href={ref.url || '#'}
              target={ref.url ? '_blank' : undefined}
              rel={ref.url ? 'noreferrer' : undefined}
              onClick={(e) => {
                if (!ref.url) e.preventDefault();
              }}
            >
              {ref.title}
            </a>
          ))}
        </div>
      </div>
    ) : null;

    if (intent === 'discovery') {
      const elaboration = toText(payload?.elaboration || payload?.phase_summary || payload?.chat_response);
      return (
        <div className="tech-dashboard tech-card-pop" data-intent="discovery" key={`${messageId}-discovery`}>
          <div className="tech-dashboard-head">
            <strong>Your Product Vision</strong>
            <span className="tech-intent-pill">Discovery</span>
          </div>
          <div className="tech-elaboration-body">
            {elaboration || 'Your idea has been captured. Ready to move forward.'}
          </div>
        </div>
      );
    }

    if (comparisonModel) {
    return (
      <div className="tech-dashboard tech-card-pop" data-intent="comparison" key={`${messageId}-comparison`}>
        <div className="tech-dashboard-head">
          <strong>Decision Dashboard</strong>
          <span className="tech-intent-pill">Comparison</span>
        </div>

        <div className="tech-kpi-grid">
          <div className="tech-kpi-card">
            <div className="tech-kpi-label">{comparisonModel.optionAName}</div>
            <div className="tech-kpi-value">{formatNumber(comparisonModel.totalScoreA)}</div>
          </div>
          <div className="tech-kpi-card">
            <div className="tech-kpi-label">{comparisonModel.optionBName}</div>
            <div className="tech-kpi-value">{formatNumber(comparisonModel.totalScoreB)}</div>
          </div>
          <div className="tech-kpi-card">
            <div className="tech-kpi-label">Winner</div>
            <div className="tech-kpi-value">{comparisonModel.winner}</div>
          </div>
        </div>

        <div className="tech-table-wrap" style={{ marginTop: '10px', marginBottom: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Criterion</th>
                <th>{comparisonModel.optionAName}</th>
                <th>{comparisonModel.optionBName}</th>
                <th>Weight</th>
              </tr>
            </thead>
            <tbody>
              {comparisonModel.rows.map((row) => (
                <tr key={`${messageId}-cmp-${row.criterion}`}>
                  <td>{row.criterion}</td>
                  <td>{row.scoreA}</td>
                  <td>{row.scoreB}</td>
                  <td>{row.weight === null ? '-' : row.weight}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {comparisonModel.recommendation && (
          <div className="tech-soft-note" style={{ marginTop: '10px' }}>
            <strong>Recommendation:</strong> {comparisonModel.recommendation}
          </div>
        )}
        {renderReferences}
      </div>
    );
  }

  if (stackModel) {
    return (
      <div className="tech-dashboard tech-card-pop" data-intent="stack" key={`${messageId}-stack`}>
        <div className="tech-dashboard-head">
          <strong>Stack Blueprint</strong>
          <span className="tech-intent-pill">Stack</span>
        </div>
        <div className="tech-column-grid">
          {stackModel.categories.map((category) => (
            <div className="tech-panel-card" key={`${messageId}-${category.label}`}>
              <div className="tech-panel-title">{category.label}</div>
              <div className="tech-chip-list">
                {category.items.length
                  ? category.items.map((item) => (
                      <span className="tech-chip" key={`${messageId}-${category.label}-${item}`}>{item}</span>
                    ))
                  : <span className="tech-empty-note">No recommendation extracted</span>}
              </div>
            </div>
          ))}
        </div>
        {stackModel.rationale && <div className="tech-soft-note"><strong>Why:</strong> {stackModel.rationale}</div>}
        {renderReferences}
      </div>
    );
  }

  if (costModel) {
    const maxTotal = Math.max(...costModel.cards.map((card) => card.total), 1);
    return (
      <div className="tech-dashboard tech-card-pop" data-intent="cost" key={`${messageId}-cost`}>
        <div className="tech-dashboard-head">
          <strong>Cost Dashboard</strong>
          <span className="tech-intent-pill">Cost</span>
        </div>
        <div className="tech-kpi-grid">
          {costModel.cards.map((card) => {
            const widthPct = Math.max(6, Math.round((card.total / maxTotal) * 100));
            return (
              <div className="tech-kpi-card" key={`${messageId}-${card.key}`}>
                <div className="tech-kpi-label">{card.title}</div>
                <div className="tech-kpi-value">{formatUsd(card.total)}</div>
                <div className="tech-score-track"><span className="tech-score-fill" style={{ width: `${widthPct}%` }} /></div>
              </div>
            );
          })}
        </div>
        {costModel.assumptions.length > 0 && (
          <div className="tech-dashboard-section">
            <div className="tech-dashboard-section-title">Assumptions</div>
            <ul className="tech-list">
              {costModel.assumptions.map((item) => <li key={`${messageId}-assumption-${item}`}>{item}</li>)}
            </ul>
          </div>
        )}
        {renderReferences}
      </div>
    );
  }

  if (roadmapModel) {
    return (
      <div className="tech-dashboard tech-card-pop" data-intent="roadmap" key={`${messageId}-roadmap`}>
        <div className="tech-dashboard-head">
          <strong>Roadmap Dashboard</strong>
          <span className="tech-intent-pill">Roadmap</span>
        </div>
        <div className="tech-column-grid">
          {roadmapModel.phaseCards.map((phase) => (
            <div className="tech-panel-card" key={`${messageId}-${phase.key}`}>
              <div className="tech-panel-title">{phase.title}</div>
              {phase.items.length ? (
                <ul className="tech-list">
                  {phase.items.map((item) => <li key={`${messageId}-${phase.key}-${item}`}>{item}</li>)}
                </ul>
              ) : (
                <div className="tech-empty-note">No milestones extracted</div>
              )}
            </div>
          ))}
        </div>
        {roadmapModel.milestones.length > 0 && (
          <div className="tech-dashboard-section">
            <div className="tech-dashboard-section-title">Cross-Phase Milestones</div>
            <div className="tech-chip-list">
              {roadmapModel.milestones.map((item) => <span className="tech-chip" key={`${messageId}-ms-${item}`}>{item}</span>)}
            </div>
          </div>
        )}
        {renderReferences}
      </div>
    );
  }

  if (feasibilityModel) {
    const feasibleLabel = feasibilityModel.feasible === false ? 'Not Feasible' : 'Feasible';
    const feasibleClass = feasibilityModel.feasible === false ? 'tech-pill-danger' : 'tech-pill-success';
    return (
      <div className="tech-dashboard tech-card-pop" data-intent="feasibility" key={`${messageId}-feasibility`}>
        <div className="tech-dashboard-head">
          <strong>Feasibility Dashboard</strong>
          <span className="tech-intent-pill">Feasibility</span>
        </div>
        <div className="tech-kpi-grid">
          <div className="tech-kpi-card">
            <div className="tech-kpi-label">Status</div>
            <div className={`tech-state-pill ${feasibleClass}`}>{feasibleLabel}</div>
          </div>
          <div className="tech-kpi-card">
            <div className="tech-kpi-label">Effort</div>
            <div className="tech-kpi-value" style={{ textTransform: 'capitalize' }}>{feasibilityModel.effort || '-'}</div>
          </div>
        </div>
        {feasibilityModel.approach && <div className="tech-soft-note"><strong>Approach:</strong> {feasibilityModel.approach}</div>}
        {feasibilityModel.risks.length > 0 && (
          <div className="tech-dashboard-section">
            <div className="tech-dashboard-section-title">Key Risks</div>
            <ul className="tech-list">
              {feasibilityModel.risks.map((risk) => <li key={`${messageId}-risk-${risk}`}>{risk}</li>)}
            </ul>
          </div>
        )}
        {renderReferences}
      </div>
    );
  }

  if (securityModel) {
    return (
      <div className="tech-dashboard tech-card-pop" data-intent="security" key={`${messageId}-security`}>
        <div className="tech-dashboard-head">
          <strong>Security Dashboard</strong>
          <span className="tech-intent-pill">Security</span>
        </div>
        <div className="tech-column-grid">
          <div className="tech-panel-card">
            <div className="tech-panel-title">Standards</div>
            <div className="tech-chip-list">
              {securityModel.standards.length
                ? securityModel.standards.map((item) => <span className="tech-chip" key={`${messageId}-std-${item}`}>{item}</span>)
                : <span className="tech-empty-note">No standards extracted</span>}
            </div>
          </div>
          <div className="tech-panel-card">
            <div className="tech-panel-title">Priority Controls</div>
            <ul className="tech-list">
              {securityModel.controls.length
                ? securityModel.controls.map((item) => <li key={`${messageId}-ctrl-${item}`}>{item}</li>)
                : <li className="tech-empty-note">No controls extracted</li>}
            </ul>
          </div>
          <div className="tech-panel-card">
            <div className="tech-panel-title">Gaps</div>
            <ul className="tech-list">
              {securityModel.gaps.length
                ? securityModel.gaps.map((item) => <li key={`${messageId}-gap-${item}`}>{item}</li>)
                : <li className="tech-empty-note">No gaps extracted</li>}
            </ul>
          </div>
        </div>
        {renderReferences}
      </div>
    );
  }

  if (librariesModel) {
    return (
      <div className="tech-dashboard tech-card-pop" data-intent="libraries" key={`${messageId}-libraries`}>
        <div className="tech-dashboard-head">
          <strong>Open-Source Discovery</strong>
          <span className="tech-intent-pill">Libraries</span>
        </div>
        <div className="tech-repo-grid">
          {librariesModel.repos.length ? librariesModel.repos.map((repo) => (
            <a
              key={`${messageId}-${repo.name}-${repo.url}`}
              href={repo.url || '#'}
              target={repo.url ? '_blank' : undefined}
              rel={repo.url ? 'noreferrer' : undefined}
              className="tech-repo-card"
              onClick={(e) => {
                if (!repo.url) e.preventDefault();
              }}
            >
              <div className="tech-repo-title">{repo.name}</div>
              <div className="tech-mini-muted">{repo.stars !== null ? `⭐ ${repo.stars}` : 'No stars info'}</div>
              {repo.description && <p>{repo.description}</p>}
            </a>
          )) : <div className="tech-empty-note">No repositories extracted</div>}
        </div>
        {renderReferences}
      </div>
    );
  }

  if (architectureModel) {
    return (
      <div className="tech-dashboard tech-card-pop" data-intent="architecture" key={`${messageId}-architecture`}>
        <div className="tech-dashboard-head">
          <strong>Architecture Dashboard</strong>
          <span className="tech-intent-pill">Architecture</span>
        </div>
        <div className="tech-column-grid">
          <div className="tech-panel-card">
            <div className="tech-panel-title">Components</div>
            <ul className="tech-list">
              {architectureModel.components.length
                ? architectureModel.components.map((item) => <li key={`${messageId}-comp-${item}`}>{item}</li>)
                : <li className="tech-empty-note">No components extracted</li>}
            </ul>
          </div>
          <div className="tech-panel-card">
            <div className="tech-panel-title">Infrastructure</div>
            <ul className="tech-list">
              {architectureModel.infrastructure.length
                ? architectureModel.infrastructure.map((item) => <li key={`${messageId}-infra-${item}`}>{item}</li>)
                : <li className="tech-empty-note">No infrastructure extracted</li>}
            </ul>
          </div>
          <div className="tech-panel-card">
            <div className="tech-panel-title">Risks</div>
            <ul className="tech-list">
              {architectureModel.risks.length
                ? architectureModel.risks.map((item) => <li key={`${messageId}-arisk-${item}`}>{item}</li>)
                : <li className="tech-empty-note">No risks extracted</li>}
            </ul>
          </div>
        </div>
        <div className="tech-dashboard-section">
          <div className="tech-dashboard-section-title">Architecture Graph</div>
          <ArchitectureGraph
            messageId={messageId}
            diagramDsl={architectureModel.diagrams[0] || ''}
            architectureModel={architectureModel}
          />
          {architectureModel.diagrams.length > 0 && (
            <details className="tech-diagram-details">
              <summary>Raw diagram DSL</summary>
              <pre className="tech-diagram-pre">{architectureModel.diagrams[0]}</pre>
            </details>
          )}
        </div>
        {renderReferences}
      </div>
    );
  }

    if (intent === 'team_building') {
      const teamModel = normalizeTeamBuildingModel(payload);
      return renderTeamBuildingDashboard(teamModel, messageId, actions);
    }

    if (intent === 'project_brief') {
      const brief = payload?.project_brief;
      if (!brief) return null;
      return (
        <div className="tech-dashboard tech-card-pop" data-intent="project_brief" key={`${messageId}-brief`}>
          <div className="tech-dashboard-head">
            <strong>Project Brief Ready</strong>
            <span className="tech-intent-pill">Handoff</span>
          </div>
          <div className="tech-brief-summary">
            <p>Your complete project brief has been generated and is ready for handoff.</p>
            <ul>
              <li>Stack: {brief.stack?.frontend} + {brief.stack?.backend}</li>
              <li>Roles: {brief.team?.recommended_roles?.length ?? 0} recommended</li>
              <li>MVP cost: {brief.cost_estimate?.mvp_monthly_usd != null ? `$${brief.cost_estimate.mvp_monthly_usd}/mo` : '-'}</li>
            </ul>
          </div>
          {(actions.onPostJobs || actions.onFindCandidates) && (
            <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
              {actions.onPostJobs && (
                <button
                  className="tech-btn tech-btn-primary"
                  onClick={() => actions.onPostJobs(brief.team?.recommended_roles || [])}
                  style={{ flex: 1 }}
                >
                  Post Job Listings →
                </button>
              )}
              {actions.onFindCandidates && (
                <button
                  className="tech-btn tech-btn-secondary"
                  onClick={() => actions.onFindCandidates(brief.team?.recommended_roles || [])}
                  style={{ flex: 1 }}
                >
                  Find Candidates →
                </button>
              )}
            </div>
          )}
        </div>
      );
    }

    if (intent === 'stack_comparison_setup') {
      return null;
    }

    if (intent !== 'general') {
    return (
      <div className="tech-dashboard tech-card-pop" data-intent="generic" key={`${messageId}-generic`}>
        <div className="tech-dashboard-head">
          <strong>Structured Summary</strong>
          <span className="tech-intent-pill">{intent}</span>
        </div>
        <div className="tech-soft-note">I understood this request. Choose one of the suggested actions below, or reply with more detail.</div>
        {renderReferences}
      </div>
    );
  }

    return null;
  } catch (err) {
    console.error('Dashboard render error:', err);
    return (
      <div className="tech-dashboard tech-card-pop" data-intent="degraded" key={`${messageId}-degraded`}>
        <div className="tech-dashboard-head">
          <strong>Response</strong>
          <span className="tech-intent-pill">Degraded</span>
        </div>
        <div className="tech-soft-note">I could not render all visual sections for this response, but the text response below remains available.</div>
      </div>
    );
  }
}

function safeRenderIntentDashboard(payload, messageId, actions = {}) {
  try {
    return renderIntentDashboard(payload, messageId, actions);
  } catch (error) {
    console.error('Failed to render intent dashboard', error);
    const intent = normalizeIntent(payload);
    return (
      <div className="tech-dashboard tech-card-pop" data-intent="fallback" key={`${messageId}-fallback`}>
        <div className="tech-dashboard-head">
          <strong>Response Summary</strong>
          <span className="tech-intent-pill">{intent}</span>
        </div>
        <div className="tech-soft-note">Rendering degraded. Continuing with text response below.</div>
      </div>
    );
  }
}

function renderMarkdownToHtml(markdown) {
  const lines = String(markdown || '').split('\n');
  const out = [];
  let inCode = false;
  let listOpen = false;
  let orderedListOpen = false;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] || '';

    if (line.trim().startsWith('```')) {
      if (listOpen) {
        out.push('</ul>');
        listOpen = false;
      }
      inCode = !inCode;
      out.push(inCode ? '<pre><code>' : '</code></pre>');
      i += 1;
      continue;
    }

    if (inCode) {
      out.push(`${escapeHtml(line)}\n`);
      i += 1;
      continue;
    }

    if (
      i + 1 < lines.length
      && line.includes('|')
      && isTableSeparator(lines[i + 1])
    ) {
      if (listOpen) {
        out.push('</ul>');
        listOpen = false;
      }

      const headers = splitTableCells(line);
      i += 2;

      const rows = [];
      while (i < lines.length) {
        const rowLine = lines[i] || '';
        if (!rowLine.trim() || !rowLine.includes('|') || rowLine.trim().startsWith('```')) {
          break;
        }
        rows.push(splitTableCells(rowLine));
        i += 1;
      }

      const thead = `<thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>`;
      const tbodyRows = rows
        .map((cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`)
        .join('');
      const tbody = `<tbody>${tbodyRows}</tbody>`;

      out.push(`<div class="tech-table-wrap"><table>${thead}${tbody}</table></div>`);
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      if (orderedListOpen) { out.push('</ol>'); orderedListOpen = false; }
      if (!listOpen) { out.push('<ul>'); listOpen = true; }
      out.push(`<li>${renderInlineMarkdown(bullet[1])}</li>`);
      i += 1;
      continue;
    }

    const numbered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (numbered) {
      if (listOpen) { out.push('</ul>'); listOpen = false; }
      if (!orderedListOpen) { out.push('<ol>'); orderedListOpen = true; }
      out.push(`<li>${renderInlineMarkdown(numbered[1])}</li>`);
      i += 1;
      continue;
    }

    if (listOpen) { out.push('</ul>'); listOpen = false; }
    if (orderedListOpen) { out.push('</ol>'); orderedListOpen = false; }

    if (!line.trim()) {
      out.push('<br />');
      i += 1;
      continue;
    }

    const h3 = line.match(/^###\s+(.*)$/);
    if (h3) {
      out.push(`<h3>${renderInlineMarkdown(h3[1])}</h3>`);
      i += 1;
      continue;
    }

    const h2 = line.match(/^##\s+(.*)$/);
    if (h2) {
      out.push(`<h2>${renderInlineMarkdown(h2[1])}</h2>`);
      i += 1;
      continue;
    }

    const h1 = line.match(/^#\s+(.*)$/);
    if (h1) {
      out.push(`<h1>${renderInlineMarkdown(h1[1])}</h1>`);
      i += 1;
      continue;
    }

    out.push(`<p>${renderInlineMarkdown(line)}</p>`);
    i += 1;
  }

  if (listOpen) out.push('</ul>');
  if (orderedListOpen) out.push('</ol>');

  return out.join('');
}

function formatNodeName(node) {
  const raw = String(node || 'step').replace(/_/g, ' ').trim();
  if (!raw) return 'Step';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function stripMermaidFence(text) {
  const source = String(text || '').trim();
  if (!source) return '';

  const fenced = source.match(/^```(?:mermaid)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : source;
}

function looksLikeMermaidDiagram(text) {
  const source = stripMermaidFence(text);
  if (!source) return false;
  return /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|mindmap|timeline|quadrantChart|pie)\b/.test(source);
}

function compactLabel(text, fallback = 'Item') {
  const clean = String(text || '')
    .replace(/[<>]/g, '')
    .replace(/"/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) return fallback;
  return clean.length > 32 ? `${clean.slice(0, 29)}...` : clean;
}

function pickArchitectureIcon(label, category) {
  const value = String(label || '').toLowerCase();

  if (value.includes('auth') || value.includes('identity') || value.includes('security')) return '🔐';
  if (value.includes('api') || value.includes('gateway')) return '🌐';
  if (value.includes('db') || value.includes('database') || value.includes('postgres') || value.includes('mysql')) return '🗄️';
  if (value.includes('cache') || value.includes('redis')) return '⚡';
  if (value.includes('queue') || value.includes('worker') || value.includes('event')) return '📬';
  if (value.includes('monitor') || value.includes('log') || value.includes('observ')) return '📈';
  if (value.includes('storage') || value.includes('s3') || value.includes('blob')) return '🪣';
  if (value.includes('cloud') || value.includes('aws') || value.includes('azure') || value.includes('gcp')) return '☁️';
  if (value.includes('risk') || value.includes('single point') || value.includes('outage')) return '⚠️';

  if (category === 'component') return '🧩';
  if (category === 'infrastructure') return '🏗️';
  if (category === 'risk') return '⚠️';
  return '•';
}

function normalizeUniqueItems(items = []) {
  const seen = new Set();
  return items
    .map((item) => String(item || '').trim())
    .filter((item) => {
      if (!item) return false;
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function categorizeArchItem(label) {
  const value = String(label || '').toLowerCase();

  if (/(client|frontend|web|mobile|ui|portal|dashboard)/.test(value)) return 'client';
  if (/(db|database|cache|redis|queue|kafka|storage|s3|blob|vector|search)/.test(value)) return 'data';
  if (/(monitor|logging|observ|metrics|trace|alert)/.test(value)) return 'observability';
  if (/(cloud|kubernetes|k8s|docker|deploy|hosting|cdn|load balancer|network|gateway|waf|firewall)/.test(value)) return 'platform';
  return 'service';
}

function isLikelyLinearFlowchart(diagramDsl) {
  const source = stripMermaidFence(diagramDsl);
  if (!/^(graph|flowchart)\b/.test(source.trim())) return false;

  const edgeRegex = /^\s*([A-Za-z0-9_]+)\s*[-.=]+.*?>\s*([A-Za-z0-9_]+)/gm;
  const outDegree = new Map();
  const inDegree = new Map();
  let edgeCount = 0;
  let match = edgeRegex.exec(source);

  while (match) {
    const from = match[1];
    const to = match[2];
    edgeCount += 1;
    outDegree.set(from, (outDegree.get(from) || 0) + 1);
    inDegree.set(to, (inDegree.get(to) || 0) + 1);
    match = edgeRegex.exec(source);
  }

  if (edgeCount < 4) return false;

  const allNodes = new Set([...outDegree.keys(), ...inDegree.keys()]);
  const branchingNodes = Array.from(outDegree.values()).filter((count) => count > 1).length;
  const mergeNodes = Array.from(inDegree.values()).filter((count) => count > 1).length;

  return branchingNodes <= 1 && mergeNodes <= 1 && allNodes.size >= edgeCount;
}

function buildFallbackArchitectureGraph(model) {
  const components = normalizeUniqueItems(Array.isArray(model?.components) ? model.components.slice(0, 12) : []);
  const infrastructure = normalizeUniqueItems(Array.isArray(model?.infrastructure) ? model.infrastructure.slice(0, 10) : []);
  const risks = normalizeUniqueItems(Array.isArray(model?.risks) ? model.risks.slice(0, 5) : []);

  const clients = [];
  const services = [];
  const dataSystems = [];
  const platform = [];
  const observability = [];

  components.forEach((item) => {
    const category = categorizeArchItem(item);
    if (category === 'client') clients.push(item);
    else if (category === 'data') dataSystems.push(item);
    else if (category === 'observability') observability.push(item);
    else if (category === 'platform') platform.push(item);
    else services.push(item);
  });

  infrastructure.forEach((item) => {
    const category = categorizeArchItem(item);
    if (category === 'data') dataSystems.push(item);
    else if (category === 'observability') observability.push(item);
    else platform.push(item);
  });

  if (!clients.length) clients.push('Web / Mobile Client');
  if (!services.length) services.push('Core Application Service');
  if (!dataSystems.length) dataSystems.push('Primary Database');
  if (!platform.length) platform.push('Cloud Runtime');
  if (!observability.length) observability.push('Monitoring and Logs');

  const limitedClients = clients.slice(0, 3);
  const limitedServices = services.slice(0, 6);
  const limitedDataSystems = dataSystems.slice(0, 5);
  const limitedPlatform = platform.slice(0, 4);
  const limitedObservability = observability.slice(0, 3);
  const includeEventBus = limitedServices.length > 1;

  const lines = [
    'flowchart TB',
    '  classDef client fill:#eff6ff,stroke:#2563eb,stroke-width:1.2px,color:#0f172a;',
    '  classDef edge fill:#ecfeff,stroke:#0891b2,stroke-width:1.2px,color:#042f2e;',
    '  classDef service fill:#eef2ff,stroke:#4f46e5,stroke-width:1.2px,color:#1e1b4b;',
    '  classDef data fill:#f0fdf4,stroke:#16a34a,stroke-width:1.2px,color:#052e16;',
    '  classDef platform fill:#fff7ed,stroke:#ea580c,stroke-width:1.2px,color:#7c2d12;',
    '  classDef ops fill:#f8fafc,stroke:#475569,stroke-width:1.2px,color:#0f172a;',
    '  classDef risk fill:#fff1f2,stroke:#e11d48,stroke-width:1.2px,color:#4c0519;',
    '  subgraph client_layer["Client Layer"]',
  ];

  const clientIds = limitedClients.map((item, idx) => {
    const id = `cl${idx}`;
    lines.push(`    ${id}["${pickArchitectureIcon(item, 'component')} ${compactLabel(item, `Client ${idx + 1}`)}"]:::client`);
    return id;
  });
  lines.push('  end');

  lines.push('  subgraph edge_layer["Edge and Security"]');
  lines.push('    edgeGateway["🌐 API Gateway"]:::edge');
  lines.push('    edgeAuth["🔐 Auth and Access"]:::edge');
  lines.push('  end');

  lines.push('  subgraph service_layer["Application Services"]');
  const serviceIds = limitedServices.map((item, idx) => {
    const id = `sv${idx}`;
    lines.push(`    ${id}["${pickArchitectureIcon(item, 'component')} ${compactLabel(item, `Service ${idx + 1}`)}"]:::service`);
    return id;
  });
  lines.push('  end');

  lines.push('  subgraph data_layer["Data and Async"]');
  const dataIds = limitedDataSystems.map((item, idx) => {
    const id = `dt${idx}`;
    lines.push(`    ${id}["${pickArchitectureIcon(item, 'infrastructure')} ${compactLabel(item, `Data ${idx + 1}`)}"]:::data`);
    return id;
  });
  if (includeEventBus) {
    lines.push('    eventBus["📬 Event Bus"]:::data');
  }
  lines.push('  end');

  lines.push('  subgraph platform_layer["Platform and Delivery"]');
  const platformIds = limitedPlatform.map((item, idx) => {
    const id = `pf${idx}`;
    lines.push(`    ${id}["${pickArchitectureIcon(item, 'infrastructure')} ${compactLabel(item, `Platform ${idx + 1}`)}"]:::platform`);
    return id;
  });
  lines.push('  end');

  lines.push('  subgraph ops_layer["Observability"]');
  const opsIds = limitedObservability.map((item, idx) => {
    const id = `op${idx}`;
    lines.push(`    ${id}["${pickArchitectureIcon(item, 'infrastructure')} ${compactLabel(item, `Ops ${idx + 1}`)}"]:::ops`);
    return id;
  });
  lines.push('  end');

  clientIds.forEach((id) => lines.push(`  ${id} --> edgeGateway`));
  lines.push('  edgeGateway --> edgeAuth');
  lines.push(`  edgeAuth --> ${serviceIds[0]}`);

  serviceIds.forEach((id, idx) => {
    lines.push(`  edgeGateway --> ${id}`);
    lines.push(`  ${id} --> ${dataIds[idx % dataIds.length]}`);
    if (serviceIds.length > 2 && idx > 0) {
      lines.push(`  ${serviceIds[0]} --> ${id}`);
    }
    if (includeEventBus) {
      lines.push(`  ${id} -. events .-> eventBus`);
      lines.push(`  eventBus -. triggers .-> ${serviceIds[(idx + 1) % serviceIds.length]}`);
    }
  });

  platformIds.forEach((id, idx) => {
    lines.push(`  ${id} -. hosts .-> ${serviceIds[idx % serviceIds.length]}`);
  });

  opsIds.forEach((id, idx) => {
    lines.push(`  ${id} -. monitors .-> ${serviceIds[idx % serviceIds.length]}`);
    lines.push(`  ${id} -. traces .-> ${dataIds[idx % dataIds.length]}`);
  });

  if (risks.length) {
    lines.push('  subgraph risk_layer["Top Risks"]');
    const riskIds = risks.map((item, idx) => {
      const id = `rk${idx}`;
      lines.push(`    ${id}{"${pickArchitectureIcon(item, 'risk')} ${compactLabel(item, `Risk ${idx + 1}`)}"}:::risk`);
      return id;
    });
    lines.push('  end');

    riskIds.forEach((id, idx) => {
      lines.push(`  ${id} -. impacts .-> ${serviceIds[idx % serviceIds.length]}`);
      lines.push(`  ${id} -. affects .-> ${dataIds[idx % dataIds.length]}`);
    });
  }

  return lines.join('\n');
}

function buildArchitectureMermaidSource(diagramDsl, model) {
  const diagram = stripMermaidFence(diagramDsl);
  if (looksLikeMermaidDiagram(diagram) && !isLikelyLinearFlowchart(diagram)) {
    return diagram;
  }
  return buildFallbackArchitectureGraph(model);
}

function ArchitectureGraph({ messageId, diagramDsl, architectureModel }) {
  const containerRef = useRef(null);
  const [graphError, setGraphError] = useState('');
  const mermaidSource = useMemo(
    () => buildArchitectureMermaidSource(diagramDsl, architectureModel),
    [diagramDsl, architectureModel]
  );

  useEffect(() => {
    let isCancelled = false;

    const renderGraph = async () => {
      if (!containerRef.current) return;
      containerRef.current.innerHTML = '';
      setGraphError('');

      try {
        const mermaidModule = await import('mermaid');
        const mermaid = mermaidModule?.default || mermaidModule;

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'base',
          flowchart: {
            htmlLabels: false,
            curve: 'linear',
            nodeSpacing: 24,
            rankSpacing: 36,
            useMaxWidth: true,
            wrappingWidth: 140,
          },
          themeVariables: {
            fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif',
            fontSize: '12px',
            lineColor: '#64748b',
            primaryColor: '#dbeafe',
            primaryTextColor: '#0f172a',
            primaryBorderColor: '#3b82f6',
            clusterBkg: '#f8fafc',
            clusterBorder: '#cbd5e1',
          },
        });

        const uniqueGraphId = `tech-arch-${messageId}-${Date.now()}`;
        const { svg } = await mermaid.render(uniqueGraphId, mermaidSource);

        if (!isCancelled && containerRef.current) {
          const parser = new DOMParser();
          const svgDoc = parser.parseFromString(svg, 'image/svg+xml');
          const svgEl = svgDoc.documentElement;

          const widthNum = Number.parseFloat(svgEl.getAttribute('width') || '0');
          const heightNum = Number.parseFloat(svgEl.getAttribute('height') || '0');
          if (!svgEl.getAttribute('viewBox') && Number.isFinite(widthNum) && Number.isFinite(heightNum) && widthNum > 0 && heightNum > 0) {
            svgEl.setAttribute('viewBox', `0 0 ${widthNum} ${heightNum}`);
          }

          const importedSvg = document.importNode(svgEl, true);
          importedSvg.removeAttribute('style');
          importedSvg.setAttribute('width', '100%');
          importedSvg.removeAttribute('height');
          importedSvg.style.maxWidth = '100%';
          importedSvg.style.height = 'auto';
          importedSvg.style.display = 'block';

          containerRef.current.innerHTML = '';
          containerRef.current.appendChild(importedSvg);
        }
      } catch (error) {
        if (!isCancelled) {
          const errorMessage = error instanceof Error
            ? error.message
            : 'Failed to render architecture graph.';
          setGraphError(errorMessage);
        }
      }
    };

    renderGraph();
    return () => {
      isCancelled = true;
    };
  }, [mermaidSource, messageId]);

  return (
    <div className="tech-architecture-graph-wrap">
      <div className="tech-architecture-graph" ref={containerRef} />
      {graphError && <div className="tech-graph-error">Could not render graph: {graphError}</div>}
    </div>
  );
}

export default function TechAgentChat({ showHeader = false, onNavigate, initialInput = '', onInitialInputConsumed } = {}) {
  const router = useRouter();
  const persisted = useMemo(() => getInitialState(), []);
  const [sessions, setSessions] = useState(() => {
    if (Array.isArray(persisted?.sessions) && persisted.sessions.length) {
      return persisted.sessions;
    }
    return [createSession()];
  });
  const [activeSessionKey, setActiveSessionKey] = useState(() => persisted?.activeSessionKey || null);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [expandedPayloads, setExpandedPayloads] = useState({});
  const [searchText, setSearchText] = useState('');
  const [journeyDrawerPhase, setJourneyDrawerPhase] = useState(null);
  const [showProjectBrief, setShowProjectBrief] = useState(false);
  const [highlightedPhase, setHighlightedPhase] = useState('');
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const prevCompletedPhasesRef = useRef([]);
  const prevActiveKeyRef = useRef('');
  const lastInitialInputRef = useRef('');

  const activeKey = activeSessionKey || sessions[0]?.id;
  const activeSession = sessions.find((s) => s.id === activeKey) || sessions[0];
  const messages = activeSession?.messages || [createDefaultMessage()];
  const founderContext = activeSession?.founderContext || DEFAULT_CONTEXT;
  const projectState = normalizeProjectState(activeSession?.projectState, founderContext);
  const sessionId = activeSession?.sessionId || '';

  const canSend = useMemo(() => input.trim().length > 0 && !isSending, [input, isSending]);
  const completedPhasesKey = useMemo(
    () => (Array.isArray(projectState.completed_phases) ? projectState.completed_phases.join('|') : ''),
    [projectState.completed_phases],
  );

  const filteredSessions = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => String(s.title || '').toLowerCase().includes(q));
  }, [sessions, searchText]);

  const latestTeamRoles = useMemo(() => {
    const msg = [...messages].reverse().find(
      (m) => m.role === 'assistant' && normalizeIntent(m.a2a_payload) === 'team_building',
    );
    if (!msg) return [];
    return Array.isArray(msg.a2a_payload?.recommended_roles)
      ? msg.a2a_payload.recommended_roles
      : [];
  }, [messages]);

  useEffect(() => {
    if (!activeSessionKey && sessions[0]?.id) {
      setActiveSessionKey(sessions[0].id);
    }
  }, [activeSessionKey, sessions]);

  useEffect(() => {
    const data = {
      activeSessionKey: activeKey,
      sessions: sessions.map((s) => ({
        ...s,
        messages: (Array.isArray(s.messages) ? s.messages : [createDefaultMessage()]).slice(-80),
      })),
    };
    localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(data));
    window.dispatchEvent(new CustomEvent('techSessionUpdate', { detail: { sessions: data.sessions, activeSessionKey: activeKey } }));
  }, [sessions, activeKey]);

  useEffect(() => {
    const handleSelect = (e) => openSession(e.detail);
    const handleNew = () => startNewConversation();
    window.addEventListener('techSessionSelect', handleSelect);
    window.addEventListener('techNewSession', handleNew);
    return () => {
      window.removeEventListener('techSessionSelect', handleSelect);
      window.removeEventListener('techNewSession', handleNew);
    };
  }, []);

  useEffect(() => {
    requestAnimationFrame(() => {
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    });
  }, [messages.length, activeKey]);

  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.style.height = '0px';
    const next = Math.min(220, inputRef.current.scrollHeight);
    inputRef.current.style.height = `${Math.max(52, next)}px`;
  }, [input]);

  useEffect(() => {
    const currentCompleted = Array.isArray(projectState.completed_phases)
      ? projectState.completed_phases
      : [];

    if (prevActiveKeyRef.current !== activeKey) {
      prevActiveKeyRef.current = activeKey;
      prevCompletedPhasesRef.current = [...currentCompleted];
      return;
    }

    const previousCompleted = prevCompletedPhasesRef.current || [];

    const newlyCompleted = currentCompleted.find((phase) => !previousCompleted.includes(phase));
    if (newlyCompleted) {
      setHighlightedPhase(newlyCompleted);
    }

    prevCompletedPhasesRef.current = [...currentCompleted];
  }, [activeKey, completedPhasesKey, projectState.completed_phases]);

  useEffect(() => {
    if (!highlightedPhase) return undefined;
    const timer = window.setTimeout(() => setHighlightedPhase(''), 900);
    return () => window.clearTimeout(timer);
  }, [highlightedPhase]);

  useEffect(() => {
    if (!sessionId) return undefined;
    let cancelled = false;

    getTechAgentProjectState(sessionId)
      .then((response) => {
        if (cancelled) return;

        const remote = normalizeProjectState(response?.project_state, founderContext);
        updateActiveSession((session) => ({
          ...session,
          projectState: mergeProjectState(session.projectState, remote, session.founderContext),
        }));
      })
      .catch(() => {
        // Keep local state as fallback when backend state is unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, [activeKey, sessionId]);

  const updateActiveSession = (updater) => {
    if (!activeKey) return;
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== activeKey) return session;
        const updated = updater(session);
        return { ...updated, updatedAt: Date.now() };
      })
    );
  };

  const setContextField = (key, value) => {
    updateActiveSession((session) => ({
      ...session,
      founderContext: { ...session.founderContext, [key]: value },
      projectState: key === 'product_description'
        ? {
            ...normalizeProjectState(session.projectState, { ...session.founderContext, [key]: value }),
            project_title: inferProjectTitle({ ...session.founderContext, [key]: value }),
            last_updated: nowIso(),
          }
        : session.projectState,
    }));
  };

  const setExistingStack = (value) => {
    const items = value
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    setContextField('existing_stack', items);
  };

  const startNewConversation = () => {
    const newSession = createSession();
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionKey(newSession.id);
    setExpandedPayloads({});
    setJourneyDrawerPhase(null);
    setShowProjectBrief(false);
    setError('');
    setInput('');
  };

  const openSession = (id) => {
    setActiveSessionKey(id);
    setExpandedPayloads({});
    setJourneyDrawerPhase(null);
    setShowProjectBrief(false);
    setError('');
    setInput('');
  };

  const deleteSession = (id) => {
    setSessions((prev) => {
      if (prev.length === 1) return [createSession()];
      return prev.filter((s) => s.id !== id);
    });

    if (activeKey === id) {
      const next = sessions.find((s) => s.id !== id);
      setActiveSessionKey(next?.id || null);
    }
  };

  const togglePayload = (id) => {
    setExpandedPayloads((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyMessage = async (content) => {
    try {
      await navigator.clipboard.writeText(content || '');
    } catch {
      // Best effort only.
    }
  };

  const updateAssistantMessage = (assistantMessageId, updater) => {
    updateActiveSession((session) => ({
      ...session,
      messages: session.messages.map((m) => {
        if (m.id !== assistantMessageId) return m;
        return typeof updater === 'function' ? updater(m) : { ...m, ...updater };
      }),
    }));
  };

  const appendAssistantStep = (assistantMessageId, payload = {}) => {
    const normalized = {
      id: `${assistantMessageId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      index: payload?.index ?? null,
      node: payload?.node || payload?.agent_step?.step || 'step',
      status: payload?.status || payload?.agent_step?.status || 'completed',
      summary: payload?.summary || payload?.agent_step?.details || 'Step completed.',
      timestamp: payload?.agent_step?.timestamp || Date.now(),
    };

    updateAssistantMessage(assistantMessageId, (message) => {
      const existing = Array.isArray(message.agentSteps) ? message.agentSteps : [];
      if (normalized.index !== null && existing.some((step) => step.index === normalized.index)) {
        return message;
      }
      return {
        ...message,
        agentSteps: [...existing, normalized],
      };
    });
  };

  const sendFeedback = async (message, rating) => {
    if (!sessionId) return;
    if (!message?.id || !message?.a2a_payload) return;

    const intent = extractIntent(message.a2a_payload);
    const kbSources = extractKbSources(message.a2a_payload);

    try {
      await submitTechAgentFeedback({
        session_id: sessionId,
        founder_id: founderContext.id || 'founder-local',
        rating,
        intent,
        kb_sources: kbSources,
      });

      updateActiveSession((session) => ({
        ...session,
        messages: session.messages.map((m) =>
          m.id === message.id ? { ...m, feedback: rating } : m
        ),
      }));
    } catch (e) {
      const feedbackError = e instanceof Error ? e.message : 'Failed to submit feedback.';
      setError(feedbackError);
    }
  };

  const dismissTransitionPrompt = (messageId) => {
    updateAssistantMessage(messageId, { transitionDismissed: true });
  };

  const exportPhaseDecisions = async (phaseKey) => {
    const phaseData = projectState?.decisions?.[phaseKey];
    if (!phaseData || typeof phaseData !== 'object') {
      setError('No decisions available for this phase yet.');
      return;
    }

    const lines = [`## ${phaseLabel(phaseKey)}`];
    if (phaseData.phase_summary) {
      lines.push(`- Summary: ${phaseData.phase_summary}`);
    }

    Object.entries(phaseData)
      .filter(([key, value]) => key !== 'phase_summary' && value !== null && value !== undefined)
      .forEach(([key, value]) => {
        lines.push(`- ${key.replace(/_/g, ' ')}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
      });

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
    } catch {
      setError('Could not copy decision summary to clipboard.');
    }
  };

  const copyProjectBriefMarkdown = async () => {
    const markdown = buildProjectBriefMarkdown(projectState, founderContext);
    try {
      await navigator.clipboard.writeText(markdown);
    } catch {
      setError('Could not copy Project Brief markdown.');
    }
  };

  const downloadProjectBriefMarkdown = () => {
    const markdown = buildProjectBriefMarkdown(projectState, founderContext);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const href = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `${(projectState?.project_title || 'project-brief').replace(/\s+/g, '-').toLowerCase()}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(href);
  };

  const scrollToLatestPhaseMessage = (phaseKey) => {
    const targetMessage = [...messages].reverse().find((message) => message.phaseKey === phaseKey);
    if (!targetMessage) {
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
      return;
    }

    const element = document.getElementById(`tech-msg-${targetMessage.id}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handoffToCreateJobs = useCallback((roles) => {
    const list = (Array.isArray(roles) && roles.length ? roles : latestTeamRoles);
    const jobs = list.map((role) => ({
      title: String(role.title || ''),
      seniority: String(role.seniority || 'mid'),
      required_skills: Array.isArray(role.key_skills) ? role.key_skills : [],
      description: String(role.reason || ''),
    }));
    localStorage.setItem('teambuilder_job_queue', JSON.stringify(jobs));
    if (onNavigate) { onNavigate('tb-ai'); } else { router.push('/'); }
  }, [latestTeamRoles, onNavigate, router]);

  const handoffToFindCandidates = useCallback((roles) => {
    const list = (Array.isArray(roles) && roles.length ? roles : latestTeamRoles);
    const allSkills = list.flatMap((r) => Array.isArray(r.key_skills) ? r.key_skills : []);
    const unique = [...new Set(allSkills)].join(',');
    localStorage.setItem('teambuilder_skills_filter', unique);
    if (onNavigate) { onNavigate('tb-candidates'); } else { router.push('/'); }
  }, [latestTeamRoles, onNavigate, router]);

  const handleRevisitPhase = (phaseKey) => {
    const nextState = normalizeProjectState(
      {
        ...projectState,
        revisiting: true,
        revisit_target: phaseKey,
        current_phase: phaseKey,
        last_updated: nowIso(),
      },
      founderContext,
    );

    updateActiveSession((session) => ({
      ...session,
      projectState: nextState,
    }));

    setJourneyDrawerPhase(null);
    handleSend(`I want to revisit the ${phaseLabel(phaseKey)} phase.`, nextState, 'command');
  };

  const continueToPhase = (phaseKey, messageId) => {
    dismissTransitionPrompt(messageId);
    handleSend(`Let's move to ${phaseLabel(phaseKey)}.`, null, 'command');
  };

  const handleSend = async (forcedText = null, forcedProjectState = null, messageType = 'user_message') => {
    const text = String(forcedText ?? input).trim();
    if (!text || isSending) return;

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    const assistantId = `assistant-${Date.now()}`;
    const assistantMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      a2a_payload: null,
      feedback: null,
      runStatus: 'running',
      currentNode: null,
      agentSteps: [],
      timestamp: Date.now(),
    };

    updateActiveSession((session) => ({
      ...session,
      title: session.title === 'New Conversation' ? deriveSessionTitle(text) : session.title,
      projectState: normalizeProjectState(
        forcedProjectState || session.projectState,
        session.founderContext,
      ),
      messages: [...session.messages, userMessage, assistantMessage],
    }));

    if (!forcedText) {
      setInput('');
    }
    setIsSending(true);
    setError('');

    try {
      const normalizedContext = normalizeFounderContext(founderContext);
      const outboundProjectState = normalizeProjectState(
        forcedProjectState || activeSession?.projectState,
        normalizedContext,
      );

      let streamFailed = false;

      const finalResponse = await invokeTechAgentStream({
        user_query: text,
        founder_context: normalizedContext,
        input_source: 'chat-ui',
        message_type: messageType,
        session_id: sessionId || undefined,
        project_state: outboundProjectState,
      }, {
        onEvent: ({ event, data }) => {
          if (event === 'step_started') {
            updateAssistantMessage(assistantId, {
              runStatus: 'running',
              currentNode: data?.node || null,
            });
            return;
          }

          if (event === 'step_completed') {
            updateAssistantMessage(assistantId, {
              runStatus: data?.status === 'failed' ? 'failed' : 'running',
              currentNode: null,
            });
            appendAssistantStep(assistantId, data || {});
            return;
          }

          if (event === 'run_failed') {
            streamFailed = true;
            const streamError = (typeof data?.error === 'string' && data.error) ? data.error : 'Tech-agent stream failed.';
            updateAssistantMessage(assistantId, {
              runStatus: 'failed',
              currentNode: null,
              content: 'I could not complete this run. Please try again.',
            });
            setError(streamError);
            return;
          }

          if (event === 'final_response') {
            const updatedProjectState = mergeProjectState(
              outboundProjectState,
              data?.updated_project_state,
              normalizedContext,
            );
            const updatedFounderContext = normalizeFounderContext(data?.updated_founder_context || normalizedContext);

            const payload = data?.a2a_payload || null;
            const phaseKey = derivePhaseFromPayload(payload, updatedProjectState);
            const wantsNextPhase = Boolean(payload?.suggest_next_phase);
            const transitionPrompt = wantsNextPhase
              ? {
                  type: updatedProjectState.current_phase === 'handoff' ? 'handoff' : 'phase',
                  summary: String(payload?.phase_summary || '').trim(),
                  nextPhase: updatedProjectState.current_phase,
                }
              : null;

            updateActiveSession((session) => ({
              ...session,
              sessionId: data?.session_id || session.sessionId,
              founderContext: updatedFounderContext,
              projectState: updatedProjectState,
              messages: session.messages.map((m) => (
                m.id === assistantId
                  ? {
                      ...m,
                      content: data?.chat_response || 'I did not receive a response body from tech-agent.',
                      a2a_payload: payload,
                      runStatus: 'completed',
                      currentNode: null,
                      phaseKey,
                      transitionPrompt,
                      transitionDismissed: false,
                    }
                  : m
              )),
            }));
            return;
          }

          if (event === 'run_completed') {
            updateAssistantMessage(assistantId, (message) => {
              if (message.runStatus === 'failed') return message;
              return {
                ...message,
                runStatus: 'completed',
                currentNode: null,
              };
            });
            return;
          }

          if (event === 'project_state_updated') {
            updateActiveSession((session) => ({
              ...session,
              projectState: mergeProjectState(session.projectState, data, session.founderContext),
            }));
          }
        },
      });

      if (!finalResponse && !streamFailed) {
        throw new Error('Tech-agent stream ended without a final response.');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to reach tech-agent.';
      updateAssistantMessage(assistantId, {
        runStatus: 'failed',
        currentNode: null,
        content: 'I could not complete this run. Please try again.',
      });
      setError(message);
    } finally {
      setIsSending(false);
    }
  };

  useEffect(() => {
    const seededInput = String(initialInput || '').trim();
    if (!seededInput || isSending) return;
    if (lastInitialInputRef.current === seededInput) return;

    lastInitialInputRef.current = seededInput;
    handleSend(seededInput, null, 'user_message');
    if (typeof onInitialInputConsumed === 'function') {
      onInitialInputConsumed();
    }
  }, [activeKey, initialInput, isSending]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const drawerPhaseData = journeyDrawerPhase
    ? projectState?.decisions?.[journeyDrawerPhase]
    : null;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        flex: 1,
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--tech-bg)',
        color: 'var(--tech-text)',
        overflow: 'hidden',
      }}
    >
      <style>
        {`
          :root {
            --tech-primary: var(--accent-primary, #4F46E5);
            --tech-primary-hover: var(--accent-purple, #7C3AED);
            --tech-bg: var(--bg-card, #FFFFFF);
            --tech-bg-alt: var(--bg-primary, #F5F7FA);
            --tech-border: var(--border-color, #E5E7EB); /* Slight border */
            --tech-text: var(--text-primary, #111827);
            --tech-text-muted: var(--text-muted, #9CA3AF);
            --tech-radius: var(--radius-lg, 16px);
          }

          [data-theme="dark"] {
            --tech-primary: var(--accent-primary, #4F46E5);
            --tech-primary-hover: var(--accent-purple, #7C3AED);
            --tech-bg: var(--bg-primary, #0A0D14);
            --tech-bg-alt: var(--bg-card, #13161D);
            --tech-border: var(--border-color, rgba(255, 255, 255, 0.1));
            --tech-text: var(--text-primary, #F9FAFB);
            --tech-text-muted: var(--text-muted, #6B7280);
          }

          .tech-container {
            flex: 1;
            display: flex;
            overflow: hidden;
            background: var(--tech-bg);
          }

          .tech-sidebar {
            width: 280px;
            background: var(--tech-bg-alt);
            border-right: 1px solid var(--tech-border);
            display: flex;
            flex-direction: column;
            transition: all 0.3s ease;
          }

          .tech-sidebar.collapsed {
            width: 60px;
          }
          
          .tech-sidebar-narrow {
            position: fixed;
            z-index: 50;
            height: 100%;
            box-shadow: 4px 0 24px rgba(0,0,0,0.1);
          }

          .tech-sidebar-header {
            padding: 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid var(--tech-border);
          }

          .tech-sidebar.collapsed .tech-sidebar-header {
            justify-content: center;
            padding: 16px 0;
          }

          .tech-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 8px 12px;
            border-radius: 8px;
            border: 1px solid var(--tech-border);
            background: var(--tech-bg);
            color: var(--tech-text);
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
          }

          .tech-btn:hover {
            background: var(--tech-bg-alt);
            border-color: var(--tech-text-muted);
          }

          .tech-action-btn {
            border: 1px solid color-mix(in oklab, var(--tech-primary) 40%, var(--tech-border));
            background: linear-gradient(145deg, var(--tech-primary), color-mix(in oklab, var(--tech-primary) 76%, #ffffff));
            color: #fff;
            font-weight: 700;
            box-shadow: 0 8px 18px color-mix(in oklab, var(--tech-primary) 32%, transparent);
            letter-spacing: 0.1px;
          }

          .tech-action-btn:hover {
            transform: translateY(-1px);
            filter: saturate(1.08);
            border-color: color-mix(in oklab, var(--tech-primary) 72%, #ffffff);
            box-shadow: 0 10px 24px color-mix(in oklab, var(--tech-primary) 40%, transparent);
          }

          .tech-action-btn:disabled {
            opacity: 0.7;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
          }
          
          .tech-btn-primary {
            background: var(--tech-primary);
            color: #fff;
            border: none;
          }
          
          .tech-btn-primary:hover {
            background: var(--tech-primary-hover);
          }
          
          .tech-btn-icon {
            padding: 8px;
            border-radius: 8px;
            background: transparent;
            border: none;
            color: var(--tech-text-muted);
            cursor: pointer;
          }
          
          .tech-btn-icon:hover {
            background: var(--tech-bg-alt);
            color: var(--tech-text);
          }

          .tech-chat-area {
            flex: 1;
            display: flex;
            flex-direction: column;
            position: relative;
            min-width: 0;
            width: 100%;
          }

          .tech-chat-header {
            padding: 12px 24px;
            border-bottom: 1px solid var(--tech-border);
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: var(--tech-bg);
            z-index: 10;
            flex-shrink: 0;
          }

          .tech-messages {
            flex: 1;
            overflow-y: auto;
            padding: 24px 0;
            scroll-behavior: smooth;
            min-height: 0;
            display: flex;
            flex-direction: column;
            width: 100%;
          }

          .tech-msg-row {
            padding: 24px 24px;
            display: flex;
            justify-content: center;
            width: 100%;
            box-sizing: border-box;
          }

          .tech-msg-row.user {
             background: var(--tech-bg-alt);
          }
           
          .tech-msg-content {
            max-width: 800px;
            width: 100%;
            display: flex;
            gap: 16px;
          }

          .tech-avatar {
            width: 32px;
            height: 32px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          }

          .tech-avatar.user {
            background: var(--tech-bg);
            border: 1px solid var(--tech-border);
            color: var(--tech-text);
          }

          .tech-avatar.assistant {
            background: var(--tech-primary);
            color: white;
          }

          .tech-msg-body {
            flex: 1;
            font-size: 15px;
            line-height: 1.6;
            color: var(--tech-text);
            min-width: 0;
          }

          .tech-input-wrapper {
             max-width: 800px;
             margin: 0 auto;
             width: 100%;
             padding: 0 24px 24px;
             box-sizing: border-box;
             flex-shrink: 0;
          }

          .tech-input-container {
            position: relative;
            background: var(--tech-bg-alt); /* Use alt background for input */
            border: 1px solid var(--tech-border);
            border-radius: var(--tech-radius);
            box-shadow: 0 4px 20px rgba(0,0,0,0.05);
            transition: border-color 0.2s;
            display: flex;
            flex-direction: column;
          }
          
          .tech-input-container:focus-within {
             border-color: var(--tech-primary);
             box-shadow: 0 4px 24px rgba(59, 130, 246, 0.1);
          }

          .tech-textarea {
            width: 100%;
            border: none;
            background: transparent;
            padding: 16px 48px 16px 16px;
            font-size: 15px;
            color: var(--tech-text);
            resize: none;
            outline: none;
            max-height: 200px;
          }

          .tech-send-btn {
            position: absolute;
            right: 8px;
            bottom: 8px;
            width: 32px;
            height: 32px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--tech-primary);
            color: white;
            border: none;
            cursor: pointer;
            transition: all 0.2s;
          }

          .tech-send-btn:disabled {
            background: var(--tech-border);
            color: var(--tech-text-muted);
            cursor: not-allowed;
          }
          
          .tech-session-item {
            padding: 10px 12px;
            margin: 4px 8px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 13px;
            color: var(--tech-text);
            display: flex;
            align-items: center;
            justify-content: space-between;
            transition: background 0.2s;
          }
          
           .tech-session-item:hover {
            background: var(--tech-bg);
           }
           
           .tech-session-item.active {
             background: var(--tech-bg);
             border: 1px solid var(--tech-border);
             font-weight: 500;
           }

          .tech-agent-markdown h1 { font-size: 15px; font-weight: 700; margin: 14px 0 6px; color: var(--tech-text); }
          .tech-agent-markdown h2 { font-size: 14px; font-weight: 700; margin: 14px 0 6px; color: var(--tech-text); }
          .tech-agent-markdown h3 { font-size: 14px; font-weight: 700; margin: 14px 0 6px; color: var(--tech-text); }
          .tech-agent-markdown h4 { font-size: 13px; font-weight: 600; margin: 10px 0 4px; color: var(--tech-text); }

          .tech-agent-markdown p { font-size: 13px; line-height: 1.6; margin: 6px 0; color: var(--tech-text-secondary); }

          .tech-agent-markdown ul, .tech-agent-markdown ol { padding-left: 18px; margin: 6px 0; display: grid; gap: 3px; }
          .tech-agent-markdown li { font-size: 13px; line-height: 1.5; color: var(--tech-text-secondary); }

          .tech-agent-markdown strong { color: var(--tech-text); font-weight: 600; }

          .tech-agent-markdown code {
            font-size: 12px;
            background: var(--tech-bg-alt);
            border: 1px solid var(--tech-border);
            border-radius: 4px;
            padding: 1px 5px;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          }

          .tech-agent-markdown pre {
            background: var(--tech-bg-alt);
            border: 1px solid var(--tech-border);
            border-radius: 8px;
            padding: 1em;
            overflow-x: auto;
            margin: 1em 0;
          }

          .tech-agent-markdown pre code {
            background: none;
            border: none;
            padding: 0;
          }

          .tech-agent-markdown a {
            color: var(--tech-primary);
            text-decoration: none;
          }
          .tech-agent-markdown a:hover {
            text-decoration: underline;
          }

          .tech-agent-markdown .tech-table-wrap {
            width: 100%;
            overflow-x: auto;
            margin: 1em 0;
            border-radius: 10px;
            border: 1px solid var(--tech-border);
          }

          .tech-agent-markdown table {
            width: 100%;
            min-width: 560px;
            border-collapse: collapse;
            background: var(--tech-bg);
            font-size: 14px;
          }

          .tech-agent-markdown thead {
            background: var(--tech-bg-alt);
          }

          .tech-agent-markdown th,
          .tech-agent-markdown td {
            border-bottom: 1px solid var(--tech-border);
            border-right: 1px solid var(--tech-border);
            text-align: left;
            padding: 10px 12px;
            vertical-align: top;
          }

          .tech-agent-markdown th:last-child,
          .tech-agent-markdown td:last-child {
            border-right: none;
          }

          .tech-agent-markdown tbody tr:last-child td {
            border-bottom: none;
          }

          @keyframes techRiseIn {
            from {
              opacity: 0;
              transform: translateY(8px) scale(0.985);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }

          .tech-card-pop {
            animation: techRiseIn 0.28s ease-out;
          }

          .tech-dashboard {
            --intent-accent: var(--tech-primary);
            margin-bottom: 14px;
            border: 1px solid color-mix(in oklab, var(--intent-accent) 24%, var(--tech-border));
            border-radius: 14px;
            background:
              radial-gradient(120% 120% at 105% -25%, color-mix(in oklab, var(--intent-accent) 24%, transparent), transparent 58%),
              linear-gradient(145deg, color-mix(in oklab, var(--intent-accent) 10%, var(--tech-bg) 90%), var(--tech-bg-alt) 72%);
            padding: 12px;
            position: relative;
            overflow: hidden;
            box-shadow: 0 10px 26px rgba(15, 23, 42, 0.08);
            transition: transform 0.24s ease, box-shadow 0.24s ease, border-color 0.24s ease;
          }

          .tech-dashboard::before {
            content: '';
            position: absolute;
            inset: 0;
            background: linear-gradient(110deg, transparent 0%, color-mix(in oklab, var(--intent-accent) 16%, transparent) 36%, transparent 72%);
            opacity: 0.38;
            pointer-events: none;
          }

          .tech-dashboard::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 3px;
            background: linear-gradient(90deg, var(--intent-accent), transparent 72%);
            pointer-events: none;
          }

          .tech-dashboard > * {
            position: relative;
            z-index: 1;
          }

          .tech-dashboard:hover {
            transform: translateY(-2px);
            box-shadow: 0 14px 30px rgba(15, 23, 42, 0.12);
            border-color: color-mix(in oklab, var(--intent-accent) 38%, var(--tech-border));
          }

          .tech-dashboard[data-intent="comparison"] {
            --intent-accent: #0ea5e9;
          }

          .tech-dashboard[data-intent="stack"] {
            --intent-accent: #14b8a6;
          }

          .tech-dashboard[data-intent="cost"] {
            --intent-accent: #f59e0b;
          }

          .tech-dashboard[data-intent="roadmap"] {
            --intent-accent: #2563eb;
          }

          .tech-dashboard[data-intent="feasibility"] {
            --intent-accent: #22c55e;
          }

          .tech-dashboard[data-intent="security"] {
            --intent-accent: #ef4444;
          }

          .tech-dashboard[data-intent="libraries"] {
            --intent-accent: #f97316;
          }

          .tech-dashboard[data-intent="architecture"] {
            --intent-accent: #0f766e;
          }

          .tech-dashboard[data-intent="generic"] {
            --intent-accent: #64748b;
          }

          .tech-dashboard-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            margin-bottom: 10px;
          }

          .tech-dashboard-head strong {
            font-size: 14px;
            letter-spacing: 0.01em;
          }

          .tech-intent-pill {
            font-size: 11px;
            color: color-mix(in oklab, var(--intent-accent) 56%, var(--tech-text));
            border: 1px solid color-mix(in oklab, var(--intent-accent) 32%, var(--tech-border));
            border-radius: 999px;
            padding: 4px 10px;
            text-transform: capitalize;
            background: color-mix(in oklab, var(--intent-accent) 14%, var(--tech-bg));
            font-weight: 700;
            letter-spacing: 0.02em;
          }

          .tech-kpi-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
            gap: 8px;
            margin-bottom: 10px;
          }

          .tech-kpi-card {
            background: linear-gradient(160deg, color-mix(in oklab, var(--intent-accent) 6%, var(--tech-bg) 94%), var(--tech-bg));
            border: 1px solid color-mix(in oklab, var(--intent-accent) 24%, var(--tech-border));
            border-radius: 10px;
            padding: 9px 10px;
            transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
            box-shadow: inset 0 1px 0 color-mix(in oklab, var(--intent-accent) 20%, transparent);
          }

          .tech-kpi-card:hover {
            transform: translateY(-1px) scale(1.01);
            box-shadow: 0 8px 18px rgba(0,0,0,0.1);
            border-color: color-mix(in oklab, var(--intent-accent) 40%, var(--tech-border));
          }

          .tech-kpi-label {
            font-size: 11px;
            color: color-mix(in oklab, var(--tech-text-muted) 78%, var(--intent-accent));
            margin-bottom: 3px;
          }

          .tech-kpi-value {
            font-size: 19px;
            font-weight: 700;
            line-height: 1.2;
            color: color-mix(in oklab, var(--intent-accent) 55%, var(--tech-text));
          }

          .tech-column-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 8px;
            margin-bottom: 10px;
          }

          .tech-panel-card {
            background: linear-gradient(165deg, color-mix(in oklab, var(--intent-accent) 7%, var(--tech-bg) 93%), var(--tech-bg));
            border: 1px solid color-mix(in oklab, var(--intent-accent) 20%, var(--tech-border));
            border-radius: 10px;
            padding: 9px 10px;
            position: relative;
            overflow: hidden;
          }

          .tech-panel-card::before {
            content: '';
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            width: 3px;
            background: color-mix(in oklab, var(--intent-accent) 72%, transparent);
            opacity: 0.85;
          }

          .tech-panel-title {
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 8px;
            color: color-mix(in oklab, var(--intent-accent) 50%, var(--tech-text));
          }

          .tech-chip-list {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
          }

          .tech-chip {
            display: inline-flex;
            align-items: center;
            font-size: 11px;
            padding: 4px 8px;
            border-radius: 999px;
            border: 1px solid color-mix(in oklab, var(--intent-accent) 28%, var(--tech-border));
            background: color-mix(in oklab, var(--intent-accent) 11%, var(--tech-bg));
            color: color-mix(in oklab, var(--intent-accent) 45%, var(--tech-text));
            transition: transform 0.16s ease, border-color 0.16s ease;
          }

          .tech-chip-link {
            text-decoration: none;
            transition: border-color 0.2s ease, color 0.2s ease, transform 0.2s ease;
          }

          .tech-chip-link:hover {
            border-color: color-mix(in oklab, var(--intent-accent) 72%, var(--tech-border));
            color: color-mix(in oklab, var(--intent-accent) 82%, var(--tech-text));
            transform: translateY(-1px);
          }

          .tech-list {
            margin: 0;
            padding-left: 16px;
            font-size: 13px;
            display: grid;
            gap: 4px;
          }

          .tech-dashboard .tech-table-wrap {
            border: 1px solid color-mix(in oklab, var(--intent-accent) 28%, var(--tech-border));
            border-radius: 10px;
            overflow: hidden;
            background: var(--tech-bg);
          }

          .tech-dashboard table {
            width: 100%;
            min-width: 520px;
            border-collapse: collapse;
            font-size: 13px;
          }

          .tech-dashboard thead {
            background: color-mix(in oklab, var(--intent-accent) 10%, var(--tech-bg-alt));
          }

          .tech-dashboard th,
          .tech-dashboard td {
            border-bottom: 1px solid color-mix(in oklab, var(--intent-accent) 16%, var(--tech-border));
            border-right: 1px solid color-mix(in oklab, var(--intent-accent) 14%, var(--tech-border));
            text-align: left;
            padding: 9px 11px;
            vertical-align: top;
          }

          .tech-dashboard th:last-child,
          .tech-dashboard td:last-child {
            border-right: none;
          }

          .tech-dashboard tbody tr:last-child td {
            border-bottom: none;
          }

          .tech-dashboard tbody tr:hover {
            background: color-mix(in oklab, var(--intent-accent) 7%, var(--tech-bg));
          }

          .tech-dashboard-section {
            margin-top: 10px;
          }

          .tech-dashboard-section-title {
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 6px;
            color: color-mix(in oklab, var(--intent-accent) 54%, var(--tech-text));
          }

          .tech-soft-note {
            font-size: 13px;
            border: 1px solid color-mix(in oklab, var(--intent-accent) 24%, var(--tech-border));
            background: linear-gradient(165deg, color-mix(in oklab, var(--intent-accent) 9%, var(--tech-bg) 91%), var(--tech-bg));
            border-radius: 10px;
            padding: 8px 10px;
          }

          .tech-score-track {
            margin-top: 7px;
            width: 100%;
            height: 7px;
            border-radius: 999px;
            background: color-mix(in oklab, var(--intent-accent) 16%, transparent);
            overflow: hidden;
          }

          .tech-score-fill {
            display: block;
            height: 100%;
            border-radius: inherit;
            background: linear-gradient(90deg, var(--intent-accent), color-mix(in oklab, var(--intent-accent) 58%, #fff));
          }

          .tech-state-pill {
            display: inline-flex;
            align-items: center;
            border-radius: 999px;
            padding: 4px 10px;
            font-size: 11px;
            font-weight: 700;
            width: fit-content;
          }

          .tech-pill-success {
            color: #0f7b53;
            background: rgba(16,185,129,0.12);
            border: 1px solid rgba(16,185,129,0.24);
          }

          .tech-pill-danger {
            color: #b4232d;
            background: rgba(244,63,94,0.12);
            border: 1px solid rgba(244,63,94,0.24);
          }

          .tech-repo-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 8px;
            margin-bottom: 10px;
          }

          .tech-repo-card {
            display: block;
            text-decoration: none;
            color: inherit;
            border: 1px solid color-mix(in oklab, var(--intent-accent) 24%, var(--tech-border));
            background: linear-gradient(165deg, color-mix(in oklab, var(--intent-accent) 8%, var(--tech-bg) 92%), var(--tech-bg));
            border-radius: 10px;
            padding: 10px;
            transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
            box-shadow: inset 0 1px 0 color-mix(in oklab, var(--intent-accent) 18%, transparent);
          }

          .tech-repo-card:hover {
            transform: translateY(-1px) scale(1.01);
            border-color: color-mix(in oklab, var(--intent-accent) 46%, var(--tech-border));
            box-shadow: 0 10px 20px rgba(0,0,0,0.09);
          }

          .tech-repo-title {
            font-size: 13px;
            font-weight: 700;
            margin-bottom: 4px;
          }

          .tech-repo-card p {
            font-size: 12px;
            color: var(--tech-text-muted);
            margin: 6px 0 0;
            line-height: 1.4;
          }

          .tech-mini-muted {
            font-size: 11px;
            color: color-mix(in oklab, var(--intent-accent) 40%, var(--tech-text-muted));
          }

          .tech-empty-note {
            font-size: 12px;
            color: var(--tech-text-muted);
          }

          .tech-diagram-pre {
            margin: 0;
            padding: 10px;
            border: 1px solid color-mix(in oklab, var(--intent-accent) 22%, var(--tech-border));
            border-radius: 10px;
            background: linear-gradient(180deg, color-mix(in oklab, var(--intent-accent) 6%, var(--tech-bg) 94%), var(--tech-bg));
            overflow-x: auto;
            font-size: 12px;
            line-height: 1.5;
          }

          .tech-architecture-graph-wrap {
            border: 1px solid color-mix(in oklab, var(--intent-accent) 28%, var(--tech-border));
            border-radius: 12px;
            background:
              radial-gradient(circle at top right, color-mix(in oklab, var(--intent-accent) 16%, transparent), transparent 56%),
              var(--tech-bg);
            overflow: hidden;
            padding: 8px;
          }

          .tech-architecture-graph {
            min-height: 240px;
            padding: 4px;
            overflow: visible;
          }

          .tech-architecture-graph svg {
            width: 100%;
            max-width: 100%;
            min-width: 0;
            height: auto;
            display: block;
          }

          .tech-architecture-graph svg .edgePath .path,
          .tech-architecture-graph svg path.flowchart-link {
            stroke-linecap: round;
            stroke-linejoin: round;
            shape-rendering: geometricPrecision;
            vector-effect: non-scaling-stroke;
          }

          .tech-architecture-graph .label {
            font-size: 11px;
          }

          .tech-diagram-details {
            margin-top: 10px;
          }

          .tech-diagram-details summary {
            cursor: pointer;
            font-size: 12px;
            color: color-mix(in oklab, var(--intent-accent) 56%, var(--tech-text-muted));
            user-select: none;
            margin-bottom: 8px;
          }

          .tech-graph-error {
            border-top: 1px solid color-mix(in oklab, var(--intent-accent) 20%, var(--tech-border));
            background: color-mix(in oklab, var(--intent-accent) 8%, var(--tech-bg-alt));
            color: #b91c1c;
            font-size: 12px;
            padding: 8px 10px;
          }

          @media (max-width: 768px) {
            .tech-architecture-graph {
              min-height: 220px;
              padding: 2px;
            }
          }
        `}
      </style>

      {/* Page Header */}
      <div className="px-6 py-5 border-b border-border bg-gradient-to-r from-cyan-500/5 via-blue-500/5 to-transparent flex-shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-foreground tracking-tight">Tech Agent</h2>
              <p className="text-xs text-muted-foreground">De l&apos;idée à la roadmap technique</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border-slate-200 bg-white text-slate-500">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Phase: {PHASE_LABELS[projectState?.current_phase] ?? 'Discovery'}</span>
            </div>
            <button
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition-colors cursor-pointer"
              onClick={() => setShowProjectBrief(true)}
            >
              <List className="w-3.5 h-3.5" />
              <span>Project Brief</span>
            </button>
          </div>
        </div>
      </div>

      <div className="tech-container">
        {/* Main Chat Area */}
        <div className="tech-chat-area">

          <ProjectJourneyBar
            projectState={projectState}
            highlightedPhase={highlightedPhase}
            onCompletedPhaseClick={(phaseKey) => setJourneyDrawerPhase(phaseKey)}
            onActivePhaseClick={scrollToLatestPhaseMessage}
          />
          <div className="tech-messages" ref={listRef}>
            {messages.length === 1 && messages[0]?.id === 'welcome' && (
               <div style={{ maxWidth: '800px', margin: '40px auto', padding: '0 24px', textAlign: 'center' }}>
                 <div style={{ width: '64px', height: '64px', background: 'var(--tech-bg-alt)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: 'var(--tech-primary)' }}>
                   <Bot size={32} />
                 </div>
                 <h2 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '12px' }}>How can I help you today?</h2>
                 <p style={{ color: 'var(--tech-text-muted)', marginBottom: '32px' }}>Ask me about architecture, scaling, or technical decisions.</p>
                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '12px', textAlign: 'left' }}>
                    {STARTER_PROMPTS.map((prompt) => (
                      <button key={prompt} onClick={() => setInput(prompt)} className="tech-btn" style={{ justifyContent: 'flex-start', padding: '16px' }}>
                        {prompt}
                      </button>
                    ))}
                 </div>
               </div>
            )}
            
            {messages
              .filter((m) => (
                m.content
                || (
                  m.role === 'assistant'
                  && (
                    m.runStatus === 'running'
                    || m.runStatus === 'failed'
                    || (Array.isArray(m.agentSteps) && m.agentSteps.length > 0)
                  )
                )
              ))
              .map((m) => {
              const isUser = m.role === 'user';
              const hasSteps = Array.isArray(m.agentSteps) && m.agentSteps.length > 0;
              const showActivity = !isUser && (hasSteps || m.runStatus === 'running' || m.runStatus === 'failed');
              const dashboard = !isUser ? safeRenderIntentDashboard(m.a2a_payload, m.id, { onPostJobs: handoffToCreateJobs, onFindCandidates: handoffToFindCandidates }) : null;
              const interactionOptions = !isUser
                ? (
                    Array.isArray(m?.a2a_payload?.interaction_options)
                      ? m.a2a_payload.interaction_options
                      : Array.isArray(m?.a2a_payload?.interaction?.options)
                        ? m.a2a_payload.interaction.options
                        : []
                  )
                    .filter((opt) => opt && typeof opt === 'object')
                    .map((opt, idx) => {
                      const explicitType = String(opt.message_type || opt.messageType || '').trim().toLowerCase();
                      const inferredType = opt.id === 'yes' || opt.id === 'proceed'
                        ? 'confirm'
                        : opt.id === 'no'
                          ? 'deny'
                          : 'command';
                      return {
                        id: String(opt.id || `${idx}`),
                        label: String(opt.label || opt.id || `Option ${idx + 1}`),
                        message: String(opt.message || opt.label || '').trim(),
                        messageType: explicitType || inferredType,
                      };
                    })
                : [];
              const showTransitionPrompt = !isUser && m.transitionPrompt && !m.transitionDismissed;
              const discoveryHasElaboration = normalizeIntent(m.a2a_payload) === 'discovery' && Boolean(m.a2a_payload?.elaboration);
              const cleanedContent = !isUser && normalizeIntent(m.a2a_payload) === 'discovery'
                ? (discoveryHasElaboration ? '' : cleanDiscoveryText(m.content))
                : stripUnknownsSections(m.content || '');
              return (
                <div id={`tech-msg-${m.id}`} key={m.id} className={`tech-msg-row ${isUser ? 'user' : 'assistant'}`}>
                  <div className="tech-msg-content">
                    <div className={`tech-avatar ${isUser ? 'user' : 'assistant'}`}>
                      {isUser ? <User size={18} /> : <Bot size={18} />}
                    </div>
                    <div className="tech-msg-body">
                      {isUser ? (
                        <div style={{ whiteSpace: 'pre-wrap', paddingTop: '4px' }}>{m.content}</div>
                      ) : (
                        <div>
                           {showActivity && (
                             <div style={{ marginBottom: '12px', border: '1px solid var(--tech-border)', borderRadius: '10px', background: 'var(--tech-bg-alt)', padding: '10px 12px' }}>
                               <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', marginBottom: hasSteps ? '8px' : 0 }}>
                                 <span style={{ fontWeight: 600 }}>Agent Activity</span>
                                 <span style={{ color: m.runStatus === 'failed' ? '#f43f5e' : 'var(--tech-text-muted)' }}>
                                   {m.runStatus === 'running' ? 'Running' : m.runStatus === 'failed' ? 'Failed' : 'Completed'}
                                 </span>
                               </div>

                               {hasSteps && m.agentSteps.map((step) => (
                                 <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', marginBottom: '6px' }}>
                                   <span style={{ width: '14px', color: step.status === 'failed' ? '#f43f5e' : '#10b981' }}>
                                     {step.status === 'failed' ? '!' : '✓'}
                                   </span>
                                   <span style={{ fontWeight: 600 }}>{formatNodeName(step.node)}</span>
                                   <span style={{ color: 'var(--tech-text-muted)' }}>{step.summary}</span>
                                 </div>
                               ))}

                               {m.runStatus === 'running' && (
                                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--tech-text-muted)' }}>
                                   <Loader2 size={13} style={{ animation: 'spin 1.5s linear infinite' }} />
                                   {m.currentNode ? `Running ${formatNodeName(m.currentNode)}...` : 'Working on your request...'}
                                 </div>
                               )}
                             </div>
                           )}

                           {dashboard}

                           {interactionOptions.length > 0 && (
                             <div style={{ marginBottom: '12px' }}>
                               <div className="tech-dashboard-section-title" style={{ marginBottom: '8px' }}>Choose your next step</div>
                               <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                               {interactionOptions.map((option) => (
                                 <button
                                   key={`${m.id}-interaction-${option.id}`}
                                   className="tech-btn tech-action-btn"
                                   disabled={isSending}
                                   onClick={() => handleSend(option.message || option.label, null, option.messageType)}
                                 >
                                   {option.label}
                                 </button>
                               ))}
                               </div>
                             </div>
                           )}

                           {cleanedContent && <div className="tech-agent-markdown" dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(cleanedContent) }} />}
                           {showTransitionPrompt && m.transitionPrompt.type === 'phase' && normalizeIntent(m.a2a_payload) !== 'team_building' && (
                             <PhaseTransitionPrompt
                               title={`✅ ${phaseLabel(m.phaseKey)} phase complete`}
                               summary={m.transitionPrompt.summary}
                               nextPhaseLabel={phaseLabel(m.transitionPrompt.nextPhase)}
                               onContinue={() => continueToPhase(m.transitionPrompt.nextPhase, m.id)}
                               onDismiss={() => dismissTransitionPrompt(m.id)}
                             />
                           )}
                           {showTransitionPrompt && m.transitionPrompt.type === 'handoff' && (
                             <HandoffCard
                               founderContext={founderContext}
                               projectState={projectState}
                               teamRoles={latestTeamRoles}
                               onPostJobs={handoffToCreateJobs}
                               onFindCandidates={handoffToFindCandidates}
                             />
                           )}
                           {(m.content || m.a2a_payload) && (
                             <div style={{ display: 'flex', gap: '8px', marginTop: '16px', alignItems: 'center' }}>
                               {m.content && <button className="tech-btn tech-btn-icon" onClick={() => copyMessage(m.content)} title="Copy"><Copy size={14} /></button>}
                               {m.a2a_payload && (
                                 <button className="tech-btn" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={() => togglePayload(m.id)}>
                                   {expandedPayloads[m.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Payload
                                 </button>
                               )}
                                {sessionId && m.a2a_payload && (
                                  <>
                                    <button className={`tech-btn tech-btn-icon ${m.feedback === 'up' ? 'active' : ''}`} style={m.feedback === 'up' ? {color: '#10b981', background: 'rgba(16,185,129,0.1)'} : {}} onClick={() => sendFeedback(m, 'up')} title="Helpful"><ThumbsUp size={14} /></button>
                                    <button className={`tech-btn tech-btn-icon ${m.feedback === 'down' ? 'active' : ''}`} style={m.feedback === 'down' ? {color: '#f43f5e', background: 'rgba(244,63,94,0.1)'} : {}} onClick={() => sendFeedback(m, 'down')} title="Not Helpful"><ThumbsDown size={14} /></button>
                                  </>
                                )}
                             </div>
                           )}
                           {expandedPayloads[m.id] && (
                             <pre style={{ marginTop: '12px', padding: '12px', borderRadius: '8px', background: 'var(--tech-bg-alt)', fontSize: '12px', overflowX: 'auto', border: '1px solid var(--tech-border)' }}>
                               {JSON.stringify(m.a2a_payload, null, 2)}
                             </pre>
                           )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="tech-input-wrapper">
             {error && (
              <div style={{ marginBottom: '12px', color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px' }}>
                {error}
              </div>
            )}
            <div className="tech-input-container">
               <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message Tech Agent..."
                className="tech-textarea"
                rows={1}
               />
               <button
                className="tech-send-btn"
                onClick={handleSend}
                disabled={!canSend}
               >
                 <Send size={16} style={{ marginLeft: '2px' }} />
               </button>
            </div>
            <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '12px', color: 'var(--tech-text-muted)' }}>
              Tech Agent can make mistakes. Consider verifying important information.
            </div>
          </div>
        </div>
      </div>

      <DecisionSummaryDrawer
        open={Boolean(journeyDrawerPhase)}
        phaseKey={journeyDrawerPhase}
        phaseLabel={phaseLabel(journeyDrawerPhase)}
        phaseData={drawerPhaseData}
        onClose={() => setJourneyDrawerPhase(null)}
        onRevisit={handleRevisitPhase}
        onExport={exportPhaseDecisions}
      />

      <ProjectBriefModal
        open={showProjectBrief}
        onClose={() => setShowProjectBrief(false)}
        projectState={projectState}
        founderContext={founderContext}
        onCopy={copyProjectBriefMarkdown}
        onDownload={downloadProjectBriefMarkdown}
      />
    </div>
  );
}

const contextInputStyle = {
  border: '1px solid var(--tech-border)',
  borderRadius: '8px',
  padding: '10px 12px',
  fontSize: '13px',
  background: 'var(--tech-bg)',
  color: 'var(--tech-text)',
  outline: 'none',
  width: '100%',
};

export { TechAgentChat };