import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import * as OTPAuth from 'otpauth';
import { auth, db } from '../firebase/config';
import { UserProfile, Role } from '../../types';
import { handleFirestoreError, OperationType } from '../firebase/errors';

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

          // Auto-bootstrap runtime admin webdev.cybernetics@gmail.com if no profile exists
          const isBootstrappedEmail = fbUser.email?.toLowerCase() === 'webdev.cybernetics@gmail.com';

          if (!userSnap.exists()) {
            const newProfile: UserProfile = {
              uid: fbUser.uid,
              email: fbUser.email || '',
              displayName: fbUser.displayName || 'Administrator',
              role: isBootstrappedEmail ? 'SUPER_ADMIN' : 'ADMIN',
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
            const data = userSnap.data() as UserProfile;
            setProfile(data);
            setCurrentMfaSecret(data.mfaSecret || null);
            if (data.mfaEnrolled && data.mfaSecret) {
              setMfaChallengePending(true);
              setIsMfaVerified(false);
            } else {
              setMfaChallengePending(true); // Must enroll first
              setIsMfaVerified(false);
            }
          }
        } catch (err: any) {
          console.error('Error fetching admin user profile:', err);
          const isBootstrappedEmail = fbUser.email?.toLowerCase() === 'webdev.cybernetics@gmail.com';
          if (isBootstrappedEmail) {
            const fallbackProfile: UserProfile = {
              uid: fbUser.uid,
              email: fbUser.email || '',
              displayName: fbUser.displayName || 'Administrator',
              role: 'SUPER_ADMIN',
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
            // For other users, log warning without throwing unhandled error during auth initialization
            console.warn('Could not load profile from Firestore:', err?.message || err);
          }
        }
      } else {
        setProfile(null);
        setMfaChallengePending(false);
        setIsMfaVerified(false);
        setCurrentMfaSecret(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithEmailPassword = async (email: string, pass: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    await writeAuditEntry('LOGIN', 'auth', cred.user.uid, { email });
  };

  const signInWithGoogleAdmin = async () => {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    await writeAuditEntry('LOGIN', 'auth', cred.user.uid, { email: cred.user.email, provider: 'google' });
  };

  const registerAdmin = async (email: string, pass: string, displayName: string, role: Role = 'ADMIN') => {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
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
    await setDoc(doc(db, 'users', cred.user.uid), newProfile);
    setProfile(newProfile);
    await writeAuditEntry('ADMIN_CREATED', 'users', cred.user.uid, { email, role });
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
    await writeAuditEntry('MFA_VERIFIED', 'auth', user.uid);
    return true;
  };

  const resetPassword = async (emailToReset: string) => {
    await sendPasswordResetEmail(auth, emailToReset.trim());
  };

  const logout = async () => {
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
