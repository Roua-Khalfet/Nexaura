'use client'

import { useState, useCallback, memo, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Leaf, Send, Loader2, AlertCircle, CheckCircle2, ChevronDown, ChevronRight,
  Sparkles, BarChart3, ShieldCheck, Lightbulb, Zap, Target, TrendingUp
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import {
  startGreenAnalysis,
  pollGreenAnalysis,
  getGreenAnalysisResults,
  type GreenAnalysisSession,
  type GreenCertification,
  type GreenRecommendation,
  type GreenESGScore,
  type GreenTraceStep,
} from '@/lib/api'
import RoadmapView from '@/components/green-analysis/RoadmapView'

// ─── Constants ───────────────────────────────────────────────────────────────

const EXAMPLE_INPUT = `I am planning to start a small olive oil production business in Sfax, Tunisia. We will process olives from local farms, produce extra virgin olive oil, and export primarily to the European Union. We plan to use hydraulic pressing and have about 15 employees. We will need water for washing olives and energy for the pressing and bottling machinery.`

const AGENTS = [
  { id: 'input_parser', label: 'Analyse des Entrées', subtitle: 'Extraction de données structurées', icon: Target, color: 'emerald' },
  { id: 'impact_analyst', label: 'Analyste d\'Impact', subtitle: 'Évaluation de l\'empreinte environnementale', icon: BarChart3, color: 'blue' },
  { id: 'cert_advisor', label: 'Conseiller Certifications', subtitle: 'Recommandations de certifications vertes', icon: ShieldCheck, color: 'violet' },
  { id: 'sustainability_coach', label: 'Coach Durabilité', subtitle: 'Plan d\'action durable', icon: Lightbulb, color: 'amber' },
  { id: 'esg_scorer', label: 'Score ESG', subtitle: 'Notation ESG & rapport final', icon: TrendingUp, color: 'rose' },
] as const

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; icon: string; shadow: string; light: string }> = {
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', icon: 'text-emerald-600', shadow: 'shadow-emerald-500/10', light: 'bg-emerald-100/50' },
  blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: 'text-blue-600', shadow: 'shadow-blue-500/10', light: 'bg-blue-100/50' },
  violet: { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', icon: 'text-violet-600', shadow: 'shadow-violet-500/10', light: 'bg-violet-100/50' },
  amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: 'text-amber-600', shadow: 'shadow-amber-500/10', light: 'bg-amber-100/50' },
  rose: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', icon: 'text-rose-600', shadow: 'shadow-rose-500/10', light: 'bg-rose-100/50' },
}

// ─── Animation Variants ──────────────────────────────────────────────────────

const staggerContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
}

const staggerItem = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } },
}

// ─── Agent Pipeline Card ─────────────────────────────────────────────────────

const MIN_RUNNING_MS = 1500

