/**
 * Firebase Configuration & Authentication Service for "Spec to 3d"
 * Supports Email/Password Authentication, Google Auth Provider,
 * and robust session state synchronization.
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  setPersistence,
  browserLocalPersistence,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyPlaceholderKeyForSpecTo3DApp2026',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'spec-to-3d.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'spec-to-3d',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'spec-to-3d.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '100000000000',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:100000000000:web:abcdef123456',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-SPECTO3D00',
};

// Initialize Firebase App singleton
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

// Enable local persistence so sessions survive browser refresh
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn('Firebase persistence warning:', err);
});

// Providers
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/**
 * Map Firebase error codes to clear, actionable, user-friendly messages
 */
export function mapFirebaseAuthError(err) {
  if (!err) return 'An unexpected authentication error occurred.';
  const code = err.code || '';

  switch (code) {
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters long.';
    case 'auth/email-already-in-use':
      return 'This email address is already registered. Please sign in instead.';
    case 'auth/user-not-found':
      return 'No account found with this email. Please click "Create Account" below.';
    case 'auth/wrong-password':
      return 'Incorrect password. Please verify your credentials.';
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      return 'Invalid email or password. If you do not have an account yet, please create one.';
    case 'auth/user-disabled':
      return 'This user account has been disabled. Please contact support.';
    case 'auth/too-many-requests':
      return 'Access temporarily blocked due to multiple failed attempts. Please try again in a few minutes.';
    case 'auth/network-request-failed':
      return 'Network error: Cannot reach authentication server. Please check your internet connection.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in popup was closed before completing.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled in the Firebase console.';
    default:
      return err.message || 'Authentication failed. Please try again.';
  }
}

export {
  app,
  auth,
  googleProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  signInWithPopup,
};
