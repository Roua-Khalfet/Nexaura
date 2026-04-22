'use client'

import { MessageSquare, FileText, ShieldCheck, Brain, Radio, Network, ChevronLeft, ChevronRight, Rocket, LayoutDashboard, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SectionId = 'pipeline' | 'chat' | 'documents' | 'conformite' | 'veille' | 'graph' | 'marketing'

const NAV_ITEMS: { id: SectionId; label: string; icon: React.ElementType; color: string; gradient: string; separator?: boolean }[] = [
  { id: 'pipeline', label: 'Pipeline', icon: LayoutDashboard, color: 'text-teal-600', gradient: 'from-teal-500/15 to-emerald-500/15' },
  { id: 'chat', label: 'Chat Juridique', icon: MessageSquare, color: 'text-blue-600', gradient: 'from-blue-500/15 to-indigo-500/15', separator: true },
  { id: 'documents', label: 'Documents', icon: FileText, color: 'text-violet-600', gradient: 'from-violet-500/15 to-fuchsia-500/15' },
  { id: 'conformite', label: 'Conformité', icon: ShieldCheck, color: 'text-emerald-600', gradient: 'from-emerald-500/15 to-teal-500/15' },
  { id: 'marketing', label: 'Marketing', icon: TrendingUp, color: 'text-pink-600', gradient: 'from-pink-500/15 to-rose-500/15', separator: true },
  { id: 'veille', label: 'Veille', icon: Radio, color: 'text-rose-600', gradient: 'from-rose-500/15 to-pink-500/15', separator: true },
  { id: 'graph', label: 'Graphe de Lois', icon: Network, color: 'text-sky-600', gradient: 'from-sky-500/15 to-cyan-500/15' },
]

interface AppSidebarProps {
  activeSection: SectionId
  onSectionChange: (id: SectionId) => void
  collapsed: boolean
  onToggleCollapse: () => void
}

export default function AppSidebar({ activeSection, onSectionChange, collapsed, onToggleCollapse }: AppSidebarProps) {
  return (
    <aside className={cn(
      'flex flex-col h-full border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300 ease-in-out',
      collapsed ? 'w-[68px]' : 'w-[250px]'
    )}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border">
        <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-blue-600 shadow-lg shadow-teal-500/20">
          <Rocket className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-base font-extrabold tracking-tight text-sidebar-foreground truncate">
              Startify
            </h1>
            <p className="text-[10px] text-sidebar-foreground/50 truncate font-medium">Plateforme Startup IA</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item, index) => {
          const Icon = item.icon
          const isActive = activeSection === item.id
          return (
            <div key={item.id}>
              {item.separator && index > 0 && (
                <div className="my-2 mx-3 border-t border-sidebar-border/60" />
              )}
              <button
                onClick={() => onSectionChange(item.id)}
                title={collapsed ? item.label : undefined}
                className={cn(
                  'w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 group',
                  isActive
                    ? `bg-gradient-to-r ${item.gradient} ${item.color} shadow-sm border border-current/10`
                    : 'text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-sidebar-accent'
                )}
              >
                <div className={cn(
                  'flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg transition-all',
                  isActive
                    ? `${item.color}`
                    : 'text-sidebar-foreground/40 group-hover:text-sidebar-foreground/70'
                )}>
                  <Icon className="w-[18px] h-[18px]" />
                </div>
                {!collapsed && (
                  <span className="truncate">{item.label}</span>
                )}
                {isActive && !collapsed && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                )}
              </button>
            </div>
          )
        })}
      </nav>

      {/* Collapse Toggle */}
      <div className="p-3 border-t border-sidebar-border">
        <button
          onClick={onToggleCollapse}
          className="w-full flex items-center justify-center gap-2 rounded-lg py-2 text-xs text-sidebar-foreground/40 hover:text-sidebar-foreground/70 hover:bg-sidebar-accent transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          {!collapsed && <span>Réduire</span>}
        </button>
      </div>
    </aside>
  )
}
