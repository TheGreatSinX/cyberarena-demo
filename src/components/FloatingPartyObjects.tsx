import React, { useState } from 'react';
import { motion } from 'motion/react';
import confetti from 'canvas-confetti';
import { soundManager } from '../lib/sound/soundManager';

const CYBER_RED = '#E5322C';
const CYBER_DARK = '#18181B';
const CYBER_SLATE = '#27272A';

// Shared SVG filter so dark charcoal + red icons from the reference sheet pop crisply on dark backgrounds
const CyberIconDefs: React.FC<{ idPrefix: string }> = ({ idPrefix }) => (
  <defs>
    <filter id={`${idPrefix}_glow`} x="-25%" y="-25%" width="150%" height="150%">
      {/* Crisp light rim so dark charcoal elements stand out clearly against slate-950 */}
      <feDropShadow dx="0" dy="0" stdDeviation="1.4" floodColor="#F8FAFC" floodOpacity="0.85" />
      {/* Subtle 3D elevation shadow */}
      <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#E5322C" floodOpacity="0.28" />
    </filter>
  </defs>
);

// 1. User Access (Businessman silhouette + Red Padlock with Checkmark)
export const UserAccessObject: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 105 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 160 160"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`transition-transform ${className}`}
  >
    <CyberIconDefs idPrefix="userAccess" />
    <g filter="url(#userAccess_glow)">
      {/* Suit Shoulders & Torso */}
      <path
        d="M18 134 C18 106, 36 94, 58 90 L90 90 C112 94, 126 106, 126 134 Z"
        fill={CYBER_DARK}
      />
      {/* White Shirt V-Collar Cutout */}
      <path d="M58 90 L74 128 L90 90 Z" fill="#FFFFFF" />
      {/* Black Tie */}
      <path d="M71 94 L77 94 L79 122 L74 130 L69 122 Z" fill={CYBER_DARK} />
      {/* Neck */}
      <rect x="65" y="76" width="18" height="16" rx="4" fill={CYBER_DARK} />
      {/* Head & Ears & Hair Silhouette */}
      <path
        d="M54 50 C54 32, 62 24, 74 24 C86 24, 94 32, 94 50 C97 51, 98 56, 96 60 C95 62, 93 63, 92 64 C90 74, 83 82, 74 82 C65 82, 58 74, 56 64 C55 63, 53 62, 52 60 C50 56, 51 51, 54 50 Z"
        fill={CYBER_DARK}
      />

      {/* White Separator Backing for Overlapping Red Lock */}
      <rect x="92" y="92" width="50" height="48" rx="9" fill="#FFFFFF" />
      <path
        d="M104 94 V83 C104 73, 130 73, 130 83 V94"
        stroke="#FFFFFF"
        strokeWidth="12"
        strokeLinecap="round"
      />

      {/* Red Padlock Shackle */}
      <path
        d="M106 95 V83 C106 75, 128 75, 128 83 V95"
        stroke={CYBER_RED}
        strokeWidth="7"
        strokeLinecap="round"
      />
      {/* Red Padlock Body */}
      <rect x="96" y="95" width="42" height="42" rx="7" fill={CYBER_RED} />
      {/* White Checkmark inside Lock */}
      <path
        d="M108 116 L115 123 L128 109"
        stroke="#FFFFFF"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  </svg>
);

