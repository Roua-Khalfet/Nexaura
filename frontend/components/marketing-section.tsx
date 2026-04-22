'use client'

import dynamic from 'next/dynamic'

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
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <Pipeline projectData={projectData} skipChatbot={true} />
      </div>
    </div>
  )
}
