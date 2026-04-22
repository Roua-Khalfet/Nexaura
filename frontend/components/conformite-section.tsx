'use client'

import { useState, useEffect } from 'react'
import { ShieldCheck, Loader2, AlertTriangle, CheckCircle2, XCircle, ArrowRight, Brain, ChevronRight, Sparkles, ClipboardCheck, Scale } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { analyzeConformite, generateContextualQuestionnaire, type ConformiteResult, type QuizQuestion } from '@/lib/api'

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
  const offset = circumference - (score / 100) * circumference
  const color = score >= 75 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444'
  
  return (
    <div className="relative mx-auto" style={{ width: dim, height: dim }}>
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-border" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1.5s ease-out' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`${size === "sm" ? 'text-xl' : 'text-4xl'} font-black`} style={{ color }}>{score}</span>
        <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">{label || '%'}</span>
      </div>
    </div>
  )
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'check') return <CheckCircle2 className="w-5 h-5 text-emerald-500" />
  if (status === 'warning') return <AlertTriangle className="w-5 h-5 text-amber-500" />
  return <XCircle className="w-5 h-5 text-red-500" />
}

export default function ConformiteSection({ projectData, conformiteResult }: {
  projectData?: { description?: string; sector?: string; capital?: string; typeSociete?: string; budget?: string; location?: string; activite?: string }
  conformiteResult?: ConformiteResult | null
}) {
  const [description, setDescription] = useState('')
  const [sector, setSector] = useState('SaaS')
  const [capital, setCapital] = useState('')
  const [typeSociete, setTypeSociete] = useState('SUARL')
  const [result, setResult] = useState<ConformiteResult | null>(conformiteResult || null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [prefilled, setPrefilled] = useState(false)

  // === Questionnaire (Audit) state ===
  const [auditPhase, setAuditPhase] = useState<'idle' | 'loading' | 'playing' | 'done'>('idle')
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [currentQ, setCurrentQ] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [isAnswered, setIsAnswered] = useState(false)
  const [answers, setAnswers] = useState<number[]>([])
  const [auditError, setAuditError] = useState('')

  // Auto-fill from pipeline data
  useEffect(() => {
    if (projectData && !prefilled) {
      if (projectData.description) setDescription(projectData.description)
      if (projectData.sector) setSector(projectData.sector)
      if (projectData.capital) setCapital(projectData.capital)
      else if (projectData.budget) setCapital(projectData.budget)
      if (projectData.typeSociete) setTypeSociete(projectData.typeSociete)
      setPrefilled(true)
    }
  }, [projectData, prefilled])

  useEffect(() => {
    if (conformiteResult && !result) setResult(conformiteResult)
  }, [conformiteResult, result])

  const handleAnalyze = async () => {
    if (!description.trim()) return
    setIsLoading(true)
    setError('')
    setResult(null)
    setAuditPhase('idle')
    setQuestions([])
    setAnswers([])
    try {
      const res = await analyzeConformite({
        project_description: description, sector,
        capital: capital ? parseInt(capital) : null,
        type_societe: typeSociete,
      })
      setResult(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur analyse')
    } finally {
      setIsLoading(false)
    }
  }

  // === Questionnaire logic ===
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
    } else {
      setCurrentQ(c => c + 1)
      setSelectedAnswer(null)
      setIsAnswered(false)
    }
  }

  // Questionnaire score calculation
  const auditTotalWeight = questions.reduce((s, q) => s + q.weight, 0)
  const auditEarnedWeight = answers.reduce((s, ans, i) => {
    if (!questions[i]) return s
    if (ans === questions[i].compliantAnswer) return s + questions[i].weight
    if (ans === 1) return s + questions[i].weight * 0.3 // Partially compliant
    return s
  }, 0)
  const auditScorePct = auditTotalWeight > 0 ? Math.round((auditEarnedWeight / auditTotalWeight) * 100) : 0

  // Combined score (initial + audit)
  const combinedScore = result ? Math.round((result.score_global * 0.4) + (auditScorePct * 0.6)) : auditScorePct

  const catScores = questions.reduce<Record<string, { earned: number; total: number }>>((acc, q, i) => {
    if (!acc[q.category]) acc[q.category] = { earned: 0, total: 0 }
    acc[q.category].total += q.weight
    if (answers[i] === q.compliantAnswer) acc[q.category].earned += q.weight
    else if (answers[i] === 1) acc[q.category].earned += q.weight * 0.3
    return acc
  }, {})

  const issues = questions.filter((q, i) => answers[i] !== undefined && answers[i] !== q.compliantAnswer)

  return (
    <div className="flex flex-col h-full bg-slate-50/30 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border bg-white shadow-sm z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Module de Conformité</h2>
              <div className="flex items-center gap-2">
                 <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full uppercase">Audit Niveau {result && auditPhase === 'done' ? '2' : '1'}</span>
                 <p className="text-[11px] text-muted-foreground">{auditPhase === 'done' ? 'Analyse approfondie terminée' : 'Scoring pondéré par critère légal'}</p>
              </div>
            </div>
          </div>
          {result && (
             <div className="flex items-center gap-4 bg-slate-50 px-4 py-2 rounded-xl border border-slate-200">
                <div className="text-right">
                   <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter">Score Final</p>
                   <p className={`text-lg font-black ${combinedScore >= 75 ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {auditPhase === 'done' ? combinedScore : result.score_global}%
                   </p>
                </div>
                <div className="w-[1px] h-8 bg-slate-200" />
                <div className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${
                  (auditPhase === 'done' ? combinedScore : result.score_global) >= 75 ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'
                }`}>
                   { (auditPhase === 'done' ? combinedScore : result.score_global) >= 75 ? 'Robuste' : 'À Améliorer' }
                </div>
             </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {!result ? (
          <div className="max-w-2xl mx-auto space-y-6 py-4">
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
               <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5" />
               <p className="text-xs text-amber-800 leading-relaxed font-medium">
                  Les données ci-dessous proviennent de l'analyse automatique de votre pipeline. 
                  Vous pouvez les modifier avant de lancer l'audit de conformité.
               </p>
            </div>

            <div className="space-y-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Secteur d&apos;activité principal</label>
                <div className="grid grid-cols-4 gap-2">
                  {SECTORS.map((s) => (
                    <button key={s.id} onClick={() => setSector(s.id)}
                      className={`p-3 rounded-xl border-2 text-center transition-all ${
                        sector === s.id ? 'border-emerald-400 bg-emerald-50/50 shadow-sm' : 'border-slate-100 hover:border-emerald-200'
                      }`}>
                      <span className="text-xl block mb-1">{s.emoji}</span>
                      <span className="text-[10px] font-bold block text-slate-800">{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Description synthétique</label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="Décrivez précisément votre projet..."
                  className="rounded-xl min-h-[120px] text-sm" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Capital Social / Budget (TND)</label>
                  <Input type="number" value={capital} onChange={(e) => setCapital(e.target.value)} placeholder="Ex : 200000" className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Forme Juridique</label>
                  <div className="flex gap-2">
                    {['SUARL', 'SARL', 'SA'].map((t) => (
                      <button key={t} onClick={() => setTypeSociete(t)}
                        className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
                          typeSociete === t ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}>{t}</button>
                    ))}
                  </div>
                </div>
              </div>

              <Button onClick={handleAnalyze} disabled={!description.trim() || isLoading}
                className="w-full py-7 rounded-xl text-sm font-bold bg-slate-900 border-2 border-slate-900 hover:bg-slate-800 text-white shadow-xl shadow-slate-200 transition-all gap-2 group">
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ClipboardCheck className="w-5 h-5 group-hover:scale-110 transition-transform" />}
                {isLoading ? 'Audit en cours...' : 'Générer l\'Analyse de Conformité'}
              </Button>
              {error && <div className="p-3 rounded-xl bg-red-50 text-red-600 text-xs border border-red-200">{error}</div>}
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-8 pb-12">
            <button onClick={() => { setResult(null); setAuditPhase('idle'); }}
              className="group flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-900 transition-colors uppercase tracking-widest">
              <ArrowRight className="w-3.5 h-3.5 rotate-180 group-hover:-translate-x-1 transition-transform" /> 
              Nouvelle Analyse
            </button>

            {/* ── Dashboard Top ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-1 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center justify-center space-y-4">
                  {auditPhase === 'done' ? (
                     <div className="flex items-center gap-4">
                        <ScoreGauge score={result.score_global} label="Description" size="sm" />
                        <ArrowRight className="text-slate-300" />
                        <ScoreGauge score={combinedScore} label="Affiné (Audit)" />
                     </div>
                  ) : (
                    <ScoreGauge score={result.score_global} label="Conformité" />
                  )}
                  <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                    (auditPhase === 'done' ? combinedScore : result.score_global) >= 75 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {result.status.replace('_', ' ')}
                  </div>
              </div>

              <div className="md:col-span-2 grid grid-cols-2 gap-4">
                {[
                  { label: 'Profil de Risque', value: result.risk_profile.niveau, icon: Scale, color: result.risk_profile.niveau === 'élevé' ? 'text-red-500' : 'text-emerald-500' },
                  { label: 'Socle Capital', value: `${result.risk_profile.capital_recommande.toLocaleString()} TND`, icon: ShieldCheck, color: 'text-slate-900' },
                  { label: 'Estimation Délai', value: result.risk_profile.delai_conformite, icon: Brain, color: 'text-slate-900' },
                  { label: 'Structure', value: typeSociete, icon: ClipboardCheck, color: 'text-slate-900' },
                ].map((item, i) => (
                  <div key={i} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center flex-shrink-0">
                       <item.icon className={`w-4 h-4 ${item.color}`} />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-0.5">{item.label}</p>
                      <p className={`text-xs font-bold ${item.color}`}>{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Content Tabs (Simulated) ── */}
            <div className="space-y-6">
               <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                     <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                     Diagnostic de Conformité
                  </h3>
               </div>

               <div className="grid grid-cols-1 gap-4">
                 {result.criteres.map((c, i) => (
                   <div key={i} className="group bg-white p-5 rounded-2xl border border-slate-200 hover:border-emerald-200 hover:shadow-md transition-all">
                     <div className="flex items-start gap-4">
                        <div className="mt-1 flex-shrink-0">
                           <StatusIcon status={c.status} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-2">
                             <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-slate-900">{c.label}</span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  c.score >= 75 ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                                }`}>{c.score}%</span>
                             </div>
                             <span className="text-[10px] font-bold text-slate-400 uppercase">{c.article_source}</span>
                          </div>
                          <p className="text-xs text-slate-500 leading-relaxed mb-3">{c.details}</p>
                          
                          {c.recommendation && (
                            <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-50 border border-slate-100 group-hover:bg-emerald-50/30 group-hover:border-emerald-100 transition-colors">
                               <ArrowRight className="w-3.5 h-3.5 mt-0.5 text-emerald-500 flex-shrink-0" />
                               <p className="text-[11px] font-medium text-slate-700">{c.recommendation}</p>
                            </div>
                          )}
                        </div>
                     </div>
                   </div>
                 ))}
               </div>
            </div>

            {/* ── Questionnaire Action ── */}
            <div className="pt-8 border-t border-slate-200">
              {auditPhase === 'idle' && (
                <div className="relative overflow-hidden bg-slate-900 p-8 rounded-[32px] text-white flex flex-col md:flex-row items-center gap-8 shadow-2xl">
                  {/* Decorative blobs */}
                  <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                  <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />

                  <div className="flex-1 space-y-4 relative z-10">
                    <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center backdrop-blur-md">
                      <Brain className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black mb-2">Audit de Conformité Approfondi</h3>
                      <p className="text-sm text-slate-300 leading-relaxed max-w-lg">
                        L&apos;IA a généré un questionnaire d&apos;expertise basé sur votre secteur spécifique. 
                        Répondez aux 10 questions techniques pour affiner votre score et obtenir des recommandations ultra-précises.
                      </p>
                    </div>
                  </div>

                  <div className="w-full md:w-auto relative z-10">
                    <Button onClick={startAudit}
                      className="w-full px-8 py-7 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-slate-900 font-bold shadow-xl shadow-emerald-500/20 text-base gap-3 border-none">
                      <Sparkles className="w-5 h-5" /> Démarrer l&apos;expertise
                    </Button>
                    {auditError && <p className="text-[10px] text-red-300 mt-2 text-center">{auditError}</p>}
                  </div>
                </div>
              )}

              {/* Questionnaire Loading */}
              {auditPhase === 'loading' && (
                <div className="p-12 bg-white rounded-3xl border border-slate-200 text-center space-y-4 shadow-sm">
                   <div className="relative w-16 h-16 mx-auto">
                      <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
                      <div className="absolute inset-0 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
                   </div>
                   <div className="space-y-1">
                      <p className="text-base font-black text-slate-900 uppercase tracking-widest">Génération de l&apos;audit</p>
                      <p className="text-xs text-slate-500">L&apos;expert IA analyse les spécificités de votre activité...</p>
                   </div>
                </div>
              )}

              {/* Questionnaire Playing */}
              {auditPhase === 'playing' && questions[currentQ] && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                   <div className="md:col-span-1 space-y-6">
                      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                         <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
                               <Scale className="w-5 h-5 text-white" />
                            </div>
                            <h4 className="text-sm font-black uppercase tracking-wider text-slate-900">Suivi d&apos;Audit</h4>
                         </div>
                         
                         <div className="space-y-4 text-center">
                            <div className="relative inline-block">
                               <svg className="w-24 h-24 -rotate-90">
                                  <circle cx="48" cy="48" r="40" fill="none" stroke="#f1f5f9" strokeWidth="8" />
                                  <circle cx="48" cy="48" r="40" fill="none" stroke="#10b981" strokeWidth="8" strokeDasharray={251} strokeDashoffset={251 - (251 * (currentQ + 1)) / questions.length} strokeLinecap="round" className="transition-all duration-500" />
                               </svg>
                               <div className="absolute inset-0 flex items-center justify-center">
                                  <span className="text-xl font-black text-slate-900">{currentQ + 1}</span>
                                  <span className="text-xs text-slate-400">/10</span>
                               </div>
                            </div>
                         </div>

                         <div className="space-y-2">
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Domaine en cours</p>
                           <p className="text-xs font-black text-slate-900 bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-blue-500" />
                              {questions[currentQ].category}
                           </p>
                         </div>

                         <div className="flex justify-center gap-1.5">
                            {Array.from({ length: 10 }).map((_, i) => (
                              <div key={i} className={`w-2.5 h-1.5 rounded-full transition-all ${
                                i === currentQ ? 'w-6 bg-slate-900' : 
                                i < answers.length ? 'bg-emerald-400' : 'bg-slate-200'
                              }`} />
                            ))}
                         </div>
                      </div>
                      
                      {isAnswered && (
                         <div className="bg-emerald-900 p-6 rounded-3xl text-white shadow-xl shadow-emerald-900/20 space-y-4 animate-in slide-in-from-bottom-4">
                            <div className="flex items-center gap-2">
                               <Brain className="w-5 h-5 text-emerald-400" />
                               <span className="text-[10px] font-black uppercase tracking-widest">Conseil d&apos;Expert</span>
                            </div>
                            <p className="text-xs text-emerald-50/80 leading-relaxed font-medium">{questions[currentQ].explanation}</p>
                            <div className="h-[1px] bg-white/10" />
                            <p className="text-[10px] font-bold text-emerald-400">Réf. {questions[currentQ].article}</p>
                         </div>
                      )}
                   </div>

                   <div className="md:col-span-2 space-y-6">
                      <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-xl min-h-[400px] flex flex-col">
                         <div className="flex items-center gap-2 mb-6">
                            <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full ${
                               questions[currentQ].weight >= 3 ? 'bg-red-500 text-white' : 
                               questions[currentQ].weight === 2 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                            }`}>
                               {questions[currentQ].weight >= 3 ? 'CRITIQUE' : 'IMPORTANT'}
                            </span>
                         </div>

                         <h3 className="text-xl md:text-2xl font-black text-slate-900 leading-tight mb-8">
                            {questions[currentQ].question}
                         </h3>

                         <div className="space-y-3 flex-1">
                            {questions[currentQ].options.map((opt, idx) => {
                               const isCompliant = idx === questions[currentQ].compliantAnswer
                               const isSelected = idx === selectedAnswer
                               const style = isAnswered 
                                 ? isCompliant ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm' 
                                 : isSelected ? 'border-red-500 bg-red-50 text-red-700' 
                                 : 'border-slate-100 opacity-50 grayscale'
                                 : 'border-slate-200 hover:border-slate-900 hover:bg-slate-50 transition-all'
                               
                               return (
                                 <button key={idx} onClick={() => handleAnswer(idx)} disabled={isAnswered}
                                   className={`w-full flex items-center gap-4 p-5 rounded-[24px] border-2 text-left font-bold text-sm ${style}`}>
                                    <span className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                                      isAnswered && isCompliant ? 'bg-emerald-500 text-white' :
                                      isAnswered && isSelected ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-500'
                                    }`}>{String.fromCharCode(65 + idx)}</span>
                                    {opt}
                                    {isAnswered && isCompliant && <CheckCircle2 className="w-5 h-5 text-emerald-500 ml-auto" />}
                                 </button>
                               )
                            })}
                         </div>

                         {isAnswered && (
                            <Button onClick={nextQuestion} className="mt-10 py-7 rounded-2xl bg-slate-900 text-white font-bold text-base gap-3 w-full animate-in fade-in duration-500">
                               {currentQ + 1 >= questions.length ? 'Finaliser l\'Audit' : 'Question Suivante'} 
                               <ChevronRight className="w-5 h-5" />
                            </Button>
                         )}
                      </div>
                   </div>
                </div>
              )}

              {/* Questionnaire Done */}
              {auditPhase === 'done' && (
                <div className="space-y-8 animate-in zoom-in-95 duration-500">
                   <div className="bg-emerald-900 p-10 rounded-[48px] text-white text-center space-y-6 relative overflow-hidden shadow-2xl">
                      <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-emerald-500/20 to-transparent pointer-events-none" />
                      <div className="w-20 h-20 rounded-[32px] bg-white/20 backdrop-blur-xl flex items-center justify-center mx-auto mb-4 border border-white/20">
                         <ClipboardCheck className="w-10 h-10 text-emerald-400" />
                      </div>
                      <div className="space-y-2 relative z-10">
                        <h3 className="text-3xl font-black">Audit de Conformité Terminé</h3>
                        <p className="text-emerald-100/70 text-sm max-w-md mx-auto">Votre score a été recalculé sur la base de vos réponses techniques.</p>
                      </div>

                      <div className="flex flex-col md:flex-row items-center justify-center gap-12 pt-4 relative z-10">
                         <div className="space-y-2">
                             <div className="text-5xl font-black text-white">{combinedScore}%</div>
                             <p className="text-[10px] font-black uppercase text-emerald-400 tracking-widest">Score Final Affiné</p>
                         </div>
                         <div className="hidden md:block w-[1px] h-20 bg-white/10" />
                         <div className="flex items-center gap-8">
                            <div className="text-center">
                               <p className="text-xs font-bold text-emerald-100/60 mb-1">Audit (Questions)</p>
                               <div className="text-2xl font-black">{auditScorePct}%</div>
                            </div>
                            <div className="text-center">
                               <p className="text-xs font-bold text-emerald-100/60 mb-1">Initiale (Description)</p>
                               <div className="text-2xl font-black">{result.score_global}%</div>
                            </div>
                         </div>
                      </div>
                   </div>

                   <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm space-y-6">
                         <h4 className="text-sm font-black uppercase tracking-wider text-slate-900 border-b pb-4">Performance par Domaine</h4>
                         <div className="space-y-4">
                            {Object.entries(catScores).map(([cat, { earned, total }]) => {
                               const pct = Math.round((earned / total) * 100)
                               return (
                                 <div key={cat} className="space-y-2">
                                    <div className="flex justify-between text-xs font-bold">
                                       <span className="text-slate-600">{cat}</span>
                                       <span className={pct >= 75 ? 'text-emerald-600' : 'text-amber-600'}>{pct}%</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                       <div className={`h-full transition-all duration-1000 ${pct >= 75 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
                                    </div>
                                 </div>
                               )
                            })}
                         </div>
                      </div>

                      <div className="space-y-6">
                         <h4 className="text-sm font-black uppercase tracking-wider text-slate-900">Points de vigilance identifiés</h4>
                         <div className="space-y-3">
                           {issues.map((q, i) => (
                             <div key={i} className="bg-white p-5 rounded-3xl border border-red-100 shadow-sm flex items-start gap-4">
                               <div className="w-10 h-10 rounded-2xl bg-red-50 flex items-center justify-center flex-shrink-0">
                                  <AlertTriangle className="w-5 h-5 text-red-500" />
                               </div>
                               <div>
                                  <p className="text-xs font-black text-slate-900 mb-1">{q.question}</p>
                                  <p className="text-[11px] text-slate-500 leading-relaxed">{q.explanation}</p>
                               </div>
                             </div>
                           ))}
                           {issues.length === 0 && (
                             <div className="bg-emerald-50 p-8 rounded-3xl border border-emerald-100 text-center space-y-2">
                                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                                <p className="text-sm font-bold text-emerald-800">Aucun point de vigilance majeur détecté lors de l&apos;audit.</p>
                             </div>
                           )}
                         </div>
                      </div>
                   </div>

                   <Button onClick={startAudit} className="w-full py-7 rounded-[24px] bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold border-none">
                      Refaire l&apos;expertise approfondie
                   </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
