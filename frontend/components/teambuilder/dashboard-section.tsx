  'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, Users, Clock, ChevronRight, Plus, Mail, UserCheck, TrendingUp, Briefcase, Target, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const container = { 
  hidden: {}, 
  show: { 
    transition: { staggerChildren: 0.05 } 
  } 
} as const;

const item = { 
  hidden: { opacity: 0, y: 15 }, 
  show: { 
    opacity: 1, 
    y: 0, 
    transition: { 
      type: 'spring' as const, 
      stiffness: 300, 
      damping: 24 
    } 
  } 
} as const;

export default function DashboardSection() {
  const [stats, setStats] = useState<any>(null);
  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [timeRange, setTimeRange] = useState('30');

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(`http://localhost:8001/api/v1/stats?days=${timeRange}`, {
          credentials: 'include',
          headers: { 'X-API-Key': 'your_api_key' }
        });
        const s = await response.json();
        
        const sessionsResponse = await fetch('http://localhost:8001/api/v1/sessions', {
          credentials: 'include',
          headers: { 'X-API-Key': 'your_api_key' }
        });
        const sessions = await sessionsResponse.json();
        
        console.log('Stats from backend:', s);
        setStats(s);
        setRecentSessions(sessions.slice(0, 5));
      } catch (e) {
        setError('Could not connect to backend.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [timeRange]);

  const handleSyncGmail = async () => {
    setSyncing(true);
    setSyncMessage('');
    
    try {
      const response = await fetch('http://localhost:8001/api/v1/gmail/sync-responses', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'X-API-Key': 'your_api_key'
        }
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setSyncMessage(`✅ ${data.message}`);
        const newStatsResponse = await fetch(`http://localhost:8001/api/v1/stats?days=${timeRange}`, {
          credentials: 'include',
          headers: { 'X-API-Key': 'your_api_key' }
        });
        const newStats = await newStatsResponse.json();
        setStats(newStats);
      } else {
        setSyncMessage(`❌ ${data.error || 'Sync failed'}`);
      }
    } catch (error) {
        setSyncMessage('❌ Failed to sync Gmail');
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(''), 5000);
    }
  };

  if (loading) return <div className="loading-overlay"><div className="spinner" /><p>Loading dashboard...</p></div>;

  const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'];
  const GRADIENTS = [
    { id: 'gradient1', start: '#6366f1', end: '#8b5cf6' },
    { id: 'gradient2', start: '#8b5cf6', end: '#ec4899' },
    { id: 'gradient3', start: '#ec4899', end: '#f59e0b' },
    { id: 'gradient4', start: '#f59e0b', end: '#10b981' },
    { id: 'gradient5', start: '#10b981', end: '#06b6d4' },
    { id: 'gradient6', start: '#06b6d4', end: '#6366f1' },
  ];
  
  const seniorityChartData = stats?.seniority_breakdown?.map((item: any, idx: number) => ({
    name: (item.seniority || 'Not specified').charAt(0).toUpperCase() + (item.seniority || 'Not specified').slice(1),
    value: item.count,
    color: COLORS[idx % COLORS.length]
  })) || [];

  const skillsChartData = stats?.skills_breakdown?.slice(0, 8).map((item: any) => ({
    skill: item.skill.charAt(0).toUpperCase() + item.skill.slice(1),
    count: item.count
  })) || [];

  const hasData = stats && stats.total_candidates > 0;

  const timeRangeOptions = [
    { value: '7', label: 'Last 7 days' },
    { value: '30', label: 'Last 30 days' },
    { value: '90', label: 'Last 90 days' },
    { value: 'all', label: 'All time' },
  ];

  return (
    <div style={{ maxWidth: '100%', paddingBottom: '40px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text-primary)', margin: '0 0 8px 0' }}>Overview</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px', margin: 0 }}>Monitor your AI recruitment agent and team building activity.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {/* Time Range Filter */}
          <div style={{ position: 'relative' }}>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              style={{
                padding: '10px 36px 10px 14px',
                fontSize: '14px',
                fontWeight: 500,
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                appearance: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s',
                minWidth: '140px'
              }}
              onMouseEnter={(e) => (e.target as HTMLSelectElement).style.borderColor = 'var(--text-secondary)'}
              onMouseLeave={(e) => (e.target as HTMLSelectElement).style.borderColor = 'var(--border-color)'}
            >
              {timeRangeOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <div style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
              color: 'var(--text-secondary)'
            }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
          
          <button 
            onClick={handleSyncGmail}
            disabled={syncing}
            className="btn btn-secondary"
            style={{ 
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', 
              borderRadius: '8px', fontSize: '14px', fontWeight: 500
            }}
          >
            <RefreshCw size={16} className={syncing ? 'spinning' : ''} />
            {syncing ? 'Syncing...' : 'Sync Gmail'}
          </button>
          <Link href="/" className="btn" style={{ 
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', color: 'white', 
            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', 
            borderRadius: '8px', fontSize: '14px', fontWeight: 500, border: 'none',
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
          }}>
            <Plus size={16} /> New Team
          </Link>
        </div>
      </div>

      {syncMessage && (
        <div style={{ 
          padding: '14px 16px', 
          background: syncMessage.startsWith('✅') ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)', 
          border: `1px solid ${syncMessage.startsWith('✅') ? 'rgba(16,185,129,0.2)' : 'rgba(244,63,94,0.2)'}`, 
          borderRadius: '8px', 
          color: syncMessage.startsWith('✅') ? '#10b981' : '#f43f5e', 
          fontSize: '14px', 
          marginBottom: '24px' 
        }}>
          {syncMessage}
        </div>
      )}

      {error && (
        <div style={{ padding: '14px 16px', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: '8px', color: '#f43f5e', fontSize: '14px', marginBottom: '24px' }}>
          ⚠ {error}
        </div>
      )}

      {/* Key Metrics Cards */}
      {stats && (
        <motion.div variants={container} initial="hidden" animate="show" 
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '32px' }}>
          
          {[
            { label: 'Total Candidates', value: stats.total_candidates || 0, icon: Users, gradient: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', change: stats.recent_candidates_30d > 0 ? `+${stats.recent_candidates_30d} this month` : null },
            { label: 'Teams Built', value: stats.total_sessions || 0, icon: Search, gradient: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)', change: stats.recent_sessions_30d > 0 ? `+${stats.recent_sessions_30d} this month` : null },
            { label: 'Invitations Sent', value: stats.total_invitations || 0, icon: Mail, gradient: 'linear-gradient(135deg, #ec4899 0%, #f59e0b 100%)', change: stats.pending_invitations > 0 ? `${stats.pending_invitations} pending` : null },
            { label: 'Interested', value: stats.interested_candidates || 0, icon: UserCheck, gradient: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)', change: stats.total_invitations > 0 ? `${((stats.interested_candidates / stats.total_invitations) * 100).toFixed(0)}% rate` : null }
          ].map((stat, i: number) => (
            <motion.div key={i} variants={item} style={{ 
              background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', 
              padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px',
              boxShadow: 'var(--shadow-sm)', position: 'relative', overflow: 'hidden'
            }}>
              <div style={{ position: 'absolute', top: 0, right: 0, width: '120px', height: '120px', background: stat.gradient, opacity: 0.05, borderRadius: '50%', transform: 'translate(30%, -30%)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>{stat.label}</span>
                <div style={{ 
                  width: '40px', height: '40px', borderRadius: '12px', 
                  background: stat.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                }}>
                  <stat.icon size={20} style={{ color: 'white' }} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: '36px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '-0.02em', marginBottom: '8px' }}>
                  {stat.value}
                </div>
                {stat.change && (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <TrendingUp size={12} />
                    {stat.change}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {(stats && seniorityChartData.length > 0 && skillsChartData.length > 0) ? (
        /* Charts for users with data */
        <>
          <div className="chart-grid-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
            
            {/* Seniority Distribution - Donut Chart with Gradients */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              style={{ 
                background: 'var(--bg-card)', 
                border: '1px solid var(--border-color)', 
                borderRadius: '16px', 
                padding: '28px', 
                boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              {/* Decorative gradient background */}
              <div style={{
                position: 'absolute',
                top: '-50%',
                right: '-20%',
                width: '200px',
                height: '200px',
                background: 'radial-gradient(circle, rgba(99, 102, 241, 0.1) 0%, transparent 70%)',
                borderRadius: '50%',
                pointerEvents: 'none'
              }} />
              
              <h3 style={{ fontSize: '17px', fontWeight: 600, margin: '0 0 24px 0', color: 'var(--text-primary)', position: 'relative' }}>
                Candidates by Seniority
              </h3>
              {seniorityChartData.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '32px', position: 'relative', minHeight: '260px' }}>
                  <div style={{ width: '100%', height: '260px', minWidth: '200px', position: 'relative' }}>
                    <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={260}>
                      <PieChart>
                        <defs>
                          {GRADIENTS.map((grad: any) => (
                            <linearGradient key={grad.id} id={grad.id} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={grad.start} stopOpacity={1} />
                              <stop offset="100%" stopColor={grad.end} stopOpacity={0.8} />
                            </linearGradient>
                          ))}
                        </defs>
                        <Pie
                          data={seniorityChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={70}
                          outerRadius={100}
                          paddingAngle={3}
                          dataKey="value"
                          animationBegin={0}
                          animationDuration={800}
                        >
                          {seniorityChartData.map((_, index: number) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={`url(#${GRADIENTS[index % GRADIENTS.length].id})`}
                              style={{
                                filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.15))',
                                cursor: 'pointer'
                              }}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            borderRadius: '12px',
                            border: 'none',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                            background: 'var(--bg-card)',
                            fontSize: '13px',
                            padding: '12px 16px'
                          }}
                          itemStyle={{ color: 'var(--text-primary)', fontWeight: 500 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Center text */}
                    <div style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      textAlign: 'center',
                      pointerEvents: 'none'
                    }}>
                      <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>
                        {stats.total_candidates}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Total
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '14px', justifyContent: 'center', width: '100%' }}>
                    {seniorityChartData.map((item: any, idx: number) => {
                      const percentage = ((item.value / stats.total_candidates) * 100).toFixed(0);
                      const gradient = GRADIENTS[idx % GRADIENTS.length];
                      return (
                        <motion.div 
                          key={idx} 
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.1 + idx * 0.05 }}
                          style={{ display: 'flex', alignItems: 'center', gap: '12px' }}
                        >
                          <div style={{ 
                            width: '14px', 
                            height: '14px', 
                            borderRadius: '4px', 
                            background: `linear-gradient(135deg, ${gradient.start}, ${gradient.end})`,
                            flexShrink: 0,
                            boxShadow: `0 2px 8px ${gradient.start}40`
                          }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                              {item.name}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                              {item.value} candidates ({percentage}%)
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-secondary)', fontSize: '14px' }}>
                  No seniority data yet
                </div>
              )}
            </motion.div>

            {/* Recruitment Metrics - Simple Progress Bars */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              style={{ 
                background: 'var(--bg-card)', 
                border: '1px solid var(--border-color)', 
                borderRadius: '16px', 
                padding: '28px', 
                boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              {/* Decorative gradient background */}
              <div style={{
                position: 'absolute',
                bottom: '-50%',
                left: '-20%',
                width: '200px',
                height: '200px',
                background: 'radial-gradient(circle, rgba(139, 92, 246, 0.1) 0%, transparent 70%)',
                borderRadius: '50%',
                pointerEvents: 'none'
              }} />
              
              <h3 style={{ fontSize: '17px', fontWeight: 600, margin: '0 0 24px 0', color: 'var(--text-primary)', position: 'relative' }}>
                Recruitment Metrics
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative' }}>
                {/* Interest Rate */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Interest Rate</span>
                    <span style={{ fontSize: '18px', fontWeight: 700, color: '#10b981' }}>
                      {stats?.total_invitations > 0 
                        ? `${Math.round((stats.interested_candidates / stats.total_invitations) * 100)}%`
                        : '0%'
                      }
                    </span>
                  </div>
                  <div style={{ 
                    width: '100%', 
                    height: '8px', 
                    background: 'var(--bg-secondary)', 
                    borderRadius: '4px',
                    overflow: 'hidden'
                  }}>
                    <div style={{ 
                      width: `${stats?.total_invitations > 0 ? Math.round((stats.interested_candidates / stats.total_invitations) * 100) : 0}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #10b981 0%, #06b6d4 100%)',
                      borderRadius: '4px',
                      transition: 'width 0.6s ease'
                    }} />
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                    {stats.interested_candidates} of {stats.total_invitations} invited candidates showed interest
                  </p>
                </div>

                {/* Response Rate */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Response Rate</span>
                    <span style={{ fontSize: '18px', fontWeight: 700, color: '#6366f1' }}>
                      {stats?.total_invitations > 0 
                        ? `${Math.round(((stats.total_invitations - stats.pending_invitations) / stats.total_invitations) * 100)}%`
                        : '0%'
                      }
                    </span>
                  </div>
                  <div style={{ 
                    width: '100%', 
                    height: '8px', 
                    background: 'var(--bg-secondary)', 
                    borderRadius: '4px',
                    overflow: 'hidden'
                  }}>
                    <div style={{ 
                      width: `${stats?.total_invitations > 0 ? Math.round(((stats.total_invitations - stats.pending_invitations) / stats.total_invitations) * 100) : 0}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #6366f1 0%, #8b5cf6 100%)',
                      borderRadius: '4px',
                      transition: 'width 0.6s ease'
                    }} />
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                    {stats.total_invitations - stats.pending_invitations} of {stats.total_invitations} responded (pending: {stats.pending_invitations})
                  </p>
                </div>

                {/* Pool Growth */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Pool Growth (30d)</span>
                    <span style={{ fontSize: '18px', fontWeight: 700, color: '#ec4899' }}>
                      +{stats.recent_candidates_30d}
                    </span>
                  </div>
                  <div style={{ 
                    width: '100%', 
                    height: '8px', 
                    background: 'var(--bg-secondary)', 
                    borderRadius: '4px',
                    overflow: 'hidden'
                  }}>
                    <div style={{ 
                      width: `${Math.min(100, Math.max(5, (stats.recent_candidates_30d / 20) * 100))}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #ec4899 0%, #f59e0b 100%)',
                      borderRadius: '4px',
                      transition: 'width 0.6s ease'
                    }} />
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                    New candidates added (target: 20/month for full bar)
                  </p>
                </div>

                {/* Average Response Time */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Avg Response Time</span>
                    <span style={{ fontSize: '18px', fontWeight: 700, color: '#8b5cf6' }}>
                      {stats.avg_response_days !== undefined && stats.avg_response_days !== null
                        ? `${stats.avg_response_days}d`
                        : '—'
                      }
                    </span>
                  </div>
                  <div style={{ 
                    width: '100%', 
                    height: '8px', 
                    background: 'var(--bg-secondary)', 
                    borderRadius: '4px',
                    overflow: 'hidden'
                  }}>
                    <div style={{ 
                      width: `${stats.avg_response_days !== undefined && stats.avg_response_days !== null ? Math.min(100, Math.max(5, 100 - (stats.avg_response_days / 7 * 100))) : 0}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #8b5cf6 0%, #6366f1 100%)',
                      borderRadius: '4px',
                      transition: 'width 0.6s ease'
                    }} />
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                    {stats.avg_response_days !== undefined && stats.avg_response_days !== null
                      ? `Average time for candidates to respond`
                      : 'Waiting for first response'
                    }
                  </p>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Top Skills - Horizontal Bar Chart with Multiple Gradients */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            style={{ 
              background: 'var(--bg-card)', 
              border: '1px solid var(--border-color)', 
              borderRadius: '16px', 
              padding: '28px', 
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)', 
              marginBottom: '32px',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            {/* Decorative gradient backgrounds */}
            <div style={{
              position: 'absolute',
              top: '20%',
              right: '-10%',
              width: '300px',
              height: '300px',
              background: 'radial-gradient(circle, rgba(236, 72, 153, 0.08) 0%, transparent 70%)',
              borderRadius: '50%',
              pointerEvents: 'none'
            }} />
            <div style={{
              position: 'absolute',
              bottom: '20%',
              left: '-10%',
              width: '250px',
              height: '250px',
              background: 'radial-gradient(circle, rgba(16, 185, 129, 0.08) 0%, transparent 70%)',
              borderRadius: '50%',
              pointerEvents: 'none'
            }} />
            
            <h3 style={{ fontSize: '17px', fontWeight: 600, margin: '0 0 24px 0', color: 'var(--text-primary)', position: 'relative' }}>
              Top Skills in Candidate Pool
            </h3>
            {skillsChartData.length > 0 ? (
              <div style={{ height: `${Math.max(320, skillsChartData.length * 50)}px`, minWidth: '300px', position: 'relative' }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={300} minHeight={320}>
                  <BarChart 
                    data={skillsChartData} 
                    layout="vertical" 
                    margin={{ top: 5, right: 40, left: 20, bottom: 5 }}
                    barSize={24}
                  >
                    <defs>
                      {skillsChartData.map((_, idx: number) => {
                        const gradient = GRADIENTS[idx % GRADIENTS.length];
                        return (
                          <linearGradient key={`skillGrad${idx}`} id={`skillGrad${idx}`} x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor={gradient.start} stopOpacity={0.9} />
                            <stop offset="100%" stopColor={gradient.end} stopOpacity={0.7} />
                          </linearGradient>
                        );
                      })}
                    </defs>
                    <CartesianGrid 
                      strokeDasharray="3 3" 
                      horizontal={false} 
                      stroke="var(--border-color)" 
                      strokeOpacity={0.3}
                    />
                    <XAxis 
                      type="number"
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 12, fill: 'var(--text-secondary)', fontWeight: 500 }}
                    />
                    <YAxis 
                      type="category"
                      dataKey="skill" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 13, fill: 'var(--text-primary)', fontWeight: 600 }} 
                      width={130}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '12px',
                        border: 'none',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                        background: 'var(--bg-card)',
                        fontSize: '13px',
                        padding: '12px 16px'
                      }}
                      itemStyle={{ color: 'var(--text-primary)', fontWeight: 500 }}
                      cursor={{ fill: 'rgba(99,102,241,0.05)', radius: 8 }}
                      labelStyle={{ fontWeight: 600, marginBottom: '4px' }}
                    />
                    {skillsChartData.map((_, index: number) => (
                      <Bar 
                        key={`bar-${index}`}
                        dataKey="count" 
                        fill={`url(#skillGrad${index})`}
                        radius={[0, 10, 10, 0]}
                        animationBegin={index * 100}
                        animationDuration={800}
                        style={{
                          filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.1))'
                        }}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-secondary)', fontSize: '14px' }}>
                No skills data yet
              </div>
            )}
          </motion.div>
        </>
      ) : null}

      {/* Recent AI Activity */}
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>Recent AI Activity</h3>
          <Link href="/" style={{ fontSize: '13px', color: 'var(--text-secondary)', textDecoration: 'none', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px', transition: 'color 0.2s' }}>
            View All <ChevronRight size={14} />
          </Link>
        </div>
        
        {recentSessions.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <Clock size={24} style={{ color: 'var(--text-muted)', margin: '0 auto 12px' }} />
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>No searches yet.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {recentSessions.map((s: any, idx: number) => (
              <Link href="/" key={s.id} style={{ 
                textDecoration: 'none', color: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '16px 24px', borderBottom: idx !== recentSessions.length - 1 ? '1px solid var(--border-color)' : 'none',
                transition: 'background 0.15s'
              }}>
                <div style={{ flex: 1, minWidth: 0, paddingRight: '16px' }}>
                  <p style={{ fontSize: '14px', fontWeight: 500, margin: '0 0 4px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-primary)' }}>
                    {s.raw_input}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <span>{new Date(s.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'var(--border-color)' }} />
                    <span>{s.region}</span>
                  </div>
                </div>
                {s.full_result?.recommended_team?.length > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: 'var(--bg-secondary)', borderRadius: '6px', fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>
                    <Users size={12} /> {s.full_result.recommended_team.length}
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>—</div>
                )}
              </Link>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
