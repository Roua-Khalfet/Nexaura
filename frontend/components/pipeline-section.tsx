'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  FileText, Scale, TrendingUp, ClipboardCheck, CheckCircle2,
  Loader2, ChevronRight, Rocket, Sparkles, ArrowRight, AlertCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { analyzeConformite, type ConformiteResult } from '@/lib/api'

/* ── Types ── */
export interface ProjectData {
  nom: string
  description: string
  sector: string
  capital: string
  typeSociete: string
  activite: string
  fondateurs: string[]
  siege: string
  location: string
  clientType: string
  priceRange: string
  problemSolved: string
  differentiator: string
  stage: string
  budget: string
}

export type PipelineStep = 'description' | 'juridique' | 'marketing' | 'rapport'

export interface PipelineState {
  currentStep: PipelineStep
  completedSteps: PipelineStep[]
  activeStep: PipelineStep | null
  juridique: ConformiteResult | null
  marketing: MarketingResult | null
}

export interface MarketingResult {
  swot: {
    strengths: SWOTItem[]
    weaknesses: SWOTItem[]
    opportunities: SWOTItem[]
    threats: SWOTItem[]
  }
  strategies: {
    strategic_summary: string
    so_strategies: string[]
    st_strategies: string[]
    wo_strategies: string[]
    wt_strategies: string[]
  }
  actions: ActionItem[]
  score: {
    viability: number
    market_opportunity: number
    competition_risk: number
    recommendation: string
  }
  personas: PersonaItem[]
  competitors: CompetitorItem[]
}

interface SWOTItem { point: string; detail: string; impact: string }
interface ActionItem { action: string; why: string; timeline: string; swot_link: string }
interface PersonaItem { name: string; age: string; role: string; motivations: string[]; frustrations: string[]; channels: string[] }
interface CompetitorItem { name: string; url: string; strengths: string[]; weaknesses: string[] }

const STEPS: { id: PipelineStep; label: string; icon: React.ElementType; color: string }[] = [
  { id: 'description', label: 'Description', icon: FileText, color: 'teal' },
  { id: 'juridique', label: 'Analyse Juridique', icon: Scale, color: 'blue' },
  { id: 'marketing', label: 'Analyse Marketing', icon: TrendingUp, color: 'pink' },
  { id: 'rapport', label: 'Rapport Final', icon: ClipboardCheck, color: 'amber' },
]

const SECTORS = [
  { id: 'Fintech', label: 'Fintech', emoji: '💳', risk: 'élevé' },
  { id: 'HealthTech', label: 'HealthTech', emoji: '🏥', risk: 'élevé' },
  { id: 'EdTech', label: 'EdTech', emoji: '📚', risk: 'moyen' },
  { id: 'E-commerce', label: 'E-commerce', emoji: '🛒', risk: 'moyen' },
  { id: 'SaaS', label: 'SaaS', emoji: '☁️', risk: 'faible' },
  { id: 'FoodTech', label: 'FoodTech', emoji: '🍽️', risk: 'moyen' },
  { id: 'Restauration', label: 'Restauration', emoji: '🍝', risk: 'moyen' },
  { id: 'Autre', label: 'Autre', emoji: '🚀', risk: 'moyen' },
]

/* ── Conversational Questions ── */
const QUESTIONS = [
  { key: 'nom', label: 'Quel est le nom de votre projet ?', placeholder: 'Ex : TechInnovate' },
  { key: 'sector', label: 'Dans quel secteur opérez-vous ?', type: 'select' as const },
  { key: 'typeSociete', label: 'Quelle forme juridique envisagez-vous ?', type: 'choice' as const, options: ['SUARL', 'SARL', 'SA', 'SAS'] },
  { key: 'capital', label: 'Quel est le capital social (TND) ?', placeholder: 'Ex : 10000' },
  { key: 'description', label: 'Décrivez votre projet en quelques phrases', placeholder: 'Ex : Plateforme SaaS de gestion de projets pour PME...' },
  { key: 'activite', label: 'Quelle est l\'activité principale exacte ?', placeholder: 'Ex : Développement de logiciels B2B' },
  { key: 'location', label: 'Où est situé le siège social ?', placeholder: 'Ex : Grand Tunis' },
  { key: 'clientType', label: 'Quel est votre type de clientèle ?', placeholder: 'Ex : B2B (PME de 10-50 employés)' },
]

