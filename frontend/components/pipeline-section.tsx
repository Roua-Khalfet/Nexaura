'use client'

import { useState, useEffect, useCallback, useRef, type Dispatch, type SetStateAction } from 'react'
import { ShieldCheck, Loader2, ChevronLeft, ChevronRight, Rocket, Sparkles, ArrowRight, AlertCircle, FileText, Scale, TrendingUp, ClipboardCheck, CheckCircle2, BarChart, Leaf } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  analyzeConformite,
  startGreenAnalysis,
  pollGreenAnalysis,
  getGreenAnalysisResults,
  type ConformiteResult,
  type GreenAnalysisSession,
} from '@/lib/api'
import ConformiteSection from '@/components/conformite-section'
import MarketingSection from '@/components/marketing-section'
import ReportSection from '@/components/report-section'
import { motion, AnimatePresence } from 'framer-motion'

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
  cible: string
  donneesTraitees: string
}

export type PipelineStep = 'description' | 'audit' | 'green' | 'marketing' | 'rapport'

export interface PipelineState {
  currentStep: PipelineStep
  completedSteps: PipelineStep[]
  activeStep: PipelineStep | null
  juridique: (ConformiteResult & { auditScorePct?: number; combinedScore?: number }) | null
  marketing: MarketingResult | null
  green: GreenPipelineState
}