// 2. Password (Black Padlock + Red 4-Star Password Banner)
export const PasswordLockObject: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 105 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 160 160"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`transition-transform ${className}`}
  >
    <CyberIconDefs idPrefix="passwordLock" />
    <g filter="url(#passwordLock_glow)">
      {/* Padlock Shackle */}
      <path
        d="M54 68 V46 C54 26, 106 26, 106 46 V68"
        stroke={CYBER_DARK}
        strokeWidth="14"
        strokeLinecap="round"
      />
      {/* Upper Lock Body */}
      <path
        d="M36 74 C36 66, 42 62, 50 62 H110 C118 62, 124 66, 124 74 V84 H36 V74 Z"
        fill={CYBER_DARK}
      />
      {/* Lower Lock Body */}
      <path
        d="M36 116 H124 V126 C124 134, 118 138, 110 138 H50 C42 138, 36 134, 36 126 V116 Z"
        fill={CYBER_DARK}
      />
      {/* White Cutout Backing for Red Star Strip */}
      <rect x="28" y="83" width="104" height="34" rx="9" fill="#FFFFFF" />
      {/* Red Password Strip */}
      <rect x="31" y="86" width="98" height="28" rx="7" fill={CYBER_RED} />

      {/* 4 White 5-Pointed Stars */}
      {[46, 68.5, 91.5, 114].map((cx, i) => (
        <polygon
          key={i}
          points={`${cx},91 ${cx + 2.4},96.5 ${cx + 8.2},97.2 ${cx + 3.8},101.2 ${cx + 5},107 ${cx},104 ${cx - 5},107 ${cx - 3.8},101.2 ${cx - 8.2},97.2 ${cx - 2.4},96.5`}
          fill="#FFFFFF"
        />
      ))}
    </g>
  </svg>
);

// 3. Fingerprint (Black Scanner Brackets + Red Fingerprint Ridges)
export const FingerprintObject: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 105 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 160 160"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`transition-transform ${className}`}
  >
    <CyberIconDefs idPrefix="fingerprint" />
    <g filter="url(#fingerprint_glow)">
      {/* 4 Black Corner Viewfinder Brackets */}
      <path d="M26 54 V34 C26 28, 30 24, 36 24 H56" stroke={CYBER_DARK} strokeWidth="9" strokeLinecap="round" />
      <path d="M104 24 H124 C130 24, 134 28, 134 34 V54" stroke={CYBER_DARK} strokeWidth="9" strokeLinecap="round" />
      <path d="M26 106 V126 C26 132, 30 136, 36 136 H56" stroke={CYBER_DARK} strokeWidth="9" strokeLinecap="round" />
      <path d="M104 136 H124 C130 136, 134 132, 134 126 V106" stroke={CYBER_DARK} strokeWidth="9" strokeLinecap="round" />

      {/* Red Fingerprint Ridges */}
      <path
        d="M52 54 C64 40, 96 40, 108 54"
        stroke={CYBER_RED}
        strokeWidth="5.5"
        strokeLinecap="round"
      />
      <path
        d="M44 74 C44 50, 116 50, 116 76 C116 92, 112 106, 106 116"
        stroke={CYBER_RED}
        strokeWidth="5.5"
        strokeLinecap="round"
      />
      <path
        d="M44 90 C44 98, 47 108, 52 116"
        stroke={CYBER_RED}
        strokeWidth="5.5"
        strokeLinecap="round"
      />
      <path
        d="M55 78 C55 58, 105 58, 105 78 C105 94, 101 108, 95 120"
        stroke={CYBER_RED}
        strokeWidth="5.5"
        strokeLinecap="round"
      />
      <path
        d="M56 92 C57 104, 61 114, 67 122"
        stroke={CYBER_RED}
        strokeWidth="5.5"
        strokeLinecap="round"
      />
      <path
        d="M67 80 C67 68, 93 68, 93 80 C93 96, 89 112, 83 124"
        stroke={CYBER_RED}
        strokeWidth="5.5"
        strokeLinecap="round"
      />
      <path
        d="M68 96 C69 108, 72 116, 75 124"
        stroke={CYBER_RED}
        strokeWidth="5.5"
        strokeLinecap="round"
      />
      <path
        d="M80 78 V108"
        stroke={CYBER_RED}
        strokeWidth="5.5"
        strokeLinecap="round"
      />
    </g>
  </svg>
);

