'use client'

import { useState, useEffect } from 'react'
import { FileText, Download, Loader2, Sparkles, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { generateDocuments, type DocumentResult } from '@/lib/api'
import { motion } from 'framer-motion'

const DOC_TYPES = [
  { id: 'statuts', label: 'Statuts de Société', icon: '📜', desc: 'SARL, SA, SUARL — Code des Sociétés', color: 'from-violet-500 to-purple-600' },
  { id: 'cgu', label: 'CGU / CGV', icon: '📋', desc: 'Conditions Générales — Loi 2004-63', color: 'from-fuchsia-500 to-pink-600' },
  { id: 'contrat_investissement', label: 'Contrat Investissement', icon: '💰', desc: 'Convention — Startup Act Art. 13+', color: 'from-amber-500 to-orange-600' },
  { id: 'demande_label', label: 'Demande Label Startup', icon: '🏷️', desc: 'Formulaire — Décret 2018-840', color: 'from-emerald-500 to-teal-600' },
  { id: 'all', label: 'Pack Complet', icon: '📦', desc: 'Tous les documents ci-dessus', color: 'from-indigo-500 to-violet-600' },
]

const SOCIETE_TYPES = ['SUARL', 'SARL', 'SA', 'SAS']

interface DocumentsSectionProps {
  projectData?: {
    nom?: string
    activite?: string
    capital?: string
    siege?: string
    typeSociete?: string
    fondateurs?: string[]
    description?: string
    location?: string
  }
  onComplete?: (docs: DocumentResult[]) => void
}

export default function DocumentsSection({ projectData, onComplete, isEmbedded = false }: DocumentsSectionProps & { isEmbedded?: boolean }) {
  const [nom, setNom] = useState('')
  const [activite, setActivite] = useState('')
  const [fondateurs, setFondateurs] = useState<string[]>([''])
  const [capital, setCapital] = useState('1000')
  const [siege, setSiege] = useState('Tunis')
  const [typeSociete, setTypeSociete] = useState('SUARL')
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null)
  const [results, setResults] = useState<DocumentResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [activePreview, setActivePreview] = useState<string | null>(null)

  // Sync from pipeline data
  useEffect(() => {
    if (projectData) {
      if (projectData.nom && !nom) setNom(projectData.nom)
      if (projectData.activite && !activite) setActivite(projectData.activite)
      else if (projectData.description && !activite) setActivite(projectData.description.slice(0, 200))
      if (projectData.capital && !capital) setCapital(projectData.capital)
      if (projectData.siege && !siege) setSiege(projectData.siege)
      else if (projectData.location && !siege) setSiege(projectData.location)
      if (projectData.typeSociete && !typeSociete) setTypeSociete(projectData.typeSociete)
    }
  }, [projectData, nom, activite, capital, siege, typeSociete])

  const handleGenerate = async () => {
    if (!nom.trim() || !activite.trim() || !selectedDoc) return
    setIsLoading(true)
    setError('')
    setResults([])
    try {
      const docs = await generateDocuments({
        doc_type: selectedDoc, nom_startup: nom, activite,
        fondateurs: fondateurs.filter(f => f.trim()),
        capital_social: parseInt(capital) || 1000,
        siege_social: siege, type_societe: typeSociete,
      })
      setResults(docs)
      if (docs.length > 0) setActivePreview(docs[0].doc_type)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur génération')
    } finally {
      setIsLoading(false)
    }
  }

  const downloadDoc = (doc: DocumentResult) => {
    const blob = new Blob([doc.content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = doc.filename; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      {!isEmbedded && (
        <div className="px-6 py-6 border-b border-border bg-gradient-to-r from-violet-500/5 via-fuchsia-500/5 to-transparent">
          <div className="flex items-center gap-4">
            <motion.div 
              whileHover={{ rotate: -10, scale: 1.1 }}
              className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-500/20"
            >
              <FileText className="w-6 h-6 text-white" />
            </motion.div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Générateur de Documents</h2>
                <div className="px-2 py-0.5 rounded-full bg-violet-100 text-[10px] font-black text-violet-700 uppercase tracking-widest">
                  Legal Tech
                </div>
              </div>
              <p className="text-xs text-muted-foreground font-medium">Statuts, CGU, contrats — conformes au droit tunisien</p>
            </div>
          </div>
        </div>
      )}


      <div className="flex-1 overflow-y-auto p-6 space-y-6">
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
          className="grid grid-cols-1 lg:grid-cols-12 gap-6"
        >
          {/* Document type selection (Bento Item) */}
          <motion.div 
            variants={{ hidden: { opacity: 0, scale: 0.95, y: 20 }, show: { opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } } }}
            className="lg:col-span-7 bg-white/70 backdrop-blur-xl p-8 rounded-[36px] border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden group"
          >
            {/* Ambient Background Glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-violet-200/40 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 transition-opacity duration-700 opacity-0 group-hover:opacity-100 mix-blend-multiply" />
            
            <div className="relative z-10 flex items-center justify-between mb-8">
               <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-800 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
                  Sélection du Type
               </h3>
               {selectedDoc && (
                 <motion.span initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="text-[10px] font-bold text-violet-600 bg-violet-50 px-3 py-1 rounded-full border border-violet-100">
                    SÉLECTIONNÉ
                 </motion.span>
               )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-10">
              {DOC_TYPES.map((dt) => {
                const isSelected = selectedDoc === dt.id
                return (
                  <motion.button 
                    key={dt.id} 
                    onClick={() => setSelectedDoc(dt.id)}
                    whileHover={{ scale: 1.02, y: -4 }}
                    whileTap={{ scale: 0.98 }}
                    className={`text-left p-6 rounded-[24px] border-2 transition-all duration-500 relative overflow-hidden ${
                      isSelected 
                        ? 'border-violet-500 bg-violet-500 text-white shadow-xl shadow-violet-500/20' 
                        : 'border-white bg-white/50 hover:bg-white hover:border-violet-200 hover:shadow-lg'
                    }`}
                  >
                    {isSelected && (
                      <motion.div 
                        layoutId="activeDocBg" 
                        className="absolute inset-0 bg-gradient-to-br from-violet-500 to-fuchsia-600 z-0" 
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      />
                    )}
                    
                    <div className="relative z-10">
                       <div className="flex items-center justify-between mb-4">
                         <motion.div 
                           animate={isSelected ? { rotate: [0, 10, -10, 0], scale: [1, 1.2, 1] } : {}} 
                           transition={{ duration: 0.5 }} 
                           className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-inner ${isSelected ? 'bg-white/20' : 'bg-slate-50'}`}
                         >
                            {dt.icon}
                         </motion.div>
                         {isSelected && <Sparkles className="w-5 h-5 text-white/50" />}
                       </div>
                       <span className={`text-sm font-black block mb-1 tracking-wide ${isSelected ? 'text-white' : 'text-slate-800'}`}>{dt.label}</span>
                       <p className={`text-[11px] font-medium leading-relaxed ${isSelected ? 'text-white/80' : 'text-slate-500'}`}>{dt.desc}</p>
                    </div>
                  </motion.button>
                )
              })}
            </div>
          </motion.div>

          {/* Form (Bento Item) */}
          <motion.div 
            variants={{ hidden: { opacity: 0, scale: 0.95, y: 20 }, show: { opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } } }}
            className="lg:col-span-5 bg-slate-900 p-8 rounded-[36px] border border-slate-800 shadow-2xl flex flex-col relative overflow-hidden"
          >
            {/* Dark glass reflection */}
            <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-fuchsia-500/10 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/3 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-violet-500/10 rounded-full blur-[60px] translate-y-1/3 -translate-x-1/2 pointer-events-none" />

            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white flex items-center gap-2 mb-8 relative z-10">
               <span className="w-2 h-2 rounded-full bg-fuchsia-500" />
               Paramètres Générateur
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 flex-1 relative z-10">
              <div className="space-y-2 sm:col-span-2 group">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest transition-colors group-focus-within:text-fuchsia-400">Nom de la Startup</label>
                <div className="relative">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-500 opacity-0 group-focus-within:opacity-100 blur transition duration-500" />
                  <Input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex : TechInnovate" className="relative h-12 rounded-2xl bg-slate-800/80 border-slate-700 text-white placeholder:text-slate-600 focus-visible:ring-0 focus-visible:border-transparent transition-all" />
                </div>
              </div>
              <div className="space-y-2 sm:col-span-2 group">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest transition-colors group-focus-within:text-fuchsia-400">Activité Principale</label>
                <div className="relative">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-500 opacity-0 group-focus-within:opacity-100 blur transition duration-500" />
                  <Input value={activite} onChange={(e) => setActivite(e.target.value)} placeholder="Ex : SaaS de gestion" className="relative h-12 rounded-2xl bg-slate-800/80 border-slate-700 text-white placeholder:text-slate-600 focus-visible:ring-0 focus-visible:border-transparent transition-all" />
                </div>
              </div>
              <div className="space-y-2 group">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest transition-colors group-focus-within:text-fuchsia-400">Capital (TND)</label>
                <div className="relative">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-500 opacity-0 group-focus-within:opacity-100 blur transition duration-500" />
                  <Input type="number" value={capital} onChange={(e) => setCapital(e.target.value)} className="relative h-12 rounded-2xl bg-slate-800/80 border-slate-700 text-white focus-visible:ring-0 focus-visible:border-transparent transition-all" />
                </div>
              </div>
              <div className="space-y-2 group">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest transition-colors group-focus-within:text-fuchsia-400">Siège Social</label>
                <div className="relative">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-500 opacity-0 group-focus-within:opacity-100 blur transition duration-500" />
                  <Input value={siege} onChange={(e) => setSiege(e.target.value)} className="relative h-12 rounded-2xl bg-slate-800/80 border-slate-700 text-white focus-visible:ring-0 focus-visible:border-transparent transition-all" />
                </div>
              </div>
              <div className="space-y-3 sm:col-span-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Format Juridique</label>
                <div className="flex gap-2 flex-wrap">
                  {SOCIETE_TYPES.map((t) => (
                    <motion.button 
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      key={t} onClick={() => setTypeSociete(t)}
                      className={`px-5 py-2.5 rounded-xl text-xs font-black tracking-widest transition-all ${
                        typeSociete === t ? 'bg-white text-slate-900 shadow-[0_0_15px_rgba(255,255,255,0.3)]' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                      }`}>{t}</motion.button>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="mt-8 pt-8 border-t border-white/10 relative z-10">
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="relative group/gen w-full">
                <div className="absolute -inset-1.5 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-[20px] blur-md opacity-40 group-hover/gen:opacity-80 transition duration-500 animate-pulse" />
                <Button onClick={handleGenerate} disabled={!nom.trim() || !activite.trim() || !selectedDoc || isLoading}
                  className="relative w-full h-14 rounded-[20px] text-sm font-black uppercase tracking-[0.2em] bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white shadow-2xl gap-3 transition-all border border-white/20">
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5 group-hover/gen:scale-125 group-hover/gen:rotate-12 transition-all duration-300 drop-shadow-md" />}
                  {isLoading ? 'Génération...' : 'Synthetiser'}
                </Button>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>

        {error && <div className="p-3 rounded-xl bg-red-50 text-red-600 text-xs border border-red-200">{error}</div>}

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              {results.map((doc) => (
                <motion.button 
                  key={doc.doc_type} 
                  onClick={() => setActivePreview(doc.doc_type)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`relative px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                    activePreview === doc.doc_type ? 'bg-violet-500 text-white shadow-md shadow-violet-500/20' : 'bg-secondary hover:bg-violet-100'
                  }`}
                >{doc.doc_type}</motion.button>
              ))}
            </div>
            {results.filter(d => d.doc_type === activePreview).map((doc) => (
              <div key={doc.doc_type} className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="flex justify-between items-center px-4 py-2 bg-secondary/50 border-b border-border">
                  <span className="text-xs font-semibold text-foreground">{doc.filename}</span>
                  <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => downloadDoc(doc)}>
                    <Download className="w-3 h-3" /> Télécharger
                  </Button>
                </div>
                <pre className="p-4 text-xs leading-relaxed overflow-x-auto max-h-[400px] overflow-y-auto whitespace-pre-wrap font-mono text-foreground/80">{doc.content}</pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
