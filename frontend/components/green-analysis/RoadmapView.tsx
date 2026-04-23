'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  MarkerType,
  type Node,
  type Edge,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { HubNode, CategoryNode, RecNode } from './RoadmapNode'
import type { GreenRecommendation } from '@/lib/api'

const NODE_TYPES = { hub: HubNode, category: CategoryNode, rec: RecNode }

const CATEGORY_EDGE_COLORS: Record<string, string> = {
  energy: '#f59e0b',
  water: '#06b6d4',
  waste: '#f43f5e',
  materials: '#8b5cf6',
  operations: '#3b82f6',
  funding: '#10b981',
}

const CATEGORY_ORDER = ['energy', 'water', 'waste', 'materials', 'operations', 'funding']

type RoadmapNode = Node<Record<string, unknown>, 'hub' | 'category' | 'rec'> & { _revealOrder: number }
type RoadmapEdge = Edge & { _revealOrder: number }

function buildRoadmapData(recommendations: GreenRecommendation[], businessName: string) {
  const groups: Record<string, GreenRecommendation[]> = {}
  for (const rec of recommendations) {
    const cat = rec.category?.toLowerCase() || 'operations'
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(rec)
  }

  const presentCategories = CATEGORY_ORDER.filter((c) => groups[c] && groups[c].length > 0)
  const fallbackCategories = Object.keys(groups).filter((c) => !CATEGORY_ORDER.includes(c))
  const categories = [...presentCategories, ...fallbackCategories]

  const allNodes: RoadmapNode[] = []
  const allEdges: RoadmapEdge[] = []

  allNodes.push({
    id: 'hub',
    type: 'hub',
    position: { x: 0, y: 0 },
    data: { label: 'Green Roadmap', subtitle: businessName },
    _revealOrder: 0,
  })

  const RADIUS_CAT = 380
  const RADIUS_REC = 320
  const catCount = Math.max(1, categories.length)

  categories.forEach((cat, catIdx) => {
    const recs = groups[cat] || []
    const catId = `cat-${cat}`

    const angle = (2 * Math.PI * catIdx) / catCount - Math.PI / 2
    const cx = Math.cos(angle) * RADIUS_CAT
    const cy = Math.sin(angle) * RADIUS_CAT

    allNodes.push({
      id: catId,
      type: 'category',
      position: { x: cx, y: cy },
      data: { label: cat.charAt(0).toUpperCase() + cat.slice(1), category: cat, count: recs.length },
      _revealOrder: 1,
    })

    const edgeColor = CATEGORY_EDGE_COLORS[cat] || '#10b981'
    const hubHandle = getHubHandle(angle)
    const catTargetHandle = getCatTargetHandle(angle)
    allEdges.push({
      id: `e-hub-${catId}`,
      source: 'hub',
      target: catId,
      sourceHandle: hubHandle,
      targetHandle: catTargetHandle,
      style: { stroke: edgeColor, strokeWidth: 2.3 },
      markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor, width: 14, height: 14 },
      animated: true,
      _revealOrder: 1,
    })

    const recCount = recs.length
    const fanSpread = Math.PI * 0.65
    const startAngle = angle - fanSpread / 2

    recs.forEach((rec, recIdx) => {
      const recId = `rec-${cat}-${recIdx}`
      const recAngle = recCount === 1 ? angle : startAngle + (fanSpread * recIdx) / (recCount - 1)
      const rx = cx + Math.cos(recAngle) * RADIUS_REC
      const ry = cy + Math.sin(recAngle) * RADIUS_REC

      allNodes.push({
        id: recId,
        type: 'rec',
        position: { x: rx, y: ry },
        data: {
          label: rec.title,
          description: rec.description,
          category: cat,
          impact: rec.estimated_impact,
          difficulty: rec.implementation_difficulty,
          cost: rec.estimated_cost,
          programs: rec.relevant_programs,
        },
        _revealOrder: 2 + recIdx,
      })

      const catSourceHandle = getCatSourceHandle(recAngle)
      const recTargetHandle = getRecTargetHandle(recAngle)
      allEdges.push({
        id: `e-${catId}-${recId}`,
        source: catId,
        target: recId,
        sourceHandle: catSourceHandle,
        targetHandle: recTargetHandle,
        style: { stroke: edgeColor, strokeWidth: 1.8, opacity: 0.55 },
        animated: false,
        _revealOrder: 2 + recIdx,
      })
    })
  })

  return { allNodes, allEdges }
}

function getHubHandle(angle: number) {
  const deg = ((angle * 180) / Math.PI + 360) % 360
  if (deg >= 315 || deg < 45) return 'right'
  if (deg >= 45 && deg < 135) return 'bottom'
  if (deg >= 135 && deg < 225) return 'left'
  return undefined
}

