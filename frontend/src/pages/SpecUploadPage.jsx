/**
 * Spec-to-3D Generator — Multi-Format Spec Ingestion & Upload Screen (v2 Enhanced)
 * Supports PDF, DOCX, XLSX, CSV, PPTX with robust error handling, part deletion, and duplicate guards.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.csv', '.tsv', '.pptx', '.ppt'];

export default function SpecUploadPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [partName, setPartName] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState(null);
  const [warningMessage, setWarningMessage] = useState(null);

  const [recentParts, setRecentParts] = useState([]);
  const [loadingParts, setLoadingParts] = useState(true);
  const [deletingPartId, setDeletingPartId] = useState(null);

  useEffect(() => {
    loadRecentParts();
  }, []);

  const loadRecentParts = async () => {
    try {
      setLoadingParts(true);
      setError(null);
      const parts = await api.listParts();
      setRecentParts(parts || []);
    } catch (err) {
      setError(err.message || 'Failed to load existing parts library.');
    } finally {
      setLoadingParts(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files));
    }
  };

  const addFiles = (newFiles) => {
    const valid = newFiles.filter((f) => {
      const ext = '.' + f.name.split('.').pop().toLowerCase();
      return ACCEPTED_EXTENSIONS.includes(ext);
    });

    if (valid.length < newFiles.length) {
      setError('Some files were rejected. Supported formats: PDF, DOCX, XLSX, CSV, PPTX.');
    } else {
      setError(null);
    }

    setSelectedFiles((prev) => [...prev, ...valid]);

    if (!partName && valid.length > 0) {
      const defaultName = valid[0].name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      setPartName(defaultName);
    }
  };

  const removeFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUploadAndExtract = async () => {
    if (selectedFiles.length === 0) {
      setError('Please select at least one technical specification document.');
      return;
    }

    try {
      setUploading(true);
      setError(null);
      setWarningMessage(null);
      setStatusMessage('Validating files & running multi-format parsers...');
      setUploadProgress(30);

      const res = await api.uploadSpecFiles(selectedFiles, partName.trim(), true);
      setUploadProgress(75);
      setStatusMessage('Extracting technical parameters & running ground-truth verification...');

      if (res.message && res.message.includes('already exists')) {
        setWarningMessage('Note: A part with this name already existed — created as a new revision.');
      }

      const partId = res.part.id;
      setUploadProgress(100);
      setStatusMessage('Verification complete! Opening Spec Review...');

      setTimeout(() => {
        navigate(`/specs/review/${partId}`);
      }, 600);
    } catch (err) {
      setError(err.message || 'Upload failed. Please check your network and files.');
      setUploading(false);
    }
  };

  const handleDeletePart = async (partId, partNameToDelete, e) => {
    e.stopPropagation();
    const confirmed = window.confirm(`Are you sure you want to delete '${partNameToDelete}' and all associated documents, extracted specs, and 3D CAD models?`);
    if (!confirmed) return;

    try {
      setDeletingPartId(partId);
      await api.deletePart(partId);
      setRecentParts((prev) => prev.filter((p) => p.id !== partId));
    } catch (err) {
      alert('Delete failed: ' + err.message);
    } finally {
      setDeletingPartId(null);
    }
  };

  const getFormatIcon = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    if (ext === 'pdf') return '📕';
    if (['docx', 'doc'].includes(ext)) return '📘';
    if (['xlsx', 'xls', 'csv'].includes(ext)) return '📊';
    if (['pptx', 'ppt'].includes(ext)) return '📙';
    return '📄';
  };

  return (
    <div className="spec-upload-page">
      <div className="page-header">
        <h1>Technical Specification Ingestion</h1>
        <p>Upload engineering specification sheets (PDF, DOCX, XLSX, CSV, PPTX) to extract exact parametric dimensions with zero hallucination.</p>
      </div>

      {error && (
        <div className="alert alert-error" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>⚠️ {error}</span>
          <button className="btn-icon" onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {warningMessage && (
        <div className="alert" style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid #f59e0b', color: '#fcd34d' }}>
          ℹ️ {warningMessage}
        </div>
      )}

      <div className="spec-upload-card">
        <div className="form-group" style={{ marginBottom: '20px' }}>
          <label>Machine / Part Name</label>
          <input
            type="text"
            placeholder="e.g. Hydraulic Cylinder HYD-400, Drive Shaft, Flange"
            value={partName}
            onChange={(e) => setPartName(e.target.value)}
            disabled={uploading}
          />
        </div>

        {/* Drag and Drop Zone */}
        <div
          className={`drop-zone ${isDragging ? 'drop-zone--active' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current && fileInputRef.current.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS.join(',')}
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
          <div className="drop-zone-content">
            <div className="drop-icon" style={{ fontSize: '2.5rem' }}>📁</div>
            <div className="drop-text">Drag & drop technical documents here, or click to browse</div>
            <div className="drop-hint">Supported formats: PDF (Text + Scanned/OCR), DOCX, XLSX, CSV, PPTX (Max 50MB per file)</div>
          </div>
        </div>

        {/* Selected Files Staging List */}
        {selectedFiles.length > 0 && (
          <div className="file-section">
            <h3>Staged Documents ({selectedFiles.length})</h3>
            <div className="file-list">
              {selectedFiles.map((file, idx) => (
                <div key={idx} className="file-item">
                  <span className="file-icon">{getFormatIcon(file.name)}</span>
                  <span className="file-name">{file.name}</span>
                  <span className="file-size">{(file.size / 1024).toFixed(1)} KB</span>
                  <button
                    type="button"
                    className="btn-icon btn-danger"
                    onClick={() => removeFile(idx)}
                    disabled={uploading}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {uploading && (
              <div className="upload-progress-container" style={{ margin: '20px 0' }}>
                <div className="progress-bar-track" style={{ height: '8px', background: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    className="progress-bar-fill"
                    style={{ height: '100%', width: `${uploadProgress}%`, background: 'var(--accent-blue)', transition: 'width 0.3s ease' }}
                  />
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--accent-blue)', marginTop: '8px', fontWeight: '500' }}>
                  ⏳ {statusMessage}
                </div>
              </div>
            )}

            <div className="page-actions" style={{ marginTop: '16px' }}>
              <button
                type="button"
                className="btn-primary"
                style={{ width: '100%', padding: '14px', fontSize: '1rem' }}
                onClick={handleUploadAndExtract}
                disabled={uploading}
              >
                {uploading ? 'Processing Multi-Format Extraction...' : '🚀 Ingest & Extract Technical Specifications'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Recent Parts Library */}
      <div className="recent-parts-section" style={{ marginTop: '40px' }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '16px', color: 'var(--text-heading)' }}>Recent Parts Library</h2>
        {loadingParts ? (
          <div style={{ padding: '20px', color: 'var(--text-muted)' }}>
            <span className="spinner" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '8px' }} />
            Loading existing parts...
          </div>
        ) : recentParts.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No parts ingested yet. Upload your first specification sheet above.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {recentParts.map((p) => (
              <div
                key={p.id}
                className="component-card"
                style={{ padding: '16px', cursor: 'pointer', transition: 'all 0.2s ease', position: 'relative' }}
                onClick={() => navigate(`/specs/review/${p.id}`)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <strong style={{ color: 'var(--text-heading)', fontSize: '1rem' }}>{p.name}</strong>
                  <span className={`file-status status--${p.status}`}>{p.status}</span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Type: <span style={{ color: 'var(--accent-blue)' }}>{p.part_type || 'Auto-Detect'}</span>
                </div>
                <div style={{ marginTop: '14px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    className="btn-sm btn-edit"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/specs/review/${p.id}`);
                    }}
                  >
                    📋 Review Specs
                  </button>
                  <button
                    className="btn-sm btn-confirm"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/specs/viewer/${p.id}`);
                    }}
                  >
                    ⚛ 3D Hologram
                  </button>
                  <button
                    className="btn-sm btn-cancel"
                    style={{ marginLeft: 'auto' }}
                    onClick={(e) => handleDeletePart(p.id, p.name, e)}
                    disabled={deletingPartId === p.id}
                    title="Delete part and all associated data"
                  >
                    {deletingPartId === p.id ? 'Deleting...' : '🗑️'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
