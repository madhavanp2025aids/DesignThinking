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

  const handleCancel = () => {
    setSelectedFiles([]);
    setPartName('');
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
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

  const getFileBadgeClass = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    if (ext === 'pdf') return 'dribbble-badge-pdf';
    if (['docx', 'doc'].includes(ext)) return 'dribbble-badge-docx';
    if (['xlsx', 'xls', 'csv', 'tsv'].includes(ext)) return 'dribbble-badge-xlsx';
    if (['pptx', 'ppt'].includes(ext)) return 'dribbble-badge-pptx';
    return 'dribbble-badge-doc';
  };

  const getFileExtLabel = (filename) => {
    const ext = filename.split('.').pop().toUpperCase();
    return ext.length > 4 ? ext.substring(0, 4) : ext;
  };

  return (
    <div className="spec-upload-page-wrapper">
      {/* Alert Banners */}
      {error && (
        <div className="dribbble-alert dribbble-alert-error">
          <div className="dribbble-alert-content">
            <span className="dribbble-alert-icon">⚠️</span>
            <span>{error}</span>
          </div>
          <button className="dribbble-alert-close" onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {warningMessage && (
        <div className="dribbble-alert dribbble-alert-warning">
          <div className="dribbble-alert-content">
            <span className="dribbble-alert-icon">ℹ️</span>
            <span>{warningMessage}</span>
          </div>
          <button className="dribbble-alert-close" onClick={() => setWarningMessage(null)}>✕</button>
        </div>
      )}

      {/* Main Dribbble Style Upload Card */}
      <div className="dribbble-upload-card">
        {/* Top Header with Title and Close X */}
        <div className="dribbble-card-header">
          <h2 className="dribbble-card-title">Upload Files</h2>
          <button
            type="button"
            className="dribbble-close-btn"
            onClick={handleCancel}
            title="Clear and reset"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Optional Part Name Spec Input */}
        <div className="dribbble-input-row">
          <label className="dribbble-input-label">Part / Assembly Identifier</label>
          <input
            type="text"
            className="dribbble-text-input"
            placeholder="e.g. Hydraulic Cylinder HYD-400, Drive Shaft, Flange"
            value={partName}
            onChange={(e) => setPartName(e.target.value)}
            disabled={uploading}
          />
        </div>

        {/* Drag and Drop Zone */}
        <div
          className={`dribbble-drop-zone ${isDragging ? 'dribbble-drop-zone--active' : ''}`}
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

          {/* Cloud Upload Icon */}
          <div className="dribbble-cloud-icon-circle">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
              <path d="M12 12v9" />
              <path d="m8 16 4-4 4 4" />
            </svg>
          </div>

          {/* Prompt Texts */}
          <p className="dribbble-drop-main-text">
            Drag and drop your file here or <span className="dribbble-browse-link">browse files</span>
          </p>
          <p className="dribbble-drop-sub-text">
            PDF, JPG, PNG, DOCX, XLSX up to 50 MB
          </p>
        </div>

        {/* Staged Files List (Exact Dribbble Style) */}
        {selectedFiles.length > 0 && (
          <div className="dribbble-files-list">
            {selectedFiles.map((file, idx) => (
              <div key={idx} className="dribbble-file-row">
                <div className="dribbble-file-left">
                  {/* File Badge */}
                  <div className={`dribbble-file-badge ${getFileBadgeClass(file.name)}`}>
                    <div className="dribbble-file-badge-fold" />
                    <span className="dribbble-file-badge-text">{getFileExtLabel(file.name)}</span>
                  </div>

                  {/* File Meta */}
                  <div className="dribbble-file-details">
                    <div className="dribbble-file-name" title={file.name}>
                      {file.name}
                    </div>
                    <div className="dribbble-file-size">
                      {formatFileSize(file.size)}
                    </div>
                  </div>
                </div>

                {/* Trash Button */}
                <button
                  type="button"
                  className="dribbble-trash-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(idx);
                  }}
                  disabled={uploading}
                  title="Remove file"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Uploading Progress */}
        {uploading && (
          <div className="dribbble-progress-section">
            <div className="dribbble-progress-track">
              <div
                className="dribbble-progress-bar"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <div className="dribbble-progress-status">
              <span className="dribbble-spinner-mini" />
              <span>{statusMessage}</span>
            </div>
          </div>
        )}

        {/* Footer Action Buttons */}
        <div className="dribbble-card-footer">
          <button
            type="button"
            className="dribbble-btn-cancel"
            onClick={handleCancel}
            disabled={uploading}
          >
            Cancel
          </button>
          <button
            type="button"
            className="dribbble-btn-attach"
            onClick={handleUploadAndExtract}
            disabled={uploading || selectedFiles.length === 0}
          >
            {uploading ? 'Attaching...' : 'Attach Files'}
          </button>
        </div>
      </div>

      {/* Recent Ingested Parts Library (Clean Card Layout) */}
      <div className="dribbble-recent-section">
        <div className="dribbble-recent-header">
          <h3>Ingested Spec Library</h3>
          <span className="dribbble-recent-count">{recentParts.length} Parts</span>
        </div>

        {loadingParts ? (
          <div className="dribbble-loading-state">
            <span className="dribbble-spinner-mini" /> Loading existing parts...
          </div>
        ) : recentParts.length === 0 ? (
          <div className="dribbble-empty-state">
            No specifications uploaded yet. Attach your first spec sheet above.
          </div>
        ) : (
          <div className="dribbble-parts-grid">
            {recentParts.map((p) => (
              <div
                key={p.id}
                className="dribbble-part-card"
                onClick={() => navigate(`/specs/review/${p.id}`)}
              >
                <div className="dribbble-part-top">
                  <span className="dribbble-part-title">{p.name}</span>
                  <span className={`dribbble-status-badge dribbble-status-${p.status}`}>
                    {p.status}
                  </span>
                </div>
                <div className="dribbble-part-meta">
                  Type: <strong>{p.part_type || 'Auto-Detect'}</strong>
                </div>
                <div className="dribbble-part-actions">
                  <button
                    className="dribbble-btn-subtle"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/specs/review/${p.id}`);
                    }}
                  >
                    📋 Review Specs
                  </button>
                  <button
                    className="dribbble-btn-subtle dribbble-btn-accent"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/specs/viewer/${p.id}`);
                    }}
                  >
                    ⚛ 3D Hologram
                  </button>
                  <button
                    className="dribbble-btn-delete"
                    onClick={(e) => handleDeletePart(p.id, p.name, e)}
                    disabled={deletingPartId === p.id}
                    title="Delete part"
                  >
                    {deletingPartId === p.id ? '...' : '🗑️'}
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