// 4. Security (Shield with Black Lock + Red Checkmark Circle Badge)
export const SecurityShieldObject: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 105 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 160 160"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`transition-transform ${className}`}
  >
    <CyberIconDefs idPrefix="securityShield" />
    <g filter="url(#securityShield_glow)">
      {/* Shield Outer & White Interior */}
      <path
        d="M72 28 L28 44 V82 C28 112, 50 132, 72 142 C94 132, 116 112, 116 82 V44 L72 28 Z"
        fill="#FFFFFF"
        stroke={CYBER_DARK}
        strokeWidth="10"
        strokeLinejoin="round"
      />
      {/* Inner Black Padlock Shackle */}
      <path
        d="M60 78 V66 C60 54, 84 54, 84 66 V78"
        stroke={CYBER_DARK}
        strokeWidth="7"
        strokeLinecap="round"
      />
      {/* Inner Black Padlock Body */}
      <rect x="51" y="76" width="42" height="36" rx="6" fill={CYBER_DARK} />
      {/* White Keyhole */}
      <circle cx="72" cy="90" r="4.5" fill="#FFFFFF" />
      <path d="M72 93 V103" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" />

      {/* Overlapping Red Checkmark Badge (Top Right) */}
      <circle cx="114" cy="52" r="28" fill="#FFFFFF" />
      <circle cx="114" cy="52" r="24" fill={CYBER_RED} />
      <path
        d="M103 52 L111 60 L126 44"
        stroke="#FFFFFF"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  </svg>
);

// 5. Email Protection (Black Envelope + Letter + Red Lock with Checkmark)
export const EmailProtectionObject: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 105 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 160 160"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`transition-transform ${className}`}
  >
    <CyberIconDefs idPrefix="emailProtection" />
    <g filter="url(#emailProtection_glow)">
      {/* White Letter Paper Rising from Envelope */}
      <rect
        x="40"
        y="48"
        width="80"
        height="68"
        rx="5"
        fill="#FFFFFF"
        stroke={CYBER_DARK}
        strokeWidth="7"
      />

      {/* Red Padlock on Letter */}
      <path
        d="M68 48 V36 C68 24, 92 24, 92 36 V48"
        stroke={CYBER_RED}
        strokeWidth="7"
        strokeLinecap="round"
      />
      <rect x="60" y="46" width="40" height="36" rx="6" fill={CYBER_RED} />
      <path
        d="M71 64 L78 71 L90 57"
        stroke="#FFFFFF"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Black Envelope Body */}
      <path
        d="M24 72 L80 108 L136 72 V128 C136 135, 131 140, 124 140 H36 C29 140, 24 135, 24 128 V72 Z"
        fill={CYBER_DARK}
      />
      {/* Top Flaps of Open Envelope */}
      <path
        d="M24 72 L38 62 V82 Z M136 72 L122 62 V82 Z"
        fill={CYBER_DARK}
      />
    </g>
  </svg>
);

