/**
 * HYDAC Spec-to-3D Generator — API Client
 * Fetch wrapper with JWT auth headers, base URL config, error handling.
 */

const API_BASE = 'http://localhost:8000/api';

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

  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = { ...options.headers };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      this.clearToken();
      window.location.href = '/';
      throw new Error('Session expired. Please log in again.');
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Request failed: ${response.status}`);
    }

    if (response.status === 204) return null;

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return response.json();
    }

    return response;
  }

  // Auth
  async signup(email, password) {
    const data = await this.request('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(data.access_token);
    return data;
  }

  async login(email, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(data.access_token);
    return data;
  }

  async getMe() {
    return this.request('/auth/me');
  }

  // Files
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

  // Extraction
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

  // Generation
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
