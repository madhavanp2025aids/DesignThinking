/**
 * HYDAC Spec-to-3D Generator — App Entry Point (v2 Enhanced)
 * Primary Flow: /specs/upload → /specs/review/:partId → /specs/viewer/:partId
 * Secondary/Legacy Flow: /upload, /confirm, /generate
 */

import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import UploadPage from './pages/UploadPage';
import ConfirmPage from './pages/ConfirmPage';
import GeneratePage from './pages/GeneratePage';
import SpecUploadPage from './pages/SpecUploadPage';
import SpecReviewPage from './pages/SpecReviewPage';
import HologramViewerPage from './pages/HologramViewerPage';
import api from './api/client';
import './index.css';

function ProtectedRoute({ children }) {
  const [health, setHealth] = useState(null);
  const [serverError, setServerError] = useState(false);
  const [showLegacyMenu, setShowLegacyMenu] = useState(false);

  useEffect(() => {
    checkHealth();
  }, []);

  const checkHealth = async () => {
    try {
      const res = await api.getHealth();
      setHealth(res);
      setServerError(false);
    } catch (err) {
      setServerError(true);
    }
  };

  if (!api.isAuthenticated()) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="app-layout">
      {/* Top Persistent Navigation Bar */}
      <nav className="app-nav">
        <div className="nav-brand">
          <Link to="/specs/upload" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="24" height="24" viewBox="0 0 40 40" fill="none">
              <rect width="40" height="40" rx="8" fill="#00f0ff" />
              <path d="M10 20h8v-8h4v8h8v4h-8v8h-4v-8h-8z" fill="#030814" />
            </svg>
            <span style={{ color: '#00f0ff', letterSpacing: '1px', fontWeight: '700' }}>SPEC-TO-3D</span>
          </Link>
        </div>

        {/* Primary Spec-to-3D Navigation */}
        <div className="nav-links">
          <Link to="/specs/upload" className="nav-link" style={{ color: '#00f0ff', fontWeight: '600' }}>
            ⚛ Ingest & Extract
          </Link>

          {/* Secondary Legacy Tools Menu */}
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <button
              className="nav-link"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              onClick={() => setShowLegacyMenu(!showLegacyMenu)}
            >
              Legacy v1 ▾
            </button>
            {showLegacyMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '4px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  padding: '8px 0',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  zIndex: 200,
                  minWidth: '160px',
                }}
              >
                <Link
                  to="/upload"
                  className="nav-link"
                  style={{ display: 'block', padding: '6px 16px' }}
                  onClick={() => setShowLegacyMenu(false)}
                >
                  Legacy Upload
                </Link>
                <Link
                  to="/confirm"
                  className="nav-link"
                  style={{ display: 'block', padding: '6px 16px' }}
                  onClick={() => setShowLegacyMenu(false)}
                >
                  Legacy Parameters
                </Link>
                <Link
                  to="/generate"
                  className="nav-link"
                  style={{ display: 'block', padding: '6px 16px' }}
                  onClick={() => setShowLegacyMenu(false)}
                >
                  Legacy 3D View
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Server Status Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', marginRight: '12px' }}>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: serverError ? '#ef4444' : '#22c55e',
              display: 'inline-block',
              boxShadow: serverError ? '0 0 6px #ef4444' : '0 0 6px #22c55e',
            }}
          />
          <span style={{ fontSize: '0.75rem', color: serverError ? '#ef4444' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {serverError ? 'API Offline' : 'API Online'}
          </span>
        </div>

        <button
          className="nav-logout"
          onClick={() => {
            api.clearToken();
            window.location.href = '/';
          }}
        >
          Sign Out
        </button>
      </nav>

      {/* Degraded Feature Warning Banner if FreeCAD/OCR missing */}
      {health && health.degraded && (
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.1)',
            borderBottom: '1px solid rgba(245, 158, 11, 0.3)',
            padding: '6px 20px',
            fontSize: '0.75rem',
            color: '#fcd34d',
            display: 'flex',
            justifyContent: 'center',
            gap: '16px',
          }}
        >
          <span>ℹ️ System Running in Fallback Mode:</span>
          {!health.ocr_available && <span>• OCR Engine not detected (Digital text extraction active)</span>}
          {!health.freecad_available && <span>• FreeCAD not detected (Pure-Python parametric STL CAD active)</span>}
        </div>
      )}

      <main className="app-main">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />

        {/* Primary Spec-to-3D Pipeline Routes */}
        <Route
          path="/specs/upload"
          element={
            <ProtectedRoute>
              <SpecUploadPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/specs/review/:partId"
          element={
            <ProtectedRoute>
              <SpecReviewPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/specs/viewer/:partId"
          element={
            <ProtectedRoute>
              <HologramViewerPage />
            </ProtectedRoute>
          }
        />

        {/* Legacy Routes (Accessible directly or via Legacy Menu) */}
        <Route
          path="/upload"
          element={
            <ProtectedRoute>
              <UploadPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/confirm"
          element={
            <ProtectedRoute>
              <ConfirmPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/generate"
          element={
            <ProtectedRoute>
              <GeneratePage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
