/**
 * HYDAC Spec-to-3D Generator — Generate + 3D Viewer Page
 * Trigger generation, pipeline stage indicators, Three.js viewer, downloads.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import Viewer3D from '../components/Viewer3D';

const PIPELINE_STAGES = [
  { key: 'validating', label: 'Validating parameters' },
  { key: 'generating', label: 'Generating CAD model' },
  { key: 'meshing', label: 'Creating mesh for viewer' },
  { key: 'complete', label: 'Complete' },
];

export default function GeneratePage() {
  const [jobs, setJobs] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [currentStage, setCurrentStage] = useState(-1);
  const [error, setError] = useState('');
  const [selectedJob, setSelectedJob] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    try {
      const data = await api.listJobs();
      setJobs(data);
      if (data.length > 0) {
        const successJob = data.find((j) => j.status === 'success');
        if (successJob) setSelectedJob(successJob);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    setCurrentStage(0);

    try {
      // Simulate stage progression
      setCurrentStage(0);
      await delay(500);
      setCurrentStage(1);

      const result = await api.generateModels();
      setCurrentStage(2);
      await delay(300);
      setCurrentStage(3);

      setJobs(result);

      const successJob = result.find((j) => j.status === 'success');
      if (successJob) {
        setSelectedJob(successJob);
      }

      const failedJobs = result.filter((j) => j.status.startsWith('failed'));
      if (failedJobs.length > 0 && !successJob) {
        setError(failedJobs.map((j) => j.error_message).join('; '));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async (jobId, format) => {
    try {
      const url = api.getDownloadUrl(jobId, format);
      const token = api.getToken();

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `model.${format}`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      setError(err.message);
    }
  };

  const getMeshUrl = (job) => {
    if (!job || job.status !== 'success') return null;
    const token = api.getToken();
    return `http://localhost:8000/api/generation/mesh/${job.id}?token=${token}`;
  };

  return (
    <div className="page-generate">
      <header className="page-header">
        <h1>3D Model Generation</h1>
        <p>Generate parametric CAD models from confirmed specifications.</p>
      </header>

      {/* Pipeline Stages */}
      {generating && (
        <div className="pipeline-stages">
          {PIPELINE_STAGES.map((stage, i) => (
            <div
              key={stage.key}
              className={`stage ${i < currentStage ? 'stage--done' : ''} ${i === currentStage ? 'stage--active' : ''} ${i > currentStage ? 'stage--pending' : ''}`}
            >
              <div className="stage-indicator">
                {i < currentStage ? '✓' : i === currentStage ? <span className="spinner" /> : (i + 1)}
              </div>
              <span className="stage-label">{stage.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="alert alert-error">
          <strong>Generation failed:</strong> {error}
        </div>
      )}

      {/* 3D Viewer */}
      {selectedJob && selectedJob.status === 'success' && (
        <div className="viewer-section">
          <Viewer3D meshUrl={getMeshUrl(selectedJob)} />

          <div className="viewer-actions">
            {selectedJob.mesh_file_path && (
              <button className="btn-download" onClick={() => handleDownload(selectedJob.id, 'stl')}>
                ↓ Download STL
              </button>
            )}
            {selectedJob.cad_file_path && (
              <button className="btn-download" onClick={() => handleDownload(selectedJob.id, 'step')}>
                ↓ Download STEP
              </button>
            )}
          </div>
        </div>
      )}

      {/* Job List */}
      {jobs.length > 0 && (
        <div className="jobs-section">
          <h3>Generation Jobs</h3>
          <div className="job-list">
            {jobs.map((job) => (
              <div
                key={job.id}
                className={`job-item job-item--${job.status} ${selectedJob?.id === job.id ? 'job-item--selected' : ''}`}
                onClick={() => job.status === 'success' && setSelectedJob(job)}
              >
                <span className="job-status-icon">{getStatusIcon(job.status)}</span>
                <span className="job-id">Job {job.id.slice(0, 8)}</span>
                <span className={`job-status status--${job.status}`}>{formatJobStatus(job.status)}</span>
                {job.error_message && (
                  <span className="job-error">{job.error_message}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Generation Log */}
      {selectedJob && selectedJob.generation_log && selectedJob.generation_log.length > 0 && (
        <div className="log-section">
          <h3>Generation Log</h3>
          <div className="log-entries">
            {selectedJob.generation_log.map((entry, i) => (
              <div key={i} className={`log-entry log-entry--${entry.status}`}>
                <span className="log-step">{entry.step}</span>
                <span className="log-status">{entry.status}</span>
                <span className="log-detail">{entry.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="page-actions">
        <button className="btn-secondary" onClick={() => navigate('/confirm')}>← Back to Parameters</button>
        <button className="btn-generate" onClick={handleGenerate} disabled={generating}>
          {generating ? 'Generating…' : jobs.length > 0 ? 'Regenerate Models' : 'Generate 3D Models'}
        </button>
      </div>
    </div>
  );
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getStatusIcon(status) {
  const icons = {
    pending: '⏳',
    generating: '⚙️',
    success: '✓',
    failed_missing_params: '⚠',
    failed_generation_error: '✕',
  };
  return icons[status] || '?';
}

function formatJobStatus(status) {
  const labels = {
    pending: 'Pending',
    generating: 'Generating…',
    success: 'Success',
    failed_missing_params: 'Missing Parameters',
    failed_generation_error: 'Generation Error',
  };
  return labels[status] || status;
}