// 6. Cloud Security (Red Cloud + Black Lock + Bottom Circuit Nodes)
export const CloudSecurityObject: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 105 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 160 160"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`transition-transform ${className}`}
  >
    <CyberIconDefs idPrefix="cloudSecurity" />
    <g filter="url(#cloudSecurity_glow)">
      {/* Red Cloud Body */}
      <path
        d="M42 108 C24 108, 14 96, 16 80 C18 66, 30 58, 40 58 C46 38, 66 28, 86 34 C102 38, 112 52, 114 64 C128 66, 138 78, 136 92 C134 102, 124 108, 110 108 H42 Z"
        fill={CYBER_RED}
      />
      {/* White Cutout Arch at Cloud Base for Circuit Stems */}
      <path
        d="M52 109 C52 96, 100 96, 100 109 Z"
        fill="#FFFFFF"
      />

      {/* Overlapping Black Lock (Top Right) */}
      <rect x="95" y="47" width="44" height="42" rx="7" fill="#FFFFFF" />
      <path
        d="M106 49 V38 C106 28, 128 28, 128 38 V49"
        stroke={CYBER_DARK}
        strokeWidth="6.5"
        strokeLinecap="round"
      />
      <rect x="98" y="49" width="38" height="36" rx="6" fill={CYBER_DARK} />
      <path
        d="M108 67 L115 74 L127 60"
        stroke="#FFFFFF"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* 3 Black Circuit Nodes Below Cloud */}
      {/* Left Node */}
      <path d="M64 104 V124 H44" stroke={CYBER_DARK} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="36" cy="124" r="7" fill="#FFFFFF" stroke={CYBER_DARK} strokeWidth="5.5" />
      {/* Center Node */}
      <path d="M76 104 V132" stroke={CYBER_DARK} strokeWidth="6" strokeLinecap="round" />
      <circle cx="76" cy="140" r="7" fill="#FFFFFF" stroke={CYBER_DARK} strokeWidth="5.5" />
      {/* Right Node */}
      <path d="M88 104 V124 H108" stroke={CYBER_DARK} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="116" cy="124" r="7" fill="#FFFFFF" stroke={CYBER_DARK} strokeWidth="5.5" />
    </g>
  </svg>
);

// 7. Cyber Security Shield (Black Shield with Checkmark + 7 Red Circuit Nodes)
export const CyberShieldCircuitObject: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 105 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 160 160"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`transition-transform ${className}`}
  >
    <CyberIconDefs idPrefix="cyberShieldCircuit" />
    <g filter="url(#cyberShieldCircuit_glow)">
      {/* Left Red Circuit Traces */}
      <path d="M52 60 H36 V40" stroke={CYBER_RED} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="36" cy="32" r="7" fill="#FFFFFF" stroke={CYBER_RED} strokeWidth="5" />

      <path d="M48 80 H28" stroke={CYBER_RED} strokeWidth="5.5" strokeLinecap="round" />
      <circle cx="20" cy="80" r="7" fill="#FFFFFF" stroke={CYBER_RED} strokeWidth="5" />

      <path d="M54 98 H36 V118" stroke={CYBER_RED} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="36" cy="126" r="7" fill="#FFFFFF" stroke={CYBER_RED} strokeWidth="5" />

      {/* Right Red Circuit Traces */}
      <path d="M108 60 H124 V40" stroke={CYBER_RED} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="124" cy="32" r="7" fill="#FFFFFF" stroke={CYBER_RED} strokeWidth="5" />

      <path d="M112 80 H132" stroke={CYBER_RED} strokeWidth="5.5" strokeLinecap="round" />
      <circle cx="140" cy="80" r="7" fill="#FFFFFF" stroke={CYBER_RED} strokeWidth="5" />

      <path d="M106 98 H124 V118" stroke={CYBER_RED} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="124" cy="126" r="7" fill="#FFFFFF" stroke={CYBER_RED} strokeWidth="5" />

      {/* Bottom Center Red Circuit Trace */}
      <path d="M80 116 V134" stroke={CYBER_RED} strokeWidth="5.5" strokeLinecap="round" />
      <circle cx="80" cy="142" r="7" fill="#FFFFFF" stroke={CYBER_RED} strokeWidth="5" />

      {/* Central Black Shield */}
      <path
        d="M80 42 L48 54 V80 C48 102, 64 114, 80 122 C96 114, 112 102, 112 80 V54 L80 42 Z"
        fill={CYBER_DARK}
      />
      {/* White Checkmark */}
      <path
        d="M68 80 L76 89 L94 70"
        stroke="#FFFFFF"
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  </svg>
);

