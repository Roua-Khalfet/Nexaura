'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AppSidebar, { type SectionId } from '@/components/app-sidebar'
import ChatSection from '@/components/chat-section'
import DocumentsSection from '@/components/documents-section'
import ConformiteSection from '@/components/conformite-section'

import VeilleSection from '@/components/veille-section'
import PipelineSection, { type ProjectData, type PipelineState } from '@/components/pipeline-section'
import MarketingSection from '@/components/marketing-section'
import GreenAnalysisSection from '@/components/green-analysis-section'
import DashboardSection from '@/components/teambuilder/dashboard-section'
import AIAssistantSection from '@/components/teambuilder/ai-assistant-section'
import HistorySection from '@/components/teambuilder/history-section'
import UploadCVSection from '@/components/teambuilder/upload-cv-section'
import CandidatesSection from '@/components/teambuilder/candidates-section'
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
  const router = useRouter()
  const [activeSection, setActiveSection] = useState<SectionId>('studio')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  // Shared project data (flows through the entire pipeline)
  const [projectData, setProjectData] = useState<ProjectData>(DEFAULT_PROJECT)
  const [pipelineState, setPipelineState] = useState<PipelineState>(DEFAULT_PIPELINE)

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('http://localhost:8001/api/v1/auth/user', {
          credentials: 'include',
          headers: {
            'X-API-Key': 'your_api_key',
          },
        })
        
        if (response.ok) {
          const data = await response.json()
          if (data.email) {
            setIsAuthenticated(true)
          } else {
            // Not logged in - redirect to login
            router.push('/login')
          }
        } else {
          // Auth check failed - redirect to login
          router.push('/login')
        }
      } catch (error) {
        console.error('Auth check failed:', error)
        // Auth check failed - redirect to login
        router.push('/login')
      } finally {
        setIsCheckingAuth(false)
      }
    }

    checkAuth()
  }, [router])

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
        pipelineState={pipelineState}
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

          {activeSection === 'audit' && (
            <motion.div key="audit" variants={sectionVariants} initial="initial" animate="animate" exit="exit" className="absolute inset-0">
              <ConformiteSection
                projectData={projectData}
                conformiteResult={pipelineState.juridique}
                onComplete={(res) => {
                  setPipelineState((prev) => ({
                    ...prev,
                    juridique: res,
                    completedSteps: Array.from(new Set([...prev.completedSteps, 'audit'])),
                    currentStep: prev.currentStep === 'audit' ? 'marketing' : prev.currentStep,
                  }))
                }}
              />
            </motion.div>
          )}

          {activeSection === 'marketing' && (
            <motion.div key="marketing" variants={sectionVariants} initial="initial" animate="animate" exit="exit" className="absolute inset-0">
              <MarketingSection projectData={projectData} />
            </motion.div>
          )}

          {activeSection === 'veille' && (
            <motion.div key="veille" variants={sectionVariants} initial="initial" animate="animate" exit="exit" className="absolute inset-0">
              <VeilleSection />
            </motion.div>
          )}

          {activeSection === 'green' && (
            <motion.div key="green" variants={sectionVariants} initial="initial" animate="animate" exit="exit" className="absolute inset-0">
              <GreenAnalysisSection
                projectData={projectData}
                initialResult={pipelineState.green.result}
                onComplete={(data) => {
                  setPipelineState((prev) => ({
                    ...prev,
                    green: {
                      ...prev.green,
                      status: 'completed',
                      sessionId: data.id,
                      result: data,
                      error: null,
                    },
                    completedSteps: Array.from(new Set([...prev.completedSteps, 'green'])),
                  }))
                }}
              />
            </motion.div>
          )}

          {activeSection === 'documents' && (
            <motion.div key="documents" variants={sectionVariants} initial="initial" animate="animate" exit="exit" className="absolute inset-0">
              <DocumentsSection projectData={projectData} />
            </motion.div>
          )}

          {/* TeamBuilder Sections */}
          {activeSection === 'tb-dashboard' && (
            <motion.div key="tb-dashboard" variants={sectionVariants} initial="initial" animate="animate" exit="exit" className="absolute inset-0">
              <div className="h-full overflow-auto p-8">
                <DashboardSection />
              </div>
            </motion.div>
          )}

          {activeSection === 'tb-ai' && (
            <motion.div key="tb-ai" variants={sectionVariants} initial="initial" animate="animate" exit="exit" className="absolute inset-0">
              <AIAssistantSection />
            </motion.div>
          )}

          {activeSection === 'tb-upload' && (
            <motion.div key="tb-upload" variants={sectionVariants} initial="initial" animate="animate" exit="exit" className="absolute inset-0">
              <div className="h-full overflow-auto p-8">
                <UploadCVSection />
              </div>
            </motion.div>
          )}

          {activeSection === 'tb-candidates' && (
            <motion.div key="tb-candidates" variants={sectionVariants} initial="initial" animate="animate" exit="exit" className="absolute inset-0">
              <div className="h-full overflow-auto p-8">
                <CandidatesSection />
              </div>
            </motion.div>
          )}

          {activeSection === 'tb-history' && (
            <motion.div key="tb-history" variants={sectionVariants} initial="initial" animate="animate" exit="exit" className="absolute inset-0">
              <div className="h-full overflow-auto p-8">
                <HistorySection />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}
