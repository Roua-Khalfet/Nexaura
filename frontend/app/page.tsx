'use client'

import { useState, useCallback } from 'react'
import AppSidebar, { type SectionId } from '@/components/app-sidebar'
import ChatSection from '@/components/chat-section'
import DocumentsSection from '@/components/documents-section'
import ConformiteSection from '@/components/conformite-section'

import VeilleSection from '@/components/veille-section'
import GraphSection from '@/components/graph-section'
import PipelineSection, { type ProjectData, type PipelineState, type MarketingResult } from '@/components/pipeline-section'
import MarketingSection from '@/components/marketing-section'
import ReportSection from '@/components/report-section'
import GreenAnalysisSection from '@/components/green-analysis-section'
import { motion, AnimatePresence } from 'framer-motion'

const DEFAULT_PROJECT: ProjectData = {
  nom: '',
  description: '',
  sector: '',
  capital: '',
  typeSociete: '',
  activite: '',
  fondateurs: [''],
  siege: 'Tunis',
  location: '',
  clientType: '',
  priceRange: '',
  problemSolved: '',
  differentiator: '',
  stage: '',
  budget: '',
  cible: '',
  donneesTraitees: '',
}

const DEFAULT_PIPELINE: PipelineState = {
  currentStep: 'description',
  completedSteps: [],
  activeStep: null,
  juridique: null,
  marketing: null,
  green: {
    status: 'idle',
    sessionId: null,
    result: null,
    error: null,
  },
}

const sectionVariants = {
  initial: { opacity: 0, scale: 0.98, filter: 'blur(4px)' },
  animate: { opacity: 1, scale: 1, filter: 'blur(0px)', transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] } },
  exit: { opacity: 0, scale: 0.98, filter: 'blur(4px)', transition: { duration: 0.2 } },
} as const

export default function Page() {
  const [activeSection, setActiveSection] = useState<SectionId>('studio')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Shared project data (flows through the entire pipeline)
  const [projectData, setProjectData] = useState<ProjectData>(DEFAULT_PROJECT)
  const [pipelineState, setPipelineState] = useState<PipelineState>(DEFAULT_PIPELINE)

  // Navigation handler
  const handleNavigate = useCallback((section: string) => {
    setActiveSection(section as SectionId)
  }, [])

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <AppSidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <main className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">
          {activeSection === 'studio' && (
            <motion.div key="studio" variants={sectionVariants} initial="initial" animate="animate" exit="exit" className="absolute inset-0">
              <PipelineSection
                projectData={projectData}
                setProjectData={setProjectData}
                pipelineState={pipelineState}
                setPipelineState={setPipelineState}
                onNavigate={handleNavigate}
              />
            </motion.div>
          )}
          {activeSection === 'chat' && (
            <motion.div key="chat" variants={sectionVariants} initial="initial" animate="animate" exit="exit" className="absolute inset-0">
              <ChatSection />
            </motion.div>
          )}
          {activeSection === 'veille' && (
            <motion.div key="veille" variants={sectionVariants} initial="initial" animate="animate" exit="exit" className="absolute inset-0">
              <VeilleSection />
            </motion.div>
          )}
          {activeSection === 'graph' && (
            <motion.div key="graph" variants={sectionVariants} initial="initial" animate="animate" exit="exit" className="absolute inset-0">
              <GraphSection />
            </motion.div>
          )}
          {activeSection === 'green' && (
            <motion.div key="green" variants={sectionVariants} initial="initial" animate="animate" exit="exit" className="absolute inset-0">
              <GreenAnalysisSection />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}
