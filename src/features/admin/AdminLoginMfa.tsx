import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { useAuth } from '../../lib/auth/authContext';
import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  Mail,
  KeyRound,
  ArrowRight,
  Loader2,
  AlertCircle,
  QrCode,
  CheckCircle2,
  Copy,
  Info,
} from 'lucide-react';

interface AdminLoginMfaProps {
  onSuccess: () => void;
}

export const AdminLoginMfa: React.FC<AdminLoginMfaProps> = ({ onSuccess }) => {
  const {
    user,
    profile,
    mfaChallengePending,
    isMfaVerified,
    loginWithEmailPassword,
    signInWithGoogleAdmin,
    generateTotpSetup,
    enrollMfa,
    verifyMfaToken,
    resetPassword,
  } = useAuth();

  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // MFA Setup State
  const [totpSecret, setTotpSecret] = useState<string>('');
  const [totpUri, setTotpUri] = useState<string>('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [mfaCode, setMfaCode] = useState<string>('');
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaVerifying, setMfaVerifying] = useState<boolean>(false);
  const [copiedSecret, setCopiedSecret] = useState<boolean>(false);

  // If already logged in and verified, trigger success
  useEffect(() => {
    if (user && isMfaVerified) {
      onSuccess();
    }
  }, [user, isMfaVerified, onSuccess]);

  // When user is authenticated but needs MFA enrollment, generate QR code
  useEffect(() => {
    if (user && profile && !profile.mfaEnrolled) {
      const setup = generateTotpSetup();
      setTotpSecret(setup.secret);
      setTotpUri(setup.uri);
      QRCode.toDataURL(setup.uri, { width: 220, margin: 2 })
        .then((url) => setQrCodeDataUrl(url))
        .catch((err) => console.error('QR Code generation failed:', err));
    }
  }, [user, profile]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await loginWithEmailPassword(email.trim(), password);
    } catch (err: any) {
      setError(err?.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogleAdmin();
    } catch (err: any) {
      setError(err?.message || 'Google sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResetSuccess(null);
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(email.trim());
      setResetSuccess(`Password reset email sent to ${email.trim()}. Please check your inbox and spam folder.`);
    } catch (err: any) {
      setError(err?.message || 'Failed to send password reset email.');
    } finally {
      setLoading(false);
    }
  };

  const handleEnrollMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setMfaError(null);
    if (mfaCode.trim().length !== 6) {
      setMfaError('Please enter a valid 6-digit code.');
      return;
    }

    try {
      setMfaVerifying(true);
      const verified = await enrollMfa(totpSecret, mfaCode);
      if (!verified) {
        setMfaError('Invalid code. Please ensure your clock is synchronized and try again.');
      } else {
        onSuccess();
      }
    } catch (err: any) {
      setMfaError(err?.message || 'Failed to enroll MFA.');
    } finally {
      setMfaVerifying(false);
    }
  };

  const handleVerifyChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    setMfaError(null);
    if (mfaCode.trim().length !== 6) {
      setMfaError('Please enter a 6-digit code.');
      return;
    }

    try {
      setMfaVerifying(true);
      const verified = await verifyMfaToken(mfaCode);
      if (!verified) {
        setMfaError('Invalid verification code.');
      } else {
        onSuccess();
      }
    } catch (err: any) {
      setMfaError(err?.message || 'Verification failed.');
    } finally {
      setMfaVerifying(false);
    }
  };

  // STEP 2: MFA FLOW (MANDATORY)
  if (user && (!isMfaVerified || mfaChallengePending)) {
    const isEnrolled = profile?.mfaEnrolled;

    return (
      <div className="min-h-[calc(100vh-4rem)] flex flex-col justify-center items-center px-4 py-12 bg-slate-950 text-white">
        <div className="w-full max-w-lg bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center mx-auto mb-3 shadow-inner">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <h2 className="text-2xl font-black text-white">
              {isEnrolled ? 'Two-Factor Authentication' : 'Mandatory MFA Enrollment'}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {isEnrolled
                ? `Enter the 6-digit TOTP code for ${user.email}`
                : 'Secure your administrator account using any standard Authenticator App.'}
            </p>
          </div>

          {mfaError && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs mb-4">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{mfaError}</span>
            </div>
          )}

          {!isEnrolled ? (
            /* ENROLLMENT */
            <form onSubmit={handleEnrollMfa} className="space-y-5">
              <div className="flex flex-col items-center p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center">
                {qrCodeDataUrl ? (
                  <img
                    src={qrCodeDataUrl}
                    alt="Authenticator QR Code"
                    className="w-44 h-44 rounded-xl border border-slate-700 p-2 bg-white"
                  />
                ) : (
                  <div className="w-44 h-44 flex items-center justify-center text-slate-500">
                    <Loader2 className="w-8 h-8 animate-spin" />
                  </div>
                )}

                <p className="text-xs text-slate-400 mt-3 font-medium">
                  Scan with Google Authenticator, Microsoft Authenticator, 1Password, or Authy.
                </p>

                {totpSecret && (
                  <div className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300">
                    <span className="truncate max-w-[200px]">Secret: {totpSecret}</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(totpSecret);
                        setCopiedSecret(true);
                        setTimeout(() => setCopiedSecret(false), 2000);
                      }}
                      className="text-indigo-400 hover:text-indigo-300 cursor-pointer"
                    >
                      {copiedSecret ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Enter 6-Digit Authenticator Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="w-full text-center text-3xl font-mono font-black tracking-widest px-4 py-3 rounded-2xl bg-slate-950 border-2 border-slate-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 text-white outline-none"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={mfaVerifying || mfaCode.length !== 6}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl font-bold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 cursor-pointer shadow-lg shadow-indigo-600/30 transition-all"
              >
                {mfaVerifying ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
                <span>Verify & Activate MFA</span>
              </button>
            </form>
          ) : (
            /* CHALLENGE */
            <form onSubmit={handleVerifyChallenge} className="space-y-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Authenticator Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="w-full text-center text-3xl font-mono font-black tracking-widest px-4 py-3 rounded-2xl bg-slate-950 border-2 border-slate-700 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 text-white outline-none"
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={mfaVerifying || mfaCode.length !== 6}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl font-bold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 cursor-pointer shadow-lg shadow-indigo-600/30 transition-all"
              >
                {mfaVerifying ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />}
                <span>Verify TOTP & Enter Console</span>
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // STEP 1: LOGIN / REGISTER FORM
  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col justify-center items-center px-4 py-12 bg-slate-950 text-white relative">
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center mx-auto mb-3 shadow-inner">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-black text-white">Administrator Portal</h2>
          <p className="text-xs text-slate-400 mt-1">
            Sign in with an authorized administrator account provisioned by a Super Admin.
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs mb-5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {mode === 'forgot' ? (
          <form onSubmit={handleResetSubmit} className="space-y-4">
            <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 text-xs leading-relaxed">
              Enter your administrator email address below. Firebase will dispatch an official password reset email containing a secure link to choose a new password.
            </div>

            {resetSuccess && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>{resetSuccess}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@cyberarena.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all disabled:opacity-50 cursor-pointer shadow-lg shadow-indigo-600/30"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <span>Send Password Reset Link</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
                setResetSuccess(null);
              }}
              className="w-full text-center text-xs font-bold text-slate-400 hover:text-white py-2 transition-colors cursor-pointer"
            >
              Back to Admin Sign In
            </button>
          </form>
        ) : (
          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@cyberarena.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot');
                    setError(null);
                    setResetSuccess(null);
                  }}
                  className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all disabled:opacity-50 cursor-pointer shadow-lg shadow-indigo-600/30"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Continue to MFA</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        <div className="my-5 flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-800" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">or</span>
          <div className="flex-1 h-px bg-slate-800" />
        </div>

        {/* Quick Google Sign In */}
        <button
          type="button"
          onClick={handleGoogleAuth}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl font-bold text-sm bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.15z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.17 0 9.99 0 12s.45 3.83 1.25 5.42l4.03-3.15z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
            />
          </svg>
          <span>Sign In with Google</span>
        </button>

        {/* Notice that new administrators must be added by Super Admin */}
        <div className="mt-6 p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-400 flex items-start gap-2">
          <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
          <span>
            Self-registration is disabled. New administrator accounts must be manually added by a <strong>Super Admin</strong> from the Administrator console.
          </span>
        </div>
      </div>
    </div>
  );
};