export interface GreenPipelineState {
  status: 'idle' | 'starting' | 'running' | 'completed' | 'failed'
  sessionId: string | null
  result: GreenAnalysisSession | null
  error: string | null
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
  { id: 'description', label: 'Projet', icon: FileText, color: 'teal' },
  { id: 'audit', label: 'Audit Juridique', icon: ShieldCheck, color: 'blue' },
  { id: 'green', label: 'Analyse Verte', icon: Leaf, color: 'emerald' },
  { id: 'marketing', label: 'Analyse Marché', icon: TrendingUp, color: 'pink' },
  { id: 'rapport', label: 'Finalisation', icon: ClipboardCheck, color: 'amber' },
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
type PipelineQuestion = {
  key: keyof ProjectData
  label: string
  placeholder?: string
  description?: string
  type?: 'select' | 'choice'
  options?: string[]
}

const QUESTIONS: PipelineQuestion[] = [
  { key: 'nom', label: 'Quel est le nom de votre projet ?', placeholder: 'Ex : TechInnovate' },
  { key: 'sector', label: 'Dans quel secteur opérez-vous ?', type: 'select' as const },
  { key: 'typeSociete', label: 'Quelle forme juridique envisagez-vous ?', type: 'choice' as const, options: ['SUARL', 'SARL', 'SA', 'SAS'] },
  { key: 'capital', label: 'Quel est le capital social (TND) ?', placeholder: 'Ex : 10000' },
  { key: 'description', label: 'Décrivez votre projet en quelques phrases', placeholder: 'Ex : Plateforme SaaS de gestion de projets pour PME...' },
  { key: 'activite', label: 'Quelle est l\'activité principale exacte ?', placeholder: 'Ex : Développement de logiciels B2B' },
  { key: 'location', label: 'Où est situé le siège social ?', placeholder: 'Ex : Grand Tunis' },
  {
    key: 'clientType',
    label: 'Quel est votre type de clientèle ?',
    type: 'choice' as const,
    options: ['B2B - Entreprises', 'B2C - Particuliers', 'B2B2C', 'Gouvernement / Secteur Public'],
  },
  {
    key: 'cible',
    label: 'Quelle est votre cible principale ?',
    type: 'choice' as const,
    options: ['PME', 'Grandes Entreprises', 'Startups', 'Consommateurs finaux'],
  },
  { key: 'donneesTraitees', label: 'Quelles données traitez-vous ?', placeholder: 'Ex : Données de santé, coordonnées bancaires...' },
]

interface PipelineSectionProps {
  projectData: ProjectData
  setProjectData: (data: ProjectData) => void
  pipelineState: PipelineState
  setPipelineState: Dispatch<SetStateAction<PipelineState>>
  onNavigate: (section: string) => void
}

export default function PipelineSection({
  projectData, setProjectData, pipelineState, setPipelineState, onNavigate,
}: PipelineSectionProps) {
  const greenRunInProgressRef = useRef(false)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [currentAnswer, setCurrentAnswer] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState('')
  const [selectedPipelineView, setSelectedPipelineView] = useState<PipelineStep>('description')

  /* Check if description phase is complete */
  const isDescriptionComplete = questionIndex >= QUESTIONS.length && !!(projectData.nom && projectData.description && projectData.sector)

  const buildGreenBusinessDescription = useCallback(() => {
    return [
      `Nom du projet: ${projectData.nom || 'N/A'}`,
      `Secteur: ${projectData.sector || 'N/A'}`,
      `Description: ${projectData.description || 'N/A'}`,
      `Activite principale: ${projectData.activite || 'N/A'}`,
      `Type de societe: ${projectData.typeSociete || 'N/A'}`,
      `Capital (TND): ${projectData.capital || projectData.budget || 'N/A'}`,
      `Localisation: ${projectData.location || projectData.siege || 'N/A'}`,
      `Clientele: ${projectData.clientType || projectData.cible || 'N/A'}`,
      `Probleme resolu: ${projectData.problemSolved || 'N/A'}`,
      `Differentiateur: ${projectData.differentiator || 'N/A'}`,
      `Donnees traitees: ${projectData.donneesTraitees || 'N/A'}`,
      `Stade startup: ${projectData.stage || 'N/A'}`,
    ].join('\n')
  }, [projectData])

  const launchGreenAnalysisInBackground = useCallback(async () => {
    if (greenRunInProgressRef.current) return

    const current = pipelineState.green.status
    if (current === 'starting' || current === 'running' || current === 'completed') return

    greenRunInProgressRef.current = true
    setPipelineState((prev) => ({
      ...prev,
      green: {
        ...prev.green,
        status: 'starting',
        error: null,
      },
    }))

    try {
      const payload = buildGreenBusinessDescription()
      const session = await startGreenAnalysis(payload, {
        nom: projectData.nom,
        sector: projectData.sector,
        description: projectData.description,
        activite: projectData.activite,
        location: projectData.location || projectData.siege,
        typeSociete: projectData.typeSociete,
        capital: projectData.capital || projectData.budget,
        clientType: projectData.clientType || projectData.cible,
        donneesTraitees: projectData.donneesTraitees,
        stage: projectData.stage,
      })

      setPipelineState((prev) => ({
        ...prev,
        green: {
          ...prev.green,
          status: 'running',
          sessionId: session.id,
          error: null,
        },
      }))

      const pollResult = await pollGreenAnalysis(session.id, () => undefined)
      if (pollResult.type === 'done' && pollResult.status === 'completed') {
        const result = await getGreenAnalysisResults(session.id)
        setPipelineState((prev) => ({
          ...prev,
          green: {
            ...prev.green,
            status: 'completed',
            sessionId: session.id,
            result,
            error: null,
          },
        }))
      } else {
        setPipelineState((prev) => ({
          ...prev,
          green: {
            ...prev.green,
            status: 'failed',
            sessionId: session.id,
            error: pollResult.type === 'timeout'
              ? 'Analyse verte en timeout'
              : pollResult.type === 'clarification'
                ? 'Clarification requise pour l\'analyse verte'
                : 'Analyse verte échouée',
          },
        }))
      }
    } catch (e) {
      setPipelineState((prev) => ({
        ...prev,
        green: {
          ...prev.green,
          status: 'failed',
          error: e instanceof Error ? e.message : 'Erreur lancement analyse verte',
        },
      }))
    } finally {
      greenRunInProgressRef.current = false
    }
  }, [buildGreenBusinessDescription, pipelineState.green.status, setPipelineState])

  /* Handle conversational answer */
  const handleAnswer = useCallback(() => {
    if (questionIndex >= QUESTIONS.length) return
    if (!currentAnswer.trim() && QUESTIONS[questionIndex].type !== 'select' && QUESTIONS[questionIndex].type !== 'choice') return
    const key = QUESTIONS[questionIndex].key as keyof ProjectData
    const value = currentAnswer.trim()

    if (key === 'fondateurs') {
      setProjectData({ ...projectData, fondateurs: value.split(',').map(f => f.trim()) })
    } else {
      setProjectData({ ...projectData, [key]: value })
    }

    setCurrentAnswer('')
    if (questionIndex < QUESTIONS.length) {
      setQuestionIndex(questionIndex + 1)
    }
  }, [currentAnswer, questionIndex, projectData, setProjectData])

  /* Mark description as done when key fields filled */
  useEffect(() => {
    if (isDescriptionComplete && !pipelineState.completedSteps.includes('description')) {
      setPipelineState({
        ...pipelineState,
        completedSteps: [...pipelineState.completedSteps, 'description'],
        currentStep: 'audit',
      })
    }
  }, [isDescriptionComplete, pipelineState, setPipelineState])

  useEffect(() => {
    if (!isDescriptionComplete) return
    void launchGreenAnalysisInBackground()
  }, [isDescriptionComplete, launchGreenAnalysisInBackground])

  useEffect(() => {
    if (pipelineState.green.status !== 'completed') return
    if (pipelineState.completedSteps.includes('green')) return
    setPipelineState((prev) => ({
      ...prev,
      completedSteps: [...prev.completedSteps, 'green'],
    }))
  }, [pipelineState.green.status, pipelineState.completedSteps, setPipelineState])

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
        completedSteps: [...pipelineState.completedSteps.filter(s => s !== 'audit'), 'audit'],
        currentStep: 'marketing',
      })
      onNavigate('audit')
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

  const handleNextQuestion = () => {
    if (questionIndex < QUESTIONS.length) {
      setQuestionIndex(questionIndex + 1)
    }
  }

  const handlePrevQuestion = () => {
    if (questionIndex > 0) {
      setQuestionIndex(questionIndex - 1)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNextQuestion()
    }
  }

  const handleProjectSubmit = () => {
    void launchGreenAnalysisInBackground()
    setPipelineState((prev) => ({
      ...prev,
      completedSteps: Array.from(new Set([...prev.completedSteps, 'description'])),
      currentStep: 'audit',
    }))
    setSelectedPipelineView('audit')
    onNavigate('audit')
  }

  /* Get step state */
  const getStepState = (stepId: PipelineStep): 'idle' | 'active' | 'done' => {
    if (pipelineState.completedSteps.includes(stepId)) return 'done'
    if (pipelineState.currentStep === stepId) return 'active'
    return 'idle'
  }

  const greenStatus = pipelineState.green.status
  const greenStatusLabel =
    greenStatus === 'starting' ? 'Démarrage' :
    greenStatus === 'running' ? 'En cours' :
    greenStatus === 'completed' ? 'Terminé' :
    greenStatus === 'failed' ? 'Erreur' :
    'En attente'
  const greenStatusClasses =
    greenStatus === 'starting' || greenStatus === 'running'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : greenStatus === 'completed'
        ? 'border-teal-200 bg-teal-50 text-teal-700'
        : greenStatus === 'failed'
          ? 'border-red-200 bg-red-50 text-red-700'
          : 'border-slate-200 bg-white text-slate-500'

  const legalScore = pipelineState.juridique?.combinedScore ?? pipelineState.juridique?.score_global ?? null
  const greenScoreValue = pipelineState.green.result?.esg_score?.composite_score ?? null
  const studioScore =
    legalScore !== null && greenScoreValue !== null
      ? Math.round((legalScore + greenScoreValue) / 2)
      : legalScore ?? greenScoreValue
  const studioScoreClasses =
    studioScore === null
      ? 'border-slate-200 bg-white text-slate-500'
      : studioScore >= 80
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : studioScore >= 60
          ? 'border-amber-200 bg-amber-50 text-amber-700'
          : 'border-red-200 bg-red-50 text-red-700'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border bg-gradient-to-r from-teal-500/5 via-blue-500/5 to-transparent">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center shadow-lg shadow-teal-500/20">
              <Rocket className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-foreground tracking-tight">Pipeline Startify</h2>
              <p className="text-xs text-muted-foreground">De la description au rapport complet</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest ${studioScoreClasses}`}>
              <BarChart className="w-3.5 h-3.5" />
              <span>Score Studio: {studioScore !== null ? `${studioScore}/100` : 'N/A'}</span>
            </div>

            <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest ${greenStatusClasses}`}>
              <Leaf className="w-3.5 h-3.5" />
              <span>Green: {greenStatusLabel}</span>
              {(greenStatus === 'starting' || greenStatus === 'running') && <Loader2 className="w-3 h-3 animate-spin" />}
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {/* ── Pipeline Visual ── */}
        <div className="px-6 py-8">
          <motion.div 
            initial="hidden"
            animate="visible"
            variants={{
              hidden: { opacity: 0 },
              visible: { opacity: 1, transition: { staggerChildren: 0.15 } }
            }}
            className="flex items-center justify-between max-w-3xl mx-auto relative z-10"
          >
            {STEPS.map((step, i) => {
              const state = getStepState(step.id)
              const Icon = step.icon
              return (
                <motion.div 
                  variants={{
                    hidden: { opacity: 0, y: 20, scale: 0.8 },
                    visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 300, damping: 20 } }
                  }}
                  key={step.id} 
                  className="flex items-center flex-1 last:flex-none"
                >
                  {/* Node */}
                  <motion.button
                    whileHover={{ scale: 1.08, y: -2 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelectedPipelineView(step.id)}
                    className={`relative flex flex-col items-center gap-2 group cursor-pointer transition-all duration-300 ${
                      selectedPipelineView === step.id ? 'z-20' : 'z-10'
                    }`}
                  >
                        <div className="relative">
                      {/* Subdued shadow on hover for inactive, glowing ambient light for active */}
                      {state === 'active' && (
                        <div className="absolute inset-0 rounded-2xl bg-blue-400/40 blur-xl opacity-60 z-0 animate-pulse" />
                      )}
                      
                      <motion.div 
                        layoutId={`step-bg-${step.id}`}
                        className={`relative w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-sm z-10 ${
                          state === 'done' ? 'bg-emerald-50 text-emerald-500 border border-emerald-200 shadow-[0_8px_20px_rgba(16,185,129,0.15)]' :
                          state === 'active' ? 'bg-white text-blue-600 border-2 border-blue-500 shadow-[0_8px_30px_rgba(59,130,246,0.2)]' :
                          'bg-white/80 backdrop-blur-md text-gray-400 border border-gray-200/50 hover:border-gray-300 hover:shadow-md'
                        }`}
                      >
                        {state === 'done' ? (
                          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5 }}>
                            <CheckCircle2 className="w-7 h-7" />
                          </motion.div>
                        ) : (
                          <Icon className={`w-7 h-7 relative z-20 transition-transform duration-300 ${state === 'active' ? 'scale-110 drop-shadow-sm' : 'opacity-60 group-hover:opacity-100 group-hover:scale-105'}`} />
                        )}
                        
                        {state === 'active' && (
                          <motion.div 
                            layoutId="activeStepIndicator"
                            className="absolute inset-[-4px] rounded-[20px] border border-blue-500/50 z-0 pointer-events-none"
                            transition={{ type: "spring", stiffness: 350, damping: 25 }}
                          />
                        )}
                      </motion.div>
                    </div>
                    <span className={`text-[10px] font-black uppercase tracking-widest text-center transition-colors ${
                      state === 'done' ? 'text-emerald-600 drop-shadow-sm' :
                      state === 'active' ? 'text-blue-700 drop-shadow-sm' :
                      'text-slate-400/80 group-hover:text-slate-500'
                    }`}>
                      {step.label}
                    </span>
                  </motion.button>

                  {/* Connector line */}
                  {i < STEPS.length - 1 && (
                    <div className="flex-1 h-[3px] mx-4 relative overflow-hidden bg-slate-100 rounded-full shadow-inner">
                      {pipelineState.completedSteps.includes(step.id) && (
                        <motion.div 
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: 1 }}
                          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                          className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-teal-400 origin-left"
                        />
                      )}
                    </div>
                  )}
                </motion.div>
              )
            })}
          </motion.div>
        </div>

        {/* ── Content Area ── */}
        <div className="px-6 pb-8">
          <div className={`${selectedPipelineView === 'audit' || selectedPipelineView === 'green' || selectedPipelineView === 'marketing' ? 'max-w-6xl' : 'max-w-4xl'} mx-auto transition-all duration-500`}>
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedPipelineView}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="w-full"
              >
                {/* ─── DESCRIPTION STEP ─── */}
                {selectedPipelineView === 'description' && (
                  <div className="space-y-8 relative">
                    {/* Ambient Glow */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-sky-200/40 rounded-full blur-[120px] -z-10 mix-blend-multiply opacity-50" />

                    <div className="bg-white/60 backdrop-blur-2xl p-8 rounded-[40px] border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden group">
                  
                  <div className="absolute top-0 right-0 w-32 h-32 bg-teal-100/50 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 transition-opacity duration-1000 opacity-0 group-hover:opacity-100" />
                  
                  <div className="flex items-center justify-between mb-8 relative z-10 border-b border-slate-100/50 pb-6">
                    <div className="flex items-center gap-4">
                      <motion.div 
                        whileHover={{ scale: 1.1, rotate: 5 }}
                        className="w-12 h-12 rounded-[18px] bg-gradient-to-br from-teal-50 to-blue-50 border border-teal-100/50 flex items-center justify-center shadow-inner"
                      >
                        <FileText className="w-6 h-6 text-teal-600 drop-shadow-sm" />
                      </motion.div>
                      <div>
                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Configuration Projet</h3>
                        <p className="text-[11px] font-medium text-slate-500 mt-1">L'agent recueille vos informations essentielles</p>
                      </div>
                    </div>
                    {isDescriptionComplete && (
                      <motion.span 
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-4 py-2 rounded-full shadow-sm border border-emerald-100/50 flex items-center gap-2"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Prêt
                      </motion.span>
                    )}
                  </div>

                  {/* Conversational Form */}
                  <div className="space-y-4">
                    <AnimatePresence initial={false}>
                      {QUESTIONS.map((q, i) => {
                        const key = q.key as keyof ProjectData
                        const value = projectData[key]
                        const isCurrentQ = i === questionIndex
                        const isAnswered = typeof value === 'string' ? !!value.trim() : (Array.isArray(value) && value.length > 0 && value[0] !== '')

                        if (i < questionIndex - 2 || i > questionIndex) {
                          if (!isAnswered || i > questionIndex) return null
                        }

                        return (
                          <motion.div 
                            layout
                            key={i}
                            initial={{ opacity: 0, y: 20, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.98, height: 0, margin: 0, overflow: 'hidden' }}
                            transition={{ type: "spring", stiffness: 300, damping: 25 }}
                            className={`flex flex-col gap-3 py-1 ${!isCurrentQ ? 'opacity-50 blur-[0.5px] hover:opacity-100 hover:blur-none transition-all' : ''}`}
                          >
                            {/* Question bubble */}
                            <div className="flex justify-start">
                              <div className="flex items-end gap-2 max-w-[85%]">
                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0 mb-1">
                                  <Sparkles className="w-4 h-4 text-slate-500" />
                                </div>
                                <div className="bg-slate-100/80 backdrop-blur-sm text-slate-800 px-5 py-3 rounded-2xl rounded-bl-sm font-medium text-[13px] leading-relaxed relative">
                                  {q.label}
                                  {q.description && (
                                    <span className="block text-[11px] text-slate-500 mt-1 font-normal">
                                      {q.description}
                                    </span>
                                  )}
                                  {isCurrentQ && (
                                    <motion.div 
                                      className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-sky-400"
                                      animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                                      transition={{ repeat: Infinity, duration: 2 }}
                                    />
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Answer Area */}
                            {isCurrentQ ? (
                              <motion.div 
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="flex justify-end pt-2"
                              >
                                <div className="w-full max-w-[90%] bg-sky-50/50 backdrop-blur-md rounded-[24px] p-2 border border-sky-100 shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)] relative group focus-within:bg-white focus-within:shadow-[0_8px_30px_rgba(59,130,246,0.1)] focus-within:border-sky-200 transition-all duration-500">
                                   
                                   {/* Input type handling */}
                                   <div className="relative">
                                    {q.key === 'cible' ? (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2 pb-14">
                                          {(q.options || []).map((opt) => (
                                            <button
                                              key={opt}
                                              type="button"
                                              onClick={() => setProjectData({ ...projectData, [key]: opt })}
                                              className={`px-4 py-3 rounded-xl text-xs font-bold transition-all text-left border ${
                                                value === opt
                                                  ? 'bg-sky-500 text-white border-sky-500 shadow-md transform scale-[1.02]'
                                                  : 'bg-white text-slate-600 border-slate-200 hover:border-sky-300 hover:bg-sky-50'
                                              }`}
                                            >
                                              {opt}
                                            </button>
                                          ))}
                                        </div>
                                      ) : q.key === 'sector' ? (
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2 pb-14">
                                          {SECTORS.map((opt) => (
                                            <button
                                              key={opt.id}
                                              type="button"
                                              onClick={() => setProjectData({ ...projectData, [key]: opt.id })}
                                              className={`px-3 py-3 rounded-xl text-xs font-bold transition-all text-center border ${
                                                value === opt.id
                                                  ? 'bg-sky-500 text-white border-sky-500 shadow-md transform scale-[1.02]'
                                                  : 'bg-white text-slate-600 border-slate-200 hover:border-sky-300 hover:bg-sky-50'
                                              }`}
                                            >
                                              <span className="block text-lg mb-1">{opt.emoji}</span>
                                              <span className="block leading-tight">{opt.label}</span>
                                            </button>
                                          ))}
                                      </div>
                                      ) : q.type === 'choice' ? (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2 pb-14">
                                          {(q.options || []).map((opt) => (
                                            <button
                                              key={opt}
                                              type="button"
                                              onClick={() => setProjectData({ ...projectData, [key]: opt })}
                                              className={`px-4 py-3 rounded-xl text-xs font-bold transition-all text-left border ${
                                                value === opt
                                                  ? 'bg-sky-500 text-white border-sky-500 shadow-md transform scale-[1.02]'
                                                  : 'bg-white text-slate-600 border-slate-200 hover:border-sky-300 hover:bg-sky-50'
                                              }`}
                                            >
                                              {opt}
                                            </button>
                                          ))}
                                        </div>
                                    ) : q.key === 'donneesTraitees' ? (
                                       <textarea
                                          autoFocus
                                          placeholder={q.placeholder}
                                          value={typeof value === 'string' ? value : ''}
                                          onChange={(e) => setProjectData({ ...projectData, [key]: e.target.value })}
                                          onKeyDown={handleKeyDown}
                                          className="w-full h-24 bg-transparent outline-none p-4 text-[13px] text-slate-800 placeholder:text-blue-300/60 leading-relaxed resize-none font-medium"
                                        />
                                    ) : (
                                      <input
                                        type="text"
                                        autoFocus
                                        placeholder={q.placeholder}
                                        value={typeof value === 'string' ? value : ''}
                                        onChange={(e) => setProjectData({ ...projectData, [key]: e.target.value })}
                                        onKeyDown={handleKeyDown}
                                        className="w-full bg-transparent outline-none px-5 py-3 text-[14px] text-slate-800 placeholder:text-blue-300/60 font-medium"
                                      />
                                    )}
                                  </div>

                                  <div className="absolute right-2 bottom-2 z-10 flex items-center justify-end p-2 gap-2">
                                    {questionIndex > 0 && (
                                       <Button 
                                        type="button" 
                                        variant="ghost"
                                        onClick={handlePrevQuestion}
                                        className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full w-8 h-8 p-0"
                                      >
                                        <ChevronLeft className="w-4 h-4" />
                                      </Button>
                                    )}
                                    <Button 
                                      type="button" 
                                      onClick={handleNextQuestion}
                                      disabled={!isAnswered}
                                      className="bg-blue-600 hover:bg-blue-700 text-white rounded-full w-10 h-10 p-0 shadow-lg shadow-blue-500/30 transition-all active:scale-95 disabled:opacity-40 disabled:hover:bg-blue-600"
                                    >
                                      {questionIndex < QUESTIONS.length - 1 ? (
                                        <ArrowRight className="w-5 h-5 ml-0.5" />
                                      ) : (
                                        <CheckCircle2 className="w-5 h-5" />
                                      )}
                                    </Button>
                                  </div>
                                </div>
                              </motion.div>
                            ) : (
                              <div className="flex justify-end">
                                <div className="bg-sky-500 text-white px-5 py-3 rounded-2xl rounded-br-sm font-medium text-[13px] max-w-[85%] shadow-sm hover:shadow-md cursor-pointer transition-shadow" onClick={() => setQuestionIndex(i)}>
                                  {typeof value === 'string' ? value : JSON.stringify(value)}
                                </div>
                              </div>
                            )}
                          </motion.div>
                        )
                      })}
                    </AnimatePresence>

                    {/* Final Submit Button state */}
                    {questionIndex >= QUESTIONS.length && (
                       <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col items-center gap-4 py-8 border-t border-slate-100 mt-8"
                      >
                        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-500">
                          <CheckCircle2 className="w-8 h-8" />
                        </div>
                        <div className="text-center">
                          <h4 className="text-sm font-black uppercase tracking-widest text-slate-800">Profil Projet Complété</h4>
                          <p className="text-[12px] text-slate-500 mt-2 max-w-sm">
                            Le contexte est prêt. Choisissez maintenant votre prochain agent.
                          </p>
                        </div>
                        <Button 
                          onClick={handleProjectSubmit}
                          disabled={isAnalyzing}
                          className="mt-4 bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-500 hover:to-teal-600 text-white rounded-full px-8 py-6 h-auto text-sm font-bold shadow-[0_8px_30px_rgba(16,185,129,0.3)] transition-all hover:-translate-y-1"
                        >
                          {isAnalyzing ? (
                            <>
                              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-3" />
                              Analyse du contexte...
                            </>
                          ) : (
                            <>
                              Valider et ouvrir l&apos;audit juridique
                              <ArrowRight className="w-5 h-5 ml-3" />
                            </>
                          )}
                        </Button>
                      </motion.div>
                    )}
                  </div>
                </div>
                </div>
                )}

                {/* ─── NEXT CTA FOR DESCRIPTION STEP ─── */}
                {selectedPipelineView === 'description' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-8">
                    <Button
                      onClick={() => {
                        setSelectedPipelineView('audit')
                        setPipelineState((prev) => ({
                          ...prev,
                          completedSteps: Array.from(new Set([...prev.completedSteps, 'description'])),
                          currentStep: 'audit',
                        }))
                        onNavigate('audit')
                      }}
                      disabled={!isDescriptionComplete}
                      className="py-6 text-white rounded-2xl text-xs font-black uppercase tracking-widest bg-gradient-to-r from-teal-500 to-blue-600 hover:from-teal-600 hover:to-blue-700 shadow-xl gap-2"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      Audit Juridique
                    </Button>

                    <Button
                      onClick={() => {
                        void launchGreenAnalysisInBackground()
                        setSelectedPipelineView('green')
                        setPipelineState((prev) => ({
                          ...prev,
                          completedSteps: Array.from(new Set([...prev.completedSteps, 'description'])),
                          currentStep: 'green',
                        }))
                        onNavigate('green')
                      }}
                      disabled={!isDescriptionComplete}
                      className="py-6 text-white rounded-2xl text-xs font-black uppercase tracking-widest bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-xl gap-2"
                    >
                      <Leaf className="w-4 h-4" />
                      Analyse Verte
                    </Button>

                    <Button
                      onClick={() => {
                        setSelectedPipelineView('marketing')
                        setPipelineState((prev) => ({
                          ...prev,
                          completedSteps: Array.from(new Set([...prev.completedSteps, 'description'])),
                          currentStep: 'marketing',
                        }))
                        onNavigate('marketing')
                      }}
                      disabled={!isDescriptionComplete}
                      className="py-6 text-white rounded-2xl text-xs font-black uppercase tracking-widest bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 shadow-xl gap-2"
                    >
                      <TrendingUp className="w-4 h-4" />
                      Aller au Marketing
                    </Button>
                  </div>
                )}
                {!isDescriptionComplete && (!projectData.description || projectData.description.length < 20) && (
                   <p className="text-center text-[10px] text-muted-foreground italic mt-4">
                      Complétez le questionnaire pour débloquer l&apos;audit juridique
                   </p>
                )}


            {/* ─── AUDIT STEP ─── */}
            {selectedPipelineView === 'audit' && (
               <div className="space-y-8 relative">
                  {/* Ambient Glow */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-emerald-200/40 rounded-full blur-[150px] -z-10 mix-blend-multiply opacity-50 pointer-events-none" />

                  <div className="bg-white/60 backdrop-blur-2xl px-6 rounded-[50px] border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden group min-h-[600px] flex flex-col pt-10">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-100/50 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 transition-opacity duration-1000 opacity-0 group-hover:opacity-100" />
                    
                    <div className="flex items-center justify-between mb-6 relative z-10 border-b border-slate-100/50 pb-6 px-4">
                      <div className="flex items-center gap-4">
                        <motion.div 
                          whileHover={{ scale: 1.1, rotate: 5 }}
                          className="w-12 h-12 rounded-[18px] bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100/50 flex items-center justify-center shadow-inner"
                        >
                          <ShieldCheck className="w-6 h-6 text-emerald-600 drop-shadow-sm" />
                        </motion.div>
                        <div>
                          <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Audit Juridique</h3>
                          <p className="text-[11px] font-medium text-slate-500 mt-1">Analyse de la conformité réglementaire</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 min-h-[500px]">
                      <ConformiteSection 
                        projectData={projectData} 
                        conformiteResult={pipelineState.juridique} 
                        isEmbedded={true}
                        onComplete={(res) => {
                          setPipelineState({
                            ...pipelineState,
                            juridique: res,
                            completedSteps: Array.from(new Set([...pipelineState.completedSteps, 'audit'])),
                          })
                        }}
                      />
                    </div>
                  </div>
                  {pipelineState.juridique && (
                     <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-8 flex justify-center pb-12">
                        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="relative group/cta w-auto">
                          <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-[24px] blur opacity-30 group-hover/cta:opacity-60 transition duration-500" />
                          <Button
                            onClick={() => {
                              setSelectedPipelineView('marketing')
                              setPipelineState({
                                ...pipelineState,
                                currentStep: 'marketing'
                              })
                              onNavigate('marketing')
                            }}
                            className="relative px-12 py-8 rounded-[24px] bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black uppercase tracking-widest shadow-2xl gap-3"
                          >
                            <TrendingUp className="w-5 h-5 group-hover/cta:scale-125 transition-transform duration-300" />
                            Transférer à l&apos;Agent Marketing
                            <motion.div animate={{ x: [0, 5, 0] }} transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}>
                              <ChevronRight className="w-5 h-5" />
                            </motion.div>
                          </Button>
                        </motion.div>
                     </motion.div>
                  )}
               </div>
            )}

            {/* ─── GREEN STEP ─── */}
            {selectedPipelineView === 'green' && (
              <div className="space-y-8 relative">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-emerald-200/40 rounded-full blur-[150px] -z-10 mix-blend-multiply opacity-50 pointer-events-none" />

                <div className="bg-white/60 backdrop-blur-2xl px-6 rounded-[50px] border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden group min-h-[420px] flex flex-col pt-10">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-100/50 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 transition-opacity duration-1000 opacity-0 group-hover:opacity-100" />

                  <div className="flex items-center justify-between mb-6 relative z-10 border-b border-slate-100/50 pb-6 px-4">
                    <div className="flex items-center gap-4">
                      <motion.div
                        whileHover={{ scale: 1.1, rotate: 5 }}
                        className="w-12 h-12 rounded-[18px] bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100/50 flex items-center justify-center shadow-inner"
                      >
                        <Leaf className="w-6 h-6 text-emerald-600 drop-shadow-sm" />
                      </motion.div>
                      <div>
                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Analyse Verte</h3>
                        <p className="text-[11px] font-medium text-slate-500 mt-1">Évaluation ESG et recommandations durables</p>
                      </div>
                    </div>

                    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest ${greenStatusClasses}`}>
                      <Leaf className="w-3.5 h-3.5" />
                      {greenStatusLabel}
                    </span>
                  </div>

                  <div className="px-4 pb-8 space-y-4 relative z-10">
                    {pipelineState.green.error && (
                      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
                        {pipelineState.green.error}
                      </div>
                    )}

                    {pipelineState.green.result?.esg_score ? (
                      <div className="rounded-3xl border border-emerald-100 bg-white px-5 py-5 shadow-sm">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Score ESG</p>
                        <div className="mt-2 flex items-end gap-3">
                          <p className="text-4xl font-black text-emerald-600 tabular-nums">{pipelineState.green.result.esg_score.composite_score}</p>
                          <p className="text-sm font-bold text-slate-500 pb-1">/100</p>
                          <span className="ml-auto rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
                            {pipelineState.green.result.esg_score.letter_grade}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-3xl border border-slate-200 bg-white px-5 py-5 text-sm text-slate-600">
                        L&apos;analyse verte est suivie dans le pipeline. Ouvrez l&apos;agent vert pour voir le détail en direct.
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Button
                        onClick={() => {
                          void launchGreenAnalysisInBackground()
                          onNavigate('green')
                        }}
                        className="rounded-2xl py-6 text-white font-black uppercase tracking-widest bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
                      >
                        Ouvrir l&apos;Agent Vert
                      </Button>

                      <Button
                        onClick={() => {
                          setSelectedPipelineView('marketing')
                          setPipelineState((prev) => ({
                            ...prev,
                            completedSteps: Array.from(new Set([...prev.completedSteps, 'green'])),
                            currentStep: 'marketing',
                          }))
                          onNavigate('marketing')
                        }}
                        className="rounded-2xl py-6 text-white font-black uppercase tracking-widest bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700"
                      >
                        Transférer vers Marketing
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ─── MARKETING STEP ─── */}
            {selectedPipelineView === 'marketing' && (
               <div className="space-y-8 relative">
                  {/* Ambient Glow */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-pink-200/40 rounded-full blur-[150px] -z-10 mix-blend-multiply opacity-50 pointer-events-none" />

                  <div className="bg-white/60 backdrop-blur-2xl px-6 rounded-[50px] border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden group min-h-[600px] flex flex-col pt-10">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-pink-100/50 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 transition-opacity duration-1000 opacity-0 group-hover:opacity-100" />
                    
                    <div className="flex items-center justify-between mb-6 relative z-10 border-b border-slate-100/50 pb-6 px-4">
                      <div className="flex items-center gap-4">
                        <motion.div 
                          whileHover={{ scale: 1.1, rotate: 5 }}
                          className="w-12 h-12 rounded-[18px] bg-gradient-to-br from-pink-50 to-rose-50 border border-pink-100/50 flex items-center justify-center shadow-inner"
                        >
                          <TrendingUp className="w-6 h-6 text-pink-600 drop-shadow-sm" />
                        </motion.div>
                        <div>
                          <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Stratégie Marketing</h3>
                          <p className="text-[11px] font-medium text-slate-500 mt-1">Analyse du marché et positionnement</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 min-h-[500px]">
                      <MarketingSection projectData={projectData} />
                    </div>
                  </div>
                  <div className="mt-8 flex justify-center pb-12">
                     <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="relative group/cta w-auto">
                        <div className="absolute -inset-1 bg-gradient-to-r from-pink-600 to-rose-600 rounded-[24px] blur opacity-30 group-hover/cta:opacity-60 transition duration-500" />
                        <Button
                          onClick={() => {
                            setSelectedPipelineView('rapport')
                            if (!pipelineState.completedSteps.includes('marketing')) {
                                setPipelineState({
                                  ...pipelineState,
                                  completedSteps: [...pipelineState.completedSteps, 'marketing'],
                                  currentStep: 'rapport'
                                })
                            }
                          }}
                          className="relative px-12 py-8 rounded-[24px] bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-700 hover:to-rose-700 text-white font-black uppercase tracking-widest shadow-2xl gap-3"
                        >
                          <FileText className="w-5 h-5 group-hover/cta:scale-125 transition-transform duration-300" />
                          Passer au Rapport Final
                          <motion.div animate={{ x: [0, 5, 0] }} transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}>
                            <ChevronRight className="w-5 h-5" />
                          </motion.div>
                        </Button>
                     </motion.div>
                  </div>
               </div>
            )}

            {/* ─── RAPPORT STEP ─── */}
            {selectedPipelineView === 'rapport' && (
               <div className="space-y-8 relative pb-12">
                  {/* Ambient Glow */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-slate-200/40 rounded-full blur-[150px] -z-10 mix-blend-multiply opacity-50 pointer-events-none" />

                  <div className="bg-white/60 backdrop-blur-2xl px-6 rounded-[50px] border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden group min-h-[600px] flex flex-col pt-10">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-slate-100/50 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 transition-opacity duration-1000 opacity-0 group-hover:opacity-100" />
                    
                    <div className="flex items-center justify-between mb-6 relative z-10 border-b border-slate-100/50 pb-6 px-4">
                      <div className="flex items-center gap-4">
                        <motion.div 
                          whileHover={{ scale: 1.1, rotate: 5 }}
                          className="w-12 h-12 rounded-[18px] bg-gradient-to-br from-slate-50 to-gray-50 border border-slate-100/50 flex items-center justify-center shadow-inner"
                        >
                          <BarChart className="w-6 h-6 text-slate-600 drop-shadow-sm" />
                        </motion.div>
                        <div>
                          <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Synthèse Globale</h3>
                          <p className="text-[11px] font-medium text-slate-500 mt-1">Rapport final et scores de conformité</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 min-h-[500px]">
                      <ReportSection projectData={projectData} pipelineState={pipelineState} />
                    </div>
                  </div>
                  <div className="mt-8 flex justify-center">
                     <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="relative group/cta w-auto">
                        <div className="absolute -inset-2 bg-gradient-to-r from-slate-900 to-black rounded-[24px] blur-lg opacity-40 group-hover/cta:opacity-70 transition duration-500 animate-pulse" />
                        <Button
                          onClick={() => {
                            // Reset or download logic
                            alert("Rapport finalisé ! Téléchargement bientôt disponible.")
                          }}
                          className="relative px-12 py-8 rounded-[24px] bg-slate-900 hover:bg-black text-white font-black uppercase tracking-widest shadow-2xl gap-3"
                        >
                          <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}>
                            <Rocket className="w-6 h-6" />
                          </motion.div>
                          Lancer la Startup
                        </Button>
                     </motion.div>
                  </div>
               </div>
            )}
            </motion.div>
          </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
