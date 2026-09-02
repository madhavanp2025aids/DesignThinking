/**
 * HYDAC Spec-to-3D Generator — Login/Signup Page
 * Email + password, session persistence, engineering-tool aesthetic.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

export default function LoginPage() {
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignup) {
        await api.signup(email, password);
      } else {
        await api.login(email, password);
      }
      navigate('/upload');
    } catch (err) {
      setError(err.message);
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

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
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
              autoComplete={isSignup ? 'new-password' : 'current-password'}
            />
          </div>

          {error && <div className="form-error">{error}</div>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Processing…' : isSignup ? 'Create Account' : 'Sign In'}
          </button>

          <button
            type="button"
            className="btn-link"
            onClick={() => {
              setIsSignup(!isSignup);
              setError('');
            }}
          >
            {isSignup ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
          </button>
        </form>

        <div className="login-footer">
          <p>Parse hydraulics specs → Generate exact 3D models</p>
        </div>
      </div>
    </div>
  );
}
