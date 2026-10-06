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

          // Auto-bootstrap runtime Super Admin webdev.cybernetics@gmail.com if no profile exists
          const isBootstrappedEmail = fbUser.email?.toLowerCase() === 'webdev.cybernetics@gmail.com';

          if (!userSnap.exists()) {
            if (isBootstrappedEmail) {
              const newProfile: UserProfile = {
                uid: fbUser.uid,
                email: fbUser.email || '',
                displayName: fbUser.displayName || 'Administrator',
                role: 'SUPER_ADMIN',
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
                setMfaChallengePending(true);
                setIsMfaVerified(false);
              } else {
                setMfaChallengePending(true); // Must enroll first
                setIsMfaVerified(false);
              }
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
    const cleanEmail = email.trim();
    const isBootstrappedEmail = cleanEmail.toLowerCase() === 'webdev.cybernetics@gmail.com';

    try {
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, pass);
      await writeAuditEntry('LOGIN', 'auth', cred.user.uid, { email: cleanEmail });
    } catch (err: any) {
      const code = err?.code || '';
      const msg = String(err?.message || '');

      // If the bootstrapped Super Admin is signing in with email/password for the first time,
      // automatically create their Email/Password credential if it doesn't exist yet
      if (
        isBootstrappedEmail &&
        pass.length >= 6 &&
        (code === 'auth/user-not-found' || code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials')
      ) {
        try {
          const created = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
          await writeAuditEntry('SUPER_ADMIN_BOOTSTRAPPED', 'auth', created.user.uid, { email: cleanEmail });
          return;
        } catch (createErr: any) {
          // If email-already-in-use, the account exists in Firebase Auth (either with a different password or Google Sign-In only)
          if (createErr?.code === 'auth/email-already-in-use') {
            throw new Error(
              'Incorrect password for webdev.cybernetics@gmail.com, or this account was originally signed in with Google. Click "Forgot password?" to set a password, or use "Sign In with Google".'
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
          `Domain ${window.location.hostname} is not authorized in Firebase. Add "${window.location.hostname}" to Firebase Console → Authentication → Settings → Authorized domains (and check GCP API Key HTTP referrers).`
        );
      }

      if (
        code === 'auth/invalid-credential' ||
        code === 'auth/invalid-login-credentials' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found'
      ) {
        throw new Error(
          'Invalid email or password. If you have not set a password yet, click "Forgot password?" below or use "Sign In with Google".'
        );
      }

      throw err;
    }
  };

  const signInWithGoogleAdmin = async () => {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    const isBootstrappedEmail = cred.user.email?.toLowerCase() === 'webdev.cybernetics@gmail.com';
    const userSnap = await getDoc(doc(db, 'users', cred.user.uid));
    if (!userSnap.exists() && !isBootstrappedEmail) {
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