// 8. Cyber Security Monitor (Monitor + Side Circuits + Red Lock on Top)
export const CyberMonitorLockObject: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 105 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 160 160"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`transition-transform ${className}`}
  >
    <CyberIconDefs idPrefix="cyberMonitorLock" />
    <g filter="url(#cyberMonitorLock_glow)">
      {/* Left Side Circuit Nodes */}
      <path d="M44 74 H32 L26 66" stroke={CYBER_SLATE} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="23" cy="62" r="4.5" fill="#FFFFFF" stroke={CYBER_SLATE} strokeWidth="3.5" />

      <path d="M44 84 H24" stroke={CYBER_SLATE} strokeWidth="4" strokeLinecap="round" />
      <circle cx="19" cy="84" r="4.5" fill="#FFFFFF" stroke={CYBER_SLATE} strokeWidth="3.5" />

      <path d="M44 94 H28" stroke={CYBER_SLATE} strokeWidth="4" strokeLinecap="round" />
      <circle cx="23" cy="94" r="4.5" fill="#FFFFFF" stroke={CYBER_SLATE} strokeWidth="3.5" />

      <path d="M44 104 H32 L26 112" stroke={CYBER_SLATE} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="23" cy="116" r="4.5" fill="#FFFFFF" stroke={CYBER_SLATE} strokeWidth="3.5" />

      {/* Right Side Circuit Nodes */}
      <path d="M116 74 H128 L134 66" stroke={CYBER_SLATE} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="137" cy="62" r="4.5" fill="#FFFFFF" stroke={CYBER_SLATE} strokeWidth="3.5" />

      <path d="M116 84 H136" stroke={CYBER_SLATE} strokeWidth="4" strokeLinecap="round" />
      <circle cx="141" cy="84" r="4.5" fill="#FFFFFF" stroke={CYBER_SLATE} strokeWidth="3.5" />

      <path d="M116 94 H132" stroke={CYBER_SLATE} strokeWidth="4" strokeLinecap="round" />
      <circle cx="137" cy="94" r="4.5" fill="#FFFFFF" stroke={CYBER_SLATE} strokeWidth="3.5" />

      <path d="M116 104 H128 L134 112" stroke={CYBER_SLATE} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="137" cy="116" r="4.5" fill="#FFFFFF" stroke={CYBER_SLATE} strokeWidth="3.5" />

      {/* Monitor Frame */}
      <rect x="42" y="60" width="76" height="56" rx="5" fill={CYBER_DARK} />
      {/* White Screen Inside */}
      <rect x="47" y="65" width="66" height="38" rx="2" fill="#FFFFFF" />
      {/* Monitor Stand Neck & Base */}
      <path d="M72 116 H88 L92 126 H68 L72 116 Z" fill={CYBER_DARK} />
      <rect x="58" y="126" width="44" height="5" rx="2.5" fill={CYBER_DARK} />

      {/* Top Red Padlock */}
      <rect x="60" y="44" width="40" height="36" rx="6" fill="#FFFFFF" />
      <path
        d="M69 46 V35 C69 25, 91 25, 91 35 V46"
        stroke={CYBER_RED}
        strokeWidth="6.5"
        strokeLinecap="round"
      />
      <rect x="62" y="46" width="36" height="32" rx="5" fill={CYBER_RED} />
      <path
        d="M72 62 L78 68 L89 56"
        stroke="#FFFFFF"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  </svg>
);

