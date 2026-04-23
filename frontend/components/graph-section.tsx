'use client'

import { useState, useEffect } from 'react'
import { Network, RefreshCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fetchGraph, type GraphData } from '@/lib/api'
import { motion, AnimatePresence } from 'framer-motion'

const NODE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  loi: { bg: 'bg-indigo-100', border: 'border-indigo-400', text: 'text-indigo-700' },
  article: { bg: 'bg-violet-100', border: 'border-violet-400', text: 'text-violet-700' },
  decret: { bg: 'bg-fuchsia-100', border: 'border-fuchsia-400', text: 'text-fuchsia-700' },
  circulaire: { bg: 'bg-sky-100', border: 'border-sky-400', text: 'text-sky-700' },
  entite: { bg: 'bg-emerald-100', border: 'border-emerald-400', text: 'text-emerald-700' },
  concept: { bg: 'bg-amber-100', border: 'border-amber-400', text: 'text-amber-700' },
  organisme: { bg: 'bg-rose-100', border: 'border-rose-400', text: 'text-rose-700' },
  avantage: { bg: 'bg-teal-100', border: 'border-teal-400', text: 'text-teal-700' },
  obligation: { bg: 'bg-orange-100', border: 'border-orange-400', text: 'text-orange-700' },
  condition: { bg: 'bg-purple-100', border: 'border-purple-400', text: 'text-purple-700' },
  default: { bg: 'bg-gray-100', border: 'border-gray-400', text: 'text-gray-700' },
}

function getNodeColor(type: string) {
  return NODE_COLORS[type.toLowerCase()] || NODE_COLORS.default
}

const RELATION_COLORS: Record<string, string> = {
  CONTIENT: 'text-indigo-500', APPLIQUE: 'text-violet-500', REFERENCE: 'text-sky-500',
  DEFINIT: 'text-emerald-500', ETABLIT: 'text-amber-500', CONCERNE: 'text-rose-500',
  BENEFICIE: 'text-teal-500', MODIFIE: 'text-fuchsia-500', PREVOIT: 'text-orange-500',
}

const stagger = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.03 } } }
const item = { hidden: { opacity: 0, scale: 0.85 }, show: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 400, damping: 25 } } }

