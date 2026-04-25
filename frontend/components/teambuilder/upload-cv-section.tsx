'use client';

import { useState } from 'react';
import { Upload, CheckCircle, AlertCircle, FileText, X, Loader2 } from 'lucide-react';

export default function UploadCVSection() {
  const [files, setFiles] = useState<File[]>([]);
  const [consent, setConsent] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadResult, setUploadResult] = useState<any>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    addFiles(selectedFiles);
  };

  const addFiles = (newFiles: File[]) => {
    const validFiles = newFiles.filter(file => {
      const fileName = file.name.toLowerCase();
      if (file.type === 'application/pdf' || 
          fileName.endsWith('.docx') ||
          file.type.startsWith('image/') ||
          fileName.endsWith('.jpg') ||
          fileName.endsWith('.jpeg') ||
          fileName.endsWith('.png')) {
        return true;
      }
      return false;
    });

    if (validFiles.length !== newFiles.length) {
      setError('Certains fichiers ont été ignorés. Seuls les PDF, DOCX et images (JPG, PNG) sont acceptés.');
    } else {
      setError(null);
    }

    setFiles(prev => [...prev, ...validFiles]);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      addFiles(droppedFiles);
    }
  };

  const handleUpload = async () => {
    console.log('Upload button clicked!', { filesCount: files.length, consent });
    
    if (files.length === 0 || !consent) {
      setError('Veuillez sélectionner au moins un fichier et accepter le consentement');
      return;
    }

    setError(null);
    setUploading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      files.forEach(file => {
        console.log('Adding file to FormData:', file.name);
        formData.append('cv_files', file);
      });
      formData.append('consent', 'true');

      console.log('Sending request to backend...');
      const response = await fetch('http://localhost:8001/api/v1/hr/upload-cv', {
        method: 'POST',
        headers: {
          'X-API-Key': 'your_api_key',
        },
        credentials: 'include',
        body: formData,
      });

      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Upload failed:', errorData);
        throw new Error(errorData.error || 'Échec du téléchargement');
      }

      const data = await response.json();
      console.log('Upload successful:', data);
      setUploadResult(data);
      
      // Clear form on success
      setFiles([]);
      setConsent(false);
      
      alert(`✅ ${data.processed} CVs téléchargés avec succès!\n${data.failed > 0 ? `⚠️ ${data.failed} ont échoué` : ''}`);
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.message || 'Échec du téléchargement des CVs');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', paddingBottom: '40px' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text-primary)', margin: '0 0 8px 0' }}>
          Télécharger des CVs de candidats
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '15px', margin: 0 }}>
          Téléchargez un ou plusieurs CVs pour les ajouter à votre vivier de candidats
        </p>
      </div>

      {/* Upload Card */}
      <div className="card" style={{ padding: '32px' }}>
        {/* Upload Zone */}
        <div 
          style={{
            border: `2px dashed ${dragActive ? 'var(--accent-primary)' : 'var(--border-color)'}`,
            borderRadius: '12px',
            padding: '48px 32px',
            textAlign: 'center',
            marginBottom: '24px',
            position: 'relative',
            cursor: 'pointer',
            transition: 'all 0.3s',
            background: dragActive ? 'var(--bg-secondary)' : (files.length > 0 ? 'var(--bg-secondary)' : 'transparent')
          }}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onMouseEnter={(e) => {
            if (!dragActive) {
              e.currentTarget.style.borderColor = 'var(--accent-primary)';
              e.currentTarget.style.background = 'var(--bg-secondary)';
            }
          }}
          onMouseLeave={(e) => {
            if (!dragActive) {
              e.currentTarget.style.borderColor = 'var(--border-color)';
              e.currentTarget.style.background = files.length > 0 ? 'var(--bg-secondary)' : 'transparent';
            }
          }}
        >
          <input
            type="file"
            accept=".pdf,.docx,image/*"
            onChange={handleFileChange}
            multiple
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              opacity: 0,
              cursor: 'pointer'
            }}
          />
          <div style={{ pointerEvents: 'none' }}>
            {files.length > 0 ? (
              <FileText size={48} style={{ color: 'var(--accent-emerald)', margin: '0 auto 16px' }} />
            ) : (
              <Upload size={48} style={{ color: 'var(--text-secondary)', margin: '0 auto 16px' }} />
            )}
            {files.length > 0 ? (
              <p style={{ color: 'var(--accent-emerald)', fontWeight: 600, fontSize: '15px', margin: 0 }}>
                ✓ {files.length} fichier{files.length > 1 ? 's' : ''} sélectionné{files.length > 1 ? 's' : ''}
              </p>
            ) : (
              <>
                <p style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: '15px', margin: '0 0 8px 0' }}>
                  Cliquez ou glissez des fichiers ici
                </p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
                  PDF, DOCX ou Images (JPG, PNG) • Plusieurs fichiers acceptés
                </p>
              </>
            )}
          </div>
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
              Fichiers sélectionnés ({files.length})
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {files.map((file, index) => (
                <div key={index} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <FileText size={18} style={{ color: 'var(--accent-primary)' }} />
                    <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{file.name}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      ({(file.size / 1024).toFixed(1)} KB)
                    </span>
                  </div>
                  <button
                    onClick={() => removeFile(index)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      color: 'var(--text-muted)',
                      transition: 'color 0.2s'
                    }}
                    onMouseEnter={(e) => (e.target as HTMLButtonElement).style.color = 'var(--accent-rose)'}
                    onMouseLeave={(e) => (e.target as HTMLButtonElement).style.color = 'var(--text-muted)'}
                  >
                    <X size={18} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Consent Section */}
        <div style={{
          marginBottom: '24px',
          padding: '16px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px'
        }}>
          <label style={{ display: 'flex', alignItems: 'start', gap: '12px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              style={{ marginTop: '2px' }}
            />
            <span style={{ color: 'var(--text-primary)', fontSize: '14px', lineHeight: '1.5' }}>
              Je confirme que les candidats ont donné leur consentement explicite pour le traitement de leurs données personnelles (RGPD)
            </span>
          </label>
        </div>

        {/* Upload Button */}
        <button
          onClick={handleUpload}
          disabled={files.length === 0 || !consent || uploading}
          className="btn btn-primary"
          style={{ 
            width: '100%', 
            padding: '12px', 
            fontSize: '15px', 
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            opacity: (files.length === 0 || !consent || uploading) ? 0.5 : 1,
            cursor: (files.length === 0 || !consent || uploading) ? 'not-allowed' : 'pointer'
          }}
        >
          {uploading ? (
            <>
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
              <span>Téléchargement...</span>
            </>
          ) : (
            <span>Analyser et Enregistrer ({files.length})</span>
          )}
        </button>

        {/* Error Alert */}
        {error && (
          <div style={{
            marginTop: '20px',
            padding: '14px 16px',
            background: 'rgba(244,63,94,0.1)',
            border: '1px solid rgba(244,63,94,0.2)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'start',
            gap: '12px'
          }}>
            <AlertCircle size={20} style={{ color: '#f43f5e', flexShrink: 0, marginTop: '2px' }} />
            <span style={{ color: '#f43f5e', fontSize: '14px' }}>{error}</span>
          </div>
        )}

        {/* Info Message */}
        <div style={{
          marginTop: '20px',
          padding: '14px 16px',
          background: 'rgba(99,102,241,0.1)',
          border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'start',
          gap: '12px'
        }}>
          <CheckCircle size={20} style={{ color: 'var(--accent-primary)', flexShrink: 0, marginTop: '2px' }} />
          <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
            L'IA traitera et indexera ces candidats en arrière-plan. Vous pouvez retourner à l'Assistant IA pour commencer la recherche.
          </span>
        </div>
      </div>
    </div>
  );
}
