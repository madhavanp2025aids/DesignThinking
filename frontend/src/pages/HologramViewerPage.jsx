/**
 * Spec-to-3D Generator — JARVIS Holographic 3D Presentation Screen (Part 3)
 * Full Iron-Man / JARVIS holographic projection viewer, interactive 3D HUD nodes,
 * bidirectional dimension highlighting with side-panel spec cards, and STL mesh export.
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import HolographicViewer from '../components/HolographicViewer';

export default function HologramViewerPage() {
  const { partId } = useParams();
  const navigate = useNavigate();

  const [partData, setPartData] = useState(null);
  const [geometryData, setGeometryData] = useState(null);
  const [specsData, setSpecsData] = useState([]);
  const [selectedFieldId, setSelectedFieldId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rebuilding, setRebuilding] = useState(false);

  useEffect(() => {
    if (partId) {
      loadModelAndSpecs();
    }
  }, [partId]);

  const loadModelAndSpecs = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch geometry & specs concurrently
      const [geomRes, specRes] = await Promise.all([
        api.getPartGeometry(partId),
        api.getPartSpecs(partId),
      ]);

      setGeometryData(geomRes);
      setPartData(specRes.part);
      setSpecsData(specRes.fields || []);
    } catch (err) {
      setError(err.message || 'Failed to load holographic 3D model.');
    } finally {
      setLoading(false);
    }
  };

  const handleRebuild = async () => {
    try {
      setRebuilding(true);
      const geomRes = await api.generatePartModel(partId, true);
      setGeometryData(geomRes);
    } catch (err) {
      alert('Rebuild failed: ' + err.message);
    } finally {
      setRebuilding(false);
    }
  };

  const handleDownloadSTL = () => {
    const meshUrl = api.getPartMeshUrl(partId);
    const link = document.createElement('a');
    link.href = meshUrl;
    link.download = `${partData?.name || 'model'}.stl`;
    link.click();
  };

  if (loading) {
    return (
      <div className="hologram-loading-page" style={{ textAlign: 'center', padding: '100px 0' }}>
        <div style={{ fontSize: '3rem', marginBottom: '20px', animation: 'spin 2s linear infinite' }}>⚛</div>
        <h2 style={{ color: '#00f0ff', letterSpacing: '2px', textTransform: 'uppercase' }}>
          Initializing JARVIS Holographic Projection...
        </h2>
        <p style={{ color: 'var(--text-muted)' }}>Assembling parametric CAD mesh from verified numeric specifications...</p>
      </div>
    );
  }

  const isPlaceholder = geometryData?.is_placeholder;
  const missingFields = geometryData?.missing_fields || [];
  const meshUrl = api.getPartMeshUrl(partId);

  return (
    <div className="hologram-page-layout">
      {/* Top Header & Actions Bar */}
      <div className="hologram-top-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1 style={{ fontSize: '1.4rem', color: '#00f0ff', letterSpacing: '1px', textTransform: 'uppercase', margin: 0 }}>
              ⚛ {partData?.name}
            </h1>
            <span className={`confidence ${isPlaceholder ? 'confidence--low' : 'confidence--high'}`}>
              {isPlaceholder ? 'INCOMPLETE SPECIFICATIONS' : '100% SPEC-DRIVEN CAD'}
            </span>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Template: <strong style={{ color: '#ffffff' }}>{geometryData?.template_used?.toUpperCase()}</strong> | Version: {geometryData?.version}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn-secondary" onClick={() => navigate(`/specs/review/${partId}`)}>
            📋 Audit Specs
          </button>
          <button className="btn-secondary" onClick={handleRebuild} disabled={rebuilding}>
            {rebuilding ? 'Rebuilding...' : '🔄 Recompute Model'}
          </button>
          <button className="btn-download" onClick={handleDownloadSTL}>
            ⬇ Download STL
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <strong>Error:</strong> {error}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-sm btn-edit" onClick={loadModelAndSpecs}>
              🔄 Retry
            </button>
            <button className="btn-sm btn-secondary" onClick={() => navigate('/specs/upload')}>
              ← Back to Upload
            </button>
          </div>
        </div>
      )}

      {/* Incomplete Spec Placeholder Warning Alert */}
      {isPlaceholder && (
        <div className="alert" style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#fca5a5', marginBottom: '16px' }}>
          <strong>⚠️ Incomplete Spec Placeholder Active:</strong> One or more required geometric dimensions are missing in the uploaded document ({missingFields.join(', ')}). The system has rendered an incomplete wireframe bounding model instead of guessing or inventing numbers.
        </div>
      )}

      {/* Main Split Viewport: 3D Hologram (Left) + Interactive Spec Panel (Right) */}
      <div className="hologram-main-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '20px', minHeight: '620px' }}>
        {/* Left: 3D Holographic Viewer */}
        <div style={{ height: '620px', borderRadius: '12px', overflow: 'hidden', border: '1px solid #00f0ff33', boxShadow: '0 0 25px rgba(0, 240, 255, 0.1)' }}>
          <HolographicViewer
            meshUrl={meshUrl}
            partId={partId}
            holographicConfig={geometryData?.holographic_config}
            selectedFieldId={selectedFieldId}
            onSelectAnchor={setSelectedFieldId}
          />
        </div>

        {/* Right: Interactive Spec Side Panel with Two-Way Highlight */}
        <div
          className="component-card"
          style={{
            height: '620px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
          }}
        >
          <div className="component-header" style={{ padding: '14px 18px' }}>
            <h3 style={{ fontSize: '1rem', color: '#00f0ff', letterSpacing: '0.5px' }}>
              🔍 Interactive Specifications Link
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Click any spec to highlight its 3D HUD dimension pin on the model
            </p>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {specsData.map((field) => {
              const isSelected = selectedFieldId === field.id;
              const isAvailable = field.is_available;

              return (
                <div
                  key={field.id}
                  onClick={() => setSelectedFieldId(isSelected ? null : field.id)}
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    border: isSelected
                      ? '1.5px solid #00f0ff'
                      : isAvailable
                      ? '1px solid var(--border-color)'
                      : '1px dashed rgba(239, 68, 68, 0.4)',
                    background: isSelected
                      ? 'rgba(0, 240, 255, 0.12)'
                      : isAvailable
                      ? 'var(--bg-card)'
                      : 'rgba(239, 68, 68, 0.04)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <strong style={{ fontSize: '0.9rem', color: isSelected ? '#00f0ff' : 'var(--text-heading)', textTransform: 'capitalize' }}>
                      {field.field_name.replace(/_/g, ' ')}
                    </strong>
                    {isAvailable ? (
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: '600', color: '#00f0ff' }}>
                        {field.user_correction || field.normalized_value} {field.unit || field.original_unit || ''}
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.7rem', color: '#f87171' }}>Not Available</span>
                    )}
                  </div>

                  {field.source_location && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      📍 Citation: {field.source_location}
                    </div>
                  )}

                  {field.source_snippet && (
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic', marginTop: '4px', background: 'rgba(0,0,0,0.2)', padding: '4px 6px', borderRadius: '4px' }}>
                      "{field.source_snippet}"
                    </div>
                  )}

                  {!isAvailable && (
                    <div style={{ fontSize: '0.75rem', color: '#f87171', marginTop: '4px', fontStyle: 'italic' }}>
                      * {field.not_available_reason || 'Not available in uploaded document'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
