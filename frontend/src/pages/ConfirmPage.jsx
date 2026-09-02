/**
 * HYDAC Spec-to-3D Generator — Parameter Confirmation Page
 * Editable parameter table with traceability, missing field flags, confirm gate.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

export default function ConfirmPage() {
  const [components, setComponents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    loadParameters();
  }, []);

  const loadParameters = async () => {
    try {
      const data = await api.getParameters();
      setComponents(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (componentId, fieldName, currentValue) => {
    setEditingCell(`${componentId}-${fieldName}`);
    setEditValue(String(currentValue));
  };

  const handleSave = async (componentId, fieldName, unit) => {
    try {
      const numValue = Number(editValue);
      const value = (isNaN(numValue) || editValue.trim() === '') ? editValue : numValue;
      const updated = await api.updateParameter(componentId, fieldName, value, unit);
      setComponents((prev) =>
        prev.map((c) => (c.id === componentId ? updated : c))
      );
      setEditingCell(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleConfirm = async (componentId) => {
    try {
      const updated = await api.confirmComponent(componentId);
      setComponents((prev) =>
        prev.map((c) => (c.id === componentId ? updated : c))
      );
    } catch (err) {
      setError(err.message);
    }
  };

  const handleConfirmAll = async () => {
    for (const comp of components) {
      if (comp.status === 'ready_for_generation' && !comp.user_confirmed) {
        await handleConfirm(comp.id);
      }
    }
  };

  const allConfirmed = components.length > 0 && components.every((c) => c.user_confirmed || c.status === 'incomplete');
  const readyCount = components.filter((c) => c.user_confirmed).length;

  if (loading) {
    return (
      <div className="page-confirm">
        <div className="loading-state">Loading extracted parameters…</div>
      </div>
    );
  }

  return (
    <div className="page-confirm">
      <header className="page-header">
        <h1>Parameter Confirmation</h1>
        <p>Review extracted parameters before 3D model generation. Edit any incorrect values.</p>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      {components.length === 0 ? (
        <div className="empty-state">
          <p>No components extracted. Return to upload and parse documents first.</p>
          <button className="btn-secondary" onClick={() => navigate('/upload')}>← Back to Upload</button>
        </div>
      ) : (
        <>
          {components.map((component) => (
            <div key={component.id} className={`component-card component-card--${component.status}`}>
              <div className="component-header">
                <div className="component-title">
                  <span className="component-type">{formatType(component.component_type)}</span>
                  <span className={`component-status status--${component.status}`}>
                    {component.user_confirmed ? '✓ Confirmed' : formatStatus(component.status)}
                  </span>
                </div>
                {component.missing_required_fields.length > 0 && (
                  <div className="missing-fields-alert">
                    Missing required: {component.missing_required_fields.map((f) => formatFieldName(f)).join(', ')}
                  </div>
                )}
              </div>

              <table className="param-table">
                <thead>
                  <tr>
                    <th>Parameter</th>
                    <th>Value</th>
                    <th>Unit</th>
                    <th>Source File</th>
                    <th>Source Location</th>
                    <th>Confidence</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(component.parameters).map(([fieldName, param]) => {
                    const cellId = `${component.id}-${fieldName}`;
                    const isEditing = editingCell === cellId;
                    const isMissing = component.missing_required_fields.includes(fieldName);

                    return (
                      <tr key={fieldName} className={isMissing ? 'row--missing' : ''}>
                        <td className="param-name">{formatFieldName(fieldName)}</td>
                        <td className="param-value">
                          {isEditing ? (
                            <input
                              type="text"
                              className="edit-input"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSave(component.id, fieldName, param.unit);
                                if (e.key === 'Escape') setEditingCell(null);
                              }}
                              autoFocus
                            />
                          ) : (
                            <span
                              className="value-display"
                              onDoubleClick={() => handleEdit(component.id, fieldName, param.value)}
                            >
                              {param.value}
                            </span>
                          )}
                        </td>
                        <td className="param-unit">{param.unit || '—'}</td>
                        <td className="param-source">{param.source_file}</td>
                        <td className="param-location">{param.source_location}</td>
                        <td>
                          <span className={`confidence confidence--${param.confidence}`}>
                            {param.confidence}
                          </span>
                        </td>
                        <td>
                          {isEditing ? (
                            <div className="edit-actions">
                              <button className="btn-sm btn-confirm" onClick={() => handleSave(component.id, fieldName, param.unit)}>✓</button>
                              <button className="btn-sm btn-cancel" onClick={() => setEditingCell(null)}>✕</button>
                            </div>
                          ) : (
                            <button
                              className="btn-sm btn-edit"
                              onClick={() => handleEdit(component.id, fieldName, param.value)}
                            >
                              Edit
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Show missing fields as empty rows */}
                  {component.missing_required_fields
                    .filter((f) => !component.parameters[f])
                    .map((fieldName) => {
                      const cellId = `${component.id}-${fieldName}`;
                      const isEditing = editingCell === cellId;

                      return (
                        <tr key={fieldName} className="row--missing row--empty">
                          <td className="param-name">{formatFieldName(fieldName)} <span className="required-tag">REQUIRED</span></td>
                          <td className="param-value">
                            {isEditing ? (
                              <input
                                type="text"
                                className="edit-input"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSave(component.id, fieldName, null);
                                  if (e.key === 'Escape') setEditingCell(null);
                                }}
                                placeholder="Enter value"
                                autoFocus
                              />
                            ) : (
                              <button
                                className="btn-sm btn-add"
                                onClick={() => handleEdit(component.id, fieldName, '')}
                              >
                                + Add Value
                              </button>
                            )}
                          </td>
                          <td colSpan="4" className="not-found">Not found in documents</td>
                          <td>
                            {isEditing && (
                              <div className="edit-actions">
                                <button className="btn-sm btn-confirm" onClick={() => handleSave(component.id, fieldName, null)}>✓</button>
                                <button className="btn-sm btn-cancel" onClick={() => setEditingCell(null)}>✕</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>

              {!component.user_confirmed && component.status === 'ready_for_generation' && (
                <div className="component-actions">
                  <button className="btn-primary" onClick={() => handleConfirm(component.id)}>
                    Confirm Parameters
                  </button>
                </div>
              )}
            </div>
          ))}

          <div className="page-actions">
            <button className="btn-secondary" onClick={() => navigate('/upload')}>← Back to Upload</button>

            {components.some((c) => c.status === 'ready_for_generation' && !c.user_confirmed) && (
              <button className="btn-primary" onClick={handleConfirmAll}>
                Confirm All Ready Components
              </button>
            )}

            {readyCount > 0 && (
              <button className="btn-generate" onClick={() => navigate('/generate')}>
                Generate 3D Models ({readyCount}) →
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function formatType(type) {
  return type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');
}

function formatFieldName(name) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).replace(/ Mm$/, ' (mm)').replace(/ Bar$/, ' (bar)').replace(/ Rpm$/, ' (rpm)').replace(/ Lpm$/, ' (L/min)').replace(/ Cc$/, ' (cc)');
}

function formatStatus(status) {
  const labels = {
    ready_for_generation: 'Ready',
    incomplete: 'Incomplete',
    no_specs_found: 'No Specs',
  };
  return labels[status] || status;
}