const AgentCard = memo(function AgentCard({
  agent,
  status,
  trace,
}: {
  agent: typeof AGENTS[number]
  status?: string
  trace: GreenTraceStep[]
}) {
  const backendStatus = status || 'idle'
  const [displayStatus, setDisplayStatus] = useState<string>('idle')
  const runningAt = useRef<number | null>(null)
  const [expanded, setExpanded] = useState(false)
  const colors = COLOR_MAP[agent.color]
  const Icon = agent.icon

  useEffect(() => {
    if (backendStatus === 'running') {
      if (runningAt.current === null) runningAt.current = Date.now()
      setDisplayStatus('running')
    } else if (backendStatus === 'completed' || backendStatus === 'failed') {
      if (runningAt.current === null) {
        setDisplayStatus(backendStatus)
        return
      }
      const elapsed = Date.now() - runningAt.current
      const remaining = Math.max(0, MIN_RUNNING_MS - elapsed)
      const timer = setTimeout(() => setDisplayStatus(backendStatus), remaining)
      return () => clearTimeout(timer)
    } else {
      setDisplayStatus('idle')
    }
  }, [backendStatus])

  const isRunning = displayStatus === 'running'
  const isCompleted = displayStatus === 'completed'
  const isFailed = displayStatus === 'failed'

  return (
    <motion.div
      variants={staggerItem}
      className={`
        bg-white/60 backdrop-blur-xl rounded-[24px] border p-5 transition-all duration-500 relative overflow-hidden
        ${isRunning ? `${colors.border} ${colors.shadow} shadow-lg` : ''}
        ${isCompleted ? 'border-emerald-200 shadow-emerald-500/10 shadow-md' : ''}
        ${isFailed ? 'border-red-200 shadow-red-500/10 shadow-md' : ''}
        ${!isRunning && !isCompleted && !isFailed ? 'border-white/80 shadow-[0_4px_20px_rgb(0,0,0,0.03)]' : ''}
      `}
    >
      {/* Running glow */}
      {isRunning && (
        <motion.div
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
          className={`absolute inset-0 ${colors.light} rounded-[24px]`}
        />
      )}

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isCompleted ? 'bg-emerald-100' : isFailed ? 'bg-red-100' : colors.bg}`}>
            {isCompleted ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            ) : isFailed ? (
              <AlertCircle className="w-5 h-5 text-red-600" />
            ) : (
              <Icon className={`w-5 h-5 ${colors.icon}`} />
            )}
          </div>
          {isRunning && (
            <span className="relative flex h-3 w-3">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${colors.bg.replace('50', '400')} opacity-75`} />
              <span className={`relative inline-flex rounded-full h-3 w-3 ${colors.bg.replace('50', '500')}`} />
            </span>
          )}
        </div>

        {/* Status badge */}
        <div className="mb-2">
          <span className={`text-[10px] font-black uppercase tracking-widest ${
            isCompleted ? 'text-emerald-600' : isFailed ? 'text-red-600' : isRunning ? colors.text : 'text-slate-400'
          }`}>
            {isCompleted ? 'Terminé' : isFailed ? 'Échoué' : isRunning ? 'En cours…' : 'En attente'}
          </span>
        </div>

        {/* Agent info */}
        <p className="text-sm font-bold text-slate-800 leading-tight">{agent.label}</p>
        <p className="text-[11px] text-slate-500 mt-0.5">{agent.subtitle}</p>

        {/* Trace */}
        {trace.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors w-full"
            >
              {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <span>{trace.length} étapes</span>
            </button>
            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {trace.map((step, i) => (
                      <div key={i} className="flex gap-1.5 text-[11px] leading-snug text-slate-500">
                        <span className="shrink-0 mt-0.5">
                          {step.step === 'tool_call' ? '🔧' : step.step === 'llm_call' ? '🧠' : step.step === 'result' ? '✅' : step.step === 'error' ? '❌' : '•'}
                        </span>
                        <span>{step.detail}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  )
})

// ─── ESG Score Display ───────────────────────────────────────────────────────

function ScoreBar({ label, score, color }: { label: string; score: number; color: string }) {
  const pct = Math.round((score / 100) * 100)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</span>
        <span className="text-sm font-black text-slate-700">{score}/100</span>
      </div>
      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1.2, ease: [0.4, 0, 0.2, 1] }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
    </div>
  )
}

