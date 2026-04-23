'use client'

import dynamic from 'next/dynamic'
import { TrendingUp, RefreshCcw, Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'

// Dynamically import the original MarketScout Pipeline component (JSX, no SSR)
const Pipeline = dynamic(
  () => import('@/lib/marketscout/components/Pipeline'),
  { ssr: false }
)

interface MarketingSectionProps {
  projectData: {
    nom?: string
    description?: string
    sector?: string
    location?: string
    clientType?: string
    priceRange?: string
    problemSolved?: string
    differentiator?: string
    stage?: string
    budget?: string
  }
}

export default function MarketingSection({ projectData }: MarketingSectionProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Premium Header */}
      <div className="px-6 py-6 border-b border-border bg-gradient-to-r from-pink-500/5 via-rose-500/5 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <motion.div 
              whileHover={{ rotate: 10, scale: 1.1 }}
              className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-lg shadow-pink-500/20"
            >
              <TrendingUp className="w-6 h-6 text-white" />
            </motion.div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Vision de Marché</h2>
                <div className="px-2 py-0.5 rounded-full bg-pink-100 text-[10px] font-black text-pink-700 uppercase tracking-widest">
                  IA Marketing
                </div>
              </div>
              <p className="text-xs text-muted-foreground font-medium">Analyse concurrentielle & stratégie de positionnement</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
             <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-sm">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Multi-Agent Scraper actif</span>
             </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <Pipeline projectData={projectData} skipChatbot={true} />
      </div>
    </div>
  )
}