export default function GraphSection() {
  const [data, setData] = useState<GraphData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)

  const loadGraph = async () => {
    setIsLoading(true); setError('')
    try { setData(await fetchGraph()) } catch (e) { setError(e instanceof Error ? e.message : 'Erreur') } finally { setIsLoading(false) }
  }
  useEffect(() => { loadGraph() }, [])

  const connectedEdges = data?.edges.filter(e => e.source === selectedNode || e.target === selectedNode) || []
  const connectedNodeIds = new Set(connectedEdges.flatMap(e => [e.source, e.target]))

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b border-border bg-gradient-to-r from-sky-500/5 via-cyan-500/5 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div whileHover={{ rotate: 90, scale: 1.1 }} transition={{ type: 'spring' }} className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
              <Network className="w-5 h-5 text-white" />
            </motion.div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Knowledge Graph</h2>
              <p className="text-xs text-muted-foreground">Relations entre lois, articles et entités</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}><Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}><ZoomOut className="w-3.5 h-3.5" /></Button></motion.div>
            <span className="text-xs text-muted-foreground w-10 text-center font-mono">{Math.round(zoom * 100)}%</span>
            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}><Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setZoom(z => Math.min(2, z + 0.1))}><ZoomIn className="w-3.5 h-3.5" /></Button></motion.div>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}><Button variant="outline" size="sm" onClick={loadGraph} disabled={isLoading} className="gap-1.5 text-xs rounded-lg ml-2"><RefreshCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Recharger</Button></motion.div>
          </div>
        </div>
      </div>
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-auto p-6">
          <AnimatePresence>{error && <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="p-3 rounded-xl bg-red-50 text-red-600 text-xs border border-red-200">{error}</motion.div>}</AnimatePresence>
          {data && (
            <motion.div animate={{ scale: zoom }} transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }} style={{ transformOrigin: 'top left' }}>
              <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-wrap gap-2 mb-6">
                {Object.entries(NODE_COLORS).filter(([k]) => k !== 'default').map(([type, colors]) => (
                  <motion.span key={type} variants={item} whileHover={{ scale: 1.1 }} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold ${colors.bg} ${colors.text} border ${colors.border} cursor-default`}>
                    <span className={`w-2 h-2 rounded-full ${colors.border} border-2`} />{type}
                  </motion.span>
                ))}
              </motion.div>
              <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {data.nodes.map((node) => {
                  const colors = getNodeColor(node.type)
                  const isSelected = selectedNode === node.id
                  const isConnected = selectedNode ? connectedNodeIds.has(node.id) : true
                  return (
                    <motion.button key={node.id} variants={item} whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }} onClick={() => setSelectedNode(isSelected ? null : node.id)} animate={{ opacity: !isConnected && selectedNode ? 0.3 : 1 }} className={`p-4 rounded-xl border-2 text-left transition-colors ${colors.bg} ${isSelected ? `${colors.border} shadow-lg ring-2 ring-offset-1` : `${colors.border} border-opacity-30 hover:border-opacity-100`}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-2.5 h-2.5 rounded-full ${colors.border} border-2 flex-shrink-0`} />
                        <span className={`text-[10px] font-semibold uppercase tracking-wider ${colors.text} opacity-70`}>{node.type}</span>
                      </div>
                      <p className={`text-xs font-bold ${colors.text} truncate`}>{node.label}</p>
                    </motion.button>
                  )
                })}
              </motion.div>
              <AnimatePresence>
                {connectedEdges.length > 0 && selectedNode && (
                  <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 15 }} className="mt-6 space-y-2">
                    <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Relations connectées</h3>
                    {connectedEdges.map((edge, i) => {
                      const sN = data.nodes.find(n => n.id === edge.source); const tN = data.nodes.find(n => n.id === edge.target)
                      return (<motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="flex items-center gap-2 p-3 rounded-xl bg-card border border-border text-xs hover:shadow-sm transition-shadow"><span className="font-semibold text-foreground truncate">{sN?.label || edge.source}</span><span className={`px-2 py-0.5 rounded-full bg-secondary font-bold ${RELATION_COLORS[edge.relation] || 'text-gray-500'}`}>— {edge.relation} →</span><span className="font-semibold text-foreground truncate">{tN?.label || edge.target}</span></motion.div>)
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
              {!selectedNode && data.edges.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-6 space-y-2">
                  <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Toutes les relations ({data.edges.length})</h3>
                  {data.edges.slice(0, 20).map((edge, i) => {
                    const sN = data.nodes.find(n => n.id === edge.source); const tN = data.nodes.find(n => n.id === edge.target)
                    return (<motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/30 text-xs hover:bg-secondary/50 transition-colors"><span className="font-medium text-foreground truncate">{sN?.label || edge.source}</span><span className={`font-bold ${RELATION_COLORS[edge.relation] || 'text-gray-500'} flex-shrink-0`}>{edge.relation}</span><span className="font-medium text-foreground truncate">{tN?.label || edge.target}</span></motion.div>)
                  })}
                  {data.edges.length > 20 && <p className="text-[10px] text-muted-foreground text-center">... et {data.edges.length - 20} autres relations</p>}
                </motion.div>
              )}
            </motion.div>
          )}
          {!data && !error && (<div className="flex flex-col items-center justify-center h-full text-center space-y-4"><motion.div animate={{ y: [0, -8, 0], rotate: [0, 5, -5, 0] }} transition={{ repeat: Infinity, duration: 3 }}><Network className="w-12 h-12 text-sky-300" /></motion.div><p className="text-sm text-muted-foreground">Chargement du graphe...</p></div>)}
        </div>
      </div>
    </div>
  )
}
