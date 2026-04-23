'use client'

import { useState, useCallback, useEffect } from 'react'
import { Brain, ChevronRight, Trophy, RotateCcw, CheckCircle2, XCircle, Sparkles, AlertTriangle, ArrowRight, Loader2, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { generateContextualQuestionnaire, type QuizQuestion } from '@/lib/api'

/* ── Fallback generic pool (used when no project data) ── */
const GENERIC_POOL: QuizQuestion[] = [
  { id: 1, question: "Votre entreprise a-t-elle été créée il y a moins de 8 ans ?", options: ["Oui", "Non", "Pas encore créée", "Je ne sais pas"], compliantAnswer: 0, explanation: "Pour obtenir le label Startup, l'entreprise doit avoir été constituée depuis moins de 8 ans.", article: "Loi n° 2018-20, Art. 3 al. 1", category: "Startup Act", weight: 3 },
  { id: 2, question: "Votre modèle économique repose-t-il sur l'innovation technologique ?", options: ["Oui, fortement", "Partiellement", "Non, activité traditionnelle", "Je ne sais pas"], compliantAnswer: 0, explanation: "Le caractère innovant et le fort potentiel de croissance sont des critères obligatoires du label.", article: "Loi n° 2018-20, Art. 3 al. 2", category: "Startup Act", weight: 3 },
  { id: 3, question: "Votre capital social respecte-t-il le minimum légal ?", options: ["Oui, au-dessus du minimum", "Non, en-dessous", "Je ne connais pas le minimum", "Pas encore de capital"], compliantAnswer: 0, explanation: "SARL/SUARL : 1 000 TND minimum. SA sans APE : 5 000 TND.", article: "Code des Sociétés, Art. 92 & 160", category: "Forme juridique", weight: 2 },
  { id: 4, question: "Avez-vous effectué une déclaration auprès de l'INPDP ?", options: ["Oui", "Non", "Pas de traitement de données", "Je ne connais pas l'INPDP"], compliantAnswer: 0, explanation: "Toute personne traitant des données personnelles doit effectuer une déclaration préalable.", article: "Loi n° 2004-63, Art. 7", category: "Protection données", weight: 3 },
  { id: 5, question: "Votre entreprise est-elle à jour dans ses déclarations fiscales ?", options: ["Oui, tout est à jour", "En retard sur certaines", "Non", "Pas encore assujettie"], compliantAnswer: 0, explanation: "Les déclarations fiscales doivent être effectuées dans les délais sous peine de pénalités.", article: "Code Fiscal, Art. 60", category: "Fiscalité", weight: 3 },
  { id: 6, question: "Vos salariés sont-ils tous déclarés à la CNSS ?", options: ["Oui, tous déclarés", "Certains seulement", "Non", "Pas de salariés"], compliantAnswer: 0, explanation: "L'affiliation au CNSS est obligatoire pour tous les salariés dès le premier jour.", article: "Code du Travail", category: "Droit social", weight: 3 },
  { id: 7, question: "Avez-vous protégé votre marque (dépôt INNORPI) ?", options: ["Oui, marque déposée", "En cours", "Non", "Je ne connais pas la procédure"], compliantAnswer: 0, explanation: "Le dépôt de marque auprès de l'INNORPI protège votre identité commerciale.", article: "Loi n° 2001-36", category: "Propriété intellectuelle", weight: 1 },
  { id: 8, question: "Vos contrats de travail sont-ils écrits et conformes ?", options: ["Oui, tous écrits et signés", "Certains sont verbaux", "Pas de contrats écrits", "Pas de salariés"], compliantAnswer: 0, explanation: "Tout contrat de travail doit être formalisé par écrit.", article: "Code du Travail, Art. 6-13", category: "Droit social", weight: 2 },
  { id: 9, question: "Votre site web affiche-t-il les mentions légales obligatoires ?", options: ["Oui (raison sociale, siège, RCS, contact)", "Partiellement", "Non", "Pas de site web"], compliantAnswer: 0, explanation: "Les mentions obligatoires incluent : raison sociale, siège social, RCS, contact.", article: "Loi n° 2000-83, Art. 9", category: "E-commerce", weight: 2 },
  { id: 10, question: "Avez-vous un expert comptable ou commissaire aux comptes ?", options: ["Oui, expert comptable", "Oui, commissaire aux comptes", "Les deux", "Non, aucun"], compliantAnswer: 0, explanation: "La tenue d'une comptabilité régulière est obligatoire.", article: "Code des Sociétés & Code Fiscal", category: "Fiscalité", weight: 2 },
]

interface QuizSectionProps {
  projectData?: {
    nom?: string
    description?: string
    sector?: string
    capital?: string
    budget?: string
    typeSociete?: string
    location?: string
    activite?: string
    differentiator?: string
  }
}

function ScoreRing({ score, max }: { score: number; max: number }) {
  const pct = Math.round((score / max) * 100)
  const circumference = 283
  const offset = circumference - (pct / 100) * circumference
  const color = pct >= 75 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444'
  return (
    <div className="relative w-44 h-44 mx-auto">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="5" className="text-border" />
        <circle cx="50" cy="50" r="45" fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1.5s ease-out' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-black" style={{ color }}>{pct}%</span>
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Conformité</span>
      </div>
    </div>
  )
}

type QuizState = 'intro' | 'loading' | 'playing' | 'result'

export default function QuizSection({ projectData }: QuizSectionProps) {
  const [state, setState] = useState<QuizState>('intro')
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [current, setCurrent] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [answered, setAnswered] = useState(false)
  const [answers, setAnswers] = useState<number[]>([])
  const [loadError, setLoadError] = useState('')
  const [isContextual, setIsContextual] = useState(false)

  const hasProjectData = !!(projectData?.description && projectData.description.trim().length > 10)

  const startQuiz = useCallback(async () => {
    setLoadError('')
    setCurrent(0)
    setSelected(null)
    setAnswered(false)
    setAnswers([])

    if (hasProjectData) {
      // Generate contextual questions via AI
      setState('loading')
      try {
        const contextualQuestions = await generateContextualQuestionnaire({
          description: projectData!.description,
          sector: projectData!.sector,
          capital: projectData!.capital,
          budget: projectData!.budget,
          typeSociete: projectData!.typeSociete,
          location: projectData!.location,
          activite: projectData!.activite,
        })
        setQuestions(contextualQuestions)
        setIsContextual(true)
        setState('playing')
      } catch (e) {
        console.error('Quiz generation error:', e)
        setLoadError(e instanceof Error ? e.message : 'Erreur génération')
        // Fallback to generic
        setQuestions(GENERIC_POOL)
        setIsContextual(false)
        setState('playing')
      }
    } else {
      // Use generic questions
      setQuestions(GENERIC_POOL)
      setIsContextual(false)
      setState('playing')
    }
  }, [hasProjectData, projectData])

  const handleAnswer = (idx: number) => {
    if (answered) return
    setSelected(idx)
    setAnswered(true)
    setAnswers(a => [...a, idx])
  }

  const nextQuestion = () => {
    if (current + 1 >= questions.length) {
      setState('result')
    } else {
      setCurrent(c => c + 1)
      setSelected(null)
      setAnswered(false)
    }
  }

  // Score calculation
  const totalWeight = questions.reduce((s, q) => s + q.weight, 0)
  const earnedWeight = answers.reduce((s, ans, i) => {
    if (!questions[i]) return s
    const q = questions[i]
    if (ans === q.compliantAnswer) return s + q.weight
    if (ans === 1) return s + q.weight * 0.3 // partial
    return s
  }, 0)
  const scorePct = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0

  const getVerdict = (pct: number) => {
    if (pct >= 80) return { label: '✅ Très bonne conformité', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', desc: 'Votre projet respecte bien le cadre juridique tunisien. Continuez à surveiller les évolutions réglementaires.' }
    if (pct >= 60) return { label: '⚠️ Conformité partielle', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', desc: 'Certains aspects nécessitent votre attention. Consultez les recommandations ci-dessous.' }
    if (pct >= 40) return { label: '🔶 Insuffisant', color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200', desc: 'Plusieurs obligations ne sont pas respectées. Il est recommandé de consulter un conseil juridique.' }
    return { label: '🚨 Non conforme', color: 'text-red-600', bg: 'bg-red-50 border-red-200', desc: 'Votre projet présente des risques juridiques significatifs. Consultez un avocat spécialisé.' }
  }

  // Category scores for result
  const catScores = questions.reduce<Record<string, { earned: number; total: number }>>((acc, q, i) => {
    if (!acc[q.category]) acc[q.category] = { earned: 0, total: 0 }
    acc[q.category].total += q.weight
    if (answers[i] === q.compliantAnswer) acc[q.category].earned += q.weight
    else if (answers[i] === 1) acc[q.category].earned += q.weight * 0.3
    return acc
  }, {})

  // Non-compliant items for recommendations
  const issues = questions.filter((q, i) => answers[i] !== undefined && answers[i] !== q.compliantAnswer)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-gradient-to-r from-amber-500/5 via-orange-500/5 to-transparent">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Analyse de Conformité Approfondie</h2>
            <p className="text-xs text-muted-foreground">
              {hasProjectData ? 'Questions générées par IA selon votre projet' : 'Évaluation générique du cadre juridique tunisien'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto flex items-center justify-center p-6">
        {/* ── INTRO ── */}
        {state === 'intro' && (
          <div className="text-center space-y-6 max-w-lg w-full">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 flex items-center justify-center mx-auto animate-float">
              <Brain className="w-12 h-12 text-amber-500" />
            </div>
            <div className="space-y-3">
              <h3 className="text-2xl font-black gradient-text">Questionnaire de Conformité</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {hasProjectData
                  ? <>L&apos;IA va analyser votre projet et générer <strong>10 questions spécifiques</strong> pour évaluer sa conformité juridique en profondeur.</>
                  : <>Répondez à <strong>10 questions</strong> pour évaluer votre conformité avec la législation tunisienne.</>
                }
              </p>
            </div>

            {/* Project context display */}
            {hasProjectData && (
              <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-left space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <p className="text-xs font-semibold text-blue-800">Contexte du projet détecté</p>
                </div>
                <p className="text-xs text-blue-700 leading-relaxed line-clamp-3">{projectData!.description}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {projectData!.sector && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{projectData!.sector}</span>
                  )}
                  {(projectData!.capital || projectData!.budget) && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{projectData!.capital || projectData!.budget} TND</span>
                  )}
                  {projectData!.typeSociete && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{projectData!.typeSociete}</span>
                  )}
                  {projectData!.location && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{projectData!.location}</span>
                  )}
                </div>
              </div>
            )}

            {!hasProjectData && (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-left space-y-2">
                <p className="text-xs font-semibold text-amber-800">💡 Astuce</p>
                <p className="text-xs text-amber-700">
                  Remplissez d&apos;abord la description de votre projet dans le <strong>Pipeline</strong> pour obtenir des questions personnalisées !
                </p>
              </div>
            )}

            <Button onClick={startQuiz} className="w-full py-6 rounded-xl text-sm font-semibold bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-lg shadow-amber-500/20 gap-2">
              <Sparkles className="w-4 h-4" />
              {hasProjectData ? 'Générer les questions contextuelles' : 'Commencer l\'évaluation'}
            </Button>
          </div>
        )}

        {/* ── LOADING (AI generating questions) ── */}
        {state === 'loading' && (
          <div className="text-center space-y-6 max-w-md">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 flex items-center justify-center mx-auto">
              <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-foreground">Analyse de votre projet en cours...</h3>
              <p className="text-xs text-muted-foreground">L&apos;IA génère des questions de conformité spécifiques à votre secteur et activité</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[10px]">
              {['📋 Lecture du projet', '⚖️ Analyse sectorielle', '📝 Génération questions'].map((s, i) => (
                <div key={i} className="p-2 rounded-lg bg-amber-50/50 border border-amber-200/50 text-amber-700 font-medium">{s}</div>
              ))}
            </div>
          </div>
        )}

        {/* ── PLAYING ── */}
        {state === 'playing' && questions[current] && (
          <div className="w-full max-w-2xl space-y-6">
            {/* Contextual badge */}
            {isContextual && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700 font-medium w-fit">
                <Sparkles className="w-3 h-3" /> Questions contextualisées pour votre projet
              </div>
            )}

            {loadError && (
              <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
                ⚠ {loadError} — Questions génériques utilisées.
              </div>
            )}

            {/* Progress */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Question {current + 1} / {questions.length}</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium text-[10px]">{questions[current].category}</span>
              </div>
              <Progress value={((current + 1) / questions.length) * 100} className="h-2" />
            </div>

            {/* Question */}
            <div className="p-6 rounded-2xl bg-card border border-border shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                {questions[current].weight >= 3 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-bold">⚠️ Critique</span>}
                {questions[current].weight === 2 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 font-bold">Important</span>}
                {questions[current].weight === 1 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-bold">Recommandé</span>}
              </div>
              <h3 className="text-lg font-bold text-foreground leading-relaxed mb-6">{questions[current].question}</h3>

              <div className="space-y-3">
                {questions[current].options.map((opt, idx) => {
                  const isCompliant = idx === questions[current].compliantAnswer
                  const isSelected = idx === selected
                  let optStyle = 'border-border hover:border-amber-300 hover:bg-amber-50/30'
                  if (answered) {
                    if (isCompliant) optStyle = 'border-emerald-400 bg-emerald-50 shadow-sm shadow-emerald-500/10'
                    else if (isSelected && !isCompliant) optStyle = 'border-red-400 bg-red-50'
                    else optStyle = 'border-border opacity-50'
                  }
                  return (
                    <button key={idx} onClick={() => handleAnswer(idx)} disabled={answered}
                      className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-center gap-3 ${optStyle}`}>
                      <span className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                        answered && isCompliant ? 'bg-emerald-500 text-white' :
                        answered && isSelected && !isCompliant ? 'bg-red-500 text-white' :
                        'bg-secondary text-secondary-foreground'
                      }`}>{String.fromCharCode(65 + idx)}</span>
                      <span className="text-sm font-medium text-foreground">{opt}</span>
                      {answered && isCompliant && <CheckCircle2 className="w-5 h-5 text-emerald-500 ml-auto" />}
                      {answered && isSelected && !isCompliant && <XCircle className="w-5 h-5 text-red-500 ml-auto" />}
                    </button>
                  )
                })}
              </div>

              {answered && (
                <div className={`mt-4 p-4 rounded-xl border space-y-1 animate-in fade-in duration-300 ${
                  selected === questions[current].compliantAnswer ? 'bg-emerald-50/70 border-emerald-200' : 'bg-amber-50/70 border-amber-200'
                }`}>
                  <p className={`text-xs font-semibold ${selected === questions[current].compliantAnswer ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {selected === questions[current].compliantAnswer ? '✅ Conforme !' : '⚠️ Point d\'attention :'}
                  </p>
                  <p className={`text-xs leading-relaxed ${selected === questions[current].compliantAnswer ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {questions[current].explanation}
                  </p>
                  <p className="text-[10px] text-muted-foreground font-medium mt-1">📖 {questions[current].article}</p>
                </div>
              )}
            </div>

            {answered && (
              <Button onClick={nextQuestion} className="w-full py-5 rounded-xl text-sm font-semibold bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 gap-2 animate-in fade-in duration-300">
                {current + 1 >= questions.length ? 'Voir le résultat' : 'Question suivante'} <ChevronRight className="w-4 h-4" />
              </Button>
            )}

            {/* Answer dots */}
            <div className="flex justify-center gap-1.5">
              {Array.from({ length: questions.length }).map((_, i) => (
                <div key={i} className={`w-3 h-3 rounded-full transition-all ${
                  i >= answers.length ? 'bg-border' :
                  answers[i] === questions[i]?.compliantAnswer ? 'bg-emerald-500 scale-110' : 'bg-red-400'
                }`} />
              ))}
            </div>
          </div>
        )}

        {/* ── RESULT ── */}
        {state === 'result' && (
          <div className="w-full max-w-2xl space-y-6 pb-6">
            <div className="text-center space-y-4">
              <ScoreRing score={earnedWeight} max={totalWeight} />
              <div className={`inline-block px-5 py-2 rounded-xl border text-sm font-bold ${getVerdict(scorePct).bg} ${getVerdict(scorePct).color}`}>
                {getVerdict(scorePct).label}
              </div>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">{getVerdict(scorePct).desc}</p>
              {isContextual && (
                <p className="text-[10px] text-blue-600 font-medium">🎯 Résultat basé sur des questions spécifiques à votre projet</p>
              )}
            </div>

            {/* Category breakdown */}
            <div className="p-5 rounded-2xl bg-card border border-border space-y-3">
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">Score par domaine</h4>
              {Object.entries(catScores).map(([cat, { earned, total }]) => {
                const pct = total > 0 ? Math.round((earned / total) * 100) : 0
                return (
                  <div key={cat} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-foreground">{cat}</span>
                      <span className={`font-bold ${pct >= 75 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-red-600'}`}>{pct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-secondary overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-1000 ${pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Recommendations */}
            {issues.length > 0 && (
              <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 space-y-3">
                <h4 className="text-xs font-semibold text-amber-800 uppercase tracking-wider flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Actions recommandées ({issues.length})
                </h4>
                {issues.map((q, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-amber-700 p-2 rounded-lg bg-white/50">
                    <ArrowRight className="w-3.5 h-3.5 mt-0.5 text-amber-500 flex-shrink-0" />
                    <div>
                      <p className="font-semibold">{q.question}</p>
                      <p className="text-amber-600/80 mt-0.5">{q.explanation}</p>
                      <p className="text-[10px] text-amber-500 mt-0.5">📖 {q.article}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Detail per question */}
            <div className="p-5 rounded-2xl bg-card border border-border space-y-2">
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">Détail par question</h4>
              {questions.map((q, i) => (
                <div key={i} className="flex items-center gap-2 text-xs py-1">
                  {answers[i] === q.compliantAnswer
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    : <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
                  <span className="truncate text-muted-foreground flex-1">{q.question}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground flex-shrink-0">{q.category}</span>
                </div>
              ))}
            </div>

            <Button onClick={startQuiz} className="w-full py-5 rounded-xl text-sm font-semibold bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 gap-2">
              <RotateCcw className="w-4 h-4" /> Refaire l&apos;évaluation
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
