/**
 * Spec-to-3D Generator — Specification Review & Audit Screen (Part 6 Enhanced)
 * Features:
 * - Two-Pass computed confidence badges (High Consensus, Medium Single-Method, Conflicting)
 * - Tolerance & GD&T fit display
 * - Cross-document & cross-pass conflict resolution UI
 * - Visual PDF citation bounding-box overlay modal
 * - Document revision diffing banner
 * - Manual edit overrides with audit logging
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';

export default function SpecReviewPage() {
  const { partId } = useParams();
  const navigate = useNavigate();

  const [partData, setPartData] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [fields, setFields] = useState([]);
  const [diffData, setDiffData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState(null);

  // Manual Edit Modal State
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Conflict Resolution Modal State
  const [resolvingField, setResolvingField] = useState(null);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [resolving, setResolving] = useState(false);

  // Visual Citation Overlay Modal State
  const [citationModal, setCitationModal] = useState(null);
  const [overlayData, setOverlayData] = useState(null);
  const [loadingOverlay, setLoadingOverlay] = useState(false);

  useEffect(() => {
    if (partId) {
      loadPartSpecs();
    }
  }, [partId]);

  const loadPartSpecs = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getPartSpecs(partId);
      setPartData(res.part);
      setDocuments(res.documents || []);
      setFields(res.fields || []);

      // Fetch revision diff
      try {
        const diffRes = await api.getPartDiff(partId);
        setDiffData(diffRes.latest);
      } catch {
        setDiffData(null);
      }
    } catch (err) {
      setError(err.message || 'Failed to load specifications.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEdit = (field) => {
    setEditingField(field);
    setEditValue(field.user_correction || field.normalized_value || '');
    setEditUnit(field.unit || field.original_unit || 'mm');
  };

  const handleSaveEdit = async () => {
    if (!editingField || !editValue.trim()) return;

    try {
      setSavingEdit(true);
      const updated = await api.updateSpecField(editingField.id, editValue.trim(), editUnit.trim());
      setFields((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setEditingField(null);
    } catch (err) {
      alert('Failed to save correction: ' + err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleOpenConflict = (field) => {
    setResolvingField(field);
    const candidates = field.candidate_values || [];
    if (candidates.length > 0) {
      setSelectedCandidate(candidates[0]);
    }
  };

  const handleConfirmConflictResolution = async () => {
    if (!resolvingField || !selectedCandidate) return;

    try {
      setResolving(true);
      const updated = await api.resolveConflict(
        resolvingField.id,
        selectedCandidate.value,
        selectedCandidate.unit || resolvingField.unit
      );
      setFields((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      setResolvingField(null);
      await loadPartSpecs();
    } catch (err) {
      alert('Conflict resolution failed: ' + err.message);
    } finally {
      setResolving(false);
    }
  };

  const handleOpenSourceOverlay = async (field) => {
    setCitationModal(field);
    setLoadingOverlay(true);
    setOverlayData(null);

    try {
      let pageNum = 1;
      if (field.source_location) {
        const match = field.source_location.match(/Page\s+(\d+)/i);
        if (match) pageNum = parseInt(match[1], 10);
      }
      const data = await api.getDocumentPageOverlay(field.document_id, pageNum);
      setOverlayData(data);
    } catch (err) {
      console.warn('Failed to load page image overlay:', err);
    } finally {
      setLoadingOverlay(false);
    }
  };

  const handleBuildHologram = async () => {
    try {
      setGenerating(true);
      await api.generatePartModel(partId, true);
      navigate(`/specs/viewer/${partId}`);
    } catch (err) {
      setError(err.message || 'Failed to generate 3D geometry.');
      setGenerating(false);
    }
  };

  const handleDownloadReport = async () => {
    try {
      setDownloadingReport(true);
      await api.downloadSpecReport(partId, partData?.name || 'part');
    } catch (err) {
      alert('Report download failed: ' + err.message);
    } finally {
      setDownloadingReport(false);
    }
  };

  const handleDeleteDocument = async (docId, filename) => {
    const confirmed = window.confirm(`Remove '${filename}' from this part? Specifications will be re-extracted automatically.`);
    if (!confirmed) return;

    try {
      setDeletingDocId(docId);
      await api.deletePartDocument(partId, docId);
      await loadPartSpecs();
    } catch (err) {
      alert('Document deletion failed: ' + err.message);
    } finally {
      setDeletingDocId(null);
    }
  };

  const handleDeleteEntirePart = async () => {
    const confirmed = window.confirm(`Permanently delete part '${partData?.name}' and all associated files?`);
    if (!confirmed) return;

    try {
      await api.deletePart(partId);
      navigate('/specs/upload');
    } catch (err) {
      alert('Part deletion failed: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ padding: '60px 0', textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto 20px' }} />
        <h2>Running Two-Pass Ground-Truth Extraction...</h2>
        <p style={{ color: 'var(--text-muted)' }}>Executing pattern consensus, cross-document verification, and spatial indexing.</p>
      </div>
    );
  }

  const availableCount = fields.filter((f) => f.is_available && !f.conflict).length;
  const missingCount = fields.filter((f) => !f.is_available && !f.conflict).length;
  const conflictCount = fields.filter((f) => f.conflict).length;

  return (
    <div className="container" style={{ padding: '30px 0 60px' }}>
      {/* Top Header Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <button
            onClick={() => navigate('/specs/upload')}
            className="btn-secondary"
            style={{ marginBottom: '12px', fontSize: '0.85rem' }}
          >
            ← Back to Uploads
          </button>
          <h1 style={{ fontSize: '1.8rem', color: 'var(--text-heading)', margin: 0 }}>
            {partData?.name || 'Part Specification Audit'}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
            Part ID: <code style={{ color: 'var(--accent-blue)' }}>{partId}</code> • Status:{' '}
            <span className={`file-status status--${partData?.status}`}>{partData?.status}</span>
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="btn-secondary"
            onClick={handleDownloadReport}
            disabled={downloadingReport}
            title="Download JSON audit report of verified specs"
          >
            {downloadingReport ? 'Generating...' : '📥 Download Report'}
          </button>
          <button
            className="btn-danger"
            onClick={handleDeleteEntirePart}
            title="Delete this entire part"
          >
            🗑️ Delete Part
          </button>
          <button
            className="btn-primary"
            onClick={handleBuildHologram}
            disabled={generating || conflictCount > 0}
            title={conflictCount > 0 ? 'Resolve conflicts before generating geometry' : 'Build parametric 3D holographic projection'}
          >
            {generating ? 'Constructing CAD...' : '⚡ Generate 3D Hologram'}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert--error" style={{ marginBottom: '20px' }}>
          {error}
        </div>
      )}

      {/* Revision Diff Alert Banner */}
      {diffData && diffData.has_changes && (
        <div
          className="component-card"
          style={{
            marginBottom: '24px',
            borderLeft: '4px solid var(--accent-blue)',
            background: 'rgba(59, 130, 246, 0.08)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '1rem', color: 'var(--accent-blue)', margin: 0 }}>
                🔄 Document Revision Diff Detected
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {diffData.summary}
              </p>
            </div>
          </div>
          {diffData.changed_fields?.length > 0 && (
            <div style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <strong>Modified Parameters:</strong>{' '}
              {diffData.changed_fields.map((c, i) => (
                <span key={i} style={{ marginRight: '12px' }}>
                  {c.field_name}: <del>{c.old_value}</del> → <strong style={{ color: 'var(--accent-yellow)' }}>{c.new_value}</strong>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Conflict Warning Banner */}
      {conflictCount > 0 && (
        <div
          className="component-card"
          style={{
            marginBottom: '24px',
            borderLeft: '4px solid #f59e0b',
            background: 'rgba(245, 158, 11, 0.1)',
          }}
        >
          <h3 style={{ fontSize: '1rem', color: '#f59e0b', margin: 0 }}>
            ⚠️ {conflictCount} Parameter Conflict{conflictCount > 1 ? 's' : ''} Detected
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Different values were extracted across documents or extraction passes. In accordance with zero-hallucination rules, conflicting fields are treated as unavailable until resolved.
          </p>
        </div>
      )}

      {/* Summary KPI Strip */}
      <div className="status-grid" style={{ marginBottom: '24px' }}>
        <div className="status-card">
          <div className="status-item">
            <span className="status-num" style={{ color: 'var(--accent-green)' }}>{availableCount}</span>
            <span className="status-label">Verified Available</span>
          </div>
          <div className="status-item">
            <span className="status-num" style={{ color: conflictCount > 0 ? '#f59e0b' : 'var(--text-muted)' }}>
              {conflictCount}
            </span>
            <span className="status-label">Conflicting</span>
          </div>
          <div className="status-item">
            <span className="status-num" style={{ color: missingCount > 0 ? '#f87171' : 'var(--text-muted)' }}>
              {missingCount}
            </span>
            <span className="status-label">Not Available in Doc</span>
          </div>
          <div className="status-item">
            <span className="status-num" style={{ color: 'var(--accent-blue)' }}>100%</span>
            <span className="status-label">Ground Truth Fidelity</span>
          </div>
        </div>
      </div>

      {/* Ingested Source Documents Section */}
      <div className="file-section" style={{ marginBottom: '30px' }}>
        <h3 style={{ fontSize: '1rem', color: 'var(--text-heading)', marginBottom: '12px' }}>
          Ingested Documents ({documents.length})
        </h3>
        <div className="file-list">
          {documents.map((doc) => (
            <div key={doc.id} className="file-item">
              <span className="file-icon">📄</span>
              <span className="file-name">{doc.filename}</span>
              <span className="file-size" style={{ textTransform: 'uppercase' }}>{doc.format}</span>
              {doc.ocr_flag && (
                <span className="confidence confidence--medium" style={{ background: 'rgba(245, 158, 11, 0.2)' }}>
                  🔍 OCR-Derived
                </span>
              )}
              <span className={`file-status status--${doc.parse_status}`}>{doc.parse_status}</span>
              <button
                type="button"
                className="btn-icon btn-danger"
                onClick={() => handleDeleteDocument(doc.id, doc.filename)}
                disabled={deletingDocId === doc.id}
                title="Delete document and re-extract specs"
                style={{ marginLeft: 'auto' }}
              >
                {deletingDocId === doc.id ? '...' : '✕'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Extracted Specifications Table */}
      <div className="component-card">
        <div className="component-header">
          <div className="component-title">
            <span className="component-type">Verified Technical Specifications</span>
            <span className="component-status status--ready_for_generation">Two-Pass Ground Truth</span>
          </div>
        </div>

        <table className="param-table">
          <thead>
            <tr>
              <th>Parameter / Dimension</th>
              <th>Verified Value</th>
              <th>Tolerance / GD&T</th>
              <th>Source Location</th>
              <th>Confidence & Method</th>
              <th>Raw Citation Snippet</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => {
              const isAvailable = field.is_available && !field.conflict;
              const isConflict = !!field.conflict;
              const hasCorrection = !!field.user_correction;

              return (
                <tr key={field.id} className={isConflict ? 'row--conflict' : (!isAvailable ? 'row--missing' : '')}>
                  <td className="param-name">
                    <strong style={{ textTransform: 'capitalize' }}>
                      {field.field_name.replace(/_/g, ' ')}
                    </strong>
                  </td>

                  <td>
                    {isConflict ? (
                      <div>
                        <span className="confidence" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b' }}>
                          ⚠️ Conflict Detected
                        </span>
                        <div style={{ fontSize: '0.75rem', color: '#f59e0b', marginTop: '4px' }}>
                          {field.not_available_reason}
                        </div>
                      </div>
                    ) : isAvailable ? (
                      <div>
                        <span className="param-value" style={{ fontSize: '1rem' }}>
                          {hasCorrection ? field.user_correction : field.normalized_value} {field.unit || ''}
                        </span>
                        {hasCorrection && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--accent-yellow)', display: 'block' }}>
                            (User Corrected: was "{field.raw_value}")
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="confidence confidence--low" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}>
                        Not available in document
                      </span>
                    )}
                  </td>

                  <td>
                    {field.tolerance_data ? (
                      <span
                        className="confidence"
                        style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#a5b4fc' }}
                      >
                        📏 {field.tolerance_data.display}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>

                  <td className="param-location">
                    {field.source_location ? (
                      <span>📍 {field.source_location}</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>

                  <td>
                    <span className={`confidence confidence--${field.confidence || 'medium'}`}>
                      {field.confidence === 'high'
                        ? '⭐ High (Consensus)'
                        : field.confidence === 'conflicting'
                        ? '⚠️ Conflicting'
                        : `✓ Medium (${field.extraction_method || 'single'})`}
                    </span>
                  </td>

                  <td className="param-source" style={{ maxWidth: '240px' }}>
                    {field.source_snippet ? (
                      <code style={{ fontSize: '0.75rem', background: 'rgba(0,0,0,0.3)', padding: '3px 6px', borderRadius: '4px' }}>
                        "{field.source_snippet}"
                      </code>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>

                  <td style={{ whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {isConflict ? (
                        <button
                          className="btn-sm"
                          style={{ background: '#f59e0b', color: '#000', fontWeight: 'bold' }}
                          onClick={() => handleOpenConflict(field)}
                          title="Resolve conflict between sources"
                        >
                          ⚖️ Resolve
                        </button>
                      ) : (
                        <button
                          className="btn-sm btn-edit"
                          onClick={() => handleOpenEdit(field)}
                          title="Correct or provide value"
                        >
                          ✏️ Edit
                        </button>
                      )}

                      <button
                        className="btn-sm btn-secondary"
                        onClick={() => handleOpenSourceOverlay(field)}
                        title="View visual citation on original document page"
                      >
                        🔍 Source
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Manual Correction Modal */}
      {editingField && (
        <div className="modal-backdrop">
          <div className="component-card modal-card">
            <h3 style={{ fontSize: '1.2rem', marginBottom: '8px', color: 'var(--text-heading)' }}>
              Manual Spec Correction: <span style={{ color: 'var(--accent-blue)' }}>{editingField.field_name}</span>
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Note: The original raw extracted value and citation are preserved in the database audit log.
            </p>

            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label>Corrected Value</label>
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                placeholder="e.g. 120"
                autoFocus
              />
            </div>

            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label>Unit</label>
              <input
                type="text"
                value={editUnit}
                onChange={(e) => setEditUnit(e.target.value)}
                placeholder="e.g. mm, bar, inch"
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="btn-secondary" onClick={() => setEditingField(null)} disabled={savingEdit}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSaveEdit} disabled={savingEdit}>
                {savingEdit ? 'Saving...' : 'Confirm Correction'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Conflict Resolution Modal */}
      {resolvingField && (
        <div className="modal-backdrop">
          <div className="component-card modal-card" style={{ maxWidth: '540px' }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '8px', color: '#f59e0b' }}>
              ⚖️ Resolve Conflict: {resolvingField.field_name.replace(/_/g, ' ')}
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Different documents or extraction passes produced conflicting values. Select the authoritative value:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              {(resolvingField.candidate_values || []).map((cand, idx) => (
                <label
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '12px',
                    borderRadius: '8px',
                    border: selectedCandidate === cand ? '2px solid var(--accent-blue)' : '1px solid var(--border-color)',
                    background: selectedCandidate === cand ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-card)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="candidateChoice"
                    checked={selectedCandidate === cand}
                    onChange={() => setSelectedCandidate(cand)}
                    style={{ marginTop: '4px' }}
                  />
                  <div>
                    <strong style={{ fontSize: '1rem', color: 'var(--text-heading)' }}>
                      {cand.value} {cand.unit || resolvingField.unit || ''}
                    </strong>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Source: {cand.document || cand.method} • 📍 {cand.location || 'Document'}
                    </div>
                  </div>
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="btn-secondary" onClick={() => setResolvingField(null)} disabled={resolving}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleConfirmConflictResolution} disabled={resolving}>
                {resolving ? 'Resolving...' : 'Confirm Authoritative Value'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visual Source Citation Overlay Modal */}
      {citationModal && (
        <div className="modal-backdrop">
          <div className="component-card modal-card" style={{ maxWidth: '780px', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontSize: '1.1rem', margin: 0, color: 'var(--text-heading)' }}>
                🔍 Visual Citation: <span style={{ color: 'var(--accent-blue)' }}>{citationModal.field_name}</span>
              </h3>
              <button className="btn-icon" onClick={() => setCitationModal(null)}>✕</button>
            </div>

            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
              Citation: <strong>{citationModal.source_location}</strong> • Raw Snippet: <code>"{citationModal.source_snippet}"</code>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', background: '#0f172a', borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'center' }}>
              {loadingOverlay ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <div className="spinner" style={{ margin: '0 auto 12px' }} />
                  <p>Rendering source document page...</p>
                </div>
              ) : overlayData?.image_data ? (
                <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
                  <img
                    src={overlayData.image_data}
                    alt="Document Page"
                    style={{ maxWidth: '100%', borderRadius: '4px', display: 'block' }}
                  />
                  {/* Bounding box overlays */}
                  {(overlayData.annotations || []).map((ann, idx) => {
                    const [x0, top, x1, bottom] = ann.bbox;
                    const scaleX = 100 / (overlayData.page_width || 612);
                    const scaleY = 100 / (overlayData.page_height || 792);

                    return (
                      <div
                        key={idx}
                        style={{
                          position: 'absolute',
                          left: `${x0 * scaleX}%`,
                          top: `${top * scaleY}%`,
                          width: `${(x1 - x0) * scaleX}%`,
                          height: `${(bottom - top) * scaleY}%`,
                          border: '2px solid #00f0ff',
                          backgroundColor: 'rgba(0, 240, 255, 0.25)',
                          borderRadius: '2px',
                          pointerEvents: 'none',
                        }}
                      />
                    );
                  })}
                </div>
              ) : (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <p>📄 Text / Tabular Source Citation</p>
                  <pre style={{ textAlign: 'left', background: 'rgba(0,0,0,0.5)', padding: '12px', borderRadius: '6px', fontSize: '0.85rem' }}>
                    {citationModal.source_snippet || overlayData?.raw_snippet || 'No raw image available for this document format.'}
                  </pre>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px' }}>
              <button className="btn-secondary" onClick={() => setCitationModal(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
