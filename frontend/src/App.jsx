/**
 * HYDAC Spec-to-3D Generator — App Entry Point
 * Integrates Firebase Auth State Listener, Protected Route Guard,
 * Primary Spec-to-3D Flow, and Secondary Legacy Tools.
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
import { auth, onAuthStateChanged, signOut } from './firebase';
import './index.css';

function ProtectedRoute({ children }) {
  const location = useLocation();
  const [health, setHealth] = useState(null);
  const [serverError, setServerError] = useState(false);
  const [showLegacyMenu, setShowLegacyMenu] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    checkHealth();

    // Firebase Auth State Listener
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const idToken = await firebaseUser.getIdToken();
          api.setToken(idToken);
          setIsAuthenticated(true);
        } catch (e) {
          setIsAuthenticated(api.isAuthenticated());
        }
      } else {
        setIsAuthenticated(api.isAuthenticated());
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
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

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.warn('Sign out error:', err);
    }
    api.clearToken();
    window.location.href = '/';
  };

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)', color: '#00f0ff' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⚛️</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', letterSpacing: '1px' }}>AUTHENTICATING SPEC-TO-3D SESSION...</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // AeroSpec HUD routes have their own integrated header & layout
  if (location.pathname.startsWith('/specs')) {
    return (
      <>
        {health && health.degraded && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              zIndex: 9999,
              background: 'rgba(245, 158, 11, 0.95)',
              padding: '4px 20px',
              fontSize: '0.75rem',
              color: '#0a0e14',
              fontWeight: 600,
              display: 'flex',
              justifyContent: 'center',
              gap: '16px',
            }}
          >
            <span>ℹ️ Fallback Active:</span>
            {!health.ocr_available && <span>• OCR: Digital Extraction Mode</span>}
            {!health.freecad_available && <span>• Pure-Python Parametric CAD Engine Active</span>}
          </div>
        )}
        {children}
      </>
    );
  }

  const userName = auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || 'J. Vance';

  return (
    <div className="app-layout">
      {/* Top Persistent Navigation Bar for Legacy Tools */}
      <nav className="cad-top-hud-navbar">
        <div className="cad-nav-brand">
          <Link to="/specs/upload" className="cad-brand-link">
            <span className="cad-brand-plus">+</span>
            <span className="cad-brand-text">SPEC-TO-3D</span>
          </Link>
        </div>

        {/* Primary Navigation Links */}
        <div className="cad-nav-tabs">
          <Link
            to="/specs/upload"
            className="cad-nav-tab-btn"
          >
            ⚛ Ingest & Extract
          </Link>

          {/* Legacy Tools Dropdown */}
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <button
              type="button"
              className="cad-nav-tab-btn cad-dropdown-trigger"
              onClick={() => setShowLegacyMenu(!showLegacyMenu)}
            >
              Legacy Tools ▾
            </button>
            {showLegacyMenu && (
              <div className="cad-nav-dropdown-menu">
                <Link
                  to="/upload"
                  className="cad-dropdown-item"
                  onClick={() => setShowLegacyMenu(false)}
                >
                  Legacy Upload
                </Link>
                <Link
                  to="/confirm"
                  className="cad-dropdown-item"
                  onClick={() => setShowLegacyMenu(false)}
                >
                  Legacy Parameters
                </Link>
                <Link
                  to="/generate"
                  className="cad-dropdown-item"
                  onClick={() => setShowLegacyMenu(false)}
                >
                  Legacy 3D View
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Right HUD status items */}
        <div className="cad-nav-right-hud">
          <div className="cad-nav-status-item">
            <span className={`hud-dot ${serverError ? 'dot-red' : 'dot-green'}`}>●</span>
            <span className="hud-status-text">
              {serverError ? 'API Offline' : 'System Status: 16/16 CAD KERNEL'}
            </span>
          </div>

          <div className="cad-nav-user-badge">
            <span>CAD_DEV: <strong>{userName}</strong></span>
          </div>

          <button type="button" className="cad-btn-nav-logout" onClick={handleLogout} title="Sign Out">
            Sign Out
          </button>
        </div>
      </nav>

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
