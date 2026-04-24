'use client'

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'

const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  energy: { bg: 'bg-amber-50/90', border: 'border-amber-200', text: 'text-amber-700', icon: '⚡' },
  water: { bg: 'bg-cyan-50/90', border: 'border-cyan-200', text: 'text-cyan-700', icon: '💧' },
  waste: { bg: 'bg-rose-50/90', border: 'border-rose-200', text: 'text-rose-700', icon: '♻️' },
  materials: { bg: 'bg-violet-50/90', border: 'border-violet-200', text: 'text-violet-700', icon: '🧱' },
  operations: { bg: 'bg-blue-50/90', border: 'border-blue-200', text: 'text-blue-700', icon: '⚙️' },
  funding: { bg: 'bg-emerald-50/90', border: 'border-emerald-200', text: 'text-emerald-700', icon: '💰' },
}

const IMPACT_BADGE: Record<string, string> = {
  high: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  low: 'bg-gray-50 text-gray-600 border-gray-200',
}

const DIFFICULTY_BADGE: Record<string, string> = {
  easy: 'bg-emerald-50 text-emerald-700',
  medium: 'bg-yellow-50 text-yellow-700',
  hard: 'bg-red-50 text-red-700',
}

export const HubNode = memo(function HubNode({ data }: { data: { label: string; subtitle?: string } }) {
  return (
    <div className="roadmap-node-enter rounded-3xl border-2 border-emerald-300 bg-white/95 backdrop-blur px-8 py-6 shadow-lg shadow-emerald-500/15 max-w-[280px] text-center">
      <div className="text-3xl mb-1.5">🌱</div>
      <div className="font-black text-xl text-emerald-700 leading-tight">{data.label}</div>
      {data.subtitle && <div className="text-sm text-slate-500 mt-1.5">{data.subtitle}</div>}
      <Handle type="source" position={Position.Top} className="!bg-emerald-500 !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!bg-emerald-500 !w-2 !h-2" id="bottom" />
      <Handle type="source" position={Position.Left} className="!bg-emerald-500 !w-2 !h-2" id="left" />
      <Handle type="source" position={Position.Right} className="!bg-emerald-500 !w-2 !h-2" id="right" />
    </div>
  )
})

export const CategoryNode = memo(function CategoryNode({
  data,
}: {
  data: { label: string; category: string; count: number }
}) {
  const c = CATEGORY_COLORS[data.category] || CATEGORY_COLORS.operations
  return (
    <div className={`roadmap-node-enter rounded-2xl border-2 ${c.border} ${c.bg} backdrop-blur px-6 py-4 shadow-md max-w-[230px] text-center`}>
      <div className="text-2xl mb-1">{c.icon}</div>
      <div className={`font-black text-base uppercase tracking-wider ${c.text}`}>{data.label}</div>
      <div className="text-sm text-slate-500 mt-1">{data.count} actions</div>
      <Handle type="target" position={Position.Left} className="!bg-slate-400 !w-2 !h-2" />
      <Handle type="target" position={Position.Right} className="!bg-slate-400 !w-2 !h-2" id="right-target" />
      <Handle type="target" position={Position.Top} className="!bg-slate-400 !w-2 !h-2" id="top-target" />
      <Handle type="target" position={Position.Bottom} className="!bg-slate-400 !w-2 !h-2" id="bottom-target" />
      <Handle type="source" position={Position.Left} className="!w-2 !h-2" id="left-source" style={{ background: 'transparent' }} />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2" id="right-source" style={{ background: 'transparent' }} />
      <Handle type="source" position={Position.Top} className="!w-2 !h-2" id="top-source" style={{ background: 'transparent' }} />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2" id="bottom-source" style={{ background: 'transparent' }} />
    </div>
  )
})

export const RecNode = memo(function RecNode({
  data,
}: {
  data: {
    label: string
    description?: string
    category: string
    impact?: string
    difficulty?: string
    cost?: string
    programs?: string[]
  }
}) {
  const c = CATEGORY_COLORS[data.category] || CATEGORY_COLORS.operations
  const impact = IMPACT_BADGE[data.impact || 'medium'] || IMPACT_BADGE.medium
  const diff = DIFFICULTY_BADGE[data.difficulty || 'medium'] || DIFFICULTY_BADGE.medium

  return (
    <div className={`roadmap-node-enter rounded-xl border ${c.border} bg-white/95 backdrop-blur px-5 py-4 shadow-sm max-w-[300px]`}>
      <div className="font-bold text-base leading-tight mb-2 text-slate-800">{data.label}</div>
      {data.description && <div className="text-sm text-slate-500 leading-snug mb-2.5 line-clamp-2">{data.description}</div>}
      <div className="flex flex-wrap gap-1">
        <span className={`text-xs px-2 py-0.5 rounded-full border ${impact}`}>{data.impact} impact</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${diff}`}>{data.difficulty}</span>
      </div>
      {data.cost && <div className="text-xs text-slate-500 mt-1.5">💰 {data.cost}</div>}
      {data.programs && data.programs.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {data.programs.map((p) => (
            <span key={p} className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
              {p}
            </span>
          ))}
        </div>
      )}
      <Handle type="target" position={Position.Left} className="!bg-slate-400 !w-1.5 !h-1.5" />
      <Handle type="target" position={Position.Right} className="!bg-slate-400 !w-1.5 !h-1.5" id="right-target" />
      <Handle type="target" position={Position.Top} className="!bg-slate-400 !w-1.5 !h-1.5" id="top-target" />
      <Handle type="target" position={Position.Bottom} className="!bg-slate-400 !w-1.5 !h-1.5" id="bottom-target" />
    </div>
  )
})
