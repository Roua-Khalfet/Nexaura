'use client'

import { 
  MessageSquare, FileText, ShieldCheck, Radio, ChevronLeft, LayoutDashboard, 
  TrendingUp, Leaf, LogOut, User, Bot, Sparkles, Upload, Users,
  History, ChevronDown, LogIn 
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { type PipelineState } from './pipeline-section'
import { getCurrentUser, logout, isGuestMode, type User as AuthUser } from '@/lib/auth'
import { useRouter } from 'next/navigation'

export type SectionId = 'studio' | 'audit' | 'marketing' | 'green' | 'documents' | 'chat' | 'veille' | 'tech-agent' |
  'tb-dashboard' | 'tb-ai' | 'tb-upload' | 'tb-candidates' | 'tb-history'

const NAV_ITEMS: { id: SectionId; label: string; icon: React.ElementType; color: string; gradient: string; separator?: boolean; parent?: string }[] = [
  { id: 'studio', label: 'Studio Startup', icon: LayoutDashboard, color: 'text-teal-600', gradient: 'from-teal-500/15 to-emerald-500/15' },
  { id: 'audit', label: 'Audit Juridique', icon: ShieldCheck, color: 'text-emerald-600', gradient: 'from-emerald-500/15 to-teal-500/15', separator: true },
  { id: 'marketing', label: 'Analyse Marché', icon: TrendingUp, color: 'text-pink-600', gradient: 'from-pink-500/15 to-rose-500/15' },
  { id: 'green', label: 'Analyse Verte', icon: Leaf, color: 'text-emerald-600', gradient: 'from-emerald-500/15 to-teal-500/15' },
  { id: 'tech-agent', label: 'Tech Agent', icon: Sparkles, color: 'text-cyan-600', gradient: 'from-cyan-500/15 to-blue-500/15', separator: true },
  { id: 'documents', label: 'Documents', icon: FileText, color: 'text-violet-600', gradient: 'from-violet-500/15 to-purple-500/15', separator: true },
  { id: 'chat', label: 'Chat Juridique', icon: MessageSquare, color: 'text-blue-600', gradient: 'from-blue-500/15 to-indigo-500/15', separator: true },
  { id: 'veille', label: 'Veille Légale', icon: Radio, color: 'text-rose-600', gradient: 'from-rose-500/15 to-pink-500/15', separator: true },
]

const TEAMBUILDER_ITEMS: { id: SectionId; label: string; icon: React.ElementType; color: string }[] = [
  { id: 'tb-dashboard', label: 'Tableau de bord', icon: LayoutDashboard, color: 'text-indigo-600' },
  { id: 'tb-ai', label: 'Assistant IA', icon: Bot, color: 'text-purple-600' },
  { id: 'tb-upload', label: 'Télécharger CVs', icon: Upload, color: 'text-blue-600' },
  { id: 'tb-candidates', label: 'Candidats', icon: Users, color: 'text-pink-600' },
  { id: 'tb-history', label: 'Historique', icon: History, color: 'text-gray-600' },
]

interface AppSidebarProps {
  activeSection: SectionId
  onSectionChange: (id: SectionId) => void
  collapsed: boolean
  onToggleCollapse: () => void
  pipelineState?: PipelineState
}

export default function AppSidebar({ activeSection, onSectionChange, collapsed, onToggleCollapse, pipelineState }: AppSidebarProps) {
  const router = useRouter()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [teamBuilderExpanded, setTeamBuilderExpanded] = useState(false)
  const [isGuest, setIsGuest] = useState(false)
  
  const legalScore = pipelineState?.juridique?.combinedScore ?? pipelineState?.juridique?.score_global ?? null
  const greenScore = pipelineState?.green?.result?.esg_score?.composite_score ?? null
  
  const studioScore = legalScore !== null && greenScore !== null 
    ? Math.round((legalScore + greenScore) / 2)
    : legalScore ?? greenScore

  useEffect(() => {
    const checkUser = async () => {
      setIsGuest(isGuestMode())
      const userData = await getCurrentUser()
      setUser(userData)
      
      // If user is logged in, make sure guest mode is cleared
      if (userData) {
        clearGuestMode()
        setIsGuest(false)
      }
    }
    
    checkUser()
    
    // Re-check every 2 seconds to catch OAuth callback
    const interval = setInterval(checkUser, 2000)
    return () => clearInterval(interval)
  }, [])

  const handleLogout = async () => {
    await logout()
    setUser(null)
    setIsGuest(false)
    router.push('/login')
  }

  const handleLogin = () => {
    router.push('/login')
  }

  return (
    <motion.aside 
      animate={{ width: collapsed ? 68 : 250 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className={cn(
        'flex flex-col h-full border-r border-sidebar-border bg-sidebar text-sidebar-foreground overflow-hidden',
      )}
    >
      {/* Logo */}
      <div className="flex items-center px-4 py-4 border-b border-sidebar-border">
        <motion.div 
          animate={{ 
            width: collapsed ? 40 : 140,
            height: collapsed ? 40 : 40,
          }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          className="relative"
        >
          <Image 
            src="/logo.png" 
            alt="Startify Logo" 
            fill
            className="object-contain"
            priority
          />
        </motion.div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item, index) => {
          const Icon = item.icon
          const isActive = activeSection === item.id
          return (
            <div key={item.id} className="relative">
              {item.separator && index > 0 && (
                <div className="my-3 mx-2 border-t border-sidebar-border/40" />
              )}
              
              {isActive && (
                <motion.div
                  layoutId="activeNavTab"
                  className={cn("absolute inset-0 rounded-xl shadow-sm border border-current/10 bg-gradient-to-r", item.gradient)}
                  initial={false}
                  transition={{ type: "spring", stiffness: 350, damping: 30 }}
                />
              )}

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onSectionChange(item.id)}
                title={collapsed ? item.label : undefined}
                className={cn(
                  'relative w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 group z-10',
                  !isActive && 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                )}
              >
                <motion.div 
                  animate={isActive ? { scale: [1, 1.15, 1] } : {}}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className={cn(
                    'flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg transition-transform duration-300 group-hover:scale-110',
                    isActive
                      ? item.color
                      : 'text-sidebar-foreground/40 group-hover:text-sidebar-foreground/80'
                  )}
                >
                  <Icon className="w-[18px] h-[18px]" />
                </motion.div>
                <AnimatePresence mode="wait">
                  {!collapsed && (
                    <motion.span 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.2 }}
                      className={cn(
                        "truncate transition-colors duration-200", 
                        isActive ? item.color : ""
                      )}
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>

                {/* Score Badges */}
                {!collapsed && (
                   <div className="ml-auto flex items-center gap-2">
                      {item.id === 'studio' && studioScore !== null && (
                        <div className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 text-[9px] font-black">{studioScore}%</div>
                      )}
                      {item.id === 'audit' && legalScore !== null && (
                        <div className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
                          legalScore >= 75 ? 'bg-emerald-100 text-emerald-700' : 
                          legalScore >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {legalScore}%
                        </div>
                      )}
                      {item.id === 'green' && greenScore !== null && (
                        <div className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-black">{greenScore}%</div>
                      )}
                   </div>
                )}
                
                {isActive && !collapsed && (
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className={cn("ml-2 w-1.5 h-1.5 rounded-full animate-pulse", item.color.replace('text-', 'bg-'))} 
                  />
                )}
              </motion.button>
            </div>
          )
        })}

        {/* TeamBuilder Section - Expandable */}
        <div className="my-3 mx-2 border-t border-sidebar-border/40" />
        
        <div className="relative">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setTeamBuilderExpanded(!teamBuilderExpanded)}
            className={cn(
              'relative w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 group',
              'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
            )}
          >
            <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-sidebar-foreground/40 group-hover:text-sidebar-foreground/80 transition-colors">
              <Bot className="w-[18px] h-[18px]" />
            </div>
            {!collapsed && (
              <>
                <span className="truncate font-semibold">TeamBuilder</span>
                <motion.div
                  animate={{ rotate: teamBuilderExpanded ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="ml-auto"
                >
                  <ChevronDown className="w-4 h-4" />
                </motion.div>
              </>
            )}
          </motion.button>

          {/* TeamBuilder Sub-items */}
          <AnimatePresence>
            {teamBuilderExpanded && !collapsed && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="pl-6 pt-1 space-y-1">
                  {TEAMBUILDER_ITEMS.map((item) => {
                    const Icon = item.icon
                    const isActive = activeSection === item.id
                    return (
                      <motion.button
                        key={item.id}
                        whileHover={{ x: 2 }}
                        onClick={() => onSectionChange(item.id)}
                        className={cn(
                          'w-full flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all',
                          isActive 
                            ? `${item.color} bg-sidebar-accent` 
                            : 'text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                        )}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </motion.button>
                    )
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </nav>

      {/* User Profile or Login Button */}
      <div className="p-3 border-t border-sidebar-border">
        {user ? (
          <div className="relative">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-full flex items-center gap-3 rounded-lg p-2 hover:bg-sidebar-accent transition-colors"
            >
              {user.picture ? (
                <img src={user.picture} alt={user.name} className="w-8 h-8 rounded-full" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                  <User size={16} className="text-white" />
                </div>
              )}
              {!collapsed && (
                <div className="flex-1 text-left overflow-hidden">
                  <div className="text-sm font-medium text-sidebar-foreground truncate">{user.name}</div>
                  <div className="text-xs text-sidebar-foreground/60 truncate">{user.email}</div>
                </div>
              )}
            </motion.button>

            {/* User Menu */}
            <AnimatePresence>
              {showUserMenu && !collapsed && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute bottom-full left-0 right-0 mb-2 bg-sidebar border border-sidebar-border rounded-lg shadow-lg overflow-hidden"
                >
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
                  >
                    <LogOut size={16} />
                    <span>Déconnexion</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : isGuest ? (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleLogin}
            className="w-full flex items-center gap-3 rounded-lg p-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 transition-all"
          >
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <LogIn size={16} className="text-white" />
            </div>
            {!collapsed && (
              <div className="flex-1 text-left">
                <div className="text-sm font-medium text-white">Mode Invité</div>
                <div className="text-xs text-white/80">Cliquez pour vous connecter</div>
              </div>
            )}
          </motion.button>
        ) : null}
      </div>

      {/* Collapse Toggle */}
      <div className="p-3 border-t border-sidebar-border">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onToggleCollapse}
          className="w-full flex items-center justify-center gap-2 rounded-lg py-2 text-xs text-sidebar-foreground/40 hover:text-sidebar-foreground/70 hover:bg-sidebar-accent transition-colors"
        >
          <motion.div
            animate={{ rotate: collapsed ? 180 : 0 }}
            transition={{ duration: 0.3 }}
          >
            <ChevronLeft className="w-4 h-4" />
          </motion.div>
          <AnimatePresence mode="wait">
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
              >
                Réduire
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </motion.aside>
  )
}
