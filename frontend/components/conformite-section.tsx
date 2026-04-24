'use client'

import { useState, useEffect } from 'react'
import { ShieldCheck, Loader2, AlertTriangle, CheckCircle2, XCircle, ArrowRight, Brain, ChevronRight, Sparkles, ClipboardCheck, Scale, Check, X, BarChart3, RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { analyzeConformite, generateContextualQuestionnaire, type ConformiteResult, type QuizQuestion } from '@/lib/api'
import { motion, AnimatePresence } from 'framer-motion'

const cardHover = {
  rest: { y: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  hover: { y: -4, boxShadow: '0 20px 40px rgba(0,0,0,0.08)', transition: { type: 'spring', stiffness: 300, damping: 20 } },
} as const

const staggerContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
} as const

const staggerItem = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 24 } },
} as const

const SECTORS = [
  { id: 'Fintech', label: 'Fintech', emoji: '💳', risk: 'élevé' },
  { id: 'HealthTech', label: 'HealthTech', emoji: '🏥', risk: 'élevé' },
  { id: 'EdTech', label: 'EdTech', emoji: '📚', risk: 'moyen' },
  { id: 'E-commerce', label: 'E-commerce', emoji: '🛒', risk: 'moyen' },
  { id: 'SaaS', label: 'SaaS', emoji: '☁️', risk: 'faible' },
  { id: 'Sport & Bien-être', label: 'Sport', emoji: '🏋️', risk: 'moyen' },
  { id: 'Restauration', label: 'Restauration', emoji: '🍽️', risk: 'moyen' },
  { id: 'Autre', label: 'Autre', emoji: '🏢', risk: 'moyen' },
]

function ScoreGauge({ score, label, size = "md" }: { score: number; label?: string; size?: "sm" | "md" }) {
  const dim = size === "sm" ? 100 : 160
  const r = size === "sm" ? 35 : 45
  const stroke = size === "sm" ? 4 : 6
  const circumference = 2 * Math.PI * r
  
  const [currentScore, setCurrentScore] = useState(0)

  useEffect(() => {
    let timer: NodeJS.Timeout
    setCurrentScore(0)
    let current = 0
    const duration = 1500
    const interval = 20
    const step = (score / (duration / interval))
    
    timer = setInterval(() => {
      current += step
      if (current >= score) {
        clearInterval(timer)
        setCurrentScore(score)
      } else {
        setCurrentScore(Math.floor(current))
      }
    }, interval)

    return () => clearInterval(timer)
  }, [score])

  const offset = circumference - (currentScore / 100) * circumference
  const color = score >= 75 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444'
  
  return (
    <div className="relative mx-auto" style={{ width: dim, height: dim }}>
      <svg className="w-full h-full -rotate-90 drop-shadow-sm" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-slate-100" />
        <motion.circle 
          cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference} 
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span 
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", delay: 0.3 }}
          className={`${size === "sm" ? 'text-xl' : 'text-4xl'} font-black tabular-nums`} 
          style={{ color }}
        >
          {currentScore}
        </motion.span>
        <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">{label || '%'}</span>
      </div>
    </div>
  )
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'check') return <CheckCircle2 className="w-5 h-5 text-emerald-500" />
  if (status === 'warning') return <AlertTriangle className="w-5 h-5 text-amber-500" />
  return <XCircle className="w-5 h-5 text-red-500" />
}

