'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History as HistoryIcon, Trash2, Clock, MapPin, Users, ExternalLink, ChevronDown, ChevronUp, Loader2, Filter, Search, FileText, Send, Mail, Globe2 } from 'lucide-react';

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

async function getSessions() {
  return apiFetch('/api/v1/sessions');
}

async function deleteSession(sessionId: string) {
  return apiFetch(`/api/v1/sessions/${sessionId}`, {
    method: 'DELETE',
  });
}

export default function HistorySection() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  
  // Candidate detail modal
  const [candidateDetailModal, setCandidateDetailModal] = useState<boolean>(false);
  const [selectedCandidate, setSelectedCandidate] = useState<any>(null);
  const [selectedRole, setSelectedRole] = useState<any>(null);
  const [loadingCandidate, setLoadingCandidate] = useState<boolean>(false);
  
  // Invite modal
  const [inviteModal, setInviteModal] = useState<boolean>(false);
  const [inviteData, setInviteData] = useState<any>({
    email: '',
    role_title: '',
    salary_range: '',
    custom_message: ''
  });

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const data = await getSessions();
      setSessions(data);
    } catch (err) {
      setError('Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Supprimer cet historique de recherche?')) return;
    try {
      await deleteSession(id);
      setSessions(sessions.filter((s: any) => s.id !== id));
    } catch (err) {
      alert('Échec de la suppression de la session');
    }
  };

  const handleViewCandidate = async (candidate: any, role: any) => {
    setSelectedRole(role);
    setLoadingCandidate(true);
    setCandidateDetailModal(true);
    
    console.log('Viewing candidate:', candidate);
    
    // Extract ID from profile_url if it exists
    let candidateId = candidate.id;
    if (!candidateId && candidate.profile_url) {
      // Extract ID from URL like "/hr/candidates/da13f6db-9407-436e-bf56-ea5627889fa3"
      const match = candidate.profile_url.match(/\/([a-f0-9-]+)$/);
      if (match) {
        candidateId = match[1];
      }
    }
    
    // If it's an internal_db candidate, fetch full details
    if (candidate.source === 'internal_db' && candidateId) {
      try {
        const response = await fetch(`${API_BASE}/api/v1/hr/candidates/${candidateId}`, {
          credentials: 'include',
          headers: { 'X-API-Key': API_KEY }
        });
        if (response.ok) {
          const fullCandidate = await response.json();
          console.log('Full candidate data:', fullCandidate);
          // Preserve the match score from the search result
          // Score might be decimal (0.43) or percentage (43), normalize it
          const score = candidate.score > 1 ? candidate.score : candidate.score * 100;
          setSelectedCandidate({ ...fullCandidate, score: score });
        } else {
          console.error('Failed to fetch candidate:', response.status);
          setSelectedCandidate(candidate);
        }
      } catch (error) {
        console.error('Error fetching candidate details:', error);
        setSelectedCandidate(candidate);
      }
    } else {
      // For external candidates, normalize score too
      const score = candidate.score > 1 ? candidate.score : candidate.score * 100;
      setSelectedCandidate({ ...candidate, score: score });
    }
    
    setLoadingCandidate(false);
  };

  const handleInviteCandidate = (candidate: any, role: any) => {
    setSelectedCandidate(candidate);
    setSelectedRole(role);
    setInviteData({
      email: candidate.email || '',
      role_title: role?.role || '',
      salary_range: role?.estimated_salary || '',
      custom_message: `We are excited to invite you to apply for the ${role?.role || 'position'} at our company. Based on your profile, we believe you would be a great fit for this role.`
    });
    setInviteModal(true);
  };

  const handleSendInvite = async () => {
    if (!inviteData.email || !inviteData.role_title) return;

    try {
      const response = await fetch(`${API_BASE}/api/v1/hr/invite-candidate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY,
        },
        credentials: 'include',
        body: JSON.stringify({
          candidate_id: selectedCandidate.id || 'unknown',
          email: inviteData.email,
          role_title: inviteData.role_title,
          salary_range: inviteData.salary_range,
          custom_message: inviteData.custom_message
        })
      });

      if (response.ok) {
        alert(`✅ Invitation sent successfully to ${inviteData.email}!`);
        setInviteModal(false);
        setInviteData({ email: '', role_title: '', salary_range: '', custom_message: '' });
      } else {
        const error = await response.json();
        alert(`❌ Error: ${error.error || 'Failed to send invitation'}`);
      }
    } catch (err: any) {
      alert(`❌ Network Error: ${err.message}`);
    }
  };

  const regions = useMemo(() => {
    const r = new Set(sessions.map((s: any) => s.region));
    return ['all', ...r];
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s: any) => {
      const matchesQuery = !searchQuery || s.raw_input.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRegion = regionFilter === 'all' || s.region === regionFilter;
      return matchesQuery && matchesRegion;
    });
  }, [sessions, searchQuery, regionFilter]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '100px 0' }}>
        <Loader2 className="animate-spin" size={32} style={{ color: 'var(--accent-primary)' }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border bg-gradient-to-r from-amber-50/40 via-orange-50/20 to-transparent">
        <div className="flex items-center gap-4">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-14 h-14 rounded-[20px] bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/25"
          >
            <HistoryIcon className="w-7 h-7 text-white" />
          </motion.div>
          <div>
            <h2 className="text-xl font-black uppercase tracking-wider text-slate-800">Historique</h2>
            <p className="text-xs font-bold text-slate-500 tracking-wider">RECHERCHES PASSÉES DE CONSTITUTION D'ÉQUIPE</p>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-full mx-auto">

      {error && <p className="text-red-600">{error}</p>}

      {/* Filters Bar */}
      {sessions.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }} 
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/60 backdrop-blur-xl border border-white rounded-[20px] p-4 mb-6 flex gap-4 items-center flex-wrap shadow-[0_4px_20px_rgb(0,0,0,0.03)]"
        >
          <div className="flex items-center gap-2 flex-1 min-w-[200px] bg-secondary/50 rounded-xl px-3">
            <Search size={16} className="text-muted-foreground flex-shrink-0" />
            <input
              type="text"
              placeholder="Rechercher les requêtes passées..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="border-none bg-transparent outline-none py-2.5 text-sm text-foreground w-full"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-muted-foreground" />
            <select
              value={regionFilter}
              onChange={e => setRegionFilter(e.target.value)}
              className="px-3 py-2 text-sm min-w-[120px] bg-secondary/50 border-none rounded-xl text-foreground"
            >
              {regions.map((r: string) => (
                <option key={r} value={r}>{r === 'all' ? 'Toutes les régions' : r}</option>
              ))}
            </select>
          </div>
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {filteredSessions.length} sur {sessions.length} résultats
          </span>
        </motion.div>
      )}

      {/* Empty State */}
      {sessions.length === 0 && !error && (
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          className="bg-white/60 backdrop-blur-xl border border-white rounded-[24px] text-center p-16 flex flex-col items-center shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
        >
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '72px', height: '72px', borderRadius: '50%', background: 'var(--bg-secondary)', marginBottom: '24px' }}>
            <HistoryIcon size={32} style={{ color: 'var(--accent-primary)' }} />
          </div>
          <h3 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>Aucun historique de recherche trouvé</h3>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '420px', margin: '0 auto', lineHeight: '1.6' }}>
            Vos recherches de constitution d'équipe et insights apparaîtront ici pour une récupération facile.
          </p>
        </motion.div>
      )}

      {/* Sessions List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filteredSessions.map((session) => {
          const isExpanded = expandedId === session.id;
          const result = session.full_result;
          const teamsCount = result?.recommended_team?.length || 0;

          return (
            <motion.div key={session.id} className="card" style={{ padding: '0', overflow: 'hidden' }}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>

              <div
                style={{ cursor: 'pointer', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onClick={() => setExpandedId(isExpanded ? null : session.id)}
              >
                <div style={{ flex: 1, paddingRight: '24px', minWidth: 0 }}>
                  <h3 style={{ fontSize: '15px', lineHeight: '1.5', margin: '0 0 6px 0', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {session.raw_input}
                  </h3>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={12} /> {new Date(session.created_at).toLocaleDateString()}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={12} /> {session.region}</span>
                    {teamsCount > 0 && <span className="badge badge-purple" style={{ fontSize: '11px', padding: '2px 8px' }}><Users size={10} style={{ marginRight: '3px' }}/> {teamsCount} roles</span>}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                  <button onClick={(e) => handleDelete(session.id, e)} className="btn btn-secondary btn-sm" style={{ padding: '6px', color: 'var(--accent-rose)', background: 'transparent', border: 'none', boxShadow: 'none' }}>
                    <Trash2 size={16} />
                  </button>
                  <div style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', background: 'var(--bg-secondary)' }}>
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>
              </div>

              <AnimatePresence>
                {isExpanded && result && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    style={{ borderTop: '1px solid var(--border-color)' }}
                  >
                    <div style={{ padding: '24px' }}>
                      {/* AI Analysis */}
                      {result.chat_response && (
                        <div style={{ marginBottom: '24px', padding: '20px', backgroundColor: 'var(--bg-secondary)', borderRadius: '12px' }}>
                          <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-primary)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI Analysis</h4>
                          <p style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--text-primary)', margin: 0, whiteSpace: 'pre-wrap' }}>{result.chat_response}</p>
                        </div>
                      )}

                      {/* Team Members Grid */}
                      {result.recommended_team && result.recommended_team.length > 0 && (
                        <div>
                          <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Recommended Team ({result.recommended_team.length} roles)
                          </h4>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                            {result.recommended_team.map((member, i) => (
                              <div key={i} style={{ padding: '20px', backgroundColor: 'var(--bg-secondary)', borderRadius: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                  <div>
                                    <h5 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 4px 0' }}>{member.role}</h5>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{member.seniority} · {member.type}</span>
                                  </div>
                                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent-primary)' }}>{member.estimated_salary}</span>
                                </div>

                                {/* Candidates for this role */}
                                {member.top_candidates && member.top_candidates.length > 0 && (
                                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '4px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                      Candidates ({member.top_candidates.length})
                                    </span>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                                      {member.top_candidates.map((c, j) => (
                                        <div key={j} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--bg-primary)', borderRadius: '8px', fontSize: '13px' }}>
                                          <div style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{ fontWeight: 500 }}>{c.name}</span>
                                            <div style={{ display: 'flex', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
                                              <span className="badge badge-blue" style={{ fontSize: '10px', padding: '1px 6px' }}>{c.source}</span>
                                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                {c.score > 1 ? Math.round(c.score) : Math.round(c.score * 100)}%
                                              </span>
                                              {c.email && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{c.email}</span>}
                                            </div>
                                          </div>
                                          <div style={{ display: 'flex', gap: '4px', flexShrink: 0, marginLeft: '8px' }}>
                                            <button
                                              onClick={() => handleViewCandidate(c, member)}
                                              style={{
                                                padding: '4px 6px',
                                                background: 'var(--bg-secondary)',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                color: 'var(--text-primary)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                transition: 'all 0.2s'
                                              }}
                                              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                                              onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
                                              title="Voir le CV"
                                            >
                                              <FileText size={12} />
                                            </button>
                                            <button
                                              onClick={() => handleInviteCandidate(c, member)}
                                              style={{
                                                padding: '4px 6px',
                                                background: 'var(--accent-primary)',
                                                border: 'none',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                color: 'white',
                                                display: 'flex',
                                                alignItems: 'center',
                                                transition: 'all 0.2s'
                                              }}
                                              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                                              onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                                              title="Envoyer une invitation"
                                            >
                                              <Send size={12} />
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

            </motion.div>
          );
        })}
      </div>

      {/* Candidate Detail Modal */}
      {candidateDetailModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }} onClick={() => setCandidateDetailModal(false)}>
          <div className="card" style={{ maxWidth: '700px', width: '90%', padding: '32px', maxHeight: '80vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            {loadingCandidate ? (
              <div style={{ textAlign: 'center', padding: '48px' }}>
                <div className="spinner" style={{ margin: '0 auto 16px' }} />
                <p style={{ color: 'var(--text-secondary)' }}>Chargement des détails du candidat...</p>
              </div>
            ) : selectedCandidate && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '24px' }}>
                  <div>
                    <h2 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {selectedCandidate.name}
                    </h2>
                    {selectedCandidate.email && (
                      <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 4px 0' }}>
                        {selectedCandidate.email}
                      </p>
                    )}
                    {selectedCandidate.phone && (
                      <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>
                        {selectedCandidate.phone}
                      </p>
                    )}
                  </div>
                  <span className="badge badge-blue" style={{ fontSize: '13px', padding: '6px 12px' }}>
                    {selectedCandidate.source}
                  </span>
                </div>

                {selectedCandidate.score > 0 && (
                  <div style={{ 
                    padding: '12px 16px', 
                    background: 'rgba(16, 185, 129, 0.1)', 
                    border: '1px solid rgba(16, 185, 129, 0.2)',
                    borderRadius: '8px',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent-emerald)' }}>
                      Match Score: {Math.round(selectedCandidate.score)}%
                    </span>
                  </div>
                )}

                {selectedCandidate.skills && selectedCandidate.skills.length > 0 && (
                  <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-secondary)' }}>
                      Compétences
                    </h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {selectedCandidate.skills.map((skill, idx) => (
                        <span key={idx} style={{
                          padding: '6px 12px',
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '12px',
                          fontSize: '13px',
                          fontWeight: 500
                        }}>
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedCandidate.seniority && (
                  <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-secondary)' }}>
                      Seniority Level
                    </h3>
                    <span style={{
                      padding: '6px 12px',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '12px',
                      fontSize: '13px',
                      fontWeight: 500,
                      textTransform: 'capitalize'
                    }}>
                      {selectedCandidate.seniority}
                    </span>
                  </div>
                )}

                {selectedCandidate.experience_years && (
                  <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-secondary)' }}>
                      Expérience
                    </h3>
                    <p style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                      {selectedCandidate.experience_years} ans
                    </p>
                  </div>
                )}

                {selectedCandidate.education && (
                  <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-secondary)' }}>
                      Formation
                    </h3>
                    <p style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                      {selectedCandidate.education}
                    </p>
                  </div>
                )}

                {selectedCandidate.cv_file_path && (
                  <div style={{ marginBottom: '20px' }}>
                    <a 
                      href={`http://localhost:8001/media/${selectedCandidate.cv_file_path}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}
                    >
                      <FileText size={16} />
                      Voir/Télécharger le CV original
                    </a>
                  </div>
                )}

                {selectedCandidate.experience && !selectedCandidate.cv_text && (
                  <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-secondary)' }}>
                      Experience
                    </h3>
                    <p style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                      {selectedCandidate.experience}
                    </p>
                  </div>
                )}

                {selectedCandidate.summary && (
                  <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-secondary)' }}>
                      Summary
                    </h3>
                    <p style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                      {selectedCandidate.summary}
                    </p>
                  </div>
                )}

                {selectedCandidate.profile_url && selectedCandidate.source !== 'internal_db' && (
                  <div style={{ marginBottom: '20px' }}>
                    <a 
                      href={selectedCandidate.profile_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="btn btn-secondary"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}
                    >
                      <Globe2 size={16} />
                      Voir le profil externe
                    </a>
                  </div>
                )}

                {selectedCandidate.source === 'internal_db' && (selectedCandidate.id || selectedCandidate.profile_url) && (
                  <div style={{ marginBottom: '20px' }}>
                    <a 
                      href={selectedCandidate.id ? `/candidates/${selectedCandidate.id}` : selectedCandidate.profile_url?.replace('/hr', '')}
                      className="btn btn-secondary"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}
                    >
                      <FileText size={16} />
                      Voir la page de profil complète
                    </a>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '20px', borderTop: '1px solid var(--border-color)' }}>
                  <button className="btn btn-secondary" onClick={() => setCandidateDetailModal(false)} style={{ padding: '10px 20px' }}>
                    Fermer
                  </button>
                  <button 
                    className="btn btn-primary" 
                    onClick={() => {
                      setCandidateDetailModal(false);
                      handleInviteCandidate(selectedCandidate, selectedRole);
                    }} 
                    style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <Send size={16} />
                    Send Invitation
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {inviteModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }} onClick={() => setInviteModal(false)}>
          <div className="card" style={{ maxWidth: '500px', width: '90%', padding: '32px', maxHeight: '80vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 24px 0', fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Mail size={20} /> Invite {selectedCandidate?.name}
            </h2>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                Candidate Email *
              </label>
              <input
                type="email"
                placeholder="e.g., candidate@email.com"
                value={inviteData.email}
                onChange={(e) => setInviteData({ ...inviteData, email: e.target.value })}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '14px' }}
              />
            </div>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                Job Title *
              </label>
              <input
                type="text"
                placeholder="e.g., Backend Engineer"
                value={inviteData.role_title}
                onChange={(e) => setInviteData({ ...inviteData, role_title: e.target.value })}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '14px' }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                Salary Range
              </label>
              <input
                type="text"
                placeholder="e.g., 45,000-62,000 TND/year"
                value={inviteData.salary_range}
                onChange={(e) => setInviteData({ ...inviteData, salary_range: e.target.value })}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '14px' }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                Custom Message (optional)
              </label>
              <textarea
                placeholder="e.g., We were impressed by your experience..."
                value={inviteData.custom_message}
                onChange={(e) => setInviteData({ ...inviteData, custom_message: e.target.value })}
                rows={4}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '14px', fontFamily: 'inherit', resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setInviteModal(false)} style={{ padding: '10px 20px' }}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSendInvite} disabled={!inviteData.email || !inviteData.role_title} style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Send size={16} />
                Send Invitation
              </button>
            </div>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
