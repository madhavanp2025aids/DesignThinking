/**
 * HYDAC Spec-to-3D Generator — Login / Signup / Email Verification Screen (Part 8)
 * Features:
 * - Prominent "Sign In" vs "Create Account" tab switcher
 * - 6-digit email OTP verification screen
 * - 60-second resend rate-limit cooldown
 * - Clean error recovery with instant "Create Account" trigger
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

export default function LoginPage() {
  const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'verify'
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

    try {
      if (mode === 'signup') {
        const res = await api.signup(email, password);
        setMode('verify');
        setCooldown(60);
        setInfoMessage(res.message || `Verification code sent to ${email}`);
      } else if (mode === 'login') {
        await api.login(email, password);
        navigate('/specs/upload');
      } else if (mode === 'verify') {
        if (!otpCode.trim() || otpCode.trim().length < 6) {
          setError('Please enter the full 6-digit verification code.');
          setLoading(false);
          return;
        }
        await api.verifyEmail(email, otpCode.trim());
        navigate('/specs/upload');
      }
    } catch (err) {
      if (err.requires_verification) {
        setMode('verify');
        setCooldown(30);
        setError(err.message || 'Please enter the verification code sent to your email.');
      } else {
        setError(err.message || 'An error occurred. Please try again.');
      }
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
      const res = await api.resendVerificationCode(email);
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

        {mode === 'verify' ? (
          /* Email Verification Step */
          <form onSubmit={handleSubmit} className="login-form">
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <span style={{ fontSize: '2rem' }}>✉️</span>
              <h2 style={{ fontSize: '1.2rem', color: 'var(--text-heading)', margin: '8px 0 4px' }}>
                Verify Your Email
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                We sent a 6-digit one-time code to <strong style={{ color: 'var(--accent-blue)' }}>{email}</strong>
              </p>
            </div>

            <div className="form-group" style={{ textAlign: 'center' }}>
              <label htmlFor="otpCode" style={{ textAlign: 'center', display: 'block' }}>
                6-Digit Verification Code
              </label>
              <input
                id="otpCode"
                type="text"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                autoFocus
                required
                style={{
                  textAlign: 'center',
                  fontSize: '1.6rem',
                  letterSpacing: '8px',
                  fontWeight: 'bold',
                  color: '#00f0ff',
                  padding: '10px',
                }}
              />
            </div>

            {infoMessage && (
              <div style={{ fontSize: '0.8rem', color: '#10b981', textAlign: 'center', marginBottom: '12px' }}>
                {infoMessage}
              </div>
            )}

            {error && <div className="form-error">{error}</div>}

            <button type="submit" className="btn-primary" disabled={loading} style={{ width: '100%', marginBottom: '10px' }}>
              {loading ? 'Verifying…' : 'Verify & Enter'}
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
              <button
                type="button"
                className="btn-link"
                onClick={handleResendCode}
                disabled={cooldown > 0 || loading}
                style={{ fontSize: '0.85rem' }}
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend Code'}
              </button>

              <button
                type="button"
                className="btn-link"
                onClick={() => {
                  setMode('login');
                  setError('');
                  setInfoMessage('');
                }}
                style={{ fontSize: '0.85rem' }}
              >
                ← Back to Login
              </button>
            </div>
          </form>
        ) : (
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
                  placeholder="Minimum 8 characters"
                  required
                  minLength={8}
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
                {loading ? 'Processing…' : mode === 'signup' ? 'Create Account & Send Code' : 'Sign In'}
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
        )}

        <div className="login-footer">
          <p>Parse hydraulics specs → Generate exact 3D models</p>
        </div>
      </div>
    </div>
  );
}