// 9. Encryption (Black Horizontal Key + Red Circuit Traces)
export const EncryptionKeyObject: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 105 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 160 160"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`transition-transform ${className}`}
  >
    <CyberIconDefs idPrefix="encryptionKey" />
    <g filter="url(#encryptionKey_glow)">
      {/* Upper Red Circuit Traces */}
      <path d="M96 64 V38 H78" stroke={CYBER_RED} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="70" cy="38" r="8" fill="#FFFFFF" stroke={CYBER_RED} strokeWidth="5.5" />

      <path d="M114 64 V40" stroke={CYBER_RED} strokeWidth="6" strokeLinecap="round" />
      <circle cx="114" cy="30" r="8" fill="#FFFFFF" stroke={CYBER_RED} strokeWidth="5.5" />

      {/* Lower Red Circuit Traces */}
      <path d="M96 96 V122 H78" stroke={CYBER_RED} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="70" cy="122" r="8" fill="#FFFFFF" stroke={CYBER_RED} strokeWidth="5.5" />

      <path d="M114 96 V120" stroke={CYBER_RED} strokeWidth="6" strokeLinecap="round" />
      <circle cx="114" cy="130" r="8" fill="#FFFFFF" stroke={CYBER_RED} strokeWidth="5.5" />

      {/* Black Key Blade */}
      <path d="M74 68 H128 L140 80 L128 92 H74 V68 Z" fill={CYBER_DARK} />
      {/* White Key Blade Groove */}
      <line x1="78" y1="80" x2="124" y2="80" stroke="#FFFFFF" strokeWidth="4.5" strokeLinecap="round" />

      {/* Black Key Bow (Head) */}
      <circle cx="48" cy="80" r="28" fill={CYBER_DARK} />
      <circle cx="48" cy="80" r="11" fill="#FFFFFF" />
    </g>
  </svg>
);

// 10. Technology (Left Black Half-Gear + Right Red Circuit Lines)
export const TechnologyGearObject: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 105 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 160 160"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`transition-transform ${className}`}
  >
    <CyberIconDefs idPrefix="techGear" />
    <g filter="url(#techGear_glow)">
      {/* Left Half Black Gear with Teeth */}
      <path
        d="M72 26 L62 26 L56 36 C51 38, 47 41, 43 45 L32 41 L24 52 L32 61 C30 66, 29 71, 29 76 L18 80 L18 92 L30 96 C31 101, 33 106, 36 110 L28 120 L38 130 L48 123 C52 126, 57 128, 62 130 L66 140 H76 V114 C56 114, 44 100, 44 82 C44 64, 56 50, 76 50 V26 Z"
        fill={CYBER_DARK}
      />

      {/* Red Circuit Lines Extending Right */}
      {/* Line 1 (Top) */}
      <path d="M68 66 H112 L120 56 H130" stroke={CYBER_RED} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="137" cy="56" r="6.5" fill="#FFFFFF" stroke={CYBER_RED} strokeWidth="5" />

      {/* Line 2 (Upper Mid) */}
      <path d="M68 78 H134" stroke={CYBER_RED} strokeWidth="5.5" strokeLinecap="round" />
      <circle cx="142" cy="78" r="6.5" fill="#FFFFFF" stroke={CYBER_RED} strokeWidth="5" />

      {/* Line 3 (Lower Mid) */}
      <path d="M68 90 H116 L126 102" stroke={CYBER_RED} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="131" cy="108" r="6.5" fill="#FFFFFF" stroke={CYBER_RED} strokeWidth="5" />

      {/* Line 4 (Bottom) */}
      <path d="M68 102 H98 L106 114" stroke={CYBER_RED} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="111" cy="120" r="6.5" fill="#FFFFFF" stroke={CYBER_RED} strokeWidth="5" />
    </g>
  </svg>
);

