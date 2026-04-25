'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Send, Sparkles, Users, DollarSign, Briefcase, TrendingUp,
  CheckCircle, Clock, Mail, Loader2, X, Eye, UserPlus, Zap, 
  ChevronDown, Target, ArrowRight, BarChart3, Search, Plus, Filter, Bot
} from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import AIAssistantBar from './ai-assistant-bar';

// API Helper Functions
const API_BASE = 'http://localhost:8001';  // TeamBuilder backend port
const API_KEY = 'your_api_key';

async function apiFetch(url: string, options: any = {}) {
  const resp = await fetch(`${API_BASE}${url}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
      ...options.headers,
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`API ${resp.status}: ${text}`);
  }
  return resp.json();
}

async function getCandidates(filters: any = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.append(key, String(value));
  });
  return apiFetch(`/api/v1/hr/candidates?${params}`);
}

async function getJobs(filters: any = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.append(key, String(value));
  });
  return apiFetch(`/api/v1/jobs?${params}`);
}

async function createJob(jobData: any) {
  return apiFetch('/api/v1/jobs', {
    method: 'POST',
    body: JSON.stringify(jobData),
  });
}

async function lookupSalary(roleTitle: string, seniority: string, region: string = 'TN', currency: string = 'TND') {
  const params = new URLSearchParams({
    role_title: roleTitle,
    seniority,
    region,
    currency
  });
  return apiFetch(`/api/v1/salary-lookup?${params}`);
}

export default function AIAssistantSection() {
  // Constants
  const region = 'TN';
  const currency = 'TND';
  // Mode state - 5 conversational modes
  const [mode, setMode] = useState<string | null>(null);
  
  // Build Team Mode state
  const [teamQuery, setTeamQuery] = useState<string>('');
  
  // Salary Mode state
  const [salaryQuery, setSalaryQuery] = useState<string>('');
  const [salaryRole, setSalaryRole] = useState<string>('');
  const [salarySeniority, setSalarySeniority] = useState<string>('mid');
  const [salaryResult, setSalaryResult] = useState<any>(null);
  
  // Find Candidates Mode state
  const [searchRole, setSearchRole] = useState<string>('');
  const [searchSkills, setSearchSkills] = useState<string>('');
  const [searchSeniority, setSearchSeniority] = useState<string>('');
  const [candidateResults, setCandidateResults] = useState<any[]>([]);
  
  // Manage Jobs Mode state
  const [jobs, setJobs] = useState<any[]>([]);
  const [showCreateJob, setShowCreateJob] = useState<boolean>(false);
  const [newJob, setNewJob] = useState<any>({
    title: '',
    seniority: 'mid',
    required_skills: '',
    description: ''
  });
  
  // Results state
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string>('');
  
  // UI state
  const [showSalaryStats, setShowSalaryStats] = useState<boolean>(false);
  const [showInterestedCandidates, setShowInterestedCandidates] = useState<boolean>(false);
  const [selectedRole, setSelectedRole] = useState<any>(null);
  const [expandedRoles, setExpandedRoles] = useState<any>({});
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Expose state to parent via custom event for navbar AND theme
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('aiAssistantState', {
      detail: { mode, loading }
    }));
    
    // Emit theme change event
    const themeColors: Record<string, { primary: string; gradient: string; shadow: string }> = {
      'build_team': { primary: '#6366f1', gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6)', shadow: 'rgba(99, 102, 241, 0.3)' },
      'salary': { primary: '#06b6d4', gradient: 'linear-gradient(135deg, #06b6d4, #0891b2)', shadow: 'rgba(6, 182, 212, 0.3)' },
      'find_candidates': { primary: '#ec4899', gradient: 'linear-gradient(135deg, #ec4899, #f472b6)', shadow: 'rgba(236, 72, 153, 0.3)' },
      'manage_jobs': { primary: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b, #fbbf24)', shadow: 'rgba(245, 158, 11, 0.3)' }
    };
    
    window.dispatchEvent(new CustomEvent('workflowThemeChange', {
      detail: { 
        mode, 
        colors: mode ? themeColors[mode] : null 
      }
    }));
  }, [mode, loading]);

  // Listen for mode changes from navbar
  useEffect(() => {
    const handleModeChange = (event: any) => {
      const newMode = event.detail.mode;
      if (newMode !== mode) {
        setMode(newMode);
        setResult(null);
        setTeamQuery('');
        setShowSalaryStats(false);
        setShowInterestedCandidates(false);
        setSalaryQuery('');
        setSalaryRole('');
        setSalarySeniority('mid');
        setSearchRole('');
        setSearchSkills('');
        setSearchSeniority('');
        setCandidateResults([]);
        setSalaryResult(null);
        setLoading(false);
        setError('');
      }
    };
    window.addEventListener('changeAIMode', handleModeChange);
    return () => window.removeEventListener('changeAIMode', handleModeChange);
  }, [mode]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [result, showSalaryStats, showInterestedCandidates]);

  // Load jobs when entering manage_jobs mode
  useEffect(() => {
    if (mode === 'manage_jobs' && jobs.length === 0) {
      setLoading(true);
      getJobs()
        .then(data => setJobs(data))
        .catch(err => setError(err.message))
        .finally(() => setLoading(false));
    }
  }, [mode, jobs.length]);

  const handleSubmit = async () => {
    if (!teamQuery.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    
    try {
      const response = await fetch('http://localhost:8001/api/v1/team-builder', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'your_api_key'
        },
        body: JSON.stringify({ 
          description: teamQuery, 
          region: 'TN', 
          currency: 'TND' 
        })
      });
      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Failed to build team. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  // Mock interested candidates (replace with real API call)
  const interestedCandidates = [
    { id: 1, name: 'Sarah Chen', role: 'Senior Backend Engineer', email: 'sarah.chen@email.com', respondedAt: '2 days ago', status: 'interested' },
    { id: 2, name: 'Ahmed Hassan', role: 'DevOps Engineer', email: 'ahmed.hassan@email.com', respondedAt: '1 day ago', status: 'interested' },
    { id: 3, name: 'Maria Garcia', role: 'Frontend Developer', email: 'maria.g@email.com', respondedAt: '3 hours ago', status: 'interested' }
  ];

  // Mock salary data (replace with real API call)
  const salaryData = {
    byRole: [
      { role: 'Backend Engineer', min: 45000, max: 75000, avg: 60000 },
      { role: 'Frontend Developer', min: 40000, max: 65000, avg: 52500 },
      { role: 'DevOps Engineer', min: 50000, max: 80000, avg: 65000 },
      { role: 'Product Manager', min: 55000, max: 85000, avg: 70000 }
    ],
    bySeniority: [
      { name: 'Junior', value: 35, color: '#6366f1' },
      { name: 'Mid-level', value: 45, color: '#8b5cf6' },
      { name: 'Senior', value: 15, color: '#ec4899' },
      { name: 'Lead', value: 5, color: '#f59e0b' }
    ]
  };

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-primary)',
      position: 'relative'
    }}>

      {/* AI Assistant Bar - Fixed at Top */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        padding: '16px 48px',
        background: 'var(--bg-primary)',
        borderBottom: '1px solid var(--border-color)'
      }}>
        <AIAssistantBar 
          isLoading={loading} 
          currentMode={mode} 
        />
      </div>

      {/* Main Content Area - Scrollable */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '32px 48px',
        paddingBottom: '140px', // Space for fixed input
        maxWidth: '1400px',
        margin: '0 auto',
        width: '100%'
      }}>
        
        {/* Welcome Message - Premium Design */}
        {!mode && !result && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              maxWidth: '1200px',
              margin: '40px auto',
            }}
          >
            {/* Minimal Header */}
            <div style={{ marginBottom: '64px', textAlign: 'center' }}>
              <h2 style={{
                fontSize: '42px',
                fontWeight: 600,
                marginBottom: '16px',
                color: 'var(--text-primary)',
                letterSpacing: '-0.03em'
              }}>
                AI Recruitment Assistant
              </h2>
              <p style={{
                fontSize: '16px',
                color: 'var(--text-secondary)',
                fontWeight: 400,
                maxWidth: '500px',
                margin: '0 auto'
              }}>
                Select a workflow from the navbar to begin
              </p>
            </div>

            {/* Premium Mode Cards - 2x2 Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '24px',
              marginBottom: '48px'
            }}>
              {/* Build Team */}
              <motion.div
                whileHover={{ y: -2 }}
                onClick={() => setMode('build_team')}
                style={{
                  padding: '32px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                {/* Subtle gradient overlay */}
                <div style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  width: '200px',
                  height: '200px',
                  background: 'radial-gradient(circle, rgba(99, 102, 241, 0.03) 0%, transparent 70%)',
                  pointerEvents: 'none'
                }} />
                
                <div style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '8px',
                      background: 'rgba(99, 102, 241, 0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Users size={20} style={{ color: '#6366f1' }} />
                    </div>
                    <h3 style={{ fontSize: '17px', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                      Build Team
                    </h3>
                  </div>
                  <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                    AI-powered team composition with role recommendations and salary estimates
                  </p>
                  <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 500, color: '#6366f1' }}>
                    Start workflow <ArrowRight size={14} />
                  </div>
                </div>
              </motion.div>

              {/* Salary Inquiry */}
              <motion.div
                whileHover={{ y: -2 }}
                onClick={() => setMode('salary')}
                style={{
                  padding: '32px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  width: '200px',
                  height: '200px',
                  background: 'radial-gradient(circle, rgba(139, 92, 246, 0.03) 0%, transparent 70%)',
                  pointerEvents: 'none'
                }} />
                
                <div style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '8px',
                      background: 'rgba(139, 92, 246, 0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <DollarSign size={20} style={{ color: '#06b6d4' }} />
                    </div>
                    <h3 style={{ fontSize: '17px', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                      Salary Intelligence
                    </h3>
                  </div>
                  <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                    Market compensation data and benchmarking across roles and regions
                  </p>
                  <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 500, color: '#06b6d4' }}>
                    View insights <ArrowRight size={14} />
                  </div>
                </div>
              </motion.div>

              {/* Find Candidates */}
              <motion.div
                whileHover={{ y: -2 }}
                onClick={() => setMode('find_candidates')}
                style={{
                  padding: '32px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  width: '200px',
                  height: '200px',
                  background: 'radial-gradient(circle, rgba(236, 72, 153, 0.03) 0%, transparent 70%)',
                  pointerEvents: 'none'
                }} />
                
                <div style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '8px',
                      background: 'rgba(236, 72, 153, 0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Target size={20} style={{ color: '#ec4899' }} />
                    </div>
                    <h3 style={{ fontSize: '17px', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                      Candidate Matching
                    </h3>
                  </div>
                  <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                    Semantic search and intelligent matching to find qualified candidates
                  </p>
                  <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 500, color: '#ec4899' }}>
                    Search pool <ArrowRight size={14} />
                  </div>
                </div>
              </motion.div>

              {/* Manage Jobs */}
              <motion.div
                whileHover={{ y: -2 }}
                onClick={() => setMode('manage_jobs')}
                style={{
                  padding: '32px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  width: '200px',
                  height: '200px',
                  background: 'radial-gradient(circle, rgba(245, 158, 11, 0.03) 0%, transparent 70%)',
                  pointerEvents: 'none'
                }} />
                
                <div style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '8px',
                      background: 'rgba(245, 158, 11, 0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Briefcase size={20} style={{ color: '#f59e0b' }} />
                    </div>
                    <h3 style={{ fontSize: '17px', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                      Job Management
                    </h3>
                  </div>
                  <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                    Create, track, and manage job postings with analytics and insights
                  </p>
                  <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 500, color: '#f59e0b' }}>
                    Manage postings <ArrowRight size={14} />
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Interested Candidates - Separate Section */}
            {interestedCandidates.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                whileHover={{ y: -2 }}
                onClick={() => setShowInterestedCandidates(true)}
                style={{
                  padding: '24px 32px',
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.05), rgba(6, 182, 212, 0.05))',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '10px',
                    background: 'rgba(16, 185, 129, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <CheckCircle size={24} style={{ color: '#10b981' }} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 4px 0', color: 'var(--text-primary)' }}>
                      {interestedCandidates.length} Interested Candidates
                    </h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                      Review responses and take action
                    </p>
                  </div>
                </div>
                <ArrowRight size={20} style={{ color: '#10b981' }} />
              </motion.div>
            )}
          </motion.div>
        )}


        {/* Interested Candidates Section - Premium Design */}
        <AnimatePresence>
          {showInterestedCandidates && (
            <>
              {/* Background Blur Overlay */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowInterestedCandidates(false)}
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(0, 0, 0, 0.4)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  zIndex: 50
                }}
              />

              {/* Modal Content */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'fixed',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '90%',
                  maxWidth: '800px',
                  maxHeight: '80vh',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '16px',
                  boxShadow: '0 24px 48px rgba(0, 0, 0, 0.2)',
                  zIndex: 100,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                {/* Header */}
                <div style={{
                  padding: '24px 32px',
                  borderBottom: '1px solid var(--border-color)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 4px 0', color: 'var(--text-primary)' }}>
                      Interested Candidates
                    </h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                      {interestedCandidates.length} candidates have responded positively
                    </p>
                  </div>
                  <button
                    onClick={() => setShowInterestedCandidates(false)}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      background: 'transparent',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-secondary)',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => (e.target as HTMLButtonElement).style.background = 'var(--bg-secondary)'}
                    onMouseLeave={(e) => (e.target as HTMLButtonElement).style.background = 'transparent'}
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Scrollable Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {interestedCandidates.map((candidate: any, i: number) => (
                      <motion.div
                        key={candidate.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        style={{
                          padding: '20px',
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '12px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          transition: 'all 0.2s'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
                          <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '10px',
                            background: 'linear-gradient(135deg, #10b981, #06b6d4)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            fontSize: '15px',
                            fontWeight: 600,
                            flexShrink: 0
                          }}>
                            {candidate.name.split(' ').map((n: string) => n[0]).join('')}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <h4 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 4px 0', color: 'var(--text-primary)' }}>
                              {candidate.name}
                            </h4>
                            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 6px 0' }}>
                              {candidate.role}
                            </p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{
                                padding: '3px 8px',
                                background: 'rgba(16, 185, 129, 0.1)',
                                border: '1px solid rgba(16, 185, 129, 0.2)',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 600,
                                color: '#10b981',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                <CheckCircle size={10} />
                                Interested
                              </div>
                              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                • Responded {candidate.respondedAt}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                          <motion.a
                            href={`mailto:${candidate.email}`}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            style={{
                              padding: '10px 16px',
                              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '8px',
                              fontSize: '13px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              textDecoration: 'none',
                              transition: 'all 0.2s'
                            }}
                          >
                            <Mail size={14} />
                            Contact
                          </motion.a>
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            style={{
                              padding: '10px',
                              background: 'var(--bg-card)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              transition: 'all 0.2s'
                            }}
                            title="View profile"
                          >
                            <Eye size={16} style={{ color: 'var(--text-secondary)' }} />
                          </motion.button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>


        {/* Salary Statistics Section */}
        <AnimatePresence>
          {showSalaryStats && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{
                marginBottom: '24px',
                background: 'var(--bg-card)',
                border: '2px solid #6366f1',
                borderRadius: '16px',
                padding: '24px',
                boxShadow: '0 8px 24px rgba(99, 102, 241, 0.15)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <DollarSign size={24} style={{ color: '#6366f1' }} />
                  <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    Salary Statistics
                  </h3>
                </div>
                <button
                  onClick={() => setShowSalaryStats(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                    padding: '4px'
                  }}
                >
                  <X size={20} />
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
                {/* Salary by Role Chart */}
                <div style={{
                  background: 'var(--bg-secondary)',
                  borderRadius: '12px',
                  padding: '20px',
                  border: '1px solid var(--border-color)'
                }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)' }}>
                    Average Salary by Role
                  </h4>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={salaryData.byRole} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" opacity={0.3} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                      <YAxis type="category" dataKey="role" tick={{ fontSize: 11, fill: 'var(--text-primary)' }} width={120} />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--bg-card)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          fontSize: '12px'
                        }}
                      />
                      <Bar dataKey="avg" fill="url(#salaryGradient)" radius={[0, 8, 8, 0]} />
                      <defs>
                        <linearGradient id="salaryGradient" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#06b6d4" />
                          <stop offset="100%" stopColor="#0891b2" />
                        </linearGradient>
                      </defs>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Seniority Distribution */}
                <div style={{
                  background: 'var(--bg-secondary)',
                  borderRadius: '12px',
                  padding: '20px',
                  border: '1px solid var(--border-color)'
                }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)' }}>
                    Candidates by Seniority
                  </h4>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={salaryData.bySeniority}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {salaryData.bySeniority.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: 'var(--bg-card)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          fontSize: '12px'
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '12px', justifyContent: 'center' }}>
                    {salaryData.bySeniority.map((item: any, i: number) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: item.color }} />
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {item.name} ({item.value}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Salary Ranges */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                {salaryData.byRole.map((role: any, i: number) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    style={{
                      padding: '16px',
                      background: 'var(--bg-secondary)',
                      borderRadius: '10px',
                      border: '1px solid var(--border-color)'
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>
                      {role.role}
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#6366f1', marginBottom: '4px' }}>
                      {role.min.toLocaleString()} - {role.max.toLocaleString()} {currency}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Avg: {role.avg.toLocaleString()} {currency}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>


        {/* Team Building Workflow - Conversational */}
        {mode === 'build_team' && !showInterestedCandidates && !showSalaryStats && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ maxWidth: '1000px', margin: '0 auto' }}
          >
            {/* Conversational Input */}
            {!result && !loading && (
              <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: '16px',
                padding: '40px',
                marginBottom: '24px'
              }}>
                <div style={{ marginBottom: '32px' }}>
                  <h3 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '12px', color: 'var(--text-primary)' }}>
                    Build Your Team
                  </h3>
                  <p style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    Describe your project and team needs in natural language. Try queries like:
                  </p>
                  <div style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {[
                      'Building a SaaS platform, need backend and frontend engineers',
                      'Mobile app startup, solo founder, budget 60k',
                      'AI product, have 2 engineers, need ML specialist and designer',
                      'E-commerce marketplace, MVP in 4 months'
                    ].map((example: string, i: number) => (
                      <motion.button
                        key={i}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setTeamQuery(example)}
                        style={{
                          padding: '8px 14px',
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          fontSize: '12px',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        "{example}"
                      </motion.button>
                    ))}
                  </div>
                </div>

                <div>
                  <textarea
                    placeholder="Tell me about your project... e.g., 'We're building a B2B SaaS platform for logistics. Currently just me (non-technical founder). Need to launch MVP in 6 months with a budget of 80,000 TND. Looking for backend engineer, frontend developer, and designer.'"
                    value={teamQuery}
                    onChange={(e) => setTeamQuery(e.target.value)}
                    rows={4}
                    autoFocus
                    style={{
                      width: '100%',
                      padding: '18px 20px',
                      background: 'var(--bg-secondary)',
                      border: '2px solid var(--border-color)',
                      borderRadius: '12px',
                      fontSize: '15px',
                      color: 'var(--text-primary)',
                      outline: 'none',
                      transition: 'all 0.2s',
                      fontWeight: 400,
                      lineHeight: 1.6,
                      resize: 'vertical',
                      fontFamily: 'inherit'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#6366f1'}
                    onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'}
                  />
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sparkles size={14} style={{ color: '#6366f1' }} />
                    AI will analyze your project, current team, budget, and timeline to recommend the perfect team composition
                  </p>
                </div>
              </div>
            )}

            {/* Loading State */}
            {loading && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '48px' }}>
                <Loader2 size={48} style={{ color: '#6366f1' }} className="animate-spin" />
                <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>Building your perfect team...</p>
              </div>
            )}

            {/* Results */}
            {result && !loading && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {/* AI Response */}
                {result.chat_response && (
                  <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '16px',
                    padding: '24px',
                    marginBottom: '24px'
                  }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-primary)' }}>
                      AI Analysis
                    </h3>
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                      {result.chat_response}
                    </p>
                  </div>
                )}

                {/* Recommended Team */}
                {result.recommended_team && result.recommended_team.length > 0 && (
                  <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Users size={20} style={{ color: '#6366f1' }} />
                      Recommended Team
                      <span style={{
                        padding: '4px 10px',
                        background: 'rgba(99, 102, 241, 0.1)',
                        color: '#6366f1',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 700
                      }}>
                        {result.recommended_team.length} roles
                      </span>
                    </h3>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                      {result.recommended_team.map((member: any, i: number) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.08 }}
                          whileHover={{ y: -4, boxShadow: '0 12px 32px rgba(0,0,0,0.12)' }}
                          style={{
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '12px',
                            padding: '20px',
                            cursor: 'pointer',
                            transition: 'all 0.3s'
                          }}
                          onClick={() => setSelectedRole(member)}
                        >
                          <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px', color: 'var(--text-primary)' }}>
                            {member.role}
                          </div>
                          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                            {member.seniority} • {member.type}
                          </div>
                          <div style={{ fontSize: '18px', fontWeight: 700, color: '#6366f1', marginBottom: '4px' }}>
                            {member.estimated_salary}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            Source: {member.salary_source}
                          </div>

                          {member.top_candidates && member.top_candidates.length > 0 && (
                            <div style={{
                              marginTop: '16px',
                              paddingTop: '16px',
                              borderTop: '1px solid var(--border-color)'
                            }}>
                              <button
                                onClick={() => setExpandedRoles((prev: any) => ({ ...prev, [i]: !prev[i] }))}
                                style={{
                                  width: '100%',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  padding: '8px 0',
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  color: 'var(--text-secondary)',
                                  transition: 'color 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
                              >
                                <span>{member.top_candidates.length} {member.top_candidates.length === 1 ? 'candidate' : 'candidates'} found</span>
                                <ChevronDown 
                                  size={16} 
                                  style={{ 
                                    transform: expandedRoles[i] ? 'rotate(180deg)' : 'rotate(0deg)',
                                    transition: 'transform 0.2s'
                                  }} 
                                />
                              </button>
                              
                              <AnimatePresence>
                                {expandedRoles[i] && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    style={{ overflow: 'hidden' }}
                                  >
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                                      {member.top_candidates.map((c: any, j: number) => (
                                        <div key={j} style={{ 
                                          display: 'flex', 
                                          justifyContent: 'space-between', 
                                          alignItems: 'center', 
                                          padding: '10px 12px', 
                                          background: 'var(--bg-secondary)', 
                                          border: '1px solid var(--border-color)', 
                                          borderRadius: '8px' 
                                        }}>
                                          <div style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{ fontSize: '14px', fontWeight: 600, display: 'block', color: 'var(--text-primary)' }}>
                                              {c.name}
                                            </span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                                              <span className="badge badge-blue" style={{ fontSize: '10px' }}>{c.source}</span>
                                              {c.score > 0 && (
                                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                  Match: {c.score > 1 ? Math.round(c.score) : Math.round(c.score * 100)}%
                                                </span>
                                              )}
                                              {c.email && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{c.email}</span>}
                                            </div>
                                          </div>
                                          <div style={{ display: 'flex', gap: '6px', flexShrink: 0, marginLeft: '8px' }}>
                                            <button
                                              onClick={() => {
                                                console.log('View candidate:', c);
                                                alert(`Candidate: ${c.name}\nSource: ${c.source}\nScore: ${c.score > 1 ? c.score : c.score * 100}%`);
                                              }}
                                              className="btn btn-secondary btn-sm"
                                              style={{ padding: '6px 10px', fontSize: '12px' }}
                                              title="View Details"
                                            >
                                              👤
                                            </button>
                                            <button
                                              onClick={() => {
                                                console.log('Invite candidate:', c, 'for role:', member.role);
                                                alert(`Send invitation to ${c.name} for ${member.role} position`);
                                              }}
                                              className="btn btn-primary btn-sm"
                                              style={{ padding: '6px 10px', fontSize: '12px' }}
                                              title="Send Invitation"
                                            >
                                              ✉️
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Budget Summary */}
                {result.a2a_payload && result.a2a_payload.total_estimated_cost_min > 0 && (
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.05), rgba(139, 92, 246, 0.05))',
                    border: '1px solid var(--border-color)',
                    borderRadius: '16px',
                    padding: '24px',
                    marginBottom: '24px'
                  }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <DollarSign size={20} style={{ color: '#10b981' }} />
                      Total Budget Estimate
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                          Estimated Annual Cost
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {result.a2a_payload.total_estimated_cost_min.toLocaleString()} - {result.a2a_payload.total_estimated_cost_max.toLocaleString()} {result.a2a_payload.currency}
                        </div>
                      </div>
                      {result.a2a_payload.budget && (
                        <div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                            Your Budget
                          </div>
                          <div style={{
                            fontSize: '24px',
                            fontWeight: 700,
                            color: result.a2a_payload.budget < result.a2a_payload.total_estimated_cost_min ? '#f43f5e' : '#10b981'
                          }}>
                            {result.a2a_payload.budget.toLocaleString()} {result.a2a_payload.currency}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Salary Mode */}
        {mode === 'salary' && !showInterestedCandidates && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ maxWidth: '1000px', margin: '0 auto' }}
          >
            {/* Conversational Input */}
            {!salaryResult && !loading && (
              <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: '16px',
                padding: '40px',
                marginBottom: '24px'
              }}>
                <div style={{ marginBottom: '32px' }}>
                  <h3 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '12px', color: 'var(--text-primary)' }}>
                    Salary Intelligence
                  </h3>
                  <p style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    Ask me anything about salaries. Try questions like:
                  </p>
                  <div style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {[
                      'Show me salary for senior backend engineer',
                      'What does a mid-level product manager earn?',
                      'Salary curve for data scientists',
                      'Compare salaries across seniority levels'
                    ].map((example: string, i: number) => (
                      <motion.button
                        key={i}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setSalaryQuery(example)}
                        style={{
                          padding: '8px 14px',
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          fontSize: '12px',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        "{example}"
                      </motion.button>
                    ))}
                  </div>
                </div>

                <div>
                  <textarea
                    placeholder="Ask me about salaries... e.g., 'What's the salary for a senior backend engineer in Tunisia?' or 'Show me salary trends for product managers'"
                    value={salaryQuery}
                    onChange={(e) => setSalaryQuery(e.target.value)}
                    rows={4}
                    autoFocus
                    style={{
                      width: '100%',
                      padding: '18px 20px',
                      background: 'var(--bg-secondary)',
                      border: '2px solid var(--border-color)',
                      borderRadius: '12px',
                      fontSize: '15px',
                      color: 'var(--text-primary)',
                      outline: 'none',
                      transition: 'all 0.2s',
                      fontWeight: 400,
                      lineHeight: 1.6,
                      resize: 'vertical',
                      fontFamily: 'inherit'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#06b6d4'}
                    onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'}
                  />
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sparkles size={14} style={{ color: '#06b6d4' }} />
                    AI will understand your question and extract the role, seniority, and region automatically
                  </p>
                </div>
              </div>
            )}

            {/* Loading State */}
            {loading && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '48px' }}>
                <Loader2 size={48} style={{ color: '#06b6d4' }} className="animate-spin" />
                <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>Analyzing salary data...</p>
              </div>
            )}

            {/* Salary Results */}
            {salaryResult && !loading && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div style={{
                  background: 'var(--bg-card)',
                  border: '2px solid #06b6d4',
                  borderRadius: '16px',
                  padding: '32px',
                  marginBottom: '24px'
                }}>
                  <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-primary)' }}>
                      {salaryRole} ({salarySeniority})
                    </h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      Source: {salaryResult.source}
                    </p>
                  </div>

                  <div style={{
                    padding: '24px',
                    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.05), rgba(167, 139, 250, 0.05))',
                    borderRadius: '12px',
                    marginBottom: '24px'
                  }}>
                    <div style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                      Annual Salary Range
                    </div>
                    <div style={{ fontSize: '32px', fontWeight: 700, color: '#06b6d4' }}>
                      {salaryResult.annual_min?.toLocaleString()} - {salaryResult.annual_max?.toLocaleString()} {salaryResult.currency}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px' }}>
                      Average: {Math.round((salaryResult.annual_min + salaryResult.annual_max) / 2).toLocaleString()} {salaryResult.currency}/year
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '12px' }}>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setShowSalaryStats(!showSalaryStats)}
                      style={{
                        flex: 1,
                        padding: '12px',
                        background: showSalaryStats ? 'var(--bg-secondary)' : 'linear-gradient(135deg, #06b6d4, #0891b2)',
                        border: showSalaryStats ? '1px solid var(--border-color)' : 'none',
                        borderRadius: '10px',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: showSalaryStats ? 'var(--text-primary)' : 'white',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                      }}
                    >
                      <BarChart3 size={16} />
                      {showSalaryStats ? 'Hide Statistics' : 'View Market Statistics'}
                    </motion.button>
                    
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        setSalaryResult(null);
                        setSalaryRole('');
                      }}
                      style={{
                        flex: 1,
                        padding: '12px',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '10px',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      New Search
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Find Candidates Mode */}
        {mode === 'find_candidates' && !showInterestedCandidates && !showSalaryStats && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ maxWidth: '1000px', margin: '0 auto' }}
          >
            {/* Conversational Search */}
            {candidateResults.length === 0 && !loading && (
              <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: '16px',
                padding: '40px',
                marginBottom: '24px'
              }}>
                <div style={{ marginBottom: '32px' }}>
                  <h3 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '12px', color: 'var(--text-primary)' }}>
                    Find Candidates
                  </h3>
                  <p style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    Describe who you're looking for in natural language. Try queries like:
                  </p>
                  <div style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {[
                      'Find senior developers with Python and React',
                      'Show me mid-level product managers',
                      'Candidates with 5+ years in backend',
                      'Junior designers with Figma experience'
                    ].map((example: string, i: number) => (
                      <motion.button
                        key={i}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setSearchRole(example)}
                        style={{
                          padding: '8px 14px',
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          fontSize: '12px',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        "{example}"
                      </motion.button>
                    ))}
                  </div>
                </div>

                <div>
                  <textarea
                    placeholder="Describe the candidate you're looking for... e.g., 'Find senior backend engineers with Python, Django, and PostgreSQL experience' or 'Show me mid-level product managers with SaaS background'"
                    value={searchRole}
                    onChange={(e) => setSearchRole(e.target.value)}
                    rows={4}
                    autoFocus
                    style={{
                      width: '100%',
                      padding: '18px 20px',
                      background: 'var(--bg-secondary)',
                      border: '2px solid var(--border-color)',
                      borderRadius: '12px',
                      fontSize: '15px',
                      color: 'var(--text-primary)',
                      outline: 'none',
                      transition: 'all 0.2s',
                      fontWeight: 400,
                      lineHeight: 1.6,
                      resize: 'vertical',
                      fontFamily: 'inherit'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#ec4899'}
                    onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'}
                  />
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sparkles size={14} style={{ color: '#ec4899' }} />
                    AI will parse your query and search for matching candidates based on skills, experience, and seniority
                  </p>
                </div>
              </div>
            )}

            {/* Loading State */}
            {loading && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '48px' }}>
                <Loader2 size={48} style={{ color: '#ec4899' }} className="animate-spin" />
                <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>Searching candidates...</p>
              </div>
            )}

            {/* Candidate Results */}
            {candidateResults.length > 0 && !loading && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Found {candidateResults.length} candidates
                  </h3>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setCandidateResults([]);
                      setSearchRole('');
                      setSearchSkills('');
                      setSearchSeniority('');
                    }}
                    style={{
                      padding: '8px 16px',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    New Search
                  </motion.button>
                </div>

                <div style={{ display: 'grid', gap: '12px' }}>
                  {candidateResults.map((candidate: any, i: number) => (
                    <motion.div
                      key={candidate.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      style={{
                        padding: '20px',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transition: 'all 0.2s'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
                        <div style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '10px',
                          background: 'linear-gradient(135deg, #ec4899, #f472b6)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontSize: '15px',
                          fontWeight: 600,
                          flexShrink: 0
                        }}>
                          {candidate.name.split(' ').map((n: string) => n[0]).join('')}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h4 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 4px 0', color: 'var(--text-primary)' }}>
                            {candidate.name}
                          </h4>
                          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 6px 0' }}>
                            {candidate.seniority} • {candidate.experience_years} years exp
                          </p>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {candidate.skills?.slice(0, 4).map((skill: string, idx: number) => (
                              <span key={idx} style={{
                                padding: '3px 8px',
                                background: 'rgba(236, 72, 153, 0.1)',
                                border: '1px solid rgba(236, 72, 153, 0.2)',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 600,
                                color: '#ec4899'
                              }}>
                                {skill}
                              </span>
                            ))}
                            {candidate.skills?.length > 4 && (
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                +{candidate.skills.length - 4} more
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                        <motion.a
                          href={`mailto:${candidate.email}`}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          style={{
                            padding: '10px 16px',
                            background: 'linear-gradient(135deg, #ec4899, #f472b6)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            textDecoration: 'none',
                            transition: 'all 0.2s'
                          }}
                        >
                          <Mail size={14} />
                          Contact
                        </motion.a>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Manage Jobs Mode */}
        {mode === 'manage_jobs' && !showInterestedCandidates && !showSalaryStats && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ maxWidth: '1100px', margin: '0 auto' }}
          >
            {/* Header with Create Button */}
            <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px', color: 'var(--text-primary)' }}>
                  Job Postings
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  {jobs.length} active positions
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowCreateJob(true)}
                style={{
                  padding: '10px 20px',
                  background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
                  transition: 'all 0.2s'
                }}
              >
                <Plus size={16} />
                Create Job
              </motion.button>
            </div>

            {/* Create Job Form */}
            <AnimatePresence>
              {showCreateJob && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setShowCreateJob(false)}
                    style={{
                      position: 'fixed',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: 'rgba(0, 0, 0, 0.4)',
                      backdropFilter: 'blur(8px)',
                      WebkitBackdropFilter: 'blur(8px)',
                      zIndex: 50
                    }}
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'fixed',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: '90%',
                      maxWidth: '600px',
                      maxHeight: '90vh',
                      overflowY: 'auto',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '16px',
                      boxShadow: '0 24px 48px rgba(0, 0, 0, 0.2)',
                      zIndex: 100,
                      padding: '32px'
                    }}
                  >
                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-primary)' }}>
                        Create New Job
                      </h3>
                      <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                        Add a new position to your recruitment pipeline
                      </p>
                    </div>

                    <div style={{ display: 'grid', gap: '16px', marginBottom: '24px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>
                          Job Title
                        </label>
                        <input
                          type="text"
                          placeholder="e.g., Senior Backend Engineer"
                          value={newJob.title}
                          onChange={(e) => setNewJob({...newJob, title: e.target.value})}
                          autoFocus
                          style={{
                            width: '100%',
                            padding: '12px 16px',
                            background: 'var(--bg-secondary)',
                            border: '2px solid var(--border-color)',
                            borderRadius: '10px',
                            fontSize: '14px',
                            color: 'var(--text-primary)',
                            outline: 'none'
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>
                          Seniority Level
                        </label>
                        <select
                          value={newJob.seniority}
                          onChange={(e) => setNewJob({...newJob, seniority: e.target.value})}
                          style={{
                            width: '100%',
                            padding: '12px 16px',
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '10px',
                            fontSize: '14px',
                            color: 'var(--text-primary)',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="junior">Junior</option>
                          <option value="mid">Mid-level</option>
                          <option value="senior">Senior</option>
                          <option value="lead">Lead</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>
                          Required Skills (comma-separated)
                        </label>
                        <input
                          type="text"
                          placeholder="e.g., Python, Django, PostgreSQL"
                          value={newJob.required_skills}
                          onChange={(e) => setNewJob({...newJob, required_skills: e.target.value})}
                          style={{
                            width: '100%',
                            padding: '12px 16px',
                            background: 'var(--bg-secondary)',
                            border: '2px solid var(--border-color)',
                            borderRadius: '10px',
                            fontSize: '14px',
                            color: 'var(--text-primary)',
                            outline: 'none'
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>
                          Description
                        </label>
                        <textarea
                          placeholder="Job description and requirements..."
                          value={newJob.description}
                          onChange={(e) => setNewJob({...newJob, description: e.target.value})}
                          rows={4}
                          style={{
                            width: '100%',
                            padding: '12px 16px',
                            background: 'var(--bg-secondary)',
                            border: '2px solid var(--border-color)',
                            borderRadius: '10px',
                            fontSize: '14px',
                            color: 'var(--text-primary)',
                            resize: 'vertical',
                            fontFamily: 'inherit',
                            outline: 'none'
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px' }}>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={async () => {
                          if (!newJob.title.trim()) return;
                          setLoading(true);
                          try {
                            const skillsArray = newJob.required_skills.split(',').map((s: string) => s.trim()).filter(Boolean);
                            await createJob({
                              title: newJob.title,
                              seniority: newJob.seniority,
                              required_skills: skillsArray,
                              description: newJob.description,
                              status: 'open'
                            });
                            // Refresh jobs list
                            const jobsData = await getJobs();
                            setJobs(jobsData);
                            setShowCreateJob(false);
                            setNewJob({ title: '', seniority: 'mid', required_skills: '', description: '' });
                          } catch (err: any) {
                            setError(err.message);
                          } finally {
                            setLoading(false);
                          }
                        }}
                        disabled={!newJob.title.trim() || loading}
                        style={{
                          flex: 1,
                          padding: '12px',
                          background: newJob.title.trim() ? 'linear-gradient(135deg, #f59e0b, #fbbf24)' : 'var(--bg-secondary)',
                          color: newJob.title.trim() ? 'white' : 'var(--text-muted)',
                          border: 'none',
                          borderRadius: '10px',
                          fontSize: '14px',
                          fontWeight: 600,
                          cursor: newJob.title.trim() ? 'pointer' : 'not-allowed',
                          transition: 'all 0.2s'
                        }}
                      >
                        {loading ? 'Creating...' : 'Create Job'}
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setShowCreateJob(false)}
                        style={{
                          padding: '12px 24px',
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '10px',
                          fontSize: '14px',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        Cancel
                      </motion.button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>

            {/* Jobs List */}
            {loading && jobs.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '48px' }}>
                <Loader2 size={48} style={{ color: '#f59e0b' }} className="animate-spin" />
                <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>Loading jobs...</p>
              </div>
            ) : jobs.length === 0 ? (
              <div style={{
                padding: '48px',
                textAlign: 'center',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: '16px'
              }}>
                <Briefcase size={48} style={{ color: '#f59e0b', margin: '0 auto 16px' }} />
                <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>
                  No jobs yet
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  Create your first job posting to start recruiting
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '16px' }}>
                {jobs.map((job: any, i: number) => (
                  <motion.div
                    key={job.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    style={{
                      padding: '24px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '12px',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                      <div style={{ flex: 1 }}>
                        <h4 style={{ fontSize: '17px', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--text-primary)' }}>
                          {job.title}
                        </h4>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
                          <span style={{
                            padding: '4px 10px',
                            background: job.status === 'open' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(156, 163, 175, 0.1)',
                            border: `1px solid ${job.status === 'open' ? '#10b981' : '#9ca3af'}`,
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: job.status === 'open' ? '#10b981' : '#9ca3af',
                            textTransform: 'capitalize'
                          }}>
                            {job.status}
                          </span>
                          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                            {job.seniority} level
                          </span>
                          {job.candidates_count > 0 && (
                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                              • {job.candidates_count} candidates
                            </span>
                          )}
                        </div>
                        {job.required_skills && job.required_skills.length > 0 && (
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {job.required_skills.slice(0, 5).map((skill: string, idx: number) => (
                              <span key={idx} style={{
                                padding: '3px 8px',
                                background: 'rgba(245, 158, 11, 0.1)',
                                border: '1px solid rgba(245, 158, 11, 0.2)',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 600,
                                color: '#f59e0b'
                              }}>
                                {skill}
                              </span>
                            ))}
                            {job.required_skills.length > 5 && (
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                +{job.required_skills.length - 5} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          style={{
                            padding: '8px 16px',
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            fontSize: '13px',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                        >
                          View Details
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>


      {/* Fixed Input Area at Bottom */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: '260px', // Account for sidebar width
        right: 0,
        background: 'rgba(var(--bg-card-rgb), 0.95)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid var(--border-color)',
        padding: '24px 48px',
        zIndex: 10,
        boxShadow: '0 -4px 24px rgba(0, 0, 0, 0.04)'
      }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          {/* Build Team Mode - Submit Button */}
          {mode === 'build_team' && !result && !loading && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSubmit}
              disabled={!teamQuery.trim()}
              style={{
                width: '100%',
                padding: '14px 24px',
                background: teamQuery.trim() ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'var(--bg-secondary)',
                border: 'none',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: 600,
                color: teamQuery.trim() ? 'white' : 'var(--text-muted)',
                cursor: teamQuery.trim() ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: teamQuery.trim() ? '0 4px 12px rgba(99, 102, 241, 0.3)' : 'none',
                transition: 'all 0.2s'
              }}
            >
              <Sparkles size={16} />
              Build Team
            </motion.button>
          )}

          {/* Build Team - New Search Button */}
          {mode === 'build_team' && result && !loading && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                setResult(null);
                setTeamQuery('');
              }}
              style={{
                width: '100%',
                padding: '14px 24px',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                border: 'none',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: 600,
                color: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
                transition: 'all 0.2s'
              }}
            >
              <Sparkles size={16} />
              Start New Search
            </motion.button>
          )}

          {/* Salary Mode - Search Button */}
          {mode === 'salary' && !salaryResult && !loading && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={async () => {
                if (!salaryQuery.trim()) return;
                setLoading(true);
                setError('');
                try {
                  // Parse natural language query with AI
                  const response = await fetch(`${API_BASE}/api/v1/parse-salary-query`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                      'Content-Type': 'application/json',
                      'X-API-Key': API_KEY
                    },
                    body: JSON.stringify({ query: salaryQuery })
                  });
                  
                  if (!response.ok) throw new Error('Failed to parse query');
                  
                  const parsed = await response.json();
                  const data = await lookupSalary(
                    parsed.role || 'Software Engineer',
                    parsed.seniority || 'mid',
                    parsed.region || region,
                    parsed.currency || currency
                  );
                  setSalaryResult(data);
                  setSalaryRole(parsed.role);
                  setSalarySeniority(parsed.seniority);
                } catch (err: any) {
                  setError(err.message || 'Failed to lookup salary');
                } finally {
                  setLoading(false);
                }
              }}
              disabled={!salaryQuery.trim()}
              style={{
                width: '100%',
                padding: '14px 24px',
                background: salaryQuery.trim() ? 'linear-gradient(135deg, #06b6d4, #0891b2)' : 'var(--bg-secondary)',
                border: 'none',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: 600,
                color: salaryQuery.trim() ? 'white' : 'var(--text-muted)',
                cursor: salaryQuery.trim() ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: salaryQuery.trim() ? '0 4px 12px rgba(139, 92, 246, 0.3)' : 'none',
                transition: 'all 0.2s'
              }}
            >
              <Sparkles size={16} />
              Analyze Salary
            </motion.button>
          )}

          {/* Find Candidates Mode - Search Button */}
          {mode === 'find_candidates' && candidateResults.length === 0 && !loading && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={async () => {
                if (!searchRole.trim()) return;
                setLoading(true);
                setError('');
                try {
                  // Parse natural language query with AI
                  const response = await fetch(`${API_BASE}/api/v1/parse-candidate-query`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                      'Content-Type': 'application/json',
                      'X-API-Key': API_KEY
                    },
                    body: JSON.stringify({ query: searchRole })
                  });
                  
                  if (!response.ok) throw new Error('Failed to parse query');
                  
                  const parsed = await response.json();
                  const filters: any = {};
                  if (parsed.search) filters.search = parsed.search;
                  if (parsed.skills) filters.skills = parsed.skills;
                  if (parsed.seniority && parsed.seniority !== 'any') filters.seniority = parsed.seniority;
                  
                  const data = await getCandidates(filters);
                  setCandidateResults(data);
                } catch (err: any) {
                  setError(err.message || 'Failed to search candidates');
                } finally {
                  setLoading(false);
                }
              }}
              style={{
                width: '100%',
                padding: '14px 24px',
                background: 'linear-gradient(135deg, #ec4899, #f472b6)',
                border: 'none',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: 600,
                color: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(236, 72, 153, 0.3)',
                transition: 'all 0.2s'
              }}
            >
              <Sparkles size={16} />
              Find Candidates
            </motion.button>
          )}
        </div>
      </div>

      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            style={{
              position: 'fixed',
              bottom: '100px',
              right: '32px',
              background: 'rgba(244, 63, 94, 0.95)',
              color: 'white',
              padding: '16px 20px',
              borderRadius: '12px',
              boxShadow: '0 8px 24px rgba(244, 63, 94, 0.3)',
              maxWidth: '400px',
              zIndex: 1000
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <X size={20} />
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>Error</div>
                <div style={{ fontSize: '13px', opacity: 0.9 }}>{error}</div>
              </div>
              <button
                onClick={() => setError('')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'white',
                  cursor: 'pointer',
                  padding: '4px',
                  marginLeft: 'auto'
                }}
              >
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>


    </div>
  );
}
