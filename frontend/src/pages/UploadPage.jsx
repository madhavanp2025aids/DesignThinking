/**
 * HYDAC Spec-to-3D Generator — Upload Page
 * Drag-and-drop + file picker, multi-file, per-file status display.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

export default function UploadPage() {
  const [files, setFiles] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');
  const [pipelineStatus, setPipelineStatus] = useState(null);
  const fileInputRef = useRef();
  const navigate = useNavigate();

  const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.xlsx'];

  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    try {
      const data = await api.listFiles();
      setUploadedFiles(data || []);
    } catch (err) {
      setError(err.message);
    }
  };

  const validateFiles = (fileList) => {
    const valid = [];
    for (const file of fileList) {
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      if (ACCEPTED_EXTENSIONS.includes(ext)) {
        valid.push(file);
      }
    }
    return valid;
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    const dropped = validateFiles(Array.from(e.dataTransfer.files));
    if (dropped.length > 0) {
      setFiles((prev) => [...prev, ...dropped]);
    }
  };

  const handleFileSelect = (e) => {
    const selected = validateFiles(Array.from(e.target.files));
    if (selected.length > 0) {
      setFiles((prev) => [...prev, ...selected]);
    }
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCancel = () => {
    setFiles([]);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setError('');

    try {
      const result = await api.uploadFiles(files);
      setUploadedFiles((prev) => [...prev, ...result]);
      setFiles([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleExtract = async () => {
    setExtracting(true);
    setError('');

    try {
      const status = await api.triggerExtraction();
      setPipelineStatus(status);
      await loadFiles();

      if (status.components_found > 0) {
        navigate('/confirm');
      } else if (status.no_specs_found === status.total_files) {
        setError('No hydraulics specifications found in any uploaded document.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setExtracting(false);
    }
  };

  const handleDeleteFile = async (fileId) => {
    try {
      await api.deleteFile(fileId);
      await loadFiles();
    } catch (err) {
      setError(err.message);
    }
  };

  const getFileBadgeClass = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    if (ext === 'pdf') return 'dribbble-badge-pdf';
    if (['docx', 'doc'].includes(ext)) return 'dribbble-badge-docx';
    if (['xlsx', 'xls', 'csv'].includes(ext)) return 'dribbble-badge-xlsx';
    return 'dribbble-badge-doc';
  };

  const getFileExtLabel = (filename) => {
    const ext = filename.split('.').pop().toUpperCase();
    return ext.length > 4 ? ext.substring(0, 4) : ext;
  };

  const parsedCount = uploadedFiles.filter((f) => f.parse_status === 'parsed').length;
  const pendingCount = uploadedFiles.filter((f) => f.parse_status === 'pending').length;

  return (
    <div className="spec-upload-page-wrapper">
      {/* Error */}
      {error && (
        <div className="dribbble-alert dribbble-alert-error">
          <div className="dribbble-alert-content">
            <span className="dribbble-alert-icon">⚠️</span>
            <span>{error}</span>
          </div>
          <button className="dribbble-alert-close" onClick={() => setError('')}>✕</button>
        </div>
      )}

      {/* Main Upload Card */}
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

        {/* Drop Zone */}
        <div
          className={`dribbble-drop-zone ${dragActive ? 'dribbble-drop-zone--active' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.xlsx"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />

          <div className="dribbble-cloud-icon-circle">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
              <path d="M12 12v9" />
              <path d="m8 16 4-4 4 4" />
            </svg>
          </div>

          <p className="dribbble-drop-main-text">
            Drag and drop your file here or <span className="dribbble-browse-link">browse files</span>
          </p>
          <p className="dribbble-drop-sub-text">
            PDF, JPG, PNG, DOCX, XLSX up to 50 MB
          </p>
        </div>

        {/* Staged Files List */}
        {files.length > 0 && (
          <div className="dribbble-files-list">
            {files.map((file, i) => (
              <div key={i} className="dribbble-file-row">
                <div className="dribbble-file-left">
                  <div className={`dribbble-file-badge ${getFileBadgeClass(file.name)}`}>
                    <div className="dribbble-file-badge-fold" />
                    <span className="dribbble-file-badge-text">{getFileExtLabel(file.name)}</span>
                  </div>
                  <div className="dribbble-file-details">
                    <div className="dribbble-file-name">{file.name}</div>
                    <div className="dribbble-file-size">{formatSize(file.size)}</div>
                  </div>
                </div>

                <button
                  type="button"
                  className="dribbble-trash-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(i);
                  }}
                  title="Remove file"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    <line x1="10" x2="10" y1="11" x2="10" y2="17" />
                    <line x1="14" x2="14" y1="11" x2="14" y2="17" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Card Footer Actions */}
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
            onClick={handleUpload}
            disabled={uploading || files.length === 0}
          >
            {uploading ? 'Attaching...' : 'Attach Files'}
          </button>
        </div>
      </div>

      {/* Uploaded Documents List */}
      {uploadedFiles.length > 0 && (
        <div className="dribbble-recent-section">
          <div className="dribbble-recent-header">
            <h3>Uploaded Documents</h3>
            <span className="dribbble-recent-count">{uploadedFiles.length} Files</span>
          </div>

          <div className="dribbble-parts-grid">
            {uploadedFiles.map((file) => (
              <div key={file.id} className="dribbble-part-card">
                <div className="dribbble-part-top">
                  <span className="dribbble-part-title">{file.filename}</span>
                  <span className={`dribbble-status-badge dribbble-status-${file.parse_status}`}>
                    {file.parse_status}
                  </span>
                </div>
                {file.parse_error && file.parse_status === 'no_specs_found' && (
                  <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '6px' }}>
                    {file.parse_error}
                  </div>
                )}
                <div className="dribbble-part-actions">
                  <button
                    className="dribbble-btn-delete"
                    onClick={() => handleDeleteFile(file.id)}
                    title="Delete document"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
            {pendingCount > 0 && (
              <button className="dribbble-btn-attach" onClick={handleExtract} disabled={extracting}>
                {extracting ? 'Extracting Parameters…' : `Parse & Extract (${pendingCount} pending)`}
              </button>
            )}
            {parsedCount > 0 && (
              <button className="dribbble-btn-cancel" onClick={() => navigate('/confirm')}>
                Review Parameters →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