interface PipelineSectionProps {
  projectData: ProjectData
  setProjectData: (data: ProjectData) => void
  pipelineState: PipelineState
  setPipelineState: (state: PipelineState) => void
  onNavigate: (section: string) => void
}

export default function PipelineSection({
  projectData, setProjectData, pipelineState, setPipelineState, onNavigate,
}: PipelineSectionProps) {
  const [questionIndex, setQuestionIndex] = useState(0)
  const [currentAnswer, setCurrentAnswer] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState('')
  const [selectedPipelineView, setSelectedPipelineView] = useState<PipelineStep>('description')

  /* Check if description phase is complete */
  const isDescriptionComplete = !!(projectData.nom && projectData.description && projectData.sector)

  /* Handle conversational answer */
  const handleAnswer = useCallback(() => {
    if (!currentAnswer.trim() && QUESTIONS[questionIndex].type !== 'select' && QUESTIONS[questionIndex].type !== 'choice') return
    const key = QUESTIONS[questionIndex].key as keyof ProjectData
    const value = currentAnswer.trim()

    if (key === 'fondateurs') {
      setProjectData({ ...projectData, fondateurs: value.split(',').map(f => f.trim()) })
    } else {
      setProjectData({ ...projectData, [key]: value })
    }

    setCurrentAnswer('')
    if (questionIndex < QUESTIONS.length - 1) {
      setQuestionIndex(questionIndex + 1)
    }
  }, [currentAnswer, questionIndex, projectData, setProjectData])

  /* Mark description as done when key fields filled */
  useEffect(() => {
    if (isDescriptionComplete && !pipelineState.completedSteps.includes('description')) {
      setPipelineState({
        ...pipelineState,
        completedSteps: [...pipelineState.completedSteps, 'description'],
        currentStep: 'juridique',
      })
    }
  }, [isDescriptionComplete, pipelineState, setPipelineState])

  /* Launch juridique analysis */
  const handleJuridiqueAnalysis = async () => {
    setIsAnalyzing(true)
    setAnalyzeError('')
    try {
      // Use capital if set, otherwise fallback to budget
      const capitalValue = projectData.capital || projectData.budget
      const result = await analyzeConformite({
        project_description: projectData.description,
        sector: projectData.sector,
        capital: capitalValue ? parseInt(capitalValue) : null,
        type_societe: projectData.typeSociete || 'SUARL',
      })
      setPipelineState({
        ...pipelineState,
        juridique: result,
        completedSteps: [...pipelineState.completedSteps.filter(s => s !== 'juridique'), 'juridique'],
        currentStep: 'marketing',
      })
      // Navigate to conformite section to show detailed results
      onNavigate('conformite')
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : 'Erreur analyse')
    } finally {
      setIsAnalyzing(false)
    }
  }

  /* Launch marketing analysis (triggers navigation to marketing section) */
  const handleMarketingAnalysis = () => {
    onNavigate('marketing')
  }

  /* Get step state */
  const getStepState = (stepId: PipelineStep): 'idle' | 'active' | 'done' => {
    if (pipelineState.completedSteps.includes(stepId)) return 'done'
    if (pipelineState.currentStep === stepId) return 'active'
    return 'idle'
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border bg-gradient-to-r from-teal-500/5 via-blue-500/5 to-transparent">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center shadow-lg shadow-teal-500/20">
            <Rocket className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-foreground tracking-tight">Pipeline Startify</h2>
            <p className="text-xs text-muted-foreground">De la description au rapport complet</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── Pipeline Visual ── */}
        <div className="px-6 py-8">
          <div className="flex items-center justify-between max-w-3xl mx-auto">
            {STEPS.map((step, i) => {
              const state = getStepState(step.id)
              const Icon = step.icon
              return (
                <div key={step.id} className="flex items-center flex-1 last:flex-none">
                  {/* Node */}
                  <button
                    onClick={() => setSelectedPipelineView(step.id)}
                    className={`flex flex-col items-center gap-2 group cursor-pointer transition-all duration-500 ${
                      selectedPipelineView === step.id ? 'scale-105' : ''
                    }`}
                  >
                    <div className={`relative w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-500 ${
                      state === 'done' ? 'pipeline-node-done' :
                      state === 'active' ? 'pipeline-node-active' :
                      'pipeline-node-idle'
                    }`}>
                      {state === 'done' ? (
                        <CheckCircle2 className="w-7 h-7 text-emerald-500 animate-check-pop" />
                      ) : state === 'active' ? (
                        <Icon className="w-7 h-7" />
                      ) : (
                        <Icon className="w-7 h-7 opacity-40" />
                      )}
                      {state === 'active' && (
                        <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-teal-500 animate-pulse" />
                      )}
                    </div>
                    <span className={`text-xs font-semibold text-center transition-colors ${
                      state === 'done' ? 'text-emerald-600' :
                      state === 'active' ? 'text-foreground' :
                      'text-muted-foreground/50'
                    }`}>
                      {step.label}
                    </span>
                  </button>

                  {/* Connector line */}
                  {i < STEPS.length - 1 && (
                    <div className="flex-1 mx-3 relative">
                      <div className={`rounded-full transition-all duration-700 ${
                        getStepState(STEPS[i + 1].id) === 'done' || getStepState(step.id) === 'done'
                          ? 'pipeline-line-done'
                          : getStepState(STEPS[i + 1].id) === 'active'
                          ? 'pipeline-line-active'
                          : 'pipeline-line-idle'
                      }`} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Content Area ── */}
        <div className="px-6 pb-8">
          <div className="max-w-3xl mx-auto">

            {/* ─── DESCRIPTION STEP ─── */}
            {selectedPipelineView === 'description' && (
              <div className="animate-slide-up space-y-6">
                <div className="startify-card p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <FileText className="w-5 h-5 text-teal-600" />
                    <h3 className="text-base font-bold text-foreground">Description du projet</h3>
                    {isDescriptionComplete && (
                      <span className="ml-auto text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                        ✓ Complété
                      </span>
                    )}
                  </div>

                  {/* Conversational Form */}
                  <div className="space-y-4">
                    {QUESTIONS.map((q, i) => {
                      const key = q.key as keyof ProjectData
                      const value = projectData[key]
                      const isCurrentQ = i === questionIndex
                      const isAnswered = typeof value === 'string' ? !!value : (Array.isArray(value) && value.length > 0 && value[0] !== '')

                      // Show answered questions as chips, current as input
                      if (i > questionIndex && !isAnswered) return null

                      return (
                        <div key={q.key} className={`transition-all duration-300 ${isCurrentQ ? 'opacity-100' : 'opacity-80'}`}>
                          <label className="text-xs font-semibold text-foreground/70 mb-1 block">{q.label}</label>
                          {isAnswered && !isCurrentQ ? (
                            <button
                              onClick={() => setQuestionIndex(i)}
                              className="w-full text-left px-3 py-2 rounded-lg bg-teal-50/50 border border-teal-200/50 text-sm text-foreground hover:border-teal-300 transition-colors"
                            >
                              {typeof value === 'string' ? value : (value as string[]).join(', ')}
                            </button>
                          ) : isCurrentQ ? (
                            <div className="space-y-2">
                              {q.type === 'select' ? (
                                <div className="grid grid-cols-4 gap-2">
                                  {SECTORS.map(s => (
                                    <button
                                      key={s.id}
                                      onClick={() => {
                                        setProjectData({ ...projectData, sector: s.id })
                                        setCurrentAnswer(s.id)
                                        if (questionIndex < QUESTIONS.length - 1) setQuestionIndex(questionIndex + 1)
                                      }}
                                      className={`p-2.5 rounded-xl border-2 text-center transition-all ${
                                        projectData.sector === s.id
                                          ? 'border-teal-400 bg-teal-50/50 shadow-sm'
                                          : 'border-border hover:border-teal-300'
                                      }`}
                                    >
                                      <span className="text-xl block">{s.emoji}</span>
                                      <span className="text-[10px] font-semibold block mt-0.5 text-foreground">{s.label}</span>
                                    </button>
                                  ))}
                                </div>
                              ) : q.type === 'choice' ? (
                                <div className="flex gap-2">
                                  {q.options?.map(opt => (
                                    <button
                                      key={opt}
                                      onClick={() => {
                                        setProjectData({ ...projectData, [key]: opt })
                                        if (questionIndex < QUESTIONS.length - 1) setQuestionIndex(questionIndex + 1)
                                      }}
                                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                                        projectData[key] === opt ? 'bg-teal-500 text-white' : 'bg-secondary hover:bg-teal-100'
                                      }`}
                                    >{opt}</button>
                                  ))}
                                </div>
                              ) : q.key === 'description' ? (
                                <div className="flex gap-2">
                                  <Textarea
                                    value={currentAnswer}
                                    onChange={e => setCurrentAnswer(e.target.value)}
                                    placeholder={q.placeholder}
                                    className="rounded-xl min-h-[80px]"
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAnswer() } }}
                                  />
                                </div>
                              ) : (
                                <div className="flex gap-2">
                                  <Input
                                    value={currentAnswer}
                                    onChange={e => setCurrentAnswer(e.target.value)}
                                    placeholder={q.placeholder}
                                    className="rounded-lg"
                                    onKeyDown={e => { if (e.key === 'Enter') handleAnswer() }}
                                    type={q.key === 'capital' ? 'number' : 'text'}
                                  />
                                  <Button onClick={handleAnswer} size="icon" className="shrink-0 rounded-lg bg-teal-500 hover:bg-teal-600">
                                    <ArrowRight className="w-4 h-4" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Next step CTA */}
                {isDescriptionComplete && (
                  <Button
                    onClick={() => { setSelectedPipelineView('juridique') }}
                    className="w-full py-5 rounded-xl text-sm font-semibold bg-gradient-to-r from-teal-500 to-blue-600 hover:from-teal-600 hover:to-blue-700 shadow-lg shadow-teal-500/20 gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    Passer à l&apos;Analyse Juridique
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                )}
              </div>
            )}

            {/* ─── JURIDIQUE STEP ─── */}
            {selectedPipelineView === 'juridique' && (
              <div className="animate-slide-up space-y-6">
                <div className="startify-card p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Scale className="w-5 h-5 text-blue-600" />
                    <h3 className="text-base font-bold text-foreground">Analyse Juridique</h3>
                    {pipelineState.juridique && (
                      <span className="ml-auto text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                        Score : {pipelineState.juridique.score_global}/100
                      </span>
                    )}
                  </div>

                  {!isDescriptionComplete ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Veuillez d&apos;abord compléter la description du projet</p>
                      <Button variant="outline" size="sm" className="mt-3" onClick={() => setSelectedPipelineView('description')}>
                        Retour à la description
                      </Button>
                    </div>
                  ) : !pipelineState.juridique ? (
                    <div className="space-y-4">
                      <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-200/50 space-y-2">
                        <p className="text-sm text-blue-800 font-medium">Prêt pour l&apos;analyse de conformité</p>
                        <p className="text-xs text-blue-600/70">
                          Projet : <strong>{projectData.nom}</strong> • Secteur : <strong>{projectData.sector}</strong>
                          {projectData.capital && <> • Capital : <strong>{projectData.capital} TND</strong></>}
                        </p>
                      </div>
                      <Button
                        onClick={handleJuridiqueAnalysis}
                        disabled={isAnalyzing}
                        className="w-full py-5 rounded-xl text-sm font-semibold bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-lg shadow-blue-500/20 gap-2"
                      >
                        {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scale className="w-4 h-4" />}
                        {isAnalyzing ? 'Analyse en cours...' : 'Lancer l\'analyse juridique'}
                      </Button>
                      {analyzeError && <div className="p-3 rounded-xl bg-red-50 text-red-600 text-xs border border-red-200">{analyzeError}</div>}
                    </div>
                  ) : (
                    /* Juridique Results Summary */
                    <div className="space-y-4">
                      {/* Score gauge mini */}
                      <div className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/50">
                        <div className="relative w-16 h-16">
                          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                            <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="6" className="text-blue-200" />
                            <circle cx="50" cy="50" r="45" fill="none"
                              stroke={pipelineState.juridique.score_global >= 75 ? '#10b981' : pipelineState.juridique.score_global >= 50 ? '#f59e0b' : '#ef4444'}
                              strokeWidth="6" strokeLinecap="round"
                              strokeDasharray={283} strokeDashoffset={283 - (pipelineState.juridique.score_global / 100) * 283}
                              style={{ transition: 'stroke-dashoffset 1.5s ease-out' }} />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-lg font-black text-blue-700">{pipelineState.juridique.score_global}</span>
                          </div>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-blue-800">Conformité : {pipelineState.juridique.status === 'conforme' ? '✓ Conforme' : pipelineState.juridique.status === 'conforme_reserves' ? '⚠ Avec réserves' : '✗ Non conforme'}</p>
                          <p className="text-xs text-blue-600/70 mt-1">{pipelineState.juridique.criteres.length} critères analysés • {pipelineState.juridique.recommendations.length} recommandations</p>
                        </div>
                        <Button variant="outline" size="sm" className="text-xs" onClick={() => onNavigate('conformite')}>
                          Détails <ChevronRight className="w-3 h-3 ml-1" />
                        </Button>
                      </div>

                      {/* Key recommendations */}
                      {pipelineState.juridique.recommendations.slice(0, 3).map((rec, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-foreground/70 pl-2">
                          <span className="font-bold text-blue-500 mt-0.5">{i + 1}.</span>
                          <span>{rec}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Next step */}
                {pipelineState.juridique && (
                  <Button
                    onClick={() => { setSelectedPipelineView('marketing'); handleMarketingAnalysis() }}
                    className="w-full py-5 rounded-xl text-sm font-semibold bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 shadow-lg shadow-pink-500/20 gap-2"
                  >
                    <TrendingUp className="w-4 h-4" />
                    Passer à l&apos;Analyse Marketing
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                )}
              </div>
            )}

            {/* ─── MARKETING STEP ─── */}
            {selectedPipelineView === 'marketing' && (
              <div className="animate-slide-up space-y-6">
                <div className="startify-card p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="w-5 h-5 text-pink-600" />
                    <h3 className="text-base font-bold text-foreground">Analyse Marketing</h3>
                  </div>
                  {pipelineState.marketing ? (
                    <div className="space-y-3">
                      <div className="p-4 rounded-xl bg-pink-50/50 border border-pink-200/50">
                        <p className="text-sm font-bold text-pink-800">Analyse concurrentielle terminée</p>
                        <p className="text-xs text-pink-600/70 mt-1">
                          {pipelineState.marketing.competitors.length} concurrents • {pipelineState.marketing.personas.length} personas • SWOT complet
                        </p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => onNavigate('marketing')}>
                        Voir les détails <ChevronRight className="w-3 h-3 ml-1" />
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <TrendingUp className="w-8 h-8 mx-auto mb-2 text-pink-400 opacity-40" />
                      <p className="text-sm text-muted-foreground mb-3">Lancez l&apos;analyse marketing pour votre projet</p>
                      <Button
                        onClick={handleMarketingAnalysis}
                        className="bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 gap-2"
                      >
                        <TrendingUp className="w-4 h-4" />
                        Lancer l&apos;analyse
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ─── RAPPORT STEP ─── */}
            {selectedPipelineView === 'rapport' && (
              <div className="animate-slide-up space-y-6">
                <div className="startify-card p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <ClipboardCheck className="w-5 h-5 text-amber-600" />
                    <h3 className="text-base font-bold text-foreground">Rapport Final</h3>
                  </div>
                  {pipelineState.juridique && pipelineState.marketing ? (
                    <div className="space-y-3">
                      <p className="text-sm text-foreground/70">Votre rapport complet est prêt, combinant l&apos;analyse juridique et marketing.</p>
                      <Button onClick={() => onNavigate('rapport')} className="bg-gradient-to-r from-amber-500 to-orange-600 gap-2">
                        <ClipboardCheck className="w-4 h-4" />
                        Voir le rapport complet
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <ClipboardCheck className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Complétez les analyses juridique et marketing pour générer le rapport</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