function ESGScorePanel({ score }: { score: GreenESGScore }) {
  const gradeColor =
    score.composite_score >= 80 ? 'text-emerald-600' :
    score.composite_score >= 65 ? 'text-blue-600' :
    score.composite_score >= 50 ? 'text-amber-600' :
    'text-red-600'

  const gradeBg =
    score.composite_score >= 80 ? 'from-emerald-500 to-teal-500' :
    score.composite_score >= 65 ? 'from-blue-500 to-indigo-500' :
    score.composite_score >= 50 ? 'from-amber-500 to-orange-500' :
    'from-red-500 to-rose-500'

  return (
    <motion.div variants={staggerItem} className="bg-white/60 backdrop-blur-2xl p-8 rounded-[32px] border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden">
      <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-100/40 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Score ESG Global</span>
            <h3 className="text-lg font-black text-slate-800 mt-1">Performance Environnementale</h3>
          </div>
          <div className="text-center">
            <div className={`w-20 h-20 rounded-[20px] bg-gradient-to-br ${gradeBg} flex items-center justify-center shadow-lg`}>
              <span className="text-2xl font-black text-white">{score.letter_grade}</span>
            </div>
            <p className="text-[10px] font-bold text-slate-400 mt-1.5">{score.composite_score}/100</p>
          </div>
        </div>

        <div className="space-y-4">
          <ScoreBar label="Environnement (50%)" score={score.environmental_score} color="bg-gradient-to-r from-emerald-400 to-teal-500" />
          <ScoreBar label="Social (25%)" score={score.social_score} color="bg-gradient-to-r from-blue-400 to-indigo-500" />
          <ScoreBar label="Gouvernance (25%)" score={score.governance_score} color="bg-gradient-to-r from-violet-400 to-purple-500" />
        </div>

        {score.summary && (
          <p className="text-sm text-slate-500 mt-5 leading-relaxed">{score.summary}</p>
        )}
      </div>
    </motion.div>
  )
}

// ─── Certification Journey ───────────────────────────────────────────────────

