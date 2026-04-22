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
}

const DEFAULT_PIPELINE: PipelineState = {
  currentStep: 'description',
  completedSteps: [],
  activeStep: null,
  juridique: null,
  marketing: null,
}

export default function Page() {
  const [activeSection, setActiveSection] = useState<SectionId>('pipeline')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Shared project data (flows through the entire pipeline)
  const [projectData, setProjectData] = useState<ProjectData>(DEFAULT_PROJECT)
  const [pipelineState, setPipelineState] = useState<PipelineState>(DEFAULT_PIPELINE)

  // Navigation handler for pipeline → other sections
  const handleNavigate = useCallback((section: string) => {
    if (section === 'rapport') {
      // Use the report section (not a separate SectionId for now)
      setActiveSection('pipeline')
    } else {
      setActiveSection(section as SectionId)
    }
  }, [])

  // Marketing completion handler
  const handleMarketingComplete = useCallback((result: MarketingResult) => {
    setPipelineState(prev => ({
      ...prev,
      marketing: result,
      completedSteps: [...prev.completedSteps.filter(s => s !== 'marketing'), 'marketing'],
      currentStep: 'rapport',
    }))
  }, [])

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <AppSidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <main className="flex-1 overflow-hidden">
        {activeSection === 'pipeline' && (
          <PipelineSection
            projectData={projectData}
            setProjectData={setProjectData}
            pipelineState={pipelineState}
            setPipelineState={setPipelineState}
            onNavigate={handleNavigate}
          />
        )}
        {activeSection === 'chat' && <ChatSection />}
        {activeSection === 'documents' && <DocumentsSection projectData={projectData} />}
        {activeSection === 'conformite' && <ConformiteSection projectData={projectData} conformiteResult={pipelineState.juridique} />}

        {activeSection === 'marketing' && (
          <MarketingSection
            projectData={projectData}
          />
        )}
        {activeSection === 'veille' && <VeilleSection />}
        {activeSection === 'graph' && <GraphSection />}
      </main>
    </div>
  )
}
