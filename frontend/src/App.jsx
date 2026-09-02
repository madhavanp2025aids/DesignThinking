/**
 * HYDAC Spec-to-3D Generator — App Entry Point
 * React Router: / → Login, /upload → Upload, /confirm → Confirm, /generate → Generate
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import UploadPage from './pages/UploadPage';
import ConfirmPage from './pages/ConfirmPage';
import GeneratePage from './pages/GeneratePage';
import api from './api/client';
import './index.css';

function ProtectedRoute({ children }) {
  if (!api.isAuthenticated()) {
    return <Navigate to="/" replace />;
  }
  return (
    <div className="app-layout">
      <nav className="app-nav">
        <div className="nav-brand">
          <svg width="24" height="24" viewBox="0 0 40 40" fill="none">
            <rect width="40" height="40" rx="8" fill="#2563eb"/>
            <path d="M10 20h8v-8h4v8h8v4h-8v8h-4v-8h-8z" fill="#fff"/>
          </svg>
          <span>HYDAC</span>
        </div>
        <div className="nav-links">
          <a href="/upload" className="nav-link">Upload</a>
          <a href="/confirm" className="nav-link">Parameters</a>
          <a href="/generate" className="nav-link">Generate</a>
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
      <main className="app-main">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
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
