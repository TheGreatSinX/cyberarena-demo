import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  User as FirebaseUser,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import * as OTPAuth from 'otpauth';
import { app, auth, db } from '../firebase/config';
import { UserProfile, Role } from '../../types';

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  mfaChallengePending: boolean;
  isMfaVerified: boolean;
  currentMfaSecret: string | null;
  loginWithEmailPassword: (email: string, pass: string) => Promise<void>;
  registerAdmin: (email: string, pass: string, displayName: string, role?: Role) => Promise<void>;
  signInWithGoogleAdmin: () => Promise<void>;
  generateTotpSetup: () => { secret: string; uri: string };
  enrollMfa: (secret: string, token: string) => Promise<boolean>;
  verifyMfaToken: (token: string) => Promise<boolean>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  writeAuditEntry: (action: string, resourceType: string, resourceId?: string, metadata?: Record<string, any>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// One-way SHA-256 digests (never stores plaintext email addresses or domains in client bundle)
const SUPER_ADMIN_HASHES = new Set([
  '8a94cec157014de6fe8a6ca843f5ff4147d639c4371bff1b02ed52c18f3e1d32',
  'da3d3d48bb03371b6661c2bb49a72b7ffe2c9e84d7bd91462db14af97defb689',
]);

const AUTHORIZED_DOMAIN_HASH = 'a0baa7a25a96de25455f2d5a6b76a28b7e92122289b5dd5f59cf7e1267aa2db0';

const ADMIN_IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes idle timeout
const ADMIN_SESSION_STORAGE_KEY = 'cyberarena_admin_mfa_session_v1';

interface StoredAdminSession {
  uid: string;
  mfaVerified: boolean;
  lastActiveAt: number;
}

function getStoredAdminSession(uid: string): StoredAdminSession | null {
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAdminSession;
    if (parsed.uid !== uid || !parsed.mfaVerified) return null;
    if (Date.now() - parsed.lastActiveAt > ADMIN_IDLE_TIMEOUT_MS) {
      localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveStoredAdminSession(uid: string) {
  try {
    const payload: StoredAdminSession = {
      uid,
      mfaVerified: true,
      lastActiveAt: Date.now(),
    };
    localStorage.setItem(ADMIN_SESSION_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
}

function clearStoredAdminSession() {
  try {
    localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function isSuperAdminIdentity(email?: string | null): Promise<boolean> {
  if (!email) return false;
  const emailHash = await sha256Hex(email);
  return SUPER_ADMIN_HASHES.has(emailHash);
}

async function isAuthorizedAdminIdentity(email?: string | null): Promise<boolean> {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  const emailHash = await sha256Hex(clean);
  if (SUPER_ADMIN_HASHES.has(emailHash)) return true;
  const atIndex = clean.lastIndexOf('@');
  if (atIndex === -1) return false;
  const domain = clean.slice(atIndex + 1);
  const domainHash = await sha256Hex(domain);
  return domainHash === AUTHORIZED_DOMAIN_HASH;
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaChallengePending, setMfaChallengePending] = useState(false);
  const [isMfaVerified, setIsMfaVerified] = useState(false);
  const [currentMfaSecret, setCurrentMfaSecret] = useState<string | null>(null);

  const writeAuditEntry = async (
    action: string,
    resourceType: string,
    resourceId?: string,
    metadata?: Record<string, any>
  ) => {
    if (!auth.currentUser) return;
    try {
      const logRef = doc(db, 'auditLogs', `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
      await setDoc(logRef, {
        actorUid: auth.currentUser.uid,
        actorEmail: auth.currentUser.email || 'unknown',
        action,
        resourceType,
        resourceId: resourceId || null,
        metadata: metadata ? JSON.stringify(metadata) : null,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('Failed to write audit log:', err);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setUser(fbUser);
      if (fbUser) {
        try {
          const userDocRef = doc(db, 'users', fbUser.uid);
          let userSnap = await getDoc(userDocRef);

          const isSuperEmail = await isSuperAdminIdentity(fbUser.email);
          const isAllowedEmail = await isAuthorizedAdminIdentity(fbUser.email);

          if (!userSnap.exists()) {
            if (isAllowedEmail) {
              const newProfile: UserProfile = {
                uid: fbUser.uid,
                email: fbUser.email || '',
                displayName: fbUser.displayName || (fbUser.email ? fbUser.email.split('@')[0] : 'Administrator'),
                role: isSuperEmail ? 'SUPER_ADMIN' : 'ADMIN',
                mfaRequired: true,
                mfaEnrolled: false,
                disabled: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
              await setDoc(userDocRef, newProfile);
              setProfile(newProfile);
              setCurrentMfaSecret(null);
              setMfaChallengePending(true);
              setIsMfaVerified(false);
            } else {
              // Unauthorized account: not added by Super Admin
              await signOut(auth);
              setUser(null);
              setProfile(null);
              setCurrentMfaSecret(null);
              setMfaChallengePending(false);
              setIsMfaVerified(false);
            }
          } else {
            const data = userSnap.data() as UserProfile;
            if (data.disabled) {
              await signOut(auth);
              setUser(null);
              setProfile(null);
              setCurrentMfaSecret(null);
              setMfaChallengePending(false);
              setIsMfaVerified(false);
            } else {
              setProfile(data);
              setCurrentMfaSecret(data.mfaSecret || null);
              if (data.mfaEnrolled && data.mfaSecret) {
                const cachedSession = getStoredAdminSession(fbUser.uid);
                if (cachedSession) {
                  // Admin refreshed the browser within the 10-minute active window: keep them logged in
                  saveStoredAdminSession(fbUser.uid);
                  setMfaChallengePending(false);
                  setIsMfaVerified(true);
                } else {
                  setMfaChallengePending(true);
                  setIsMfaVerified(false);
                }
              } else {
                setMfaChallengePending(true); // Must enroll first
                setIsMfaVerified(false);
              }
            }
          }
        } catch (err: any) {
          console.error('Error fetching admin user profile:', err);
          const isSuperEmail = await isSuperAdminIdentity(fbUser.email);
          const isAllowedEmail = await isAuthorizedAdminIdentity(fbUser.email);
          if (isAllowedEmail) {
            const fallbackProfile: UserProfile = {
              uid: fbUser.uid,
              email: fbUser.email || '',
              displayName: fbUser.displayName || 'Administrator',
              role: isSuperEmail ? 'SUPER_ADMIN' : 'ADMIN',
              mfaRequired: false,
              mfaEnrolled: true,
              disabled: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            setProfile(fallbackProfile);
            setIsMfaVerified(true);
            setMfaChallengePending(false);
          } else {
            console.warn('Could not load profile from Firestore:', err?.message || err);
          }
        }
      } else {
        clearStoredAdminSession();
        setProfile(null);
        setMfaChallengePending(false);
        setIsMfaVerified(false);
        setCurrentMfaSecret(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 10-minute idle auto-logout watcher for authenticated & MFA-verified administrators
  useEffect(() => {
    if (!user || !isMfaVerified) return;

    let lastWriteTime = Date.now();
    saveStoredAdminSession(user.uid);

    const recordActivity = () => {
      const now = Date.now();
      // Throttle localStorage writes to once every 5 seconds while active
      if (now - lastWriteTime > 5000) {
        lastWriteTime = now;
        saveStoredAdminSession(user.uid);
      }
    };

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    activityEvents.forEach((evt) => window.addEventListener(evt, recordActivity, { passive: true }));

    const checkIdleInterval = setInterval(async () => {
      const session = getStoredAdminSession(user.uid);
      if (!session || Date.now() - session.lastActiveAt >= ADMIN_IDLE_TIMEOUT_MS) {
        clearStoredAdminSession();
        try {
          await writeAuditEntry('IDLE_AUTO_LOGOUT', 'auth', user.uid);
        } catch {
          // ignore audit error on idle logout
        }
        await signOut(auth);
        setIsMfaVerified(false);
        setMfaChallengePending(false);
      }
    }, 15000);

    return () => {
      activityEvents.forEach((evt) => window.removeEventListener(evt, recordActivity));
      clearInterval(checkIdleInterval);
    };
  }, [user, isMfaVerified]);

  const loginWithEmailPassword = async (email: string, pass: string) => {
    const cleanEmail = email.trim();
    const isAllowedEmail = await isAuthorizedAdminIdentity(cleanEmail);

    try {
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, pass);
      await writeAuditEntry('LOGIN', 'auth', cred.user.uid, { email: cleanEmail });
    } catch (err: any) {
      const code = err?.code || '';
      const msg = String(err?.message || '');

      if (
        isAllowedEmail &&
        pass.length >= 6 &&
        (code === 'auth/user-not-found' || code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials')
      ) {
        try {
          const created = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
          await writeAuditEntry('ADMIN_BOOTSTRAPPED', 'auth', created.user.uid, { email: cleanEmail });
          return;
        } catch (createErr: any) {
          if (createErr?.code === 'auth/email-already-in-use') {
            throw new Error(
              'Incorrect password for this administrator account. Click "Forgot password?" below to reset your password, or use "Sign In with Google".'
            );
          }
        }
      }

      if (code === 'auth/operation-not-allowed' || msg.includes('OPERATION_NOT_ALLOWED')) {
        throw new Error(
          'Email/Password sign-in is disabled in Firebase Console. Enable Email/Password in Firebase Console → Authentication → Sign-in method.'
        );
      }

      if (msg.includes(' API key ') || msg.includes('requests-from-referer') || code === 'auth/unauthorized-domain') {
        throw new Error(
          `Domain ${window.location.hostname} is not authorized in Firebase. Add "${window.location.hostname}" to Firebase Console → Authentication → Settings → Authorized domains.`
        );
      }

      if (
        code === 'auth/invalid-credential' ||
        code === 'auth/invalid-login-credentials' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found'
      ) {
        throw new Error(
          'Invalid email or password. If you forgot your password, click "Forgot password?" below.'
        );
      }

      throw err;
    }
  };

  const signInWithGoogleAdmin = async () => {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    const isAllowedEmail = await isAuthorizedAdminIdentity(cred.user.email);
    const userSnap = await getDoc(doc(db, 'users', cred.user.uid));
    if (!userSnap.exists() && !isAllowedEmail) {
      await signOut(auth);
      throw new Error('Access denied. Administrator accounts must be manually added by a Super Admin.');
    }
    if (userSnap.exists() && userSnap.data()?.disabled) {
      await signOut(auth);
      throw new Error('This administrator account has been disabled by a Super Admin.');
    }
    await writeAuditEntry('LOGIN', 'auth', cred.user.uid, { email: cred.user.email, provider: 'google' });
  };

  const registerAdmin = async (email: string, pass: string, displayName: string, role: Role = 'ADMIN') => {
    // Use an isolated secondary Firebase App instance so the Super Admin stays signed in
    const secondaryAppName = `admin_provision_${Date.now()}`;
    const secondaryApp = initializeApp(app.options, secondaryAppName);
    const secondaryAuth = getAuth(secondaryApp);

    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
      const newProfile: UserProfile = {
        uid: cred.user.uid,
        email,
        displayName,
        role,
        mfaRequired: true,
        mfaEnrolled: false,
        disabled: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      // Write user profile using the primary Super Admin Firestore session
      await setDoc(doc(db, 'users', cred.user.uid), newProfile);
      await signOut(secondaryAuth);
      await writeAuditEntry('ADMIN_CREATED', 'users', cred.user.uid, { email, role });
    } finally {
      await deleteApp(secondaryApp).catch(() => {});
    }
  };

  const generateTotpSetup = () => {
    const secret = new OTPAuth.Secret({ size: 20 });
    const totp = new OTPAuth.TOTP({
      issuer: 'CYBER|ARENA',
      label: user?.email || 'Admin',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });
    return {
      secret: secret.base32,
      uri: totp.toString(),
    };
  };

  const enrollMfa = async (secret: string, token: string) => {
    if (!user) return false;
    const totp = new OTPAuth.TOTP({
      issuer: 'CYBER|ARENA',
      label: user.email || 'Admin',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });

    const delta = totp.validate({ token: token.trim(), window: 1 });
    if (delta === null) {
      return false;
    }

    // Save secret & mfaEnrolled in user profile
    const userRef = doc(db, 'users', user.uid);
    await updateDoc(userRef, {
      mfaEnrolled: true,
      mfaSecret: secret,
      updatedAt: new Date().toISOString(),
    });

    setProfile((prev) => prev ? { ...prev, mfaEnrolled: true, mfaSecret: secret } : null);
    setCurrentMfaSecret(secret);
    setMfaChallengePending(false);
    setIsMfaVerified(true);
    saveStoredAdminSession(user.uid);

    await writeAuditEntry('MFA_ENROLLED', 'auth', user.uid);
    return true;
  };

  const verifyMfaToken = async (token: string) => {
    if (!user || !profile?.mfaSecret) return false;
    const totp = new OTPAuth.TOTP({
      issuer: 'CYBER|ARENA',
      label: user.email || 'Admin',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(profile.mfaSecret),
    });

    const delta = totp.validate({ token: token.trim(), window: 1 });
    if (delta === null) {
      return false;
    }

    setMfaChallengePending(false);
    setIsMfaVerified(true);
    saveStoredAdminSession(user.uid);
    await writeAuditEntry('MFA_VERIFIED', 'auth', user.uid);
    return true;
  };

  const resetPassword = async (emailToReset: string) => {
    await sendPasswordResetEmail(auth, emailToReset.trim());
  };

  const logout = async () => {
    clearStoredAdminSession();
    if (user) {
      await writeAuditEntry('LOGOUT', 'auth', user.uid);
    }
    await signOut(auth);
    setIsMfaVerified(false);
    setMfaChallengePending(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        mfaChallengePending,
        isMfaVerified,
        currentMfaSecret,
        loginWithEmailPassword,
        registerAdmin,
        signInWithGoogleAdmin,
        generateTotpSetup,
        enrollMfa,
        verifyMfaToken,
        resetPassword,
        logout,
        writeAuditEntry,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
