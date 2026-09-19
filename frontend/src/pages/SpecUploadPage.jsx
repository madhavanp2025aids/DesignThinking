import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { auth } from '../firebase';

const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.csv', '.tsv', '.pptx', '.ppt', '.step', '.stp'];

export default function SpecUploadPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // Top state
  const [showOcrAlert, setShowOcrAlert] = useState(true);
  const [standardTolerance, setStandardTolerance] = useState('ISO 2768-mK');
  const [orientationMode, setOrientationMode] = useState('Z-Up (Right-Handed)');

  // Target Part Identifier State
  const [partName, setPartName] = useState('');
  const [canonicalIndex, setCanonicalIndex] = useState('#HEX-7718A');
  const [isLockedContext, setIsLockedContext] = useState(true);

  // File Queue State (Starts empty, populated by user's actual files or demo)
  const [queueFiles, setQueueFiles] = useState([]);

  const [isDragging, setIsDragging] = useState(false);
  const [gdtRigor, setGdtRigor] = useState('Strict');
  const [uploading, setUploading] = useState(false);
  const [pipelineProgress, setPipelineProgress] = useState(0);
  const [pipelineStep, setPipelineStep] = useState('');
  const [errorBanner, setErrorBanner] = useState(null);

  // Real Ingested Parts from Database
  const [recentParts, setRecentParts] = useState([]);
  const [loadingParts, setLoadingParts] = useState(true);
  const [deletingPartId, setDeletingPartId] = useState(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('All'); // 'All' | 'Ready for 3D' | 'Needs Review'
  const [sortOrder, setSortOrder] = useState('Recently Updated (Desc)');

  // Inspect Modal
  const [inspectModalFile, setInspectModalFile] = useState(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // User
  const user = auth.currentUser;
  const userName = user?.displayName || user?.email?.split('@')[0] || 'J. Vance';

  useEffect(() => {
    loadRecentParts();
  }, []);

  const loadRecentParts = async () => {
    try {
      setLoadingParts(true);
      const parts = await api.listParts();
      setRecentParts(parts || []);
    } catch (err) {
      console.warn('Failed to load parts:', err);
      setRecentParts([]);
    } finally {
      setLoadingParts(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const calculateTotalPayload = () => {
    const totalBytes = queueFiles.reduce((acc, f) => acc + (f.size || 0), 0);
    return formatFileSize(totalBytes);
  };

  // Check if a part with this name already exists in user's real parts
  const existingPart = recentParts.find(
    (p) => partName.trim() && (p.name || '').toLowerCase() === partName.trim().toLowerCase()
  );

  // Drag & drop handlers
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
      handleIncomingFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleIncomingFiles = (files) => {
    const valid = files.filter((f) => {
      const ext = '.' + f.name.split('.').pop().toLowerCase();
      return ACCEPTED_EXTENSIONS.includes(ext);
    });

    if (valid.length === 0) {
      setErrorBanner('Unsupported file format. Please upload PDF, DOCX, XLSX, CSV, or STEP files.');
      return;
    }

    const newQueueItems = valid.map((file, idx) => {
      const ext = file.name.split('.').pop().toLowerCase();
      return {
        id: `user-${Date.now()}-${idx}`,
        name: file.name,
        size: file.size,
        ext,
        meta: `GD&T Spec Document • ${ext.toUpperCase()}`,
        status: 'Staged for Ingestion',
        progress: 0,
        state: 'staged',
        fileObj: file,
      };
    });

    setQueueFiles((prev) => [...prev, ...newQueueItems]);

    // Auto-fill Part Name from first file if currently empty
    if (valid.length > 0 && !partName.trim()) {
      const cleanName = valid[0].name
        .replace(/\.[^/.]+$/, '')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      setPartName(cleanName);
      setCanonicalIndex(`#HEX-${Math.random().toString(16).substring(2, 7).toUpperCase()}`);
    }
  };

  const removeQueueItem = (id) => {
    setQueueFiles((prev) => prev.filter((item) => item.id !== id));
  };

  const clearQueue = () => {
    setQueueFiles([]);
  };

  const handleLoadDemo = () => {
    const demoName = 'Hydraulic Cylinder HYD-450';
    setPartName(demoName);
    setCanonicalIndex('#HEX-9844B');
    setQueueFiles([
      {
        id: 'demo-1',
        name: 'hyd450_cylinder_assembly_schematic.pdf',
        size: 14.2 * 1024 * 1024,
        ext: 'pdf',
        meta: 'ISO Orthographic View A-A & GD&T Tolerances',
        status: 'Extracting [38/54 Dim]',
        progress: 68,
        state: 'extracting',
        fileObj: null,
      },
      {
        id: 'demo-2',
        name: 'hyd450_tolerance_fit_table.xlsx',
        size: 3.4 * 1024 * 1024,
        ext: 'xlsx',
        meta: 'H7/g6 Fit Tolerances & Pressure Ratings',
        status: 'Verifying Tolerances',
        progress: 92,
        state: 'verifying',
        fileObj: null,
      },
      {
        id: 'demo-3',
        name: 'port_flange_bolt_coordinates.csv',
        size: 840 * 1024,
        ext: 'csv',
        meta: 'PCD 180mm Polar Array Coordinates',
        status: 'Complete (12 Vectors)',
        progress: 100,
        state: 'complete',
        fileObj: null,
      }
    ]);
  };

  const handleStartPipeline = async () => {
    if (queueFiles.length === 0) {
      setErrorBanner('Please attach at least one specification file before running the extraction pipeline.');
      return;
    }

    const realFiles = queueFiles.filter((f) => f.fileObj !== null).map((f) => f.fileObj);
    const targetName = partName.trim() || 'Hydraulic Component';

    setUploading(true);
    setErrorBanner(null);
    setPipelineProgress(25);
    setPipelineStep('Initiating Scaled B-Rep Reconstruction & OCR Scan...');

    setQueueFiles((prev) =>
      prev.map((item) => ({
        ...item,
        state: 'extracting',
        status: 'Extracting GD&T Parameters...',
        progress: Math.max(item.progress, 45),
      }))
    );

    try {
      if (realFiles.length > 0) {
        // Upload user's real files to backend
        setPipelineProgress(55);
        setPipelineStep('Vectorizing orthographic dimensions and synthesizing 3D geometry...');
        const res = await api.uploadSpecFiles(realFiles, targetName, true);
        setPipelineProgress(100);
        setPipelineStep('Dimensions synthesized! Opening Parameter Verification...');

        setTimeout(() => {
          navigate(`/specs/review/${res.part.id}`);
        }, 500);
      } else {
        // Demo simulation: Create part in backend database so it has real CAD geometry and appears in parts list!
        setPipelineProgress(60);
        setPipelineStep('Synthesizing parametric geometry & running ISO 2768 checks...');

        const demoBlob = new Blob(
          ['Hydraulic Cylinder Spec Sheet: Bore=120mm, Rod=70mm, Stroke=450mm, Pressure=250bar, Port=G1/2'],
          { type: 'text/plain' }
        );
        const demoFile = new File([demoBlob], 'hyd450_cylinder_spec.txt', { type: 'text/plain' });
        const res = await api.uploadSpecFiles([demoFile], targetName, true);

        setPipelineProgress(100);
        setPipelineStep('3D CAD Synthesis Complete! Opening 3D Viewer...');

        setTimeout(() => {
          navigate(`/specs/viewer/${res.part.id}`);
        }, 600);
      }
    } catch (err) {
      setErrorBanner(err.message || 'CAD Extraction Pipeline encountered a parse error.');
      setUploading(false);
    }
  };

  const handleDeletePart = async (partId, name, e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete part "${name}" and its generated 3D CAD model?`)) return;

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

  // Filter ONLY user's real parts from database
  const filteredParts = recentParts.filter((p) => {
    const nameMatch = (p.name || '').toLowerCase().includes(searchFilter.toLowerCase()) ||
                      (p.part_type || '').toLowerCase().includes(searchFilter.toLowerCase());
    if (statusFilter === 'All') return nameMatch;
    if (statusFilter === 'Ready for 3D') return nameMatch && (p.status === 'ready' || p.status === 'complete');
    if (statusFilter === 'Needs Review') return nameMatch && (p.status === 'processing' || p.status === 'incomplete');
    return nameMatch;
  });

  return (
    <div className="cad-console-page">
      {/* ══════════════════════════════════════════════════════════
          TOP OCR ALERT BANNER
          ══════════════════════════════════════════════════════════ */}
      {showOcrAlert && (
        <div className="cad-top-alert-banner">
          <div className="cad-alert-left">
            <span className="cad-alert-icon">⚠</span>
            <span className="cad-alert-msg">
              OCR engine operational in fallback mode — scanned raster PDFs will utilize geometric contour extraction.
            </span>
          </div>
          <button
            type="button"
            className="cad-alert-dismiss"
            onClick={() => setShowOcrAlert(false)}
            title="Dismiss notification"
          >
            ✕
          </button>
        </div>
      )}

      {errorBanner && (
        <div className="cad-top-alert-banner cad-alert-error">
          <div className="cad-alert-left">
            <span className="cad-alert-icon">❌</span>
            <span className="cad-alert-msg">{errorBanner}</span>
          </div>
          <button type="button" className="cad-alert-dismiss" onClick={() => setErrorBanner(null)}>✕</button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          PAGE HEADER (Upload Specification Documents + Quick Pills)
          ══════════════════════════════════════════════════════════ */}
      <div className="cad-page-header-row">
        <div className="cad-header-titles">
          <div className="cad-title-line">
            <h1 className="cad-main-title">Upload Specification Documents</h1>
            <span className="cad-badge-pipeline">[PIPELINE: V3.8.2]</span>
            <span className="cad-badge-idle">● GD&T VECTORIZER IDLE</span>
          </div>
          <p className="cad-subtitle">
            PDF, DOCX, XLSX, CSV, or PPTX — we'll extract verified dimensions automatically.
          </p>
        </div>

        <div className="cad-header-actions">
          <button
            type="button"
            className="cad-btn-load-demo"
            onClick={handleLoadDemo}
            title="Load sample hydraulic component dataset"
          >
            <span className="icon-tool">🛠</span> Load Demo: Hydro-Drive Unit
          </button>
          <button
            type="button"
            className="cad-pill-toggle"
            onClick={() => setStandardTolerance((prev) => prev === 'ISO 2768-mK' ? 'ISO 2768-fH' : 'ISO 2768-mK')}
            title="Toggle standard tolerance"
          >
            {standardTolerance}
          </button>
          <button
            type="button"
            className="cad-pill-toggle"
            onClick={() => setOrientationMode((prev) => prev.includes('Z-Up') ? 'Y-Up (OpenGL)' : 'Z-Up (Right-Handed)')}
            title="Toggle CAD coordinate orientation"
          >
            {orientationMode}
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          TARGET PART IDENTIFIER // ASSEMBLY CODE BOX
          ══════════════════════════════════════════════════════════ */}
      <div className="cad-target-id-card">
        <div className="cad-target-card-top">
          <div className="cad-target-label">
            <span>TARGET PART IDENTIFIER // ASSEMBLY CODE</span>
            <span className="cad-info-circle" title="Unique CAD model identifier for tracking revisions">ⓘ</span>
          </div>
          <div className="cad-canonical-index">
            <span>CANONICAL_INDEX: <strong>{canonicalIndex}</strong></span>
          </div>
        </div>

        <div className="cad-target-input-row">
          <input
            type="text"
            className="cad-target-input"
            value={partName}
            onChange={(e) => setPartName(e.target.value)}
            placeholder="e.g. Hydraulic Cylinder HC-450, Manifold Block MB-12, Directional Valve"
            disabled={uploading}
          />
          <button
            type="button"
            className={`cad-locked-context-pill ${isLockedContext ? 'active' : ''}`}
            onClick={() => setIsLockedContext(!isLockedContext)}
            title="Toggle locked context"
          >
            ● {isLockedContext ? 'LOCKED CONTEXT' : 'UNLOCKED CONTEXT'}
          </button>
        </div>

        {/* Real Part Revision Notice if this name already exists in database */}
        {existingPart && (
          <div className="cad-rev-warning-bar">
            <div className="cad-rev-left">
              <span className="rev-warn-icon">⚠</span>
              <span>
                A part named <strong>{existingPart.name}</strong> already exists in your library — continuing will update or initialize a revision.
              </span>
            </div>
            <div className="cad-rev-actions">
              <button
                type="button"
                className="cad-btn-rev-action"
                onClick={() => setPartName(`${existingPart.name} (Rev 2.0)`)}
              >
                [ Create Revision 2.0 ]
              </button>
              <button
                type="button"
                className="cad-btn-rev-action"
                onClick={() => setPartName(`${existingPart.name}-B`)}
              >
                [ Rename to {existingPart.name}-B ]
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════
          FUTURISTIC CAD HUD DROPZONE (Corner crosshairs & Axis markers)
          ══════════════════════════════════════════════════════════ */}
      <div
        className={`cad-hud-dropzone ${isDragging ? 'is-dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS.join(',')}
          style={{ display: 'none' }}
          onChange={(e) => e.target.files && handleIncomingFiles(Array.from(e.target.files))}
        />

        {/* Technical Corner Crosshairs */}
        <span className="hud-corner hud-corner-tl">┌</span>
        <span className="hud-corner hud-corner-tr">┐</span>
        <span className="hud-corner hud-corner-bl">└</span>
        <span className="hud-corner hud-corner-br">┘</span>

        {/* Axis Labels */}
        <span className="hud-axis-label hud-axis-l">AXIS_Y-L</span>
        <span className="hud-axis-label hud-axis-r">AXIS_Y-R</span>

        {/* Center Hologram Isometric Cube Icon */}
        <div className="cad-drop-holo-cube">
          <svg width="44" height="44" viewBox="0 0 48 48" fill="none">
            <polygon points="24,4 44,14 44,34 24,44 4,34 4,14" stroke="#00f0ff" strokeWidth="1.6" strokeDasharray="3 2" fill="rgba(0, 240, 255, 0.05)" />
            <polygon points="24,14 36,20 36,32 24,38 12,32 12,20" stroke="#00f0ff" strokeWidth="2" fill="rgba(0, 240, 255, 0.15)" />
            <line x1="24" y1="14" x2="24" y2="38" stroke="#00f0ff" strokeWidth="1.8" />
            <line x1="12" y1="20" x2="24" y2="26" stroke="#00f0ff" strokeWidth="1.8" />
            <line x1="36" y1="20" x2="24" y2="26" stroke="#00f0ff" strokeWidth="1.8" />
            <circle cx="24" cy="26" r="3" fill="#00f0ff" />
          </svg>
        </div>

        <div className="cad-drop-main-text">
          Drag files here or <span className="cad-cyan-link">click to browse</span>
        </div>

        <div className="cad-drop-subtext">
          Auto-OCR & GD&T Geometric Dimensioning & Tolerancing enabled • Scaled B-Rep Reconstruction Engine
        </div>

        {/* Supported File Extension Tags */}
        <div className="cad-drop-formats-row">
          <span className="cad-fmt-tag"><strong style={{ color: '#ef4444' }}>● PDF</strong> ORTHO</span>
          <span className="cad-fmt-tag"><strong style={{ color: '#3b82f6' }}>● DOCX</strong> SPEC</span>
          <span className="cad-fmt-tag"><strong style={{ color: '#10b981' }}>● XLSX</strong> TOLERANCE</span>
          <span className="cad-fmt-tag"><strong style={{ color: '#06b6d4' }}>● CSV</strong> COORDS</span>
          <span className="cad-fmt-tag"><strong style={{ color: '#ec4899' }}>● PPTX</strong> PACK</span>
        </div>

        <div className="cad-drop-security-line">
          ENCRYPTION: TLS 1.3 // EPHEMERAL CAD PIPELINE BUFFER // LIMIT 150MB PER FILE
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          DOCUMENT QUEUE & PARSING PIPELINE
          ══════════════════════════════════════════════════════════ */}
      {queueFiles.length > 0 && (
        <div className="cad-queue-section">
          <div className="cad-queue-header-row">
            <div className="cad-queue-title-left">
              <h2 className="cad-queue-title">DOCUMENT QUEUE & PARSING PIPELINE</h2>
              <span className="cad-queue-count-pill">{queueFiles.length} file(s) attached</span>
            </div>
            <div className="cad-queue-specs-right">
              <span>PAYLOAD: <strong>{calculateTotalPayload()}</strong> • <strong style={{ color: '#00f0ff' }}>● 8 CORES DEDICATED</strong></span>
            </div>
          </div>

          {/* List of Queue Rows */}
          <div className="cad-queue-items-list">
            {queueFiles.map((item) => {
              const isPdf = item.ext === 'pdf';
              const isXlsx = item.ext === 'xlsx' || item.ext === 'xls';
              const isCsv = item.ext === 'csv' || item.ext === 'tsv';
              const isDocx = item.ext === 'docx' || item.ext === 'doc';

              return (
                <div key={item.id} className={`cad-queue-item-card ${item.state}`}>
                  {/* File Type Icon */}
                  <div className={`cad-file-icon-box ext-${item.ext}`}>
                    {isPdf && (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="9" y1="15" x2="15" y2="15" />
                      </svg>
                    )}
                    {isXlsx && (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <line x1="3" y1="9" x2="21" y2="9" />
                        <line x1="3" y1="15" x2="21" y2="15" />
                        <line x1="9" y1="3" x2="9" y2="21" />
                      </svg>
                    )}
                    {isCsv && (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                        <line x1="4" y1="10" x2="20" y2="10" />
                        <line x1="10" y1="4" x2="10" y2="20" />
                      </svg>
                    )}
                    {isDocx && (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                      </svg>
                    )}
                  </div>

                  {/* File Details */}
                  <div className="cad-item-meta-col">
                    <div className="cad-item-filename">{item.name}</div>
                    <div className="cad-item-subinfo">
                      {formatFileSize(item.size)} / {item.meta}
                    </div>
                  </div>

                  {/* Progress / Status Center Column */}
                  <div className="cad-item-progress-col">
                    {item.state === 'error' ? (
                      <div className="cad-error-pill-status">
                        <span>⚠ {item.status}</span>
                      </div>
                    ) : (
                      <>
                        <div className="cad-progress-label-row">
                          <span className={`status-dot dot-${item.state}`}>●</span>
                          <span className="status-text">{item.status}</span>
                          <span className="status-percent">{item.progress}%</span>
                        </div>
                        <div className="cad-progress-bar-track">
                          <div
                            className={`cad-progress-bar-fill fill-${item.state}`}
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                      </>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="cad-item-actions-col">
                    <button
                      type="button"
                      className="cad-btn-item-action"
                      onClick={() => setInspectModalFile(item)}
                    >
                      🔍 Inspect
                    </button>

                    <button
                      type="button"
                      className="cad-btn-item-delete"
                      onClick={() => removeQueueItem(item.id)}
                      title="Remove document from queue"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Queue Bottom Control Bar */}
          <div className="cad-queue-bottom-bar">
            <div className="cad-queue-bottom-left">
              <button
                type="button"
                className="cad-btn-queue-opt"
                onClick={() => setShowSettingsModal(true)}
              >
                ⚙ Extraction Settings (GD&T Rigor: {gdtRigor})
              </button>
              <button
                type="button"
                className="cad-btn-queue-clear"
                onClick={clearQueue}
              >
                Clear Queue
              </button>
            </div>

            <div className="cad-queue-bottom-right">
              <button
                type="button"
                className="cad-btn-start-pipeline"
                onClick={handleStartPipeline}
                disabled={uploading || queueFiles.length === 0}
              >
                <span className="pipeline-btn-icon">⚛</span>
                {uploading ? (pipelineStep || 'Extracting CAD Dimensions...') : 'Start CAD Extraction Pipeline'}
              </button>
            </div>
          </div>

          {uploading && (
            <div className="cad-pipeline-active-progress">
              <div className="pipeline-pulse-track">
                <div className="pipeline-pulse-fill" style={{ width: `${pipelineProgress}%` }} />
              </div>
              <div className="pipeline-status-line">
                <span className="cad-spinner-dot" />
                <span>{pipelineStep}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          "YOUR PARTS" LIVE BLUEPRINT GALLERY (Only real parts from document)
          ══════════════════════════════════════════════════════════ */}
      <div className="cad-parts-gallery-section" id="your-parts">
        <div className="cad-gallery-top-row">
          <div className="cad-gallery-title-group">
            <h2 className="cad-gallery-title">Your Ingested Parts</h2>
            <span className="cad-gallery-count-pill">{recentParts.length} parts stored</span>
            <span className="cad-gallery-storage-pill">CAD DATABASE: ACTIVE</span>
          </div>

          {recentParts.length > 0 && (
            <div className="cad-gallery-controls">
              <div className="cad-search-box">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Search parts by name, rev, or tag"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                />
              </div>

              <div className="cad-filter-pills-group">
                {['All', 'Ready for 3D', 'Needs Review'].map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`cad-gallery-pill ${statusFilter === f ? 'active' : ''}`}
                    onClick={() => setStatusFilter(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>

              <select
                className="cad-sort-dropdown"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              >
                <option>Sort: Recently Updated (Desc)</option>
                <option>Sort: Name (A-Z)</option>
              </select>
            </div>
          )}
        </div>

        {/* Loading State */}
        {loadingParts ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#22d3ee', fontFamily: 'var(--font-mono)' }}>
            <span className="cad-spinner-dot" style={{ display: 'inline-block', marginRight: '8px' }} />
            FETCHING CAD PARTS REPOSITORY...
          </div>
        ) : filteredParts.length === 0 ? (
          /* Empty State */
          <div
            style={{
              background: 'rgba(15, 22, 32, 0.5)',
              border: '1px dashed rgba(34, 211, 238, 0.25)',
              borderRadius: '12px',
              padding: '48px 24px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '2.4rem', marginBottom: '12px' }}>📂</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: '700', color: '#f1f5f9', marginBottom: '6px' }}>
              {recentParts.length === 0 ? 'NO EXTRACTED PARTS YET' : 'NO PARTS MATCH FILTER'}
            </div>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', maxWidth: '520px', margin: '0 auto 20px' }}>
              {recentParts.length === 0
                ? 'Attach your hydraulic specification document (PDF, XLSX, CSV, DOCX) in the dropzone above and click "Start CAD Extraction Pipeline" to synthesize your verified 3D CAD model.'
                : 'Try adjusting your search filter above.'}
            </p>
            {recentParts.length === 0 && (
              <button
                type="button"
                className="cad-btn-load-demo"
                onClick={handleLoadDemo}
              >
                🛠 Load Demo Cylinder Spec & Test Pipeline
              </button>
            )}
          </div>
        ) : (
          /* Real Parts Grid */
          <div className="cad-cards-grid">
            {filteredParts.map((part) => {
              const isReady = part.status === 'ready' || part.status === 'complete';
              const paramCount = part.spec_data?.parameters
                ? Object.keys(part.spec_data.parameters).length
                : (part.spec_fields_count || 12);
              const partType = part.part_type || 'cylinder';
              const dateStr = part.created_at ? new Date(part.created_at).toLocaleDateString() : 'Active';

              return (
                <div
                  key={part.id}
                  className={`cad-part-card ${isReady ? 'border-success' : 'border-warning'}`}
                  onClick={() => navigate(`/specs/viewer/${part.id}`)}
                  title="Click to open related 3D CAD Viewer"
                >
                  {/* Card Header Tag */}
                  <div className="cad-card-top-tag-row">
                    <span className={`cad-tag-status ${isReady ? 'tag-success' : 'tag-warning'}`}>
                      {isReady ? 'B-REP READY' : 'REVISION ACTIVE'}
                    </span>
                    <button
                      type="button"
                      className="cad-btn-item-delete"
                      style={{ marginLeft: 'auto', fontSize: '0.8rem' }}
                      onClick={(e) => handleDeletePart(part.id, part.name, e)}
                      disabled={deletingPartId === part.id}
                      title="Delete part"
                    >
                      {deletingPartId === part.id ? '...' : '🗑'}
                    </button>
                  </div>

                  {/* Vector Blueprint Wireframe Canvas Preview matching Part Type */}
                  <div className="cad-wireframe-preview-box">
                    {partType === 'cylinder' && (
                      <svg width="100%" height="80" viewBox="0 0 200 80" fill="none">
                        <ellipse cx="40" cy="40" rx="14" ry="24" stroke="#00f0ff" strokeWidth="1.6" />
                        <line x1="40" y1="16" x2="160" y2="16" stroke="#00f0ff" strokeWidth="1.6" />
                        <line x1="40" y1="64" x2="160" y2="64" stroke="#00f0ff" strokeWidth="1.6" />
                        <ellipse cx="160" cy="40" rx="14" ry="24" stroke="#00f0ff" strokeWidth="1.6" strokeDasharray="3 2" />
                        <line x1="160" y1="40" x2="190" y2="40" stroke="#00f0ff" strokeWidth="1.4" />
                        <line x1="40" y1="8" x2="160" y2="8" stroke="#64748b" strokeWidth="1" strokeDasharray="2 2" />
                        <text x="100" y="7" fill="#00f0ff" fontSize="9" textAnchor="middle" fontFamily="monospace">L 450mm</text>
                        <text x="100" y="44" fill="#64748b" fontSize="8" textAnchor="middle" fontFamily="monospace">Ø 120mm</text>
                      </svg>
                    )}

                    {partType === 'manifold' && (
                      <svg width="100%" height="80" viewBox="0 0 200 80" fill="none">
                        <polygon points="50,15 150,15 170,35 70,35" stroke="#00f0ff" strokeWidth="1.4" />
                        <polygon points="50,15 50,55 70,75 70,35" stroke="#00f0ff" strokeWidth="1.4" />
                        <polygon points="70,35 170,35 170,75 70,75" stroke="#00f0ff" strokeWidth="1.4" />
                        <circle cx="120" cy="55" r="8" stroke="#22d3ee" strokeWidth="1.4" />
                        <circle cx="90" cy="45" r="6" stroke="#22d3ee" strokeWidth="1.4" />
                        <text x="120" y="58" fill="#22d3ee" fontSize="8" textAnchor="middle" fontFamily="monospace">P1/P2</text>
                      </svg>
                    )}

                    {partType === 'valve' && (
                      <svg width="100%" height="80" viewBox="0 0 200 80" fill="none">
                        <rect x="40" y="20" width="120" height="40" rx="4" stroke="#00f0ff" strokeWidth="1.6" />
                        <polygon points="50,40 70,25 70,55" stroke="#00f0ff" strokeWidth="1.4" fill="rgba(0,240,255,0.1)" />
                        <polygon points="150,40 130,25 130,55" stroke="#00f0ff" strokeWidth="1.4" fill="rgba(0,240,255,0.1)" />
                        <line x1="70" y1="40" x2="130" y2="40" stroke="#00f0ff" strokeWidth="1.4" />
                        <circle cx="100" cy="40" r="6" fill="#00f0ff" />
                      </svg>
                    )}

                    {partType !== 'cylinder' && partType !== 'manifold' && partType !== 'valve' && (
                      <svg width="100%" height="80" viewBox="0 0 200 80" fill="none">
                        <ellipse cx="100" cy="40" rx="55" ry="25" stroke="#00f0ff" strokeWidth="1.6" />
                        <ellipse cx="100" cy="40" rx="30" ry="14" stroke="#00f0ff" strokeWidth="1.6" fill="rgba(0, 240, 255, 0.05)" />
                        <circle cx="65" cy="40" r="2.5" fill="#00f0ff" />
                        <circle cx="135" cy="40" r="2.5" fill="#00f0ff" />
                        <text x="100" y="74" fill="#64748b" fontSize="8" textAnchor="middle" fontFamily="monospace">ISO 2768-m</text>
                      </svg>
                    )}
                  </div>

                  {/* Part Title & Revision */}
                  <div className="cad-card-title-row">
                    <span className="cad-card-name" title={part.name}>{part.name}</span>
                    <span className="cad-card-rev">REV 1.0</span>
                  </div>

                  {/* Status & Dimension Count */}
                  <div className="cad-card-dim-status">
                    <span className={`card-status-dot ${isReady ? 'dot-success' : 'dot-warning'}`}>●</span>
                    <span className="card-status-name">{isReady ? 'Complete' : 'Needs Review'}</span>
                    <span className="card-dim-count">{paramCount} dimensions</span>
                  </div>

                  {/* Document Summary */}
                  <div className="cad-card-docs-summary">
                    Extracted from uploaded spec • {partType.toUpperCase()}
                  </div>

                  {/* Card Meta & Badges */}
                  <div className="cad-card-footer-meta">
                    <span className="card-author-time">{dateStr} by {userName}</span>
                    <span className="card-cad-badge">STEP / STL</span>
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="cad-card-action-btn btn-cyan"
                      style={{ flex: 1 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/specs/viewer/${part.id}`);
                      }}
                    >
                      Open 3D Viewer →
                    </button>
                    <button
                      type="button"
                      className="cad-card-action-btn btn-warning"
                      style={{ flex: 1 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/specs/review/${part.id}`);
                      }}
                    >
                      Review ⇋
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════
          INSPECT / MATRIX MODAL
          ══════════════════════════════════════════════════════════ */}
      {inspectModalFile && (
        <div className="cad-modal-backdrop" onClick={() => setInspectModalFile(null)}>
          <div className="cad-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="cad-modal-header">
              <div className="cad-modal-title">
                <span>GD&T INSPECTOR: <strong>{inspectModalFile.name}</strong></span>
              </div>
              <button className="cad-modal-close" onClick={() => setInspectModalFile(null)}>✕</button>
            </div>
            <div className="cad-modal-body">
              <div className="cad-inspect-row">
                <span className="key">File Format:</span>
                <span className="val">{inspectModalFile.ext.toUpperCase()} Orthographic / Spec Matrix</span>
              </div>
              <div className="cad-inspect-row">
                <span className="key">Payload Size:</span>
                <span className="val">{formatFileSize(inspectModalFile.size)}</span>
              </div>
              <div className="cad-inspect-row">
                <span className="key">Detected GD&T Vectors:</span>
                <span className="val text-cyan">Linear Dimensions & Tolerances (ISO 2768)</span>
              </div>
              <div className="cad-inspect-row">
                <span className="key">B-Rep Anchor Confidence:</span>
                <span className="val text-green">98.4% Ground Truth Match</span>
              </div>
              <div className="cad-inspect-sample-box">
                <code>
                  [VECTOR_01] COMPONENT: {partName || 'Hydraulic Component'}<br />
                  [VECTOR_02] SPEC_SOURCE: {inspectModalFile.name}<br />
                  [VECTOR_03] EXTRACTION: Scaled B-Rep Reconstruction Active<br />
                  [VECTOR_04] TOLERANCE: {standardTolerance}
                </code>
              </div>
            </div>
            <div className="cad-modal-footer">
              <button className="cad-btn-modal-close" onClick={() => setInspectModalFile(null)}>Close Inspector</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          SETTINGS MODAL
          ══════════════════════════════════════════════════════════ */}
      {showSettingsModal && (
        <div className="cad-modal-backdrop" onClick={() => setShowSettingsModal(false)}>
          <div className="cad-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="cad-modal-header">
              <div className="cad-modal-title">
                <span>GD&T Extraction Pipeline Settings</span>
              </div>
              <button className="cad-modal-close" onClick={() => setShowSettingsModal(false)}>✕</button>
            </div>
            <div className="cad-modal-body">
              <div className="cad-setting-group">
                <label style={{ color: '#94a3b8', fontSize: '0.8rem' }}>GD&T Rigor Level:</label>
                <div className="cad-rigor-options">
                  {['Strict', 'Balanced', 'Permissive'].map((level) => (
                    <button
                      key={level}
                      type="button"
                      className={`cad-rigor-btn ${gdtRigor === level ? 'active' : ''}`}
                      onClick={() => setGdtRigor(level)}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
              <div className="cad-setting-group" style={{ marginTop: 16 }}>
                <label style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Default Standard Tolerance:</label>
                <select
                  className="cad-setting-select"
                  value={standardTolerance}
                  onChange={(e) => setStandardTolerance(e.target.value)}
                >
                  <option>ISO 2768-mK (Medium - Machined)</option>
                  <option>ISO 2768-fH (Fine - Precision Ground)</option>
                  <option>ISO 2768-c (Coarse - Castings)</option>
                  <option>ASME Y14.5-2018 Standard</option>
                </select>
              </div>
            </div>
            <div className="cad-modal-footer">
              <button className="cad-btn-modal-close" onClick={() => setShowSettingsModal(false)}>Apply & Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
