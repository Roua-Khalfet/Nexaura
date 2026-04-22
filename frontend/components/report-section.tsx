'use client'

import { Download, ClipboardCheck, Scale, TrendingUp, Users, Zap, Shield, AlertTriangle, CheckCircle2, XCircle, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ProjectData, PipelineState } from './pipeline-section'

interface ReportSectionProps {
  projectData: ProjectData
  pipelineState: PipelineState
}

export default function ReportSection({ projectData, pipelineState }: ReportSectionProps) {
  const juridique = pipelineState.juridique
  const marketing = pipelineState.marketing

  const downloadReport = () => {
    const lines: string[] = []
    lines.push(`# Rapport Startify — ${projectData.nom || 'Mon Projet'}`)
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

    lines.push('---')
    lines.push(`*Rapport généré par Startify — Plateforme IA pour Startups*`)

    const content = lines.join('\n')
    const blob = new Blob([content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rapport-startify-${projectData.nom || 'projet'}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const hasAny = juridique || marketing

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-gradient-to-r from-amber-500/5 via-orange-500/5 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <ClipboardCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Rapport Final</h2>
              <p className="text-xs text-muted-foreground">Synthèse Juridique + Marketing</p>
            </div>
          </div>
          {hasAny && (
            <Button onClick={downloadReport} variant="outline" className="gap-2 text-xs">
              <Download className="w-3.5 h-3.5" /> Télécharger .md
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {!hasAny ? (
          <div className="text-center py-16 text-muted-foreground">
            <ClipboardCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <h3 className="text-base font-bold mb-1">Aucune analyse effectuée</h3>
            <p className="text-sm">Complétez les analyses juridique et/ou marketing depuis le Pipeline pour voir votre rapport.</p>
          </div>
        ) : (
          <>
            {/* ── Project Summary ── */}
            <div className="startify-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-teal-600" />
                <h3 className="text-sm font-bold text-foreground">Résumé du Projet</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                {[
                  { label: 'Startup', value: projectData.nom || '—' },
                  { label: 'Secteur', value: projectData.sector || '—' },
                  { label: 'Capital', value: projectData.capital ? `${projectData.capital} TND` : '—' },
                  { label: 'Société', value: projectData.typeSociete || '—' },
                ].map(item => (
                  <div key={item.label} className="p-2 rounded-lg bg-secondary/50">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{item.label}</p>
                    <p className="font-semibold text-foreground mt-0.5">{item.value}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3 leading-relaxed">{projectData.description}</p>
            </div>

            {/* ── Juridique Section ── */}
            {juridique && (
              <div className="startify-card p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4 text-blue-600" />
                  <h3 className="text-sm font-bold text-foreground">Analyse Juridique</h3>
                  <div className={`ml-auto text-xs font-bold px-3 py-1 rounded-full ${
                    juridique.score_global >= 75 ? 'bg-emerald-100 text-emerald-700' :
                    juridique.score_global >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {juridique.score_global}/100
                  </div>
                </div>

                {/* Risk Profile */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {[
                    { label: 'Risque', value: juridique.risk_profile.niveau },
                    { label: 'Capital recommandé', value: `${juridique.risk_profile.capital_recommande.toLocaleString()} TND` },
                    { label: 'Délai', value: juridique.risk_profile.delai_conformite },
                    { label: 'Autorisations', value: juridique.risk_profile.autorisations_requises.length > 0 ? juridique.risk_profile.autorisations_requises.join(', ') : 'Aucune' },
                  ].map(item => (
                    <div key={item.label} className="p-2 rounded-lg bg-blue-50/50 border border-blue-200/30 text-xs">
                      <p className="text-[9px] text-blue-600/70 uppercase tracking-wider">{item.label}</p>
                      <p className="font-semibold text-blue-800 mt-0.5">{item.value}</p>
                    </div>
                  ))}
                </div>

                {/* Key Criteria */}
                <div className="space-y-1.5">
                  {juridique.criteres.slice(0, 5).map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs p-2 rounded-lg hover:bg-secondary/30">
                      {c.status === 'check' ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> :
                       c.status === 'warning' ? <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" /> :
                       <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
                      <span className="font-medium text-foreground">{c.label}</span>
                      <div className="flex-1 h-1 rounded-full bg-secondary mx-2">
                        <div className={`h-full rounded-full ${c.score >= 75 ? 'bg-emerald-500' : c.score >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${c.score}%` }} />
                      </div>
                      <span className="text-muted-foreground font-medium">{c.score}</span>
                    </div>
                  ))}
                </div>

                {/* Laws */}
                <div className="flex flex-wrap gap-1.5">
                  {juridique.lois_applicables.map((loi, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-200">{loi}</span>
                  ))}
                </div>
              </div>
            )}

            {/* ── Marketing Section ── */}
            {marketing && (
              <div className="startify-card p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-pink-600" />
                  <h3 className="text-sm font-bold text-foreground">Analyse Marketing</h3>
                  <div className="ml-auto text-xs font-bold px-3 py-1 rounded-full bg-pink-100 text-pink-700">
                    Viabilité {marketing.score.viability}/100
                  </div>
                </div>

                {/* Strategy summary */}
                <p className="text-xs text-foreground/70 leading-relaxed">{marketing.strategies.strategic_summary}</p>

                {/* SWOT mini grid */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Forces', items: marketing.swot.strengths, color: 'emerald' },
                    { label: 'Faiblesses', items: marketing.swot.weaknesses, color: 'red' },
                    { label: 'Opportunités', items: marketing.swot.opportunities, color: 'blue' },
                    { label: 'Menaces', items: marketing.swot.threats, color: 'amber' },
                  ].map(q => (
                    <div key={q.label} className={`p-3 rounded-lg bg-${q.color}-50/50 border border-${q.color}-200/50`}>
                      <p className={`text-[10px] font-bold text-${q.color}-700 uppercase tracking-wider mb-1`}>{q.label} ({q.items.length})</p>
                      {q.items.slice(0, 2).map((item, i) => (
                        <p key={i} className="text-[11px] text-foreground/60 mb-0.5 truncate">{item.point}</p>
                      ))}
                    </div>
                  ))}
                </div>

                {/* Personas mini */}
                <div className="flex gap-3">
                  {marketing.personas.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/30">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white text-xs font-bold">
                        {p.name[0]}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-foreground">{p.name}</p>
                        <p className="text-[10px] text-muted-foreground">{p.role}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Priority actions */}
                <div>
                  <p className="text-[10px] font-semibold text-pink-700 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Zap className="w-3 h-3" /> Actions Prioritaires
                  </p>
                  {marketing.actions.slice(0, 3).map((a, i) => (
                    <div key={i} className="flex items-start gap-2 mb-1.5 text-xs">
                      <span className={`shrink-0 w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center text-white ${
                        a.timeline === '0-3 mois' ? 'bg-teal-500' : a.timeline === '3-6 mois' ? 'bg-blue-500' : 'bg-amber-500'
                      }`}>{i + 1}</span>
                      <div>
                        <p className="font-medium text-foreground">{a.action}</p>
                        <p className="text-[10px] text-muted-foreground">{a.timeline}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Download ── */}
            <div className="text-center pt-4">
              <Button onClick={downloadReport} className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-lg gap-2 py-5 px-8 rounded-xl">
                <Download className="w-4 h-4" />
                Télécharger le rapport complet
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