function CertificationJourney({ certifications }: { certifications: GreenCertification[] }) {
  const phases = [
    { id: 'now', label: 'Maintenant', priorities: ['high'], color: 'emerald', desc: 'Forte priorité et impact immédiat' },
    { id: 'next', label: 'Prochaine Étape', priorities: ['medium'], color: 'blue', desc: 'Certifications de priorité moyenne' },
    { id: 'later', label: 'Plus Tard', priorities: ['low'], color: 'slate', desc: 'Certifications à long terme' },
  ]

  const grouped = phases.map((phase) => ({
    ...phase,
    items: certifications.filter((c) => phase.priorities.includes((c.priority || '').toLowerCase())),
  }))

  // Put uncategorized in "later"
  const categorized = new Set(['high', 'medium', 'low'])
  const uncategorized = certifications.filter((c) => !categorized.has((c.priority || '').toLowerCase()))
  if (uncategorized.length > 0) {
    grouped[2] = { ...grouped[2], items: [...grouped[2].items, ...uncategorized] }
  }

  return (
    <motion.div variants={staggerItem} className="bg-white/60 backdrop-blur-2xl p-8 rounded-[32px] border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden">
      <div className="absolute top-0 left-0 w-32 h-32 bg-violet-100/40 rounded-full blur-3xl -translate-y-1/2 -translate-x-1/2" />

      <div className="relative z-10">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Parcours Certification</span>
        <h3 className="text-lg font-black text-slate-800 mt-1 mb-6">Feuille de Route Certifications</h3>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {grouped.map((phase) => {
            const c = COLOR_MAP[phase.color] || COLOR_MAP.emerald
            return (
              <div key={phase.id} className={`rounded-[20px] border ${c.border} ${c.bg} p-4`}>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${c.text.replace('text-', 'bg-')}`} />
                  <h4 className={`text-xs font-black uppercase tracking-widest ${c.text}`}>{phase.label}</h4>
                  <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${c.light} ${c.text}`}>
                    {phase.items.length}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mb-3">{phase.desc}</p>

                {phase.items.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-[11px] text-slate-400 text-center">
                    Aucune certification dans cette phase
                  </div>
                ) : (
                  <div className="space-y-2">
                    {phase.items.map((cert, idx) => (
                      <div key={`${cert.name}-${idx}`} className="rounded-xl bg-white/80 border border-white/60 p-3 shadow-sm">
                        <p className="text-sm font-bold text-slate-700">{cert.name}</p>
                        {cert.relevance && <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{cert.relevance}</p>}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {cert.estimated_timeline && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                              {cert.estimated_timeline}
                            </span>
                          )}
                          {cert.estimated_cost && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                              {cert.estimated_cost}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </motion.div>
  )
}

// ─── Recommendations ─────────────────────────────────────────────────────────

function RecommendationCard({ rec }: { rec: GreenRecommendation }) {
  const impactColor = rec.estimated_impact === 'high' ? 'text-emerald-600 bg-emerald-50' :
    rec.estimated_impact === 'medium' ? 'text-amber-600 bg-amber-50' : 'text-slate-500 bg-slate-50'
  const diffColor = rec.implementation_difficulty === 'easy' ? 'text-emerald-600 bg-emerald-50' :
    rec.implementation_difficulty === 'hard' ? 'text-red-600 bg-red-50' : 'text-amber-600 bg-amber-50'

  return (
    <motion.div
      variants={staggerItem}
      whileHover={{ y: -2 }}
      className="bg-white/60 backdrop-blur-xl p-5 rounded-[20px] border border-white/80 shadow-[0_4px_20px_rgb(0,0,0,0.03)]"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="text-sm font-bold text-slate-800">{rec.title}</p>
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full shrink-0">
          {rec.category}
        </span>
      </div>
      <p className="text-[12px] text-slate-500 leading-relaxed mb-3">{rec.description}</p>
      <div className="flex flex-wrap gap-2">
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${impactColor}`}>
          Impact: {rec.estimated_impact}
        </span>
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${diffColor}`}>
          Difficulté: {rec.implementation_difficulty}
        </span>
        {rec.estimated_cost && (
          <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-50 text-slate-500">
            {rec.estimated_cost}
          </span>
        )}
      </div>
      {rec.relevant_programs && rec.relevant_programs.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {rec.relevant_programs.map((p) => (
            <span key={p} className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-600">
              {p}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  )
}

// ─── Full Report (Collapsible) ───────────────────────────────────────────────

function FullReport({ report }: { report: string }) {
  const [open, setOpen] = useState(false)

  return (
    <motion.div variants={staggerItem} className="bg-white/60 backdrop-blur-2xl rounded-[32px] border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-8 py-5 hover:bg-slate-50/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-slate-800">Rapport Complet (Markdown)</p>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Cliquer pour développer</p>
          </div>
        </div>
        <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-8 pb-8 prose prose-sm prose-slate max-w-none whitespace-pre-wrap text-sm text-slate-600 leading-relaxed">
              {report}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── Main Section Component ──────────────────────────────────────────────────

export default function GreenAnalysisSection() {
  const [input, setInput] = useState('')
  const [agentStatuses, setAgentStatuses] = useState<Record<string, string>>({})
  const [agentTraces, setAgentTraces] = useState<Record<string, GreenTraceStep[]>>({})
  const [results, setResults] = useState<GreenAnalysisSession | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAnalyze = useCallback(async () => {
    if (!input.trim() || loading) return

    setLoading(true)
    setError(null)
    setResults(null)
    setAgentStatuses({})
    setAgentTraces({})

    try {
      const { id } = await startGreenAnalysis(input)

      await pollGreenAnalysis(
        id,
        (agent, status) => setAgentStatuses((prev) => ({ ...prev, [agent]: status })),
        (agent, steps) => setAgentTraces((prev) => ({ ...prev, [agent]: steps })),
      )

      const data = await getGreenAnalysisResults(id)
      setResults(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }, [input, loading])

  const completedAgents = Object.values(agentStatuses).filter((s) => s === 'completed').length
  const totalAgents = AGENTS.length
  const progressPct = loading ? Math.round((completedAgents / totalAgents) * 100) : 0

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border bg-gradient-to-r from-emerald-50/40 via-teal-50/20 to-transparent">
        <div className="flex items-center gap-4">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-14 h-14 rounded-[20px] bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/25"
          >
            <Leaf className="w-7 h-7 text-white" />
          </motion.div>
          <div>
            <h2 className="text-xl font-black uppercase tracking-wider text-slate-800">Analyse Verte</h2>
            <p className="text-xs font-bold text-slate-500 tracking-wider">ANALYSE ENVIRONNEMENTALE INTELLIGENTE & RECOMMANDATIONS ESG</p>
          </div>
          {loading && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="ml-auto flex items-center gap-3"
            >
              <div className="w-40">
                <Progress value={progressPct} className="h-2" />
              </div>
              <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                {completedAgents}/{totalAgents} agents
              </span>
            </motion.div>
          )}
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Input Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/60 backdrop-blur-2xl p-8 rounded-[32px] border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-100/30 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

          <div className="relative z-10">
            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-4 py-2 rounded-full shadow-sm border border-emerald-100/50">
              Description du Projet
            </span>

            <div className="mt-5">
              <Textarea
                placeholder="Décrivez votre projet d'entreprise en Tunisie (secteur, activité, taille, lieu, exportation…)"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={loading}
                className="min-h-[120px] bg-white/80 border-slate-200 rounded-2xl resize-none text-sm focus:ring-emerald-500/20 focus:border-emerald-300"
              />
            </div>

            <div className="flex items-center gap-3 mt-4">
              <Button
                onClick={handleAnalyze}
                disabled={loading || !input.trim()}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-2xl px-6 py-2.5 font-bold shadow-lg shadow-emerald-500/25 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                {loading ? 'Analyse en cours…' : 'Analyser'}
              </Button>

              <button
                onClick={() => setInput(EXAMPLE_INPUT)}
                disabled={loading}
                className="text-xs font-bold text-slate-400 hover:text-emerald-600 transition-colors px-3 py-2 rounded-xl hover:bg-emerald-50/50"
              >
                <Zap className="w-3.5 h-3.5 inline mr-1" />
                Charger un exemple
              </button>
            </div>
          </div>
        </motion.div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="rounded-2xl border border-red-200 bg-red-50/80 backdrop-blur-xl px-5 py-4 flex items-center gap-3"
            >
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Agent Pipeline */}
        <AnimatePresence>
          {(loading || results) && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <div className="flex items-center gap-3 mb-4">
                <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-4 py-2 rounded-full shadow-sm border border-blue-100/50">
                  Pipeline d&apos;Agents IA
                </span>
                {loading && (
                  <span className="text-[10px] font-bold text-blue-500 animate-pulse">Exécution parallèle collaborative…</span>
                )}
                {results?.status === 'completed' && (
                  <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Terminé
                  </span>
                )}
              </div>

              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4"
              >
                {AGENTS.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    status={agentStatuses[agent.id]}
                    trace={agentTraces[agent.id] || []}
                  />
                ))}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results */}
        <AnimatePresence>
          {results?.status === 'completed' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
              key="results"
            >
              {/* ESG Score */}
              {results.esg_score && (
                <motion.div variants={staggerContainer} initial="hidden" animate="show">
                  <ESGScorePanel score={results.esg_score} />
                </motion.div>
              )}

              {/* Certifications */}
              {results.certifications && results.certifications.length > 0 && (
                <motion.div variants={staggerContainer} initial="hidden" animate="show">
                  <CertificationJourney certifications={results.certifications} />
                </motion.div>
              )}

              {/* Recommendations */}
              {results.recommendations && results.recommendations.length > 0 && (
                <div>
                  <motion.div variants={staggerContainer} initial="hidden" animate="show" className="mb-6">
                    <RoadmapView
                      recommendations={results.recommendations}
                      businessName={String((results.parsed_input as { business_name?: string; sector?: string } | undefined)?.business_name || (results.parsed_input as { sector?: string } | undefined)?.sector || 'Votre Projet')}
                    />
                  </motion.div>

                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest bg-amber-50 px-4 py-2 rounded-full shadow-sm border border-amber-100/50">
                      Recommandations Durables
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      {results.recommendations.length} actions proposées
                    </span>
                  </div>
                  <motion.div
                    variants={staggerContainer}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-1 lg:grid-cols-2 gap-4"
                  >
                    {results.recommendations.map((rec, i) => (
                      <RecommendationCard key={i} rec={rec} />
                    ))}
                  </motion.div>
                </div>
              )}

              {/* Full Report */}
              {results.final_report && (
                <motion.div variants={staggerContainer} initial="hidden" animate="show">
                  <FullReport report={results.final_report} />
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
