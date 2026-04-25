'use client';

import { useState, useEffect } from 'react';
import { Mail, Phone, Send, Trash2, Filter, Users, Loader2 } from 'lucide-react';
import SearchBar from './search-bar';

export default function CandidatesSection() {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filters, setFilters] = useState<any>({
    seniority: '',
    availability: '',
    skills: ''
  });
  const [selectedCandidate, setSelectedCandidate] = useState<any>(null);
  const [inviteModal, setInviteModal] = useState<boolean>(false);
  const [inviteData, setInviteData] = useState<any>({
    email: '',
    role_title: '',
    salary_range: '',
    custom_message: ''
  });

  useEffect(() => {
    fetchCandidates();
  }, [filters]);

  const fetchCandidates = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.seniority) params.append('seniority', filters.seniority);
      if (filters.availability) params.append('availability', filters.availability);
      if (filters.skills) params.append('skills', filters.skills);

      const response = await fetch(
        `http://localhost:8001/api/v1/hr/candidates?${params}`,
        {
          headers: { 'X-API-Key': 'your_api_key' },
          credentials: 'include'
        }
      );
      const data = await response.json();
      // Backend returns array directly, not wrapped in object
      setCandidates(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching candidates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async () => {
    if (!selectedCandidate || !inviteData.role_title) return;

    try {
      const response = await fetch('http://localhost:8001/api/v1/hr/invite-candidate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'your_api_key'
        },
        credentials: 'include',
        body: JSON.stringify({
          candidate_id: selectedCandidate.id,
          email: inviteData.email || selectedCandidate.email,  // Use edited email or default
          role_title: inviteData.role_title,
          salary_range: inviteData.salary_range,
          custom_message: inviteData.custom_message
        })
      });

      if (response.ok) {
        alert('✅ Invitation envoyée avec succès!');
        setInviteModal(false);
        setInviteData({ email: '', role_title: '', salary_range: '', custom_message: '' });
        fetchCandidates();
      }
    } catch (error) {
      alert('❌ Erreur lors de l\'envoi de l\'invitation');
    }
  };

  const handleDelete = async (candidateId) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce candidat?')) return;

    try {
      const response = await fetch(
        `http://localhost:8001/api/v1/hr/candidates/${candidateId}/delete`,
        {
          method: 'DELETE',
          headers: { 'X-API-Key': 'your_api_key' },
          credentials: 'include'
        }
      );

      if (response.ok) {
        alert('✅ Candidat supprimé');
        fetchCandidates();
      }
    } catch (error) {
      alert('❌ Erreur lors de la suppression');
    }
  };

  const getSeniorityColor = (seniority) => {
    const colors = {
      junior: { bg: 'rgba(33, 150, 243, 0.1)', text: '#2196F3' },
      mid: { bg: 'rgba(156, 39, 176, 0.1)', text: '#9C27B0' },
      senior: { bg: 'rgba(255, 152, 0, 0.1)', text: '#FF9800' },
      lead: { bg: 'rgba(233, 30, 99, 0.1)', text: '#E91E63' }
    };
    return colors[seniority] || colors.mid;
  };

  // Filter candidates by search query
  const filteredCandidates = candidates.filter((candidate: any) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      candidate.name.toLowerCase().includes(query) ||
      candidate.email?.toLowerCase().includes(query) ||
      candidate.phone?.toLowerCase().includes(query) ||
      candidate.seniority?.toLowerCase().includes(query) ||
      candidate.skills?.some((skill: string) => skill.toLowerCase().includes(query))
    );
  });

  return (
    <div style={{ maxWidth: '100%', paddingBottom: '40px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text-primary)', margin: '0 0 8px 0' }}>
            Candidate Pool
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px', margin: 0 }}>
            {candidates.length} candidates available in your pool
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <Users size={18} style={{ color: 'var(--text-secondary)' }} />
          <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{candidates.length}</span>
        </div>
      </div>

      {/* Search Bar */}
      <SearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search by name, email, phone, skills..."
        style={{ marginBottom: '24px' }}
      />

      {/* Filters */}
      <div className="card" style={{ padding: '20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Filter size={18} style={{ color: 'var(--text-secondary)' }} />
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Filters</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>
              Seniority Level
            </label>
            <div style={{ position: 'relative' }}>
              <select
                value={filters.seniority}
                onChange={(e) => setFilters({ ...filters, seniority: e.target.value })}
                style={{ 
                  width: '100%', 
                  padding: '10px 36px 10px 12px', 
                  fontSize: '14px', 
                  border: '1.5px solid var(--border-color)', 
                  borderRadius: '10px', 
                  background: 'var(--bg-card)', 
                  color: 'var(--text-primary)',
                  appearance: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  fontWeight: 500,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent-primary)';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(79, 70, 229, 0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-color)';
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent-primary)';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(79, 70, 229, 0.08)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-color)';
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
                }}
              >
                <option value="">Tous les niveaux</option>
                <option value="junior">👶 Junior</option>
                <option value="mid">👔 Mid-Level</option>
                <option value="senior">🎯 Senior</option>
                <option value="lead">⭐ Lead</option>
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
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>
              Disponibilité
            </label>
            <div style={{ position: 'relative' }}>
              <select
                value={filters.availability}
                onChange={(e) => setFilters({ ...filters, availability: e.target.value })}
                style={{ 
                  width: '100%', 
                  padding: '10px 36px 10px 12px', 
                  fontSize: '14px', 
                  border: '1.5px solid var(--border-color)', 
                  borderRadius: '10px', 
                  background: 'var(--bg-card)', 
                  color: 'var(--text-primary)',
                  appearance: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  fontWeight: 500,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent-primary)';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(79, 70, 229, 0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-color)';
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent-primary)';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(79, 70, 229, 0.08)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-color)';
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
                }}
              >
                <option value="">All statuses</option>
                <option value="available">✅ Available</option>
                <option value="busy">⏳ Busy</option>
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
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>
              Compétences
            </label>
            <input
              type="text"
              placeholder="React, Python, Django..."
              value={filters.skills}
              onChange={(e) => setFilters({ ...filters, skills: e.target.value })}
              style={{ 
                width: '100%', 
                padding: '10px 12px', 
                border: '1.5px solid var(--border-color)', 
                borderRadius: '10px', 
                background: 'var(--bg-card)', 
                color: 'var(--text-primary)', 
                fontSize: '14px',
                transition: 'all 0.2s',
                fontWeight: 500,
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent-primary)';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(79, 70, 229, 0.08)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-color)';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
              }}
            />
          </div>
        </div>
      </div>

      {/* Candidates Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-secondary)' }}>
          <div className="spinner" style={{ margin: '0 auto 16px' }} />
          <p>Chargement des candidats...</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
          {filteredCandidates.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '48px', color: 'var(--text-secondary)' }}>
              <p>{searchQuery ? 'Aucun candidat ne correspond à votre recherche' : 'Aucun candidat trouvé'}</p>
            </div>
          ) : (
            filteredCandidates.map((candidate) => {
              const seniorityColor = getSeniorityColor(candidate.seniority);
              return (
                <div key={candidate.id} className="card" style={{ padding: '20px', transition: 'transform 0.2s, box-shadow 0.2s' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                  }}>
                
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {candidate.name}
                  </h3>
                  <span style={{
                    padding: '4px 10px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    background: seniorityColor.bg,
                    color: seniorityColor.text
                  }}>
                    {candidate.seniority}
                  </span>
                </div>

                {/* Contact Info */}
                <div style={{ marginBottom: '16px' }}>
                  {candidate.email && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                      <Mail size={14} />
                      <span>{candidate.email}</span>
                    </div>
                  )}
                  {candidate.phone && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                      <Phone size={14} />
                      <span>{candidate.phone}</span>
                    </div>
                  )}
                </div>

                {/* Skills */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
                  {candidate.skills.slice(0, 5).map((skill, idx) => (
                    <span key={idx} style={{
                      padding: '4px 10px',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '12px',
                      fontSize: '12px',
                      color: 'var(--text-primary)',
                      fontWeight: 500
                    }}>
                      {skill}
                    </span>
                  ))}
                  {candidate.skills.length > 5 && (
                    <span style={{
                      padding: '4px 10px',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '12px',
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      fontWeight: 500
                    }}>
                      +{candidate.skills.length - 5}
                    </span>
                  )}
                </div>

                {/* Meta */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: '16px',
                  borderTop: '1px solid var(--border-color)',
                  marginBottom: '16px',
                  fontSize: '13px',
                  color: 'var(--text-secondary)'
                }}>
                  <span>📅 {new Date(candidate.created_at).toLocaleDateString()}</span>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setSelectedCandidate(candidate);
                      setInviteData({ 
                        email: candidate.email || '',
                        role_title: '', 
                        salary_range: '', 
                        custom_message: '' 
                      });
                      setInviteModal(true);
                    }}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', fontSize: '14px' }}
                  >
                    <Send size={14} />
                    Inviter
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleDelete(candidate.id)}
                    style={{ padding: '10px 14px', background: 'rgba(244,63,94,0.1)', color: '#f43f5e', border: 'none' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(244,63,94,0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(244,63,94,0.1)';
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              );
            })
          )}
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
          <div className="card" style={{ maxWidth: '500px', width: '90%', padding: '32px' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 24px 0', fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>
              📧 Inviter {selectedCandidate?.name}
            </h2>
            
            {/* Email Field */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                Email du candidat *
              </label>
              <input
                type="email"
                placeholder="Ex: candidate@email.com"
                value={inviteData.email}
                onChange={(e) => setInviteData({ ...inviteData, email: e.target.value })}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '14px' }}
              />
              <small style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '4px', display: 'block' }}>
                L'email sera envoyé depuis votre compte Gmail connecté
              </small>
            </div>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                Titre du poste *
              </label>
              <input
                type="text"
                placeholder="Ex: Backend Engineer"
                value={inviteData.role_title}
                onChange={(e) => setInviteData({ ...inviteData, role_title: e.target.value })}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '14px' }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                Fourchette salariale
              </label>
              <input
                type="text"
                placeholder="Ex: 45,000-62,000 TND/an"
                value={inviteData.salary_range}
                onChange={(e) => setInviteData({ ...inviteData, salary_range: e.target.value })}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '14px' }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                Message personnalisé (optionnel)
              </label>
              <textarea
                placeholder="Ex: Nous avons été impressionnés par votre expérience..."
                value={inviteData.custom_message}
                onChange={(e) => setInviteData({ ...inviteData, custom_message: e.target.value })}
                rows={4}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '14px', fontFamily: 'inherit', resize: 'vertical' }}
              />
              <small style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                Si vide, un message professionnel par défaut sera envoyé
              </small>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setInviteModal(false)} style={{ padding: '10px 20px' }}>
                Annuler
              </button>
              <button className="btn btn-primary" onClick={handleInvite} disabled={!inviteData.email || !inviteData.role_title} style={{ padding: '10px 20px' }}>
                Envoyer l'invitation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