function getCatTargetHandle(angle: number) {
  const deg = ((angle * 180) / Math.PI + 180 + 360) % 360
  if (deg >= 315 || deg < 45) return 'right-target'
  if (deg >= 45 && deg < 135) return 'bottom-target'
  if (deg >= 135 && deg < 225) return undefined
  return 'top-target'
}

function getCatSourceHandle(angle: number) {
  const deg = ((angle * 180) / Math.PI + 360) % 360
  if (deg >= 315 || deg < 45) return 'right-source'
  if (deg >= 45 && deg < 135) return 'bottom-source'
  if (deg >= 135 && deg < 225) return 'left-source'
  return 'top-source'
}

function getRecTargetHandle(angle: number) {
  const deg = ((angle * 180) / Math.PI + 180 + 360) % 360
  if (deg >= 315 || deg < 45) return 'right-target'
  if (deg >= 45 && deg < 135) return 'bottom-target'
  if (deg >= 135 && deg < 225) return undefined
  return 'top-target'
}

export default function RoadmapView({ recommendations, businessName }: { recommendations: GreenRecommendation[]; businessName: string }) {
  const { allNodes, allEdges } = useMemo(
    () => buildRoadmapData(recommendations || [], businessName),
    [recommendations, businessName],
  )

  const [revealStep, setRevealStep] = useState(-1)
  const maxOrder = useMemo(
    () => Math.max(0, ...allNodes.map((n) => Number(n._revealOrder || 0)), ...allEdges.map((e) => Number(e._revealOrder || 0))),
    [allNodes, allEdges],
  )

  useEffect(() => {
    if (!recommendations || recommendations.length === 0) return
    setRevealStep(-1)
    const startTimer = setTimeout(() => setRevealStep(0), 700)
    return () => clearTimeout(startTimer)
  }, [recommendations])

  useEffect(() => {
    if (revealStep < 0 || revealStep >= maxOrder) return
    const timer = setTimeout(() => setRevealStep((s) => s + 1), 380)
    return () => clearTimeout(timer)
  }, [revealStep, maxOrder])

  const visibleNodes = useMemo<Node[]>(
    () => allNodes.filter((n) => Number(n._revealOrder || 0) <= revealStep).map(({ _revealOrder, ...n }) => n),
    [allNodes, revealStep],
  )
  const visibleEdges = useMemo<Edge[]>(
    () => allEdges.filter((e) => Number(e._revealOrder || 0) <= revealStep).map(({ _revealOrder, ...e }) => e),
    [allEdges, revealStep],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null)

  useEffect(() => setNodes(visibleNodes), [visibleNodes, setNodes])
  useEffect(() => setEdges(visibleEdges), [visibleEdges, setEdges])

  useEffect(() => {
    if (!rfInstance || visibleNodes.length === 0 || revealStep < 0) return
    const shouldFit = revealStep === 0 || revealStep === maxOrder || revealStep % 2 === 0
    if (!shouldFit) return
    const isEarly = revealStep <= 1
    const done = revealStep >= maxOrder
    rfInstance.fitView({
      nodes: visibleNodes.map((n) => ({ id: String(n.id) })),
      padding: isEarly ? 0.55 : 0.4,
      duration: done ? 980 : 720,
      minZoom: 0.3,
      maxZoom: 1.1,
    })
  }, [rfInstance, visibleNodes, revealStep, maxOrder])

  const isBuilding = revealStep >= 0 && revealStep < maxOrder
  const isComplete = revealStep >= maxOrder && recommendations && recommendations.length > 0

  if (!recommendations || recommendations.length === 0) return null

  return (
    <div className="w-full rounded-[32px] border border-white bg-white/60 backdrop-blur-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="text-lg">🗺️</span>
          <h3 className="font-black text-sm text-slate-700 uppercase tracking-wider">Mind Map Durable</h3>
          {isBuilding && <span className="text-xs text-blue-500 animate-pulse ml-2">construction…</span>}
          {isComplete && <span className="text-xs text-emerald-600 ml-2">✓ complet</span>}
        </div>
        <span className="text-[10px] text-slate-500 uppercase tracking-widest">interactive • zoom • drag</span>
      </div>

      <div style={{ height: 760 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onInit={setRfInstance}
          nodeTypes={NODE_TYPES}
          defaultViewport={{ x: 0, y: 0, zoom: 0.52 }}
          minZoom={0.32}
          maxZoom={1.6}
          proOptions={{ hideAttribution: true }}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable={false}
          panOnScroll
          zoomOnScroll
          className="bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2ff_42%,#ecfeff_100%)]"
        >
          <Background color="#cbd5e1" gap={26} size={1.2} />
          <Controls
            showInteractive={false}
            className="!bg-white !border-slate-200 !rounded-lg [&>button]:!bg-white [&>button]:!border-slate-200 [&>button]:!text-slate-500 [&>button:hover]:!bg-slate-50"
          />
        </ReactFlow>
      </div>
    </div>
  )
}