export default function ConformiteSection({ projectData, conformiteResult, isEmbedded = false, onComplete }: {
  projectData?: { description?: string; sector?: string; capital?: string; typeSociete?: string; budget?: string; location?: string; activite?: string }
  conformiteResult?: ConformiteResult | null
  isEmbedded?: boolean
  onComplete?: (res: ConformiteResult & { auditScorePct: number; combinedScore: number }) => void
}) {
  const [description, setDescription] = useState('')
  const [sector, setSector] = useState('')
  const [capital, setCapital] = useState('')
  const [typeSociete, setTypeSociete] = useState('')
  const [result, setResult] = useState<ConformiteResult | null>(conformiteResult || null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  // === Questionnaire (Audit) state ===
  const [auditPhase, setAuditPhase] = useState<'idle' | 'loading' | 'playing' | 'done'>('idle')
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [currentQ, setCurrentQ] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [isAnswered, setIsAnswered] = useState(false)
  const [answers, setAnswers] = useState<number[]>([])
  const [auditError, setAuditError] = useState('')

  // Sync from pipeline data
  useEffect(() => {
    if (projectData) {
      if (projectData.description && !description.trim()) setDescription(projectData.description)
      if (projectData.sector && !sector.trim()) setSector(projectData.sector)
      if (projectData.capital && !capital.trim()) setCapital(projectData.capital)
      else if (projectData.budget && !capital.trim()) setCapital(projectData.budget)
      if (projectData.typeSociete && !typeSociete.trim()) setTypeSociete(projectData.typeSociete)
    }
  }, [projectData, description, sector, capital, typeSociete])

  useEffect(() => {
    if (conformiteResult && !result) setResult(conformiteResult)
  }, [conformiteResult, result])

  const handleAnalyze = async (isPostAudit = false) => {
    if (!description.trim()) return
    setIsLoading(true)
    setError('')
    
    if (!isPostAudit) {
      setResult(null)
      setAuditPhase('idle')
      setQuestions([])
      setAnswers([])
    }
    try {
      const res = await analyzeConformite({
        project_description: description, sector,
        capital: capital ? parseInt(capital) : null,
        type_societe: typeSociete,
        audit_results: isPostAudit ? { questions, answers } : null
      })
      setResult(res)
      if (isPostAudit && onComplete) {
        const localCombined = Math.round((res.score_global * 0.4) + (auditScorePct * 0.6))
        onComplete({
          ...res,
          auditScorePct,
          combinedScore: localCombined
        })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur analyse')
    } finally {
      setIsLoading(false)
    }
  }

  const startAudit = async () => {
    setAuditPhase('loading')
    setAuditError('')
    setCurrentQ(0)
    setSelectedAnswer(null)
    setIsAnswered(false)
    setAnswers([])
    try {
      const qs = await generateContextualQuestionnaire({
        description, sector, capital,
        budget: projectData?.budget,
        typeSociete, location: projectData?.location,
        activite: projectData?.activite,
      })
      setQuestions(qs)
      setAuditPhase('playing')
    } catch (e) {
      setAuditError(e instanceof Error ? e.message : 'Erreur génération')
      setAuditPhase('idle')
    }
  }

  const handleAnswer = (idx: number) => {
    if (isAnswered) return
    setSelectedAnswer(idx)
    setIsAnswered(true)
    setAnswers(a => [...a, idx])
  }

  const nextQuestion = () => {
    if (currentQ + 1 >= questions.length) {
      setAuditPhase('done')
      handleAnalyze(true)
    } else {
      setCurrentQ(c => c + 1)
      setSelectedAnswer(null)
      setIsAnswered(false)
    }
  }

  const auditTotalWeight = questions.reduce((s, q) => s + q.weight, 0)
  const auditEarnedWeight = answers.reduce((s, ans, i) => {
    if (!questions[i]) return s
    if (ans === questions[i].compliantAnswer) return s + questions[i].weight
    if (ans === 1) return s + questions[i].weight * 0.3
    return s
  }, 0)
  const auditScorePct = auditTotalWeight > 0 ? Math.round((auditEarnedWeight / auditTotalWeight) * 100) : 0
  const combinedScore = result?.combinedScore ?? (result ? Math.round((result.score_global * 0.4) + (auditScorePct * 0.6)) : auditScorePct)

  const catScores = questions.reduce<Record<string, { earned: number; total: number }>>((acc, q, i) => {
    if (!acc[q.category]) acc[q.category] = { earned: 0, total: 0 }
    acc[q.category].total += q.weight
    if (answers[i] === q.compliantAnswer) acc[q.category].earned += q.weight
    else if (answers[i] === 1) acc[q.category].earned += q.weight * 0.3
    return acc
  }, {})

  const issues = questions.filter((q, i) => answers[i] !== undefined && answers[i] !== q.compliantAnswer)

  return (
    <div className={`flex flex-col h-full ${isEmbedded ? '' : 'bg-slate-50/30'} overflow-hidden`}>
      {/* Header */}
      {!isEmbedded && (
        <div className="px-6 py-5 border-b border-white pb-6 relative z-10">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <motion.div 
                whileHover={{ scale: 1.1, rotate: -5 }}
                className="w-14 h-14 rounded-[20px] bg-gradient-to-br from-emerald-500 to-teal-600 flex justify-center items-center shadow-lg shadow-emerald-500/30"
              >
                <div className="w-full h-full rounded-[20px] bg-white/90 flex justify-center items-center backdrop-blur-sm m-[1.5px]">
                    <ShieldCheck className="w-6 h-6 text-emerald-600 drop-shadow-sm" />
                </div>
              </motion.div>
              <div>
                <h2 className="text-xl font-black uppercase tracking-wider text-slate-800">
                  Audit Juridique
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                  <p className="text-xs font-bold text-slate-500 tracking-wider">ANALYSE DE CONFORMITÉ</p>
                </div>
              </div>
            </div>
        </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6 space-y-6 relative z-10 custom-scrollbar">
        {auditPhase === 'loading' ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, type: 'spring' }}
            className="max-w-2xl mx-auto py-20 text-center space-y-8"
          >
             <div className="relative w-32 h-32 mx-auto mb-10 flex items-center justify-center">
                {/* Outer radar pulse rings */}
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    animate={{
                      scale: [1, 2.5],
                      opacity: [0.3, 0],
                    }}
                    transition={{
                      duration: 2.5,
                      repeat: Infinity,
                      delay: i * 0.8,
                      ease: "easeOut",
                    }}
                    className="absolute inset-0 rounded-full border border-emerald-500/50"
                  />
                ))}
                
                {/* Inner spinner */}
                <div className="absolute inset-2 rounded-full border-4 border-slate-100 shadow-inner" />
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                  className="absolute inset-2 rounded-full border-4 border-emerald-500 border-t-transparent" 
                />
                
                {/* Center Icon */}
                <div className="absolute inset-0 flex items-center justify-center z-10">
                   <motion.div 
                     animate={{ scale: [1, 1.15, 1], filter: ["brightness(1)", "brightness(1.2)", "brightness(1)"] }} 
                     transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                   >
                     <ShieldCheck className="w-12 h-12 text-emerald-500 drop-shadow-md" />
                   </motion.div>
                </div>
             </div>
             <motion.div 
               initial={{ opacity: 0, y: 10 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.3 }}
               className="space-y-3"
             >
                <h3 className="text-2xl font-black text-slate-900 uppercase tracking-[0.2em]">Initialisation de l&apos;Audit</h3>
                <p className="text-slate-500 max-w-sm mx-auto leading-relaxed">
                   Analyse de votre secteur et de votre description pour générer un questionnaire d&apos;expertise sur-mesure...
                </p>
                <div className="flex justify-center gap-1.5 pt-4">
                  {[0, 1, 2, 3, 4].map(i => (
                    <motion.div
                      key={i}
                      animate={{ y: [0, -8, 0], opacity: [0.3, 1, 0.3] }}
                      transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.15 }}
                      className="w-2 h-2 rounded-full bg-emerald-500"
                    />
                  ))}
                </div>
             </motion.div>
          </motion.div>
        ) : auditPhase === 'playing' ? (
          <div className="max-w-5xl mx-auto py-4">
             {!questions || questions.length === 0 ? (
               <div className="bg-white/60 backdrop-blur-xl p-12 rounded-[32px] border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] text-center space-y-4">
                  <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto shadow-inner">
                    <AlertTriangle className="w-8 h-8" />
                  </div>
                  <p className="text-slate-900 font-bold">Impossible de générer les questions pour ce projet.</p>
                  <Button onClick={() => setAuditPhase('idle')} variant="outline" className="rounded-xl bg-white focus:ring-slate-200">Retour au formulaire</Button>
               </div>
             ) : questions[currentQ] && (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                   <div className="lg:col-span-1 space-y-6">
                      <div className="bg-white/60 backdrop-blur-xl p-8 rounded-[32px] border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-6 relative overflow-hidden">
                          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-100/30 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                         <div className="flex items-center gap-3 relative z-10">
                            <div className="w-12 h-12 rounded-[18px] bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                               <Scale className="w-6 h-6 text-white" />
                            </div>
                            <h4 className="text-sm font-black uppercase tracking-wider text-slate-900">Diagnostic en cours</h4>
                         </div>
                         
                         <div className="space-y-4 text-center py-4 relative z-10">
                            <div className="relative inline-block drop-shadow-md">
                               <svg className="w-28 h-28 -rotate-90">
                                  <circle cx="56" cy="56" r="48" fill="none" stroke="#f1f5f9" strokeWidth="10" />
                                  <circle cx="56" cy="56" r="48" fill="none" stroke="#10b981" strokeWidth="10" strokeDasharray={301.6} strokeDashoffset={301.6 - (301.6 * (currentQ + 1)) / questions.length} strokeLinecap="round" className="transition-all duration-700 ease-out" />
                               </svg>
                               <div className="absolute inset-0 flex flex-col items-center justify-center">
                                  <span className="text-3xl font-black text-slate-900 tabular-nums">{currentQ + 1}</span>
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-[-4px]">sur 10</span>
                               </div>
                            </div>
                         </div>

                         <div className="space-y-3">
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Domaine Juridique</p>
                           <p className="text-xs font-black text-slate-900 bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center gap-3">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
                              {questions[currentQ].category}
                           </p>
                         </div>

                         <div className="flex justify-center gap-2 relative z-10">
                            {Array.from({ length: 10 }).map((_, i) => (
                              <div key={i} className={`h-2 rounded-full transition-all duration-300 ${
                                i === currentQ ? 'w-8 bg-gradient-to-r from-emerald-400 to-teal-500 shadow-md' : 
                                i < answers.length ? 'w-2 bg-emerald-300' : 'w-2 bg-slate-200'
                              }`} />
                            ))}
                         </div>
                      </div>
                   </div>

                   <div className="lg:col-span-3 space-y-6">
                       <div className="bg-white/60 backdrop-blur-2xl rounded-[40px] border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col relative overflow-hidden group">
                         {/* Decorative background element */}
                         <div className="absolute top-0 right-0 w-64 h-64 bg-teal-50/50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 -z-10 transition-opacity duration-1000 opacity-0 group-hover:opacity-100" />
                         
                         {/* Header: Fixed */}
                          <div className="p-4 pb-0 flex items-center gap-3 relative z-10">
                            <span className={`text-[11px] font-black uppercase px-4 py-1.5 rounded-full tracking-widest ${
                               questions[currentQ].weight >= 3 ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 
                               questions[currentQ].weight === 2 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                            }`}>
                               {questions[currentQ].weight >= 3 ? 'CRITIQUE / BLOQUANT' : 'IMPORTANT / RECOMMANDÉ'}
                            </span>
                         </div>

                         {/* Body: Scrollable */}
                          <div className="flex-1 overflow-y-auto p-4 pt-2 custom-scrollbar">
                            <h3 className="text-lg md:text-xl font-bold text-slate-900 leading-snug mb-6 relative z-10 pt-2">
                               {questions[currentQ].question || (questions[currentQ] as any).label}
                            </h3>

                            <motion.div 
                               variants={staggerContainer}
                               initial="hidden"
                               animate="show"
                               key={currentQ}
                               className="space-y-4 relative z-10"
                            >
                               {(questions[currentQ].options || (questions[currentQ] as any).choices || []).map((opt: string, idx: number) => {
                                  const isCompliant = idx === questions[currentQ].compliantAnswer
                                  const isSelected = idx === selectedAnswer
                                  const style = isAnswered 
                                    ? isCompliant ? 'border-emerald-400 bg-emerald-50/80 text-emerald-800 shadow-[0_4px_20px_rgba(16,185,129,0.15)] ring-4 ring-emerald-500/10' 
                                    : isSelected ? 'border-red-400 bg-red-50/80 text-red-800 shadow-[0_4px_20px_rgba(239,68,68,0.1)]' 
                                    : 'border-slate-100/50 bg-white/50 opacity-40 grayscale-[0.5]'
                                    : 'border-white bg-white/60 hover:bg-white hover:border-teal-300 hover:shadow-[0_8px_30px_rgba(20,184,166,0.15)] focus:ring-4 focus:ring-teal-500/20 active:scale-[0.98] transition-all backdrop-blur-md'

                                  return (
                                    <motion.button 
                                      key={idx} 
                                      variants={staggerItem}
                                      whileHover={!isAnswered ? { scale: 1.02, x: 4 } : {}}
                                      whileTap={!isAnswered ? { scale: 0.98 } : {}}
                                      disabled={isAnswered} 
                                      onClick={() => handleAnswer(idx)}
                                      className={`w-full p-4 rounded-[20px] border-2 text-left transition-all duration-500 flex items-center justify-between group relative overflow-hidden ${style}`}
                                    >
                                       {(!isAnswered) && (
                                         <div className="absolute inset-0 bg-gradient-to-r from-teal-400/0 via-teal-400/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 -z-10" />
                                       )}
                                       <div className="flex items-center gap-4 relative z-10 w-full">
                                          <div className={`w-10 h-10 rounded-full flex shrink-0 items-center justify-center border-2 transition-colors duration-500 shadow-sm ${
                                              isAnswered ? isCompliant ? 'bg-emerald-500 border-emerald-500 text-white' 
                                              : isSelected ? 'bg-red-500 border-red-500 text-white' 
                                              : 'bg-transparent border-slate-300 text-slate-400'
                                              : 'bg-white border-slate-200 text-slate-400 group-hover:border-teal-400 group-hover:text-teal-500 shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)]'
                                          }`}>
                                             {isAnswered && isCompliant ? <Check className="w-5 h-5" /> :
                                              isAnswered && isSelected ? <X className="w-5 h-5" /> :
                                              <span className="font-bold text-sm">{String.fromCharCode(65 + idx)}</span>}
                                          </div>
                                          <span className="font-bold text-xs md:text-sm leading-snug flex-1 relative z-10">{opt}</span>
                                       </div>
                                       {!isAnswered && (
                                         <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center translate-x-4 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-300 shadow-sm z-20">
                                            <ArrowRight className="w-4 h-4 text-teal-600" />
                                         </div>
                                       )}
                                    </motion.button>
                                  )
                               })}
                            </motion.div>
                         </div>

                         {/* Footer: Fixed Action Area */}
                          <div className="p-4 border-t border-white/50 bg-slate-50/50 backdrop-blur-md rounded-b-[40px] relative z-10">
                             <div className="flex justify-end items-center gap-4">
                               <Button 
                                  size="lg"
                                  onClick={nextQuestion}
                                  disabled={!isAnswered}
                                  className="relative bg-slate-900 hover:bg-slate-800 text-white rounded-full px-8 disabled:opacity-50 disabled:scale-100 transition-all shadow-[0_8px_30px_rgba(15,23,42,0.2)]"
                               >
                                  {currentQ + 1 >= questions.length ? (
                                    <span className="flex items-center gap-2 font-bold">Terminer l&apos;audit <ArrowRight className="w-4 h-4" /></span>
                                  ) : (
                                    <span className="flex items-center gap-2 font-bold">Question suivante <ArrowRight className="w-4 h-4" /></span>
                                  )}
                               </Button>
                            </div>
                         </div>
                       </div>
                       
                       {isAnswered && (
                          <motion.div 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-emerald-950 p-6 rounded-[32px] text-white shadow-2xl shadow-emerald-900/40 space-y-4 relative overflow-hidden mt-6"
                          >
                             <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/20 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                             <div className="flex items-center gap-3 relative z-10">
                                <div className="w-10 h-10 rounded-[14px] bg-white/10 flex items-center justify-center backdrop-blur-md border border-white/10 shadow-inner">
                                   <Brain className="w-5 h-5 text-emerald-400" />
                                 </div>
                                <span className="text-[11px] font-black uppercase tracking-[0.1em]">Analyse de l&apos;Expert</span>
                             </div>
                             <p className="text-sm text-emerald-50/90 leading-relaxed font-medium relative z-10">{questions[currentQ].explanation}</p>
                             <div className="h-[1px] bg-white/10 relative z-10" />
                             <div className="flex items-center justify-between relative z-10">
                                <p className="text-[10px] font-bold text-emerald-300 bg-white/5 px-2.5 py-1.5 rounded-lg tracking-wider border border-white/5">REF. {questions[currentQ].article}</p>
                                <ShieldCheck className="w-4 h-4 text-emerald-500/50" />
                             </div>
                          </motion.div>
                       )}
                    </div>
                 </div>
             )}
          </div>
        ) : isLoading ? (
          <div className="max-w-2xl mx-auto py-20 text-center space-y-8 animate-in fade-in duration-700">
            <div className="relative w-32 h-32 mx-auto mb-6 flex items-center justify-center">
                {/* Advanced Radar Pulse Rings */}
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={`radar-${i}`}
                    animate={{
                      scale: [1, 2.5],
                      opacity: [0.4, 0],
                    }}
                    transition={{
                      duration: 2.5,
                      repeat: Infinity,
                      delay: i * 0.8,
                      ease: "easeOut",
                    }}
                    className="absolute inset-0 rounded-full border-2 border-blue-500/40 z-0"
                  />
                ))}
                
                {/* Core spinner */}
                <div className="absolute inset-4 rounded-full border-4 border-slate-100 z-10 bg-white" />
                <motion.div 
                  animate={{ rotate: -360 }}
                  transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                  className="absolute inset-4 rounded-full border-4 border-blue-500 border-t-transparent z-20" 
                />
                
                {/* Center Icon */}
                <div className="absolute inset-0 flex items-center justify-center z-30">
                   <motion.div 
                     animate={{ scale: [1, 1.15, 1], filter: ["brightness(1)", "brightness(1.5)", "brightness(1)"] }} 
                     transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                   >
                     <Brain className="w-12 h-12 text-blue-500 drop-shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
                   </motion.div>
                </div>
             </div>
            <div className="space-y-3">
              <h3 className="text-2xl font-black text-slate-900 uppercase tracking-widest">Analyse Juridique Finale</h3>
              <p className="text-sm text-slate-500 max-w-sm mx-auto">
                 Fusion des données du Quiz avec le GraphRAG et les recherches Web pour un score de haute fidélité...
              </p>
            </div>
          </div>
        ) : result ? (
          <div className="max-w-4xl mx-auto space-y-8 pb-12">
            <div className="flex justify-between items-center">
              <button onClick={() => { setResult(null); setAuditPhase('idle'); }}
                className="group flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-900 transition-colors uppercase tracking-widest">
                <ArrowRight className="w-3.5 h-3.5 rotate-180 group-hover:-translate-x-1 transition-transform" /> 
                Nouvelle Analyse
              </button>
            </div>

            <motion.div 
              initial="hidden"
              animate="show"
              variants={{
                hidden: { opacity: 0 },
                show: {
                  opacity: 1,
                  transition: { staggerChildren: 0.1 }
                }
              }}
              className="grid grid-cols-1 md:grid-cols-12 gap-8 relative z-10"
            >
              {/* Bento Item: Global Score (Focus) */}
              <motion.div 
                variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } } }}
                className="md:col-span-5 lg:col-span-4 bg-white/60 backdrop-blur-2xl p-8 rounded-[40px] border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col items-center justify-center space-y-8 relative overflow-hidden group hover:-translate-y-1 transition-all duration-500"
              >
                  <div className="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                  <div className="flex items-center justify-center relative z-10">
                     <ScoreGauge score={combinedScore} label="Score Unique" size="md" />
                  </div>
                  <div className={`px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-[0.2em] relative z-10 shadow-sm border ${
                    combinedScore >= 75 ? 'bg-emerald-50 text-emerald-600 border-emerald-100/50' : 'bg-amber-50 text-amber-600 border-amber-100/50'
                  }`}>
                    {result.status.replace('_', ' ')}
                  </div>
              </motion.div>

              {/* Bento Item: Key Metrics */}
              <motion.div 
                variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } } }}
                className="md:col-span-7 lg:col-span-8 grid grid-cols-2 gap-6"
              >
                {[
                  { label: 'Profil de Risque', value: result.risk_profile.niveau, icon: Scale, color: result.risk_profile.niveau === 'élevé' ? 'text-red-500' : 'text-teal-600', bg: result.risk_profile.niveau === 'élevé' ? 'bg-red-50' : 'bg-teal-50/50' },
                  { label: 'Capital Social', value: `${(capital ? parseInt(capital.replace(/[^0-9]/g, '')) : result.risk_profile.capital_recommande).toLocaleString()} TND`, icon: ShieldCheck, color: 'text-indigo-600', bg: 'bg-indigo-50/50' },
                  { label: 'Estimation Délai', value: result.risk_profile.delai_conformite, icon: Brain, color: 'text-emerald-600', bg: 'bg-emerald-50/50' },
                  { label: 'Structure', value: typeSociete, icon: ClipboardCheck, color: 'text-blue-600', bg: 'bg-blue-50/50' },
                ].map((item, i) => (
                  <motion.div 
                    key={i} 
                    variants={staggerItem}
                    whileHover={{ y: -4, scale: 1.02 }}
                    className="bg-white/60 backdrop-blur-xl p-6 rounded-[32px] border border-white shadow-[0_4px_20px_rgb(0,0,0,0.03)] flex flex-col justify-center gap-4 transition-all duration-500 group cursor-default relative overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="flex items-center gap-5 relative z-10 w-full">
                      <div 
                        className={`w-14 h-14 rounded-2xl ${item.bg} flex items-center justify-center flex-shrink-0 shadow-inner border border-white/50 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500`}
                      >
                         <item.icon className={`w-7 h-7 ${item.color} drop-shadow-sm`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">{item.label}</p>
                        <p className={`text-sm lg:text-base font-black truncate ${item.color}`}>{item.value}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>

              <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className="md:col-span-12 space-y-8 mt-4">

               <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-[0.15em] flex items-center gap-3">
                     <span className="relative flex h-3 w-3">
                       <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                       <span className="relative inline-flex rounded-full h-3 w-3 bg-teal-500"></span>
                     </span>
                     Diagnostic Détaillé
                  </h3>
               </div>

               <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 gap-4">
                 {result.criteres.map((c, i) => (
                   <motion.div 
                     key={i} 
                     variants={staggerItem}
                     whileHover={{ x: 4, scale: 1.005 }}
                     className="group bg-white/70 backdrop-blur-xl p-6 rounded-[28px] border border-white shadow-[0_4px_20px_rgb(0,0,0,0.02)] hover:shadow-[0_8px_30px_rgb(20,184,166,0.08)] hover:border-teal-100 transition-all duration-500 cursor-default relative overflow-hidden"
                   >
                     <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-teal-400 to-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                     <div className="flex items-start gap-4">
                        <div className="mt-1 flex-shrink-0 bg-white rounded-xl shadow-sm border border-slate-100 group-hover:border-teal-100 group-hover:shadow-teal-500/10 transition-all p-1">
                           <StatusIcon status={c.status} />
                        </div>
                        <div className="flex-1 min-w-0 space-y-3">
                          <div className="flex items-center justify-between">
                             <div className="flex items-center gap-3">
                                <span className="text-[15px] font-bold text-slate-900">{c.label}</span>
                                <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg tracking-wider border ${
                                  c.score >= 75 ? 'bg-emerald-50 text-emerald-600 border-emerald-100/50' : 'bg-amber-50 text-amber-600 border-amber-100/50'
                                }`}>{c.score}%</span>
                             </div>
                             <span className="text-[10px] font-black text-slate-400 uppercase bg-slate-50 px-2 py-1 rounded-md">{c.article_source}</span>
                          </div>
                          <p className="text-sm text-slate-500 leading-relaxed font-medium">{c.details}</p>
                          
                          {c.recommendation && (
                            <div className="flex items-start gap-3 p-4 rounded-[20px] bg-gradient-to-r from-slate-50/50 to-transparent border border-slate-100 group-hover:from-teal-50/30 group-hover:border-teal-100/50 transition-colors mt-2">
                               <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center shadow-sm flex-shrink-0 border border-slate-100 group-hover:border-teal-100">
                                 <ArrowRight className="w-3 h-3 text-teal-500" />
                               </div>
                               <p className="text-xs font-semibold text-slate-700 pt-1 leading-relaxed">{c.recommendation}</p>
                            </div>
                          )}
                        </div>
                     </div>
                   </motion.div>
                 ))}
               </motion.div>
            </motion.div>

            <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className="md:col-span-12 grid grid-cols-1 md:grid-cols-2 gap-8 pt-10 border-t border-slate-200/50">
               <div className="bg-white/60 backdrop-blur-2xl p-10 rounded-[40px] border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] space-y-8 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-teal-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                  <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-slate-200/50 pb-6 flex items-center gap-2">
                     <BarChart3 className="w-4 h-4 text-teal-500" /> Performance par Domaine
                  </h4>
                  <div className="space-y-6 relative z-10">
                     {Object.entries(catScores).map(([cat, { earned, total }]) => {
                        const pct = Math.round((earned / total) * 100)
                        return (
                          <div key={cat} className="space-y-3">
                             <div className="flex justify-between text-xs font-black uppercase tracking-wider">
                                <span className="text-slate-600">{cat}</span>
                                <span className={pct >= 75 ? 'text-emerald-500' : 'text-amber-500'}>{pct}%</span>
                             </div>
                             <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden shadow-inner">
                                <div className={`h-full transition-all duration-1000 relative ${pct >= 75 ? 'bg-gradient-to-r from-emerald-400 to-teal-500' : 'bg-gradient-to-r from-amber-400 to-orange-500'}`} style={{ width: `${pct}%` }}>
                                   <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.2)_50%,transparent_75%,transparent_100%)] bg-[length:20px_20px] animate-[shimmer_1s_infinite_linear]" />
                                </div>
                             </div>
                          </div>
                        )
                     })}
                  </div>
               </div>

               <div className="space-y-8">
                  <h4 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-slate-200/50 pb-6 flex items-center gap-2">
                     <AlertTriangle className="w-4 h-4 text-amber-500" /> Points de vigilance (Quiz)
                  </h4>
                  <div className="space-y-4 relative z-10">
                    {issues.map((q, i) => (
                      <motion.div 
                        key={i} 
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="bg-white/70 backdrop-blur-md p-6 rounded-[28px] border border-red-100 shadow-sm flex items-start gap-5 group hover:shadow-md hover:border-red-200 transition-all duration-300"
                      >
                        <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center flex-shrink-0 group-hover:scale-110 group-hover:-rotate-6 transition-transform duration-300">
                           <AlertTriangle className="w-6 h-6 text-red-500" />
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                           <p className="text-sm font-black text-slate-900 mb-2 leading-snug">{q.question || (q as any).label}</p>
                           <p className="text-xs text-slate-500 leading-relaxed font-medium bg-slate-50/50 p-3 rounded-xl border border-slate-100">{q.explanation}</p>
                        </div>
                      </motion.div>
                    ))}
                    {issues.length === 0 && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-gradient-to-br from-emerald-50 to-teal-50/50 p-10 rounded-[32px] border border-emerald-100/50 text-center space-y-4 shadow-inner"
                      >
                         <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/10 mx-auto">
                            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                         </div>
                         <p className="text-sm font-black text-emerald-800 uppercase tracking-widest">Excellente configuration</p>
                         <p className="text-sm text-emerald-600/80 font-medium">Aucun point de vigilance majeur n&apos;a été détecté lors de l&apos;audit croisé de vos réponses.</p>
                      </motion.div>
                    )}
                  </div>
               </div>
            </motion.div>
            </motion.div>

            <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} className="pt-6 relative z-10 w-full flex justify-center">
               <Button 
                  onClick={() => { setAuditPhase('idle'); startAudit(); }} 
                  className="px-10 py-7 rounded-full bg-white hover:bg-slate-50 text-slate-600 font-bold border border-slate-200 shadow-sm hover:shadow-md transition-all flex items-center gap-3 group"
               >
                  <RefreshCcw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-700 text-slate-400 group-hover:text-teal-500" />
                  Nouveau Diagnostic
               </Button>
            </motion.div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-8 py-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
             <div className="p-6 rounded-[24px] bg-gradient-to-br from-amber-50 to-orange-50/30 border border-amber-200/60 flex items-start gap-4 shadow-inner">
               <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
               </div>
               <div className="pt-1">
                  <p className="text-xs font-black uppercase tracking-wider text-amber-800 mb-1">Analyse Préliminaire</p>
                  <p className="text-sm text-amber-700/80 leading-relaxed font-medium">
                     Les données ci-dessous découlent de l&apos;analyse automatique de votre pipeline. 
                     <span className="font-bold text-amber-900 border-b border-amber-900/20 pb-0.5 ml-1">Ajustez-les si nécessaire avant l&apos;audit.</span>
                  </p>
               </div>
             </div>

             <div className="space-y-8 bg-white/60 backdrop-blur-xl p-10 rounded-[40px] border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden group">
               <div className="absolute inset-0 bg-gradient-to-br from-slate-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
               
               <div className="space-y-4 relative z-10">
                 <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                    Secteur d&apos;activité
                 </label>
                 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                   {SECTORS.map((s) => (
                     <button key={s.id} onClick={() => setSector(s.id)}
                       className={`p-4 rounded-[20px] border-2 text-center transition-all duration-300 relative overflow-hidden ${
                         sector === s.id 
                           ? 'border-teal-400 bg-teal-50/50 shadow-[0_8px_20px_rgba(20,184,166,0.1)] text-teal-900 scale-[1.02]' 
                           : 'border-white bg-white/80 hover:border-teal-200 hover:shadow-md text-slate-600 hover:text-slate-900'
                       }`}>
                       {sector === s.id && <div className="absolute inset-0 bg-teal-400/5 mix-blend-overlay" />}
                       <span className="text-2xl block mb-2 relative z-10 transition-transform duration-300 group-hover:scale-110">{s.emoji}</span>
                       <span className="text-[10px] font-black uppercase tracking-wider relative z-10">{s.label}</span>
                     </button>
                   ))}
                 </div>
               </div>

               <div className="space-y-4 relative z-10">
                 <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Description détaillée
                 </label>
                 <Textarea value={description} onChange={(e) => setDescription(e.target.value)}
                   className="min-h-[160px] resize-none text-sm font-medium leading-relaxed rounded-[24px] bg-white/80 border-2 border-white shadow-inner focus:border-teal-300 focus:ring-4 focus:ring-teal-500/10 p-6 transition-all placeholder:text-slate-300"
                   placeholder="Décrivez précisément les mécanismes centraux de votre initiative..." />
               </div>

               <div className="grid grid-cols-2 gap-6 relative z-10 pt-4 border-t border-slate-100/50">
                 <div className="space-y-4">
                   <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                     <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                     Capital / Budget (TND)
                   </label>
                   <Input type="number" value={capital} onChange={(e) => setCapital(e.target.value)} 
                     placeholder="Ex : 200000" 
                     className="rounded-[20px] bg-white/80 border-2 border-white shadow-inner focus:border-teal-300 focus:ring-4 focus:ring-teal-500/10 px-6 py-6 text-sm font-bold text-slate-700 transition-all placeholder:text-slate-300" />
                 </div>
                 <div className="space-y-4">
                   <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                     <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                     Forme Juridique
                   </label>
                   <select 
                     value={typeSociete} 
                     onChange={(e) => setTypeSociete(e.target.value)}
                     className="w-full text-sm font-bold bg-white border border-slate-200/60 rounded-[20px] px-6 py-6 focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-300 transition-all text-slate-700 shadow-inner appearance-none cursor-pointer hover:bg-slate-50"
                   >
                     <option value="Non défini">Non défini pour le moment</option>
                     <option value="SARL">SARL (Société à Responsabilité Limitée)</option>
                     <option value="SUARL">SUARL (SARL Unipersonnelle)</option>
                     <option value="SA">SA (Société Anonyme)</option>
                     <option value="SAS">SAS (Société par Actions Simplifiée)</option>
                   </select>
                 </div>
               </div>

               <div className="pt-6 relative z-10">
                 <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                   <Button 
                     onClick={startAudit} 
                     disabled={!description.trim() || !sector}
                     className="w-full bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-white rounded-full py-8 text-base font-black shadow-xl shadow-teal-500/20 disabled:opacity-50 disabled:scale-100 transition-all group flex items-center justify-center gap-3 relative overflow-hidden"
                   >
                     <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                     <span className="relative z-10">Démarrer le Diagnostic & Quiz d&apos;Audit</span>
                     <ArrowRight className="w-5 h-5 relative z-10 group-hover:translate-x-1.5 transition-transform duration-300" />
                   </Button>
                 </motion.div>
               </div>
               
               {(error || auditError) && (
                 <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-4 rounded-[16px] bg-red-50/80 border border-red-100/50 backdrop-blur-sm text-red-600 text-xs font-bold flex items-start gap-3 shadow-inner relative z-10">
                    <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                      <AlertTriangle className="w-3 h-3 text-red-500" />
                    </div>
                    <span className="pt-0.5">{error || auditError}</span>
                 </motion.div>
               )}
             </div>
          </div>
        )}
      </div>
    </div>
  )
}