export const FloatingPartyObjects: React.FC = () => {
  const [, setActiveEffect] = useState<string | null>(null);

  const handleObjectClick = (name: string, xRatio: number, yRatio: number) => {
    soundManager.playAnswerSubmit();
    setActiveEffect(name);
    setTimeout(() => setActiveEffect(null), 800);

    confetti({
      particleCount: 35,
      spread: 60,
      origin: { x: xRatio, y: yRatio },
      colors: ['#E5322C', '#F05A28', '#00A191', '#F8FAFC', '#38BDF8'],
    });
  };

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {/* 1. TOP-LEFT: User Access */}
      <motion.div
        className="absolute top-6 left-3 sm:top-10 sm:left-10 lg:left-20 pointer-events-auto cursor-pointer"
        animate={{
          y: [0, -16, 0],
          rotate: [-4, 4, -4],
        }}
        transition={{
          repeat: Infinity,
          duration: 4.8,
          ease: 'easeInOut',
        }}
        whileHover={{ scale: 1.16, rotate: 8 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => handleObjectClick('user-access', 0.14, 0.18)}
        title="User Access"
      >
        <UserAccessObject size={96} />
      </motion.div>

      {/* 2. TOP-RIGHT: Password */}
      <motion.div
        className="absolute top-6 right-3 sm:top-10 sm:right-10 lg:right-20 pointer-events-auto cursor-pointer"
        animate={{
          y: [0, -18, 0],
          rotate: [5, -5, 5],
        }}
        transition={{
          repeat: Infinity,
          duration: 5.2,
          ease: 'easeInOut',
          delay: 0.3,
        }}
        whileHover={{ scale: 1.16, rotate: -8 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => handleObjectClick('password', 0.86, 0.18)}
        title="Password Security"
      >
        <PasswordLockObject size={96} />
      </motion.div>

      {/* 3. UPPER-MID-LEFT: Fingerprint */}
      <motion.div
        className="hidden md:block absolute top-[28%] left-6 lg:left-36 pointer-events-auto cursor-pointer"
        animate={{
          y: [0, 14, 0],
          rotate: [-3, 5, -3],
        }}
        transition={{
          repeat: Infinity,
          duration: 5.6,
          ease: 'easeInOut',
          delay: 0.6,
        }}
        whileHover={{ scale: 1.16, rotate: -6 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => handleObjectClick('fingerprint', 0.18, 0.32)}
        title="Biometric Fingerprint"
      >
        <FingerprintObject size={90} />
      </motion.div>

      {/* 4. UPPER-MID-RIGHT: Security Shield */}
      <motion.div
        className="hidden md:block absolute top-[28%] right-6 lg:right-36 pointer-events-auto cursor-pointer"
        animate={{
          y: [0, -15, 0],
          rotate: [4, -4, 4],
        }}
        transition={{
          repeat: Infinity,
          duration: 5.0,
          ease: 'easeInOut',
          delay: 0.9,
        }}
        whileHover={{ scale: 1.16, rotate: 8 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => handleObjectClick('security', 0.82, 0.32)}
        title="Security Shield"
      >
        <SecurityShieldObject size={92} />
      </motion.div>

      {/* 5. MID-LEFT: Email Protection */}
      <motion.div
        className="hidden sm:block absolute top-[50%] left-4 lg:left-14 pointer-events-auto cursor-pointer"
        animate={{
          y: [0, -16, 0],
          rotate: [-5, 4, -5],
        }}
        transition={{
          repeat: Infinity,
          duration: 5.8,
          ease: 'easeInOut',
          delay: 1.1,
        }}
        whileHover={{ scale: 1.16, rotate: -8 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => handleObjectClick('email-protection', 0.1, 0.52)}
        title="Email Protection"
      >
        <EmailProtectionObject size={92} />
      </motion.div>

      {/* 6. MID-RIGHT: Cloud Security */}
      <motion.div
        className="hidden sm:block absolute top-[50%] right-4 lg:right-14 pointer-events-auto cursor-pointer"
        animate={{
          y: [0, 16, 0],
          rotate: [4, -5, 4],
        }}
        transition={{
          repeat: Infinity,
          duration: 5.4,
          ease: 'easeInOut',
          delay: 1.3,
        }}
        whileHover={{ scale: 1.16, rotate: 8 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => handleObjectClick('cloud-security', 0.9, 0.52)}
        title="Cloud Security"
      >
        <CloudSecurityObject size={96} />
      </motion.div>

      {/* 7. LOWER-MID-LEFT: Encryption Key */}
      <motion.div
        className="hidden lg:block absolute bottom-[26%] left-32 pointer-events-auto cursor-pointer"
        animate={{
          y: [0, -14, 0],
          rotate: [-4, 6, -4],
        }}
        transition={{
          repeat: Infinity,
          duration: 4.9,
          ease: 'easeInOut',
          delay: 0.5,
        }}
        whileHover={{ scale: 1.16, rotate: 10 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => handleObjectClick('encryption', 0.18, 0.72)}
        title="Encryption"
      >
        <EncryptionKeyObject size={90} />
      </motion.div>

      {/* 8. LOWER-MID-RIGHT: Technology Gear */}
      <motion.div
        className="hidden lg:block absolute bottom-[26%] right-32 pointer-events-auto cursor-pointer"
        animate={{
          y: [0, 14, 0],
          rotate: [5, -5, 5],
        }}
        transition={{
          repeat: Infinity,
          duration: 5.3,
          ease: 'easeInOut',
          delay: 0.7,
        }}
        whileHover={{ scale: 1.16, rotate: -10 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => handleObjectClick('technology', 0.82, 0.72)}
        title="Technology"
      >
        <TechnologyGearObject size={90} />
      </motion.div>

      {/* 9. BOTTOM-LEFT: Cyber Security (Shield + Circuits) */}
      <motion.div
        className="absolute bottom-8 left-3 sm:bottom-10 sm:left-12 lg:left-20 pointer-events-auto cursor-pointer"
        animate={{
          y: [0, -15, 0],
          rotate: [-6, 4, -6],
        }}
        transition={{
          repeat: Infinity,
          duration: 4.6,
          ease: 'easeInOut',
          delay: 0.6,
        }}
        whileHover={{ scale: 1.18, rotate: -10 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => handleObjectClick('cyber-shield', 0.14, 0.84)}
        title="Cyber Security"
      >
        <CyberShieldCircuitObject size={98} />
      </motion.div>

      {/* 10. BOTTOM-RIGHT: Cyber Security (Monitor + Lock) */}
      <motion.div
        className="absolute bottom-8 right-3 sm:bottom-10 sm:right-12 lg:right-20 pointer-events-auto cursor-pointer"
        animate={{
          y: [0, -14, 0],
          rotate: [3, -5, 3],
        }}
        transition={{
          repeat: Infinity,
          duration: 5.5,
          ease: 'easeInOut',
          delay: 1.4,
        }}
        whileHover={{ scale: 1.18, rotate: 8 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => handleObjectClick('cyber-monitor', 0.86, 0.84)}
        title="Cyber Security"
      >
        <CyberMonitorLockObject size={98} />
      </motion.div>

      {/* Ambient Floating Cyber Nodes */}
      <motion.div
        className="absolute top-1/3 left-1/4 w-3 h-3 rounded-full border-2 border-[#E5322C] bg-slate-950 opacity-60"
        animate={{ y: [0, -24, 0], opacity: [0.35, 0.75, 0.35] }}
        transition={{ repeat: Infinity, duration: 4.2, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute top-1/4 right-1/3 w-3 h-3 rounded-full border-2 border-[#00A191] bg-slate-950 opacity-60"
        animate={{ y: [0, -20, 0], opacity: [0.35, 0.75, 0.35] }}
        transition={{ repeat: Infinity, duration: 5.1, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-1/3 left-1/3 w-3.5 h-3.5 rounded-full border-2 border-[#E5322C] bg-slate-950 opacity-50"
        animate={{ y: [0, 18, 0], opacity: [0.3, 0.7, 0.3] }}
        transition={{ repeat: Infinity, duration: 4.8, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-1/4 right-1/4 w-3 h-3 rounded-full border-2 border-slate-300 bg-slate-950 opacity-50"
        animate={{ y: [0, -18, 0], opacity: [0.3, 0.65, 0.3] }}
        transition={{ repeat: Infinity, duration: 3.9, ease: 'easeInOut' }}
      />
    </div>
  );
};
