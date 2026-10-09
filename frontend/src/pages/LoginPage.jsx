/**
 * HYDAC Spec-to-3D Generator — Login / Signup Screen
 * Native JWT Authentication (Email/Password & OTP Email Verification)
 * with user-friendly error mapping, tab switcher, and existing UI styling.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

export default function LoginPage() {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const navigate = useNavigate();

  // Cooldown countdown timer for resending verification code
  useEffect(() => {
    let timer;
    if (cooldown > 0) {
      timer = setInterval(() => {
        setCooldown((prev) => (prev > 1 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');
    setLoading(true);

    const emailClean = email.trim().toLowerCase();

    try {
      if (mode === 'signup') {
        await api.signup(emailClean, password);
        navigate('/specs/upload');
      } else if (mode === 'login') {
        await api.login(emailClean, password);
        navigate('/specs/upload');
      }
    } catch (err) {
      setError(err.message || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (cooldown > 0) return;
    setError('');
    setInfoMessage('');
    setLoading(true);

    try {
      const res = await api.resendVerificationCode(email.trim().toLowerCase());
      setCooldown(60);
      setInfoMessage(res.message || 'A new verification code has been dispatched.');
    } catch (err) {
      setError(err.message || 'Failed to resend code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-login">
      <div className="login-container">
        <div className="login-header">
          <div className="logo-mark">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <rect width="40" height="40" rx="8" fill="#2563eb"/>
              <path d="M10 20h8v-8h4v8h8v4h-8v8h-4v-8h-8z" fill="#fff"/>
            </svg>
          </div>
          <h1>HYDAC</h1>
          <p className="subtitle">Spec-to-3D Generator</p>
        </div>

          /* Standard Login & Signup with Prominent Tab Switcher */
          <div>
            {/* Top Segmented Navigation Tabs */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '6px',
                marginBottom: '20px',
                background: 'rgba(15, 23, 42, 0.6)',
                padding: '4px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError('');
                  setInfoMessage('');
                }}
                style={{
                  padding: '10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: mode === 'login' ? '#2563eb' : 'transparent',
                  color: mode === 'login' ? '#ffffff' : 'var(--text-muted)',
                  fontWeight: '600',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setError('');
                  setInfoMessage('');
                }}
                style={{
                  padding: '10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: mode === 'signup' ? '#2563eb' : 'transparent',
                  color: mode === 'signup' ? '#ffffff' : 'var(--text-muted)',
                  fontWeight: '600',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                Create Account
              </button>
            </div>

            <form onSubmit={handleSubmit} className="login-form">
              <div className="form-group">
                <label htmlFor="email">Email Address</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="engineer@company.com"
                  required
                  autoComplete="email"
                />
              </div>

              <div className="form-group">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  required
                  minLength={6}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                />
              </div>

              {infoMessage && (
                <div style={{ fontSize: '0.8rem', color: '#10b981', textAlign: 'center', marginBottom: '12px' }}>
                  {infoMessage}
                </div>
              )}

              {error && (
                <div className="form-error" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span>{error}</span>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('signup');
                        setError('');
                        setInfoMessage(`Ready to create your account for ${email || 'this email'}`);
                      }}
                      style={{
                        background: 'rgba(37, 99, 235, 0.25)',
                        border: '1px solid #3b82f6',
                        color: '#60a5fa',
                        padding: '6px 12px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        fontSize: '0.8rem',
                        width: 'fit-content',
                      }}
                    >
                      ✨ Create Account with this email
                    </button>
                  )}
                </div>
              )}

              <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '6px' }}>
                {loading ? 'Processing…' : mode === 'signup' ? 'Create Account' : 'Sign In'}
              </button>

              <div style={{ textAlign: 'center', marginTop: '16px' }}>
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => {
                    setMode(mode === 'signup' ? 'login' : 'signup');
                    setError('');
                    setInfoMessage('');
                  }}
                  style={{ fontSize: '0.85rem' }}
                >
                  {mode === 'signup' ? 'Already have an account? Sign In' : "Don't have an account? Create Account"}
                </button>
              </div>
            </form>
          </div>

        <div className="login-footer">
          <p>Parse hydraulics specs → Generate exact 3D models</p>
        </div>
      </div>
    </div>
  );
}
