'use client'

import { Download, ClipboardCheck, Scale, TrendingUp, Users, Zap, Shield, AlertTriangle, CheckCircle2, XCircle, FileText, ArrowRight, Sparkles, Leaf, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ProjectData, PipelineState } from './pipeline-section'
import { motion, AnimatePresence } from 'framer-motion'

interface ReportSectionProps {
  projectData: ProjectData
  pipelineState: PipelineState
}

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
} as const

const fadeInScale = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  show: { opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 25 } }
} as const

function ScoreBadge({ score, label, colorClass }: { score: number, label: string, colorClass: string }) {
  return (
    <motion.div 
      whileHover={{ scale: 1.05, y: -4 }}
      className={`flex flex-col items-center justify-center p-5 rounded-[28px] bg-white/70 backdrop-blur-xl border border-white/50 shadow-xl shadow-slate-200/40 relative overflow-hidden group`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${colorClass} opacity-0 group-hover:opacity-10 transition-opacity duration-500`} />
      <div className="relative z-10 text-center">
        <motion.p 
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="text-4xl font-black bg-gradient-to-br from-slate-900 to-slate-600 bg-clip-text text-transparent tabular-nums tracking-tighter"
        >
          {score}
        </motion.p>
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">{label}</p>
      </div>
    </motion.div>
  )
}

export default function ReportSection({ projectData, pipelineState }: ReportSectionProps) {
  const juridique = pipelineState.juridique
  const marketing = pipelineState.marketing
  const green = pipelineState.green

  const downloadReport = () => {
    const lines: string[] = []
    lines.push(`# Rapport Nexaura — ${projectData.nom || 'Mon Projet'}`)
    lines.push(`> Généré le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`)
    lines.push('')
    lines.push('---')
    lines.push('')
    lines.push('## 1. Description du Projet')
    lines.push(`- **Nom** : ${projectData.nom}`)
    lines.push(`- **Secteur** : ${projectData.sector}`)
    lines.push(`- **Activité** : ${projectData.activite || projectData.description}`)
    lines.push(`- **Localisation** : ${projectData.location || 'N/A'}`)
    lines.push(`- **Type de société** : ${projectData.typeSociete || 'N/A'}`)
    lines.push(`- **Capital** : ${projectData.capital ? `${projectData.capital} TND` : 'N/A'}`)
    lines.push(`- **Différenciateur** : ${projectData.differentiator || 'N/A'}`)
    lines.push(`- **Client cible** : ${projectData.clientType || 'N/A'}`)
    lines.push('')
    lines.push(`**Description complète :** ${projectData.description}`)
    lines.push('')

    if (juridique) {
      lines.push('---')
      lines.push('')
      lines.push('## 2. Analyse Juridique')
      lines.push(`**Score global : ${juridique.score_global}/100** — ${juridique.status === 'conforme' ? '✅ Conforme' : juridique.status === 'conforme_reserves' ? '⚠️ Conforme avec réserves' : '❌ Non conforme'}`)
      lines.push('')
      lines.push('### Profil de risque')
      lines.push(`- Niveau : ${juridique.risk_profile.niveau}`)
      lines.push(`- Capital recommandé : ${juridique.risk_profile.capital_recommande.toLocaleString()} TND`)
      lines.push(`- Délai conformité : ${juridique.risk_profile.delai_conformite}`)
      lines.push(`- Autorisations requises : ${juridique.risk_profile.autorisations_requises.join(', ') || 'Aucune'}`)
      lines.push('')
      lines.push('### Critères détaillés')
      juridique.criteres.forEach(c => {
        lines.push(`- **${c.label}** (${c.score}/100) — ${c.status === 'check' ? '✅' : c.status === 'warning' ? '⚠️' : '❌'} ${c.details}`)
        if (c.recommendation) lines.push(`  → ${c.recommendation}`)
      })
      lines.push('')
      if (juridique.recommendations.length > 0) {
        lines.push('### Recommandations juridiques')
        juridique.recommendations.forEach((r, i) => lines.push(`${i + 1}. ${r}`))
        lines.push('')
      }
      lines.push(`**Lois applicables :** ${juridique.lois_applicables.join(' • ')}`)
      lines.push('')
    }

    if (marketing) {
      lines.push('---')
      lines.push('')
      lines.push('## 3. Analyse Marketing')
      lines.push(`**Scores :** Viabilité ${marketing.score.viability}/100 • Opportunité ${marketing.score.market_opportunity}/100 • Risque ${marketing.score.competition_risk}/100`)
      lines.push(`**Recommandation :** ${marketing.score.recommendation}`)
      lines.push('')
      lines.push('### Résumé stratégique')
      lines.push(marketing.strategies.strategic_summary)
      lines.push('')
      lines.push('### SWOT')
      lines.push('#### Forces')
      marketing.swot.strengths.forEach(s => lines.push(`- [${s.impact}] ${s.point}`))
      lines.push('#### Faiblesses')
      marketing.swot.weaknesses.forEach(w => lines.push(`- [${w.impact}] ${w.point}`))
      lines.push('#### Opportunités')
      marketing.swot.opportunities.forEach(o => lines.push(`- [${o.impact}] ${o.point}`))
      lines.push('#### Menaces')
      marketing.swot.threats.forEach(t => lines.push(`- [${t.impact}] ${t.point}`))
      lines.push('')
      lines.push('### Personas clients')
      marketing.personas.forEach(p => {
        lines.push(`#### ${p.name} — ${p.role} (${p.age})`)
        lines.push(`- Motivations : ${p.motivations.join(' • ')}`)
        lines.push(`- Frustrations : ${p.frustrations.join(' • ')}`)
        lines.push(`- Canaux : ${p.channels.join(', ')}`)
      })
      lines.push('')
      lines.push('### Actions prioritaires')
      marketing.actions.forEach((a, i) => {
        lines.push(`${i + 1}. **${a.action}** (${a.timeline})`)
        lines.push(`   Pourquoi : ${a.why}`)
      })
      lines.push('')
    }

    if (green.result) {
      lines.push('---')
      lines.push('')
      lines.push('## 4. Analyse Verte & ESG')
      if (green.result.esg_score) {
        lines.push(`**Score ESG global : ${green.result.esg_score.composite_score}/100 (${green.result.esg_score.letter_grade})**`)
        lines.push(`- Environnement : ${green.result.esg_score.environmental_score}/100`)
        lines.push(`- Social : ${green.result.esg_score.social_score}/100`)
        lines.push(`- Gouvernance : ${green.result.esg_score.governance_score}/100`)
        if (green.result.esg_score.summary) {
          lines.push(`- Synthèse : ${green.result.esg_score.summary}`)
        }
        lines.push('')
      }

      if ((green.result.certifications || []).length > 0) {
        lines.push('### Certifications recommandées')
        green.result.certifications?.forEach((cert, i) => {
          lines.push(`${i + 1}. **${cert.name}** (${cert.priority || 'priority n/a'})`)
          if (cert.relevance) lines.push(`   - Pertinence : ${cert.relevance}`)
          if (cert.estimated_timeline) lines.push(`   - Délai : ${cert.estimated_timeline}`)
          if (cert.estimated_cost) lines.push(`   - Coût : ${cert.estimated_cost}`)
        })
        lines.push('')
      }

      if ((green.result.recommendations || []).length > 0) {
        lines.push('### Recommandations d\'impact')
        green.result.recommendations?.slice(0, 6).forEach((rec, i) => {
          lines.push(`${i + 1}. **${rec.title}**`)
          lines.push(`   - Catégorie : ${rec.category}`)
          lines.push(`   - Impact estimé : ${rec.estimated_impact}`)
          lines.push(`   - Difficulté : ${rec.implementation_difficulty}`)
          if (rec.estimated_cost) lines.push(`   - Coût : ${rec.estimated_cost}`)
        })
        lines.push('')
      }
    }

    lines.push('---')
    lines.push(`*Rapport généré par Nexaura — Plateforme IA pour Startups*`)

    const content = lines.join('\n')
    const blob = new Blob([content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rapport-nexaura-${projectData.nom || 'projet'}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const hasAny = juridique || marketing || green.result || green.status === 'running' || green.status === 'starting'

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50/30">
      {/* Header */}
      <div className="px-6 py-6 border-b border-border bg-white shadow-sm z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <motion.div 
              whileHover={{ rotate: 15, scale: 1.1 }}
              className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20"
            >
              <ClipboardCheck className="w-6 h-6 text-white" />
            </motion.div>
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Rapport Final Nexaura</h2>
              <p className="text-xs text-muted-foreground font-medium">Synthèse d'Expertise Juridique & Marketing</p>
            </div>
          </div>
          {hasAny && (
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button onClick={downloadReport} variant="outline" className="gap-2 text-xs font-bold rounded-xl border-2 hover:bg-slate-50 transition-all px-5 h-11">
                <Download className="w-4 h-4 text-orange-500" /> Télécharger .md
              </Button>
            </motion.div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
        {!hasAny ? (
          <div className="flex flex-col items-center justify-center py-32 text-center space-y-6">
            <div className="relative">
              <div className="absolute inset-0 bg-amber-500/10 blur-3xl rounded-full" />
              <ClipboardCheck className="w-20 h-20 mx-auto text-slate-200 relative z-10" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-slate-400">En attente des analyses</h3>
              <p className="text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
                Complétez les étapes de l'audit juridique et de l'analyse de marché. L'analyse verte se lance automatiquement en arrière-plan.
              </p>
            </div>
          </div>
        ) : (
          <motion.div 
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            className="max-w-5xl mx-auto space-y-8 pb-12"
          >
            {/* ── Project Summary Bento ── */}
            <motion.div variants={fadeInScale} className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative">
              
              {/* Floating ambient glow for modern SaaS feel */}
              <div className="absolute top-1/2 left-1/4 w-[500px] h-[500px] bg-gradient-to-tr from-teal-500/20 to-emerald-500/20 rounded-full blur-[100px] -translate-x-1/2 -translate-y-1/2 -z-10 mix-blend-multiply" />

              <motion.div 
                whileHover={{ y: -5, scale: 1.01 }}
                className="lg:col-span-4 bg-white/60 backdrop-blur-3xl p-8 rounded-[36px] border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col justify-center space-y-6 relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-slate-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="flex items-center gap-3 relative z-10">
                  <div className="w-10 h-10 rounded-2xl bg-teal-50 flex items-center justify-center border border-teal-100/50 shadow-sm">
                    <FileText className="w-5 h-5 text-teal-600" />
                  </div>
                  <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-800">Résumé Projet</h3>
                </div>
                <h4 className="text-3xl font-black text-slate-900 leading-tight tracking-tight relative z-10 drop-shadow-sm">
                  {projectData.nom || 'Startup sans nom'}
                </h4>
                <p className="text-sm text-slate-500 leading-relaxed line-clamp-4 relative z-10 font-medium">
                  {projectData.description}
                </p>
              </motion.div>

              <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Secteur', value: projectData.sector || 'N/A', icon: Zap, color: 'text-blue-600', hue: 'bg-blue-500/10' },
                  { label: 'Capital', value: projectData.capital ? `${projectData.capital} TND` : '—', icon: TrendingUp, color: 'text-emerald-600', hue: 'bg-emerald-500/10' },
                  { label: 'Structure', value: projectData.typeSociete || '—', icon: Shield, color: 'text-violet-600', hue: 'bg-violet-500/10' },
                  { label: 'Localisation', value: projectData.location || 'Tunis', icon: Users, color: 'text-amber-600', hue: 'bg-amber-500/10' },
                ].map((item, i) => (
                  <motion.div 
                    key={item.label} 
                    variants={fadeInScale}
                    whileHover={{ y: -5, scale: 1.03 }}
                    className="bg-white/80 backdrop-blur-xl p-6 rounded-[28px] border border-white/60 shadow-lg shadow-slate-200/50 flex flex-col justify-center items-center text-center group cursor-default relative overflow-hidden"
                  >
                    <div className={`absolute inset-0 ${item.hue} opacity-0 group-hover:opacity-100 transition-all duration-500`} />
                    <motion.div 
                      whileHover={{ rotate: 10 }}
                      className={`w-12 h-12 rounded-[18px] flex items-center justify-center mb-4 ${item.hue}`}
                    >
                      <item.icon className={`w-6 h-6 ${item.color}`} />
                    </motion.div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 relative z-10">{item.label}</p>
                    <p className={`text-base font-black ${item.color} truncate w-full tracking-tight relative z-10 drop-shadow-sm`}>{item.value}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* ── Juridique Section ── */}
            {juridique && (
              <motion.div variants={fadeInScale} className="bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/20">
                      <Scale className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-slate-900 uppercase tracking-wider">Expertise Juridique</h3>
                      <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">Audit de conformité & risque</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm ${
                      juridique.score_global >= 75 ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'
                    }`}>
                      {juridique.status.replace('_', ' ')}
                    </div>
                    <ScoreBadge score={juridique.score_global} label="Global" colorClass="from-blue-500 to-indigo-600" />
                  </div>
                </div>

                <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-12">
                  <div className="space-y-6">
                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                      <div className="w-1 h-3 bg-blue-500 rounded-full" />
                      Points Clés du Diagnostic
                    </h4>
                    <div className="space-y-3">
                      {juridique.criteres.slice(0, 5).map((c, i) => (
                        <div key={i} className="group p-4 rounded-2xl border border-slate-100 hover:border-blue-100 transition-colors">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              {c.status === 'check' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> :
                               c.status === 'warning' ? <AlertTriangle className="w-4 h-4 text-amber-500" /> :
                               <XCircle className="w-4 h-4 text-red-500" />}
                              <span className="text-xs font-bold text-slate-900">{c.label}</span>
                            </div>
                            <span className="text-[10px] font-black text-slate-400 tabular-nums">{c.score}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-50 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${c.score}%` }}
                              transition={{ duration: 1, delay: 0.5 + i * 0.1 }}
                              className={`h-full rounded-full ${c.score >= 75 ? 'bg-emerald-500' : c.score >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} 
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-6">
                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                      <div className="w-1 h-3 bg-indigo-500 rounded-full" />
                      Vigilance & Risques
                    </h4>
                    <div className="bg-slate-900 p-8 rounded-[32px] text-white space-y-6 relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Shield className="w-24 h-24 rotate-12" />
                      </div>
                      <div className="grid grid-cols-2 gap-6 relative z-10">
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-indigo-400 mb-1">Niveau Risque</p>
                          <p className="text-lg font-black uppercase tracking-wider">{juridique.risk_profile.niveau}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-indigo-400 mb-1">Délai Est.</p>
                          <p className="text-lg font-black uppercase tracking-wider">{juridique.risk_profile.delai_conformite}</p>
                        </div>
                      </div>
                      <div className="relative z-10 pt-4 border-t border-white/10">
                        <p className="text-[9px] font-black uppercase tracking-widest text-indigo-400 mb-3">Lois de Référence</p>
                        <div className="flex flex-wrap gap-2">
                          {juridique.lois_applicables.map((loi, i) => (
                            <span key={i} className="text-[10px] px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 transition-colors border border-white/5">{loi}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Marketing Section ── */}
            {marketing && (
              <motion.div variants={fadeInScale} className="bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-pink-600 flex items-center justify-center shadow-lg shadow-pink-600/20">
                      <TrendingUp className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-slate-900 uppercase tracking-wider">Vision Marketing</h3>
                      <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">Opportunités & Positionnement</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <ScoreBadge score={marketing.score.viability} label="Viabilité" colorClass="from-pink-500 to-rose-600" />
                    <ScoreBadge score={marketing.score.market_opportunity} label="Opportunité" colorClass="from-emerald-500 to-teal-600" />
                  </div>
                </div>

                <div className="p-8 space-y-12">
                  <div className="bg-slate-50 p-8 rounded-[32px] border border-slate-100 italic text-slate-700 leading-relaxed relative">
                    <Sparkles className="absolute -top-3 -left-3 w-8 h-8 text-amber-400 drop-shadow-sm" />
                    <p className="text-sm font-medium">"{marketing.strategies.strategic_summary}"</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {[
                      { label: 'Forces', items: marketing.swot.strengths, color: 'emerald', icon: Zap },
                      { label: 'Faiblesses', items: marketing.swot.weaknesses, color: 'red', icon: AlertTriangle },
                      { label: 'Opportunités', items: marketing.swot.opportunities, color: 'blue', icon: TrendingUp },
                      { label: 'Menaces', items: marketing.swot.threats, color: 'amber', icon: Shield },
                    ].map(q => (
                      <div key={q.label} className="space-y-4">
                        <div className="flex items-center gap-2">
                          <q.icon className={`w-3.5 h-3.5 text-${q.color}-500`} />
                          <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{q.label}</h5>
                        </div>
                        <div className="space-y-2">
                          {q.items.slice(0, 3).map((item, i) => (
                            <div key={i} className={`p-3 rounded-2xl bg-white border border-slate-100 text-[11px] font-medium text-slate-600 leading-snug group hover:border-${q.color}-200 transition-colors`}>
                              <span className={`inline-block w-1.5 h-1.5 rounded-full bg-${q.color}-400 mr-2`} />
                              {item.point}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                        <div className="w-1 h-3 bg-pink-500 rounded-full" />
                        Target Personas
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {marketing.personas.map((p, i) => (
                          <div key={i} className="bg-white p-5 rounded-[28px] border border-slate-200 shadow-sm hover:-translate-y-1 transition-all group">
                            <div className="flex items-center gap-4 mb-4">
                              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center text-white text-base font-black shadow-lg shadow-pink-500/10">
                                {p.name[0]}
                              </div>
                              <div>
                                <p className="text-sm font-black text-slate-900 leading-none mb-1">{p.name}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{p.role} • {p.age}</p>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {p.motivations.slice(0, 2).map((m, idx) => (
                                <span key={idx} className="px-2 py-0.5 rounded-full bg-slate-50 text-[9px] font-bold text-slate-500 border border-slate-100">{m}</span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-6">
                      <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                        <div className="w-1 h-3 bg-emerald-500 rounded-full" />
                        Actions Prioritaires
                      </h4>
                      <div className="space-y-3">
                        {marketing.actions.slice(0, 3).map((a, i) => (
                          <div key={i} className="flex items-start gap-4 p-4 rounded-2xl bg-emerald-50/30 border border-emerald-100/50 group">
                            <div className={`shrink-0 w-8 h-8 rounded-xl text-xs font-black flex items-center justify-center text-white shadow-md ${
                              a.timeline === '0-3 mois' ? 'bg-emerald-500' : a.timeline === '3-6 mois' ? 'bg-blue-500' : 'bg-amber-500'
                            }`}>
                              {i + 1}
                            </div>
                            <div>
                              <p className="text-xs font-black text-slate-900 mb-1">{a.action}</p>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-emerald-600/70 uppercase tracking-widest">{a.timeline}</span>
                                <div className="w-1 h-1 rounded-full bg-emerald-200" />
                                <span className="text-[10px] text-slate-500 font-medium italic truncate max-w-[200px]">{a.why}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {(green.status === 'starting' || green.status === 'running') && (
              <motion.div variants={fadeInScale} className="bg-white rounded-[40px] border border-emerald-100 shadow-sm overflow-hidden">
                <div className="p-8 border-b border-emerald-100 flex items-center justify-between bg-emerald-50/50">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-600/20">
                      <Leaf className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-slate-900 uppercase tracking-wider">Analyse Verte</h3>
                      <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">Traitement en arrière-plan</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-emerald-700">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-[11px] font-black uppercase tracking-widest">En cours</span>
                  </div>
                </div>
                <div className="p-8">
                  <p className="text-sm text-slate-600 leading-relaxed">
                    L'ESG et la roadmap durable se préparent automatiquement pendant que vous avancez dans le pipeline.
                  </p>
                </div>
              </motion.div>
            )}

            {green.result && (
              <motion.div variants={fadeInScale} className="bg-white rounded-[40px] border border-emerald-200 shadow-sm overflow-hidden">
                <div className="p-8 border-b border-emerald-100 flex items-center justify-between bg-emerald-50/50">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-600/20">
                      <Leaf className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-slate-900 uppercase tracking-wider">Analyse Verte & ESG</h3>
                      <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">Impact, certifications, roadmap</p>
                    </div>
                  </div>
                  {green.result.esg_score && (
                    <ScoreBadge score={green.result.esg_score.composite_score} label={`ESG ${green.result.esg_score.letter_grade}`} colorClass="from-emerald-500 to-teal-600" />
                  )}
                </div>

                <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                      <div className="w-1 h-3 bg-emerald-500 rounded-full" />
                      Certifications Recommandées
                    </h4>
                    <div className="space-y-3">
                      {(green.result.certifications || []).slice(0, 4).map((cert, i) => (
                        <div key={i} className="p-4 rounded-2xl border border-emerald-100 bg-emerald-50/40">
                          <p className="text-sm font-black text-slate-900">{cert.name}</p>
                          <p className="text-[11px] text-slate-500 mt-1">{cert.relevance || 'Pertinence en cours de calcul'}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                      <div className="w-1 h-3 bg-teal-500 rounded-full" />
                      Actions Prioritaires
                    </h4>
                    <div className="space-y-3">
                      {(green.result.recommendations || []).slice(0, 5).map((rec, i) => (
                        <div key={i} className="p-4 rounded-2xl border border-slate-100 bg-white shadow-sm">
                          <p className="text-sm font-black text-slate-900">{rec.title}</p>
                          <p className="text-[11px] text-slate-500 mt-1">{rec.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {green.status === 'failed' && (
              <motion.div variants={fadeInScale} className="bg-red-50 border border-red-200 rounded-[28px] p-6">
                <p className="text-sm font-bold text-red-700">Analyse verte non disponible pour ce run.</p>
                {green.error && <p className="text-xs text-red-600 mt-1">{green.error}</p>}
              </motion.div>
            )}

            {/* ── Call to Action ── */}
            <motion.div variants={fadeInScale} className="flex flex-col items-center justify-center space-y-6 pt-12 pb-12">
               <div className="relative group">
                 <div className="absolute -inset-1 bg-gradient-to-r from-amber-500 to-orange-600 rounded-2xl blur opacity-30 group-hover:opacity-60 transition duration-500" />
                 <Button 
                   onClick={downloadReport} 
                   className="relative bg-slate-900 hover:bg-slate-800 text-white shadow-2xl gap-3 py-8 px-12 rounded-[24px] text-base font-black uppercase tracking-widest group transition-all"
                 >
                   <Download className="w-6 h-6 group-hover:translate-y-1 transition-transform" />
                   Générer le rapport final
                 </Button>
               </div>
               <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.3em]">Version d'expertise certifiée par Nexaura AI</p>
            </motion.div>
          </motion.div>
        )}
      </div>
    </div>
  )
}

