/**
 * HYDAC Spec-to-3D Generator — Robust API Client
 * Fetch wrapper with JWT auth, request timeouts, network retries, and clear error diagnostics.
 */

const API_BASE = 'http://localhost:8000/api';
const DEFAULT_TIMEOUT_MS = 20000;

class ApiClient {
  constructor() {
    this.token = localStorage.getItem('hydac_token');
  }

  setToken(token) {
    this.token = token;
    localStorage.setItem('hydac_token', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('hydac_token');
  }

  getToken() {
    return this.token || localStorage.getItem('hydac_token');
  }

  isAuthenticated() {
    return !!this.getToken();
  }

  async request(endpoint, options = {}, retries = 1) {
    const url = `${API_BASE}${endpoint}`;
    const headers = { ...options.headers };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 401 && !endpoint.startsWith('/auth/')) {
        this.clearToken();
        if (window.location.pathname !== '/') {
          window.location.href = '/';
        }
        throw new Error('Session expired. Please log in again.');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        let message = errorData.detail || errorData.error || `Server error (${response.status})`;
        if (endpoint === '/auth/login' && response.status === 401) {
          message = 'Invalid email or password. If you do not have an account yet, click "Create Account" below.';
        }
        const err = new Error(typeof message === 'string' ? message : JSON.stringify(message));
        if (errorData.requires_verification) {
          err.requires_verification = true;
          err.email = errorData.email;
        }
        throw err;
      }

      if (response.status === 204) return null;

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return response.json();
      }

      return response;
    } catch (err) {
      clearTimeout(timeoutId);

      // Distinguish Abort / Timeout errors
      if (err.name === 'AbortError') {
        throw new Error(`Request timed out after ${DEFAULT_TIMEOUT_MS / 1000}s. The server is taking longer than expected.`);
      }

      // Retry GET requests once on network failure
      const isGet = !options.method || options.method.toUpperCase() === 'GET';
      if (retries > 0 && isGet && (err.name === 'TypeError' || err.message.includes('fetch') || err.message.includes('network'))) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        return this.request(endpoint, options, retries - 1);
      }

      // Distinguish connection / network down error
      if (err.name === 'TypeError' && (err.message.includes('fetch') || err.message.includes('Failed to fetch') || err.message.includes('NetworkError'))) {
        throw new Error('Cannot reach server — please confirm the backend is running at http://localhost:8000.');
      }

      throw err;
    }
  }

  // ── Health & Diagnostics ────────────────────────────────────
  async getHealth() {
    return this.request('/health');
  }

  // ── Auth Endpoints ──────────────────────────────────────────
  async signup(email, password) {
    const data = await this.request('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (data.access_token) {
      this.setToken(data.access_token);
    }
    return data;
  }

  async login(email, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (data.access_token) {
      this.setToken(data.access_token);
    }
    return data;
  }

  async verifyEmail(email, code) {
    const data = await this.request('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    });
    if (data.access_token) {
      this.setToken(data.access_token);
    }
    return data;
  }

  async resendVerificationCode(email) {
    return this.request('/auth/resend-code', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async getMe() {
    return this.request('/auth/me');
  }

  // ── Spec Pipeline Endpoints (Primary Flow) ──────────────────

  async uploadSpecFiles(files, partName = '', autoExtract = true) {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    if (partName) formData.append('part_name', partName);
    formData.append('auto_extract', autoExtract ? 'true' : 'false');
    return this.request('/specs/upload', {
      method: 'POST',
      body: formData,
    });
  }

  async listParts() {
    return this.request('/specs/parts');
  }

  async getPart(partId) {
    return this.request(`/specs/parts/${partId}`);
  }

  async getPartSpecs(partId) {
    return this.request(`/specs/${partId}`);
  }

  async getPartStatus(partId) {
    return this.request(`/specs/parts/${partId}/status`);
  }

  async triggerPartExtraction(partId) {
    return this.request(`/specs/parts/${partId}/extract`, { method: 'POST' });
  }

  async updateSpecField(fieldId, correction, unit = null) {
    return this.request(`/specs/fields/${fieldId}`, {
      method: 'PUT',
      body: JSON.stringify({ correction, unit }),
    });
  }

  async deletePart(partId) {
    return this.request(`/specs/parts/${partId}`, {
      method: 'DELETE',
    });
  }

  async deletePartDocument(partId, documentId) {
    return this.request(`/specs/parts/${partId}/documents/${documentId}`, {
      method: 'DELETE',
    });
  }

  async downloadSpecReport(partId, partName = 'part') {
    const token = this.getToken();
    const response = await fetch(`${API_BASE}/specs/${partId}/report`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      throw new Error('Failed to generate spec report.');
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${partName.replace(/\s+/g, '_')}_spec_report.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  async resolveConflict(fieldId, chosenValue, chosenUnit = '') {
    const formData = new FormData();
    formData.append('chosen_value', chosenValue);
    if (chosenUnit) formData.append('chosen_unit', chosenUnit);
    return this.request(`/specs/fields/${fieldId}/resolve_conflict`, {
      method: 'POST',
      body: formData,
    });
  }

  async getDocumentPageOverlay(documentId, pageNumber = 1) {
    return this.request(`/specs/documents/${documentId}/page/${pageNumber}`);
  }

  async getPartDiff(partId) {
    return this.request(`/specs/parts/${partId}/diff`);
  }

  // ── 3D Model Generation Endpoints ───────────────────────────

  async generatePartModel(partId, forceRebuild = false) {
    return this.request(`/models/generate/${partId}?force_rebuild=${forceRebuild}`, {
      method: 'POST',
    });
  }

  async getPartGeometry(partId) {
    return this.request(`/models/${partId}`);
  }

  getPartMeshUrl(partId) {
    const token = this.getToken();
    return `${API_BASE}/models/${partId}/mesh?token=${token}`;
  }

  getStepDownloadUrl(partId) {
    const token = this.getToken();
    return `${API_BASE}/models/${partId}/step?token=${token}`;
  }

  getIgesDownloadUrl(partId) {
    const token = this.getToken();
    return `${API_BASE}/models/${partId}/iges?token=${token}`;
  }

  // ── Legacy V1 Endpoints (Preserved for compatibility) ────────

  async uploadFiles(files) {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    return this.request('/files/upload', {
      method: 'POST',
      body: formData,
    });
  }

  async listFiles() {
    return this.request('/files/');
  }

  async deleteFile(fileId) {
    return this.request(`/files/${fileId}`, { method: 'DELETE' });
  }

  async triggerExtraction() {
    return this.request('/extraction/extract', { method: 'POST' });
  }

  async getParameters() {
    return this.request('/extraction/parameters');
  }

  async updateParameter(componentId, fieldName, value, unit) {
    return this.request(`/extraction/parameters/${componentId}`, {
      method: 'PUT',
      body: JSON.stringify({ field_name: fieldName, value, unit }),
    });
  }

  async confirmComponent(componentId) {
    return this.request(`/extraction/confirm/${componentId}`, { method: 'POST' });
  }

  async generateModels() {
    return this.request('/generation/generate', { method: 'POST' });
  }

  async listJobs() {
    return this.request('/generation/jobs');
  }

  async getJob(jobId) {
    return this.request(`/generation/jobs/${jobId}`);
  }

  getMeshUrl(jobId) {
    const token = this.getToken();
    return `${API_BASE}/generation/mesh/${jobId}?token=${token}`;
  }

  getDownloadUrl(jobId, format) {
    return `${API_BASE}/generation/download/${jobId}/${format}`;
  }
}

export const api = new ApiClient();
export default api;
