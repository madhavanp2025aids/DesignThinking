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

  const ACCEPTED_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];
  const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.xlsx'];

  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    try {
      const data = await api.listFiles();
      setUploadedFiles(data);
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

  const parsedCount = uploadedFiles.filter((f) => f.parse_status === 'parsed').length;
  const pendingCount = uploadedFiles.filter((f) => f.parse_status === 'pending').length;
  const hasFiles = uploadedFiles.length > 0 || files.length > 0;

  return (
    <div className="page-upload">
      <header className="page-header">
        <h1>Document Upload</h1>
        <p>Upload hydraulics spec documents for parameter extraction.</p>
      </header>

      {/* Drop Zone */}
      <div
        className={`drop-zone ${dragActive ? 'drop-zone--active' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="drop-zone-content">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="drop-icon">
            <rect width="48" height="48" rx="12" fill="#1e293b"/>
            <path d="M24 14v14m-7-7l7-7 7 7M16 34h16" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <p className="drop-text">Drop spec documents here or click to browse</p>
          <p className="drop-hint">Accepted: PDF, DOCX, XLSX — Max 50MB per file</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.xlsx"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
      </div>

      {/* Staged Files (before upload) */}
      {files.length > 0 && (
        <div className="file-section">
          <h3>Ready to Upload ({files.length})</h3>
          <div className="file-list">
            {files.map((file, i) => (
              <div key={i} className="file-item file-item--staged">
                <span className="file-icon">{getFileIcon(file.name)}</span>
                <span className="file-name">{file.name}</span>
                <span className="file-size">{formatSize(file.size)}</span>
                <button className="btn-icon" onClick={() => removeFile(i)} title="Remove">✕</button>
              </div>
            ))}
          </div>
          <button className="btn-primary" onClick={handleUpload} disabled={uploading}>
            {uploading ? 'Uploading…' : `Upload ${files.length} File${files.length > 1 ? 's' : ''}`}
          </button>
        </div>
      )}

      {/* Uploaded Files */}
      {uploadedFiles.length > 0 && (
        <div className="file-section">
          <h3>Uploaded Documents ({uploadedFiles.length})</h3>
          <div className="file-list">
            {uploadedFiles.map((file) => (
              <div key={file.id} className={`file-item file-item--${file.parse_status}`}>
                <span className="file-icon">{getFileIcon(file.filename)}</span>
                <span className="file-name">{file.filename}</span>
                <span className={`file-status status--${file.parse_status}`}>
                  {getStatusLabel(file.parse_status)}
                </span>
                {file.parse_error && file.parse_status === 'no_specs_found' && (
                  <span className="file-error-inline">{file.parse_error}</span>
                )}
                <button className="btn-icon btn-danger" onClick={() => handleDeleteFile(file.id)} title="Delete">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && <div className="alert alert-error">{error}</div>}

      {/* Pipeline Status */}
      {pipelineStatus && (
        <div className="pipeline-status">
          <div className="status-grid">
            <div className="status-item"><span className="status-num">{pipelineStatus.parsed}</span><span className="status-label">Parsed</span></div>
            <div className="status-item"><span className="status-num">{pipelineStatus.components_found}</span><span className="status-label">Components</span></div>
            <div className="status-item"><span className="status-num">{pipelineStatus.no_specs_found}</span><span className="status-label">No Specs</span></div>
            <div className="status-item"><span className="status-num">{pipelineStatus.errors}</span><span className="status-label">Errors</span></div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="page-actions">
        {pendingCount > 0 && (
          <button className="btn-primary" onClick={handleExtract} disabled={extracting}>
            {extracting ? 'Extracting Parameters…' : `Parse & Extract (${pendingCount} pending)`}
          </button>
        )}
        {parsedCount > 0 && (
          <button className="btn-secondary" onClick={() => navigate('/confirm')}>
            Review Parameters →
          </button>
        )}
      </div>
    </div>
  );
}

function getFileIcon(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const icons = { pdf: '📄', docx: '📝', xlsx: '📊', doc: '📝' };
  return icons[ext] || '📁';
}

function getStatusLabel(status) {
  const labels = {
    pending: 'Pending',
    parsing: 'Parsing…',
    parsed: 'Parsed ✓',
    no_specs_found: 'No Specs Found',
    error: 'Error',
  };
  return labels[status] || status;
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
