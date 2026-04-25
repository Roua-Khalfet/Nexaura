'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Loader2, Users, DollarSign, Target, Briefcase, Zap } from 'lucide-react';

interface AIAssistantBarProps {
  isLoading?: boolean;
  currentMode?: string | null;
  onModeChange?: (mode: string) => void;
}

export default function AIAssistantBar({ isLoading = false, currentMode = null, onModeChange }: AIAssistantBarProps) {
  const [hoveredMode, setHoveredMode] = useState<string | null>(null);

  // Workflow configurations
  const workflows = [
    {
      id: 'build_team',
      icon: Users,
      label: 'Build',
      color: '#6366f1',
      gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
      loadingText: 'Building team...'
    },
    {
      id: 'salary',
      icon: DollarSign,
      label: 'Salary',
      color: '#06b6d4',
      gradient: 'linear-gradient(135deg, #06b6d4, #0891b2)',
      loadingText: 'Looking up...'
    },
    {
      id: 'find_candidates',
      icon: Target,
      label: 'Find',
      color: '#ec4899',
      gradient: 'linear-gradient(135deg, #ec4899, #f472b6)',
      loadingText: 'Searching...'
    },
    {
      id: 'manage_jobs',
      icon: Briefcase,
      label: 'Jobs',
      color: '#f59e0b',
      gradient: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
      loadingText: 'Loading...'
    }
  ];

  const handleWorkflowClick = (workflow: any) => {
    // Dispatch event to change mode in AI Assistant
    window.dispatchEvent(new CustomEvent('changeAIMode', {
      detail: { mode: workflow.id }
    }));
    
    // Also call callback if provided
    if (onModeChange) {
      onModeChange(workflow.id);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px',
      background: 'var(--bg-card)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      border: '1px solid var(--border-color)',
      borderRadius: '12px',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
    }}>
      {/* AI Icon */}
      <motion.div
        animate={{
          rotate: isLoading ? 360 : 0
        }}
        transition={{
          rotate: { duration: 2, repeat: isLoading ? Infinity : 0, ease: 'linear' }
        }}
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '8px',
          background: currentMode 
            ? workflows.find(w => w.id === currentMode)?.gradient 
            : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          boxShadow: currentMode
            ? `0 4px 12px ${workflows.find(w => w.id === currentMode)?.color}30`
            : '0 4px 12px rgba(99, 102, 241, 0.3)'
        }}
      >
        {isLoading ? (
          <Loader2 size={16} color="white" className="animate-spin" />
        ) : (
          <Sparkles size={16} color="white" />
        )}
      </motion.div>

      {/* Workflow Buttons */}
      {workflows.map((workflow) => {
        const Icon = workflow.icon;
        const isActive = currentMode === workflow.id;
        const isHovered = hoveredMode === workflow.id;
        const showLoading = isLoading && isActive;

        return (
          <motion.button
            key={workflow.id}
            onClick={() => handleWorkflowClick(workflow)}
            onMouseEnter={() => setHoveredMode(workflow.id)}
            onMouseLeave={() => setHoveredMode(null)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            animate={{
              background: isActive 
                ? workflow.gradient
                : isHovered
                ? 'var(--bg-secondary)'
                : 'transparent',
              color: isActive ? 'white' : 'var(--text-primary)',
              boxShadow: isActive 
                ? `0 4px 12px ${workflow.color}30`
                : 'none'
            }}
            style={{
              position: 'relative',
              padding: '8px 14px',
              border: isActive ? 'none' : '1px solid transparent',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              overflow: 'hidden'
            }}
          >
            {/* Shimmer effect when loading */}
            <AnimatePresence>
              {showLoading && (
                <motion.div
                  initial={{ x: '-100%' }}
                  animate={{ x: '200%' }}
                  exit={{ opacity: 0 }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: 'linear'
                  }}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '50%',
                    height: '100%',
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                    pointerEvents: 'none'
                  }}
                />
              )}
            </AnimatePresence>

            {/* Icon with animation */}
            <motion.div
              animate={{
                rotate: showLoading ? [0, 10, -10, 0] : 0
              }}
              transition={{
                duration: 0.5,
                repeat: showLoading ? Infinity : 0
              }}
            >
              <Icon size={14} />
            </motion.div>

            {/* Label with loading text */}
            <AnimatePresence mode="wait">
              {showLoading ? (
                <motion.span
                  key="loading"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  style={{ fontSize: '12px' }}
                >
                  {workflow.loadingText}
                </motion.span>
              ) : (
                <motion.span
                  key="label"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                >
                  {workflow.label}
                </motion.span>
              )}
            </AnimatePresence>

            {/* Pulsing dot when active and loading */}
            <AnimatePresence>
              {showLoading && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: [1, 1.2, 1] }}
                  exit={{ scale: 0 }}
                  transition={{
                    duration: 1,
                    repeat: Infinity
                  }}
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: 'white',
                    boxShadow: '0 0 8px rgba(255,255,255,0.8)'
                  }}
                />
              )}
            </AnimatePresence>
          </motion.button>
        );
      })}

      {/* AI Badge */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{
          marginLeft: '4px',
          padding: '6px 10px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '6px',
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}
      >
        <Zap size={10} />
        <span>AI</span>
      </motion.div>
    </div>
  );
}
