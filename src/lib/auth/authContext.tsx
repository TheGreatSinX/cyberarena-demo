import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
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
  idleLogoutNotice: string | null;
  clearIdleLogoutNotice: () => void;
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

export const ADMIN_IDLE_TIMEOUT_MS = 10 * 60 * 1000; // Exact 10 minutes (600,000 ms) idle timeout
const ADMIN_SESSION_STORAGE_KEY = 'cyberarena_admin_mfa_session_v1';

interface StoredAdminSession {
  uid: string;
  mfaVerified: boolean;
  lastActiveAt: number;
}

function readRawStoredAdminSession(): StoredAdminSession | null {
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredAdminSession;
  } catch {
    return null;
  }
}

function getStoredAdminSession(uid: string): StoredAdminSession | null {
  const parsed = readRawStoredAdminSession();
  if (!parsed || parsed.uid !== uid || !parsed.mfaVerified) return null;
  if (Date.now() - parsed.lastActiveAt >= ADMIN_IDLE_TIMEOUT_MS) {
    clearStoredAdminSession();
    return null;
  }
  return parsed;
}

function saveStoredAdminSession(uid: string, mfaVerified = true, timestamp = Date.now()) {
  try {
    const payload: StoredAdminSession = {
      uid,
      mfaVerified,
      lastActiveAt: timestamp,
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
  const [idleLogoutNotice, setIdleLogoutNotice] = useState<string | null>(null);

  const lastActiveRef = useRef<number>(Date.now());
  const isMfaVerifiedRef = useRef<boolean>(false);
  const justAuthenticatedRef = useRef<boolean>(false);
  const idleLoggingOutRef = useRef<boolean>(false);

  useEffect(() => {
    isMfaVerifiedRef.current = isMfaVerified;
  }, [isMfaVerified]);

  const clearIdleLogoutNotice = () => setIdleLogoutNotice(null);

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
      if (fbUser) {
        // Check if an existing session in localStorage has already exceeded the 10-minute idle limit
        const rawSession = readRawStoredAdminSession();
        const isExpiredSession =
          rawSession &&
          rawSession.uid === fbUser.uid &&
          Date.now() - rawSession.lastActiveAt >= ADMIN_IDLE_TIMEOUT_MS;

        if (isExpiredSession || (!rawSession && !justAuthenticatedRef.current)) {
          clearStoredAdminSession();
          if (isExpiredSession) {
            setIdleLogoutNotice(
              'Your administrator session expired due to 10 minutes of inactivity. Please sign in again.'
            );
          }
          await signOut(auth);
          setUser(null);
          setProfile(null);
          setCurrentMfaSecret(null);
          setMfaChallengePending(false);
          setIsMfaVerified(false);
          setLoading(false);
          return;
        }

        setUser(fbUser);
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
              const now = Date.now();
              lastActiveRef.current = now;
              saveStoredAdminSession(fbUser.uid, false, now);
            } else {
              // Unauthorized account: not added by Super Admin
              clearStoredAdminSession();
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
              clearStoredAdminSession();
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
                  // Admin refreshed the browser within the 10-minute active window: preserve exact lastActiveAt
                  lastActiveRef.current = cachedSession.lastActiveAt;
                  setMfaChallengePending(false);
                  setIsMfaVerified(true);
                } else {
                  const now = Date.now();
                  lastActiveRef.current = now;
                  saveStoredAdminSession(fbUser.uid, false, now);
                  setMfaChallengePending(true);
                  setIsMfaVerified(false);
                }
              } else {
                const now = Date.now();
                lastActiveRef.current = now;
                saveStoredAdminSession(fbUser.uid, false, now);
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
            const now = Date.now();
            lastActiveRef.current = now;
            saveStoredAdminSession(fbUser.uid, true, now);
            setProfile(fallbackProfile);
            setIsMfaVerified(true);
            setMfaChallengePending(false);
          } else {
            console.warn('Could not load profile from Firestore:', err?.message || err);
          }
        } finally {
          justAuthenticatedRef.current = false;
        }
      } else {
        clearStoredAdminSession();
        setUser(null);
        setProfile(null);
        setMfaChallengePending(false);
        setIsMfaVerified(false);
        setCurrentMfaSecret(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Accurate 10-minute (600,000 ms) idle auto-logout watcher for any signed-in administrator
  useEffect(() => {
    if (!user) return;

    idleLoggingOutRef.current = false;
    const existing = readRawStoredAdminSession();
    const initialLastActive =
      existing && existing.uid === user.uid && Date.now() - existing.lastActiveAt < ADMIN_IDLE_TIMEOUT_MS
        ? existing.lastActiveAt
        : Date.now();

    lastActiveRef.current = initialLastActive;
    saveStoredAdminSession(user.uid, isMfaVerifiedRef.current, initialLastActive);

    let lastStorageWrite = initialLastActive;
    let exactTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const getEffectiveLastActive = (): number => {
      const stored = readRawStoredAdminSession();
      if (stored && stored.uid === user.uid) {
        return Math.max(lastActiveRef.current, stored.lastActiveAt);
      }
      return lastActiveRef.current;
    };

    const performIdleLogout = async () => {
      if (idleLoggingOutRef.current) return;
      idleLoggingOutRef.current = true;

      if (exactTimeoutId) {
        clearTimeout(exactTimeoutId);
        exactTimeoutId = null;
      }

      const expiredUid = user.uid;
      clearStoredAdminSession();
      setIdleLogoutNotice(
        'Your administrator session expired due to 10 minutes of inactivity. Please sign in again.'
      );
      setIsMfaVerified(false);
      setMfaChallengePending(false);
      setUser(null);
      setProfile(null);

      try {
        await writeAuditEntry('IDLE_AUTO_LOGOUT', 'auth', expiredUid, {
          idleTimeoutMinutes: 10,
        });
      } catch {
        // ignore audit error on idle logout
      }

      try {
        await signOut(auth);
      } catch (err) {
        console.warn('Error signing out idle administrator:', err);
      }
    };

    const scheduleExactTimer = () => {
      if (exactTimeoutId) {
        clearTimeout(exactTimeoutId);
      }
      const elapsed = Date.now() - getEffectiveLastActive();
      const remainingMs = Math.max(0, ADMIN_IDLE_TIMEOUT_MS - elapsed);
      exactTimeoutId = setTimeout(() => {
        if (Date.now() - getEffectiveLastActive() >= ADMIN_IDLE_TIMEOUT_MS) {
          void performIdleLogout();
        } else {
          scheduleExactTimer();
        }
      }, remainingMs);
    };

    const checkAndEnforceIdle = (): boolean => {
      const elapsed = Date.now() - getEffectiveLastActive();
      if (elapsed >= ADMIN_IDLE_TIMEOUT_MS) {
        void performIdleLogout();
        return true;
      }
      return false;
    };

    const recordActivity = () => {
      if (idleLoggingOutRef.current) return;
      // CRITICAL: Check if 10 minutes have already elapsed BEFORE updating lastActiveRef
      // so returning to an idle/backgrounded tab cannot accidentally reset an expired timer.
      if (checkAndEnforceIdle()) {
        return;
      }

      const now = Date.now();
      lastActiveRef.current = now;
      if (now - lastStorageWrite >= 1000) {
        lastStorageWrite = now;
        saveStoredAdminSession(user.uid, isMfaVerifiedRef.current, now);
      }
      scheduleExactTimer();
    };

    const handleVisibilityOrFocus = () => {
      if (!checkAndEnforceIdle()) {
        scheduleExactTimer();
      }
    };

    const handleStorageSync = (e: StorageEvent) => {
      if (e.key === ADMIN_SESSION_STORAGE_KEY) {
        if (!e.newValue) {
          // Logged out in another tab
          void performIdleLogout();
        } else {
          scheduleExactTimer();
        }
      }
    };

    scheduleExactTimer();

    const activityEvents = [
      'pointerdown',
      'mousedown',
      'mousemove',
      'keydown',
      'wheel',
      'scroll',
      'touchstart',
      'click',
    ];
    activityEvents.forEach((evt) =>
      window.addEventListener(evt, recordActivity, { passive: true })
    );
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('storage', handleStorageSync);

    // 1-second heartbeat check to guarantee sub-second accuracy even after sleep/wake or throttling
    const checkIdleInterval = setInterval(() => {
      checkAndEnforceIdle();
    }, 1000);

    return () => {
      if (exactTimeoutId) {
        clearTimeout(exactTimeoutId);
      }
      clearInterval(checkIdleInterval);
      activityEvents.forEach((evt) => window.removeEventListener(evt, recordActivity));
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('storage', handleStorageSync);
    };
  }, [user]);

  const loginWithEmailPassword = async (email: string, pass: string) => {
    const cleanEmail = email.trim();
    const isAllowedEmail = await isAuthorizedAdminIdentity(cleanEmail);
    setIdleLogoutNotice(null);
    justAuthenticatedRef.current = true;
    const now = Date.now();
    lastActiveRef.current = now;

    try {
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, pass);
      saveStoredAdminSession(cred.user.uid, false, Date.now());
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
          saveStoredAdminSession(created.user.uid, false, Date.now());
          await writeAuditEntry('ADMIN_BOOTSTRAPPED', 'auth', created.user.uid, { email: cleanEmail });
          return;
        } catch (createErr: any) {
          if (createErr?.code === 'auth/email-already-in-use') {
            justAuthenticatedRef.current = false;
            throw new Error(
              'Incorrect password for this administrator account. Click "Forgot password?" below to reset your password, or use "Sign In with Google".'
            );
          }
        }
      }

      justAuthenticatedRef.current = false;

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
    setIdleLogoutNotice(null);
    justAuthenticatedRef.current = true;
    const provider = new GoogleAuthProvider();
    try {
      const cred = await signInWithPopup(auth, provider);
      const isAllowedEmail = await isAuthorizedAdminIdentity(cred.user.email);
      const userSnap = await getDoc(doc(db, 'users', cred.user.uid));
      if (!userSnap.exists() && !isAllowedEmail) {
        justAuthenticatedRef.current = false;
        clearStoredAdminSession();
        await signOut(auth);
        throw new Error('Access denied. Administrator accounts must be manually added by a Super Admin.');
      }
      if (userSnap.exists() && userSnap.data()?.disabled) {
        justAuthenticatedRef.current = false;
        clearStoredAdminSession();
        await signOut(auth);
        throw new Error('This administrator account has been disabled by a Super Admin.');
      }
      const now = Date.now();
      lastActiveRef.current = now;
      saveStoredAdminSession(cred.user.uid, false, now);
      await writeAuditEntry('LOGIN', 'auth', cred.user.uid, { email: cred.user.email, provider: 'google' });
    } catch (err) {
      justAuthenticatedRef.current = false;
      throw err;
    }
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

    const now = Date.now();
    lastActiveRef.current = now;
    isMfaVerifiedRef.current = true;
    setProfile((prev) => prev ? { ...prev, mfaEnrolled: true, mfaSecret: secret } : null);
    setCurrentMfaSecret(secret);
    setMfaChallengePending(false);
    setIsMfaVerified(true);
    saveStoredAdminSession(user.uid, true, now);

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

    const now = Date.now();
    lastActiveRef.current = now;
    isMfaVerifiedRef.current = true;
    setMfaChallengePending(false);
    setIsMfaVerified(true);
    saveStoredAdminSession(user.uid, true, now);
    await writeAuditEntry('MFA_VERIFIED', 'auth', user.uid);
    return true;
  };

  const resetPassword = async (emailToReset: string) => {
    await sendPasswordResetEmail(auth, emailToReset.trim());
  };

  const logout = async () => {
    clearStoredAdminSession();
    setIdleLogoutNotice(null);
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
        idleLogoutNotice,
        clearIdleLogoutNotice,
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
