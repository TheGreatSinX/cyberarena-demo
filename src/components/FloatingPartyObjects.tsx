import React, { useState } from 'react';
import { motion } from 'motion/react';
import confetti from 'canvas-confetti';
import { soundManager } from '../lib/sound/soundManager';

// Shared 3D Clay / Glossy Material Gradients & Filters matching the uploaded 3D Cyber Security Icon Set
const Clay3DDefs: React.FC<{ idPrefix: string }> = ({ idPrefix }) => (
  <defs>
    {/* Soft 3D ambient drop shadow + subtle rim glow */}
    <filter id={`${idPrefix}_3d_shadow`} x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="10" stdDeviation="8" floodColor="#000000" floodOpacity="0.65" />
      <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#3B82F6" floodOpacity="0.28" />
    </filter>

    {/* Dark Matte / Glossy Charcoal 3D Gradient */}
    <linearGradient id={`${idPrefix}_dark_matte`} x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stopColor="#4B5563" />
      <stop offset="35%" stopColor="#27272A" />
      <stop offset="80%" stopColor="#18181B" />
      <stop offset="100%" stopColor="#09090B" />
    </linearGradient>

    {/* Radial Glossy Black Sphere Gradient */}
    <radialGradient id={`${idPrefix}_black_sphere`} cx="35%" cy="28%" r="70%">
      <stop offset="0%" stopColor="#71717A" />
      <stop offset="22%" stopColor="#3F3F46" />
      <stop offset="60%" stopColor="#18181B" />
      <stop offset="92%" stopColor="#09090B" />
      <stop offset="100%" stopColor="#52525B" />
    </radialGradient>

    {/* Vibrant 3D Blue Clay Gradient */}
    <linearGradient id={`${idPrefix}_blue_clay`} x1="15%" y1="0%" x2="85%" y2="100%">
      <stop offset="0%" stopColor="#60A5FA" />
      <stop offset="45%" stopColor="#3B82F6" />
      <stop offset="85%" stopColor="#1D4ED8" />
      <stop offset="100%" stopColor="#1E3A8A" />
    </linearGradient>

    {/* Radial 3D Blue Sphere / Knob Gradient */}
    <radialGradient id={`${idPrefix}_blue_orb`} cx="35%" cy="30%" r="68%">
      <stop offset="0%" stopColor="#93C5FD" />
      <stop offset="38%" stopColor="#3B82F6" />
      <stop offset="82%" stopColor="#1D4ED8" />
      <stop offset="100%" stopColor="#1E3A8A" />
    </radialGradient>

    {/* Soft 3D White / Silver Clay Gradient */}
    <linearGradient id={`${idPrefix}_white_clay`} x1="20%" y1="0%" x2="80%" y2="100%">
      <stop offset="0%" stopColor="#FFFFFF" />
      <stop offset="55%" stopColor="#E4E4E7" />
      <stop offset="88%" stopColor="#A1A1AA" />
      <stop offset="100%" stopColor="#71717A" />
    </linearGradient>

    {/* Radial 3D White Puff Gradient for Cloud */}
    <radialGradient id={`${idPrefix}_cloud_puff`} cx="38%" cy="28%" r="70%">
      <stop offset="0%" stopColor="#FFFFFF" />
      <stop offset="50%" stopColor="#E4E4E7" />
      <stop offset="85%" stopColor="#A1A1AA" />
      <stop offset="100%" stopColor="#71717A" />
    </radialGradient>
  </defs>
);

// 1. 3D Cyber Bomb (Glossy black sphere bomb, braided white fuse rope, glowing 3D blue spark)
export const Bomb3DIcon: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 104 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 160 160"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`transition-transform ${className}`}
  >
    <Clay3DDefs idPrefix="bomb3d" />
    <g filter="url(#bomb3d_3d_shadow)">
      {/* Braided White Fuse Cord */}
      <path
        d="M84 44 C88 26, 108 24, 122 34"
        stroke="url(#bomb3d_white_clay)"
        strokeWidth="10"
        strokeLinecap="round"
      />
      {/* Rope texture ribs */}
      <path
        d="M88 38 L94 34 M96 33 L102 31 M105 31 L111 32 M114 33 L119 36"
        stroke="#71717A"
        strokeWidth="2.2"
        strokeLinecap="round"
      />

      {/* 3D Blue Spark Burst at Fuse Tip */}
      <g transform="translate(125, 36)">
        <path
          d="M0 -15 L4 -5 L14 -9 L7 0 L15 7 L4 6 L2 16 L-3 6 L-13 10 L-6 1 L-14 -6 L-4 -5 Z"
          fill="url(#bomb3d_blue_clay)"
        />
        <circle cx="0" cy="0" r="5" fill="#93C5FD" />
        <circle cx="0" cy="0" r="2.2" fill="#FFFFFF" />
      </g>

      {/* Bomb Neck / Nozzle Collar */}
      <ellipse cx="80" cy="48" rx="15" ry="6" fill="#27272A" stroke="#52525B" strokeWidth="1.5" />
      <path
        d="M65 48 V58 C65 62, 95 62, 95 58 V48"
        fill="url(#bomb3d_dark_matte)"
      />
      <ellipse cx="80" cy="48" rx="11" ry="3.8" fill="#09090B" />

      {/* Main 3D Glossy Black Bomb Sphere */}
      <circle cx="76" cy="94" r="42" fill="url(#bomb3d_black_sphere)" />

      {/* Specular 3D Soft Highlights & Bottom Rim Light */}
      <ellipse
        cx="60"
        cy="76"
        rx="14"
        ry="9"
        transform="rotate(-28 60 76)"
        fill="#FFFFFF"
        fillOpacity="0.26"
      />
      <path
        d="M46 122 C60 135, 92 135, 106 120"
        stroke="#E4E4E7"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeOpacity="0.65"
      />
    </g>
  </svg>
);

// 2. 3D Microchip / Processor Node (Dark rounded square chip with blue circuit arms & white 3D sphere nodes)
export const ChipCircuit3DIcon: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 104 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 160 160"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`transition-transform ${className}`}
  >
    <Clay3DDefs idPrefix="chip3d" />
    <g filter="url(#chip3d_3d_shadow)">
      {/* Blue 3D Circuit Arms */}
      {/* Top Left Arm */}
      <path d="M70 56 V36 H58 V26" stroke="url(#chip3d_blue_clay)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      {/* Top Right Arm */}
      <path d="M90 56 V26" stroke="url(#chip3d_blue_clay)" strokeWidth="8" strokeLinecap="round" />
      {/* Left Arm */}
      <path d="M54 78 H38 V66" stroke="url(#chip3d_blue_clay)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      {/* Right Arm */}
      <path d="M106 76 H122 V86 H134" stroke="url(#chip3d_blue_clay)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      {/* Bottom Left Arm */}
      <path d="M66 104 V116 H48 V134" stroke="url(#chip3d_blue_clay)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
      {/* Bottom Right Arm */}
      <path d="M92 104 V122 H106 V136" stroke="url(#chip3d_blue_clay)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />

      {/* White 3D Sphere Terminals */}
      <circle cx="58" cy="24" r="7.5" fill="url(#chip3d_white_clay)" />
      <circle cx="90" cy="24" r="7.5" fill="url(#chip3d_white_clay)" />
      <circle cx="30" cy="66" r="7.5" fill="url(#chip3d_white_clay)" />
      <circle cx="136" cy="86" r="7.5" fill="url(#chip3d_white_clay)" />
      <circle cx="48" cy="136" r="7.5" fill="url(#chip3d_white_clay)" />
      <circle cx="106" cy="136" r="7.5" fill="url(#chip3d_white_clay)" />

      {/* Central 3D Dark Processor Housing */}
      <rect
        x="50"
        y="52"
        width="60"
        height="58"
        rx="14"
        fill="url(#chip3d_dark_matte)"
        stroke="#52525B"
        strokeWidth="2"
      />
      {/* Inner Raised Die */}
      <rect
        x="58"
        y="60"
        width="44"
        height="42"
        rx="9"
        fill="#27272A"
        stroke="#3F3F46"
        strokeWidth="2"
      />
      {/* Top bevel highlight */}
      <path d="M62 63 H98" stroke="#71717A" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.6" />
    </g>
  </svg>
);

// 3. 3D Biometric Fingerprint Tile (Dark 3D rounded square with 4 blue side spheres & glowing white fingerprint)
export const Fingerprint3DIcon: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 104 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 160 160"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`transition-transform ${className}`}
  >
    <Clay3DDefs idPrefix="fp3d" />
    <g filter="url(#fp3d_3d_shadow)">
      {/* 4 Protruding 3D Blue Spheres (Top, Right, Bottom, Left) */}
      <circle cx="80" cy="26" r="11" fill="url(#fp3d_blue_orb)" />
      <circle cx="80" cy="134" r="11" fill="url(#fp3d_blue_orb)" />
      <circle cx="26" cy="80" r="11" fill="url(#fp3d_blue_orb)" />
      <circle cx="134" cy="80" r="11" fill="url(#fp3d_blue_orb)" />

      {/* Outer 3D Dark Rounded Square Body */}
      <rect
        x="32"
        y="32"
        width="96"
        height="96"
        rx="24"
        fill="url(#fp3d_dark_matte)"
        stroke="#71717A"
        strokeWidth="2.5"
      />
      {/* Recessed Inner Face */}
      <rect
        x="40"
        y="40"
        width="80"
        height="80"
        rx="18"
        fill="#27272A"
        stroke="#3F3F46"
        strokeWidth="1.5"
      />

      {/* Glowing White 3D Fingerprint Ridges */}
      <path
        d="M58 62 C68 50, 92 50, 102 62"
        stroke="#FFFFFF"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M52 78 C52 56, 108 56, 108 78 C108 90, 105 98, 100 106"
        stroke="#FFFFFF"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M53 90 C54 96, 57 102, 61 107"
        stroke="#FFFFFF"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M62 80 C62 64, 98 64, 98 80 C98 92, 95 100, 90 108"
        stroke="#FFFFFF"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M63 92 C65 98, 68 104, 72 108"
        stroke="#FFFFFF"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M72 80 C72 72, 88 72, 88 80 C88 90, 86 100, 82 108"
        stroke="#FFFFFF"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M80 80 V98"
        stroke="#FFFFFF"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
    </g>
  </svg>
);

// 4. 3D Password Badge (Blue-rimmed dark pill housing 4 3D white asterisks)
export const PasswordPill3DIcon: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 104 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 160 160"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`transition-transform ${className}`}
  >
    <Clay3DDefs idPrefix="pass3d" />
    <g filter="url(#pass3d_3d_shadow)">
      {/* 3D Blue Outer Bezel Pill */}
      <rect
        x="14"
        y="52"
        width="132"
        height="56"
        rx="16"
        fill="url(#pass3d_blue_clay)"
      />
      {/* 3D Dark Inner Recessed Plate */}
      <rect
        x="20"
        y="58"
        width="120"
        height="44"
        rx="11"
        fill="url(#pass3d_dark_matte)"
        stroke="#52525B"
        strokeWidth="1.5"
      />

      {/* 4 White 3D Asterisk Stars (* * * *) */}
      {[38, 66, 94, 122].map((cx, idx) => (
        <g key={idx} transform={`translate(${cx}, 80)`}>
          <line x1="0" y1="-10" x2="0" y2="10" stroke="url(#pass3d_white_clay)" strokeWidth="4.2" strokeLinecap="round" />
          <line x1="-8.5" y1="-5" x2="8.5" y2="5" stroke="url(#pass3d_white_clay)" strokeWidth="4.2" strokeLinecap="round" />
          <line x1="-8.5" y1="5" x2="8.5" y2="-5" stroke="url(#pass3d_white_clay)" strokeWidth="4.2" strokeLinecap="round" />
          <circle cx="0" cy="0" r="2.5" fill="#FFFFFF" />
        </g>
      ))}
    </g>
  </svg>
);

// 5. 3D Cloud Shield (Plump 3D white clay cloud with dark shield & glowing blue checkmark)
export const CloudShield3DIcon: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 104 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 160 160"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`transition-transform ${className}`}
  >
    <Clay3DDefs idPrefix="cloud3d" />
    <g filter="url(#cloud3d_3d_shadow)">
      {/* Back Cloud Base */}
      <path
        d="M28 114 C16 114, 10 104, 14 94 C17 86, 24 82, 30 82 C34 64, 52 50, 74 44 C94 38, 114 50, 122 68 C132 70, 140 78, 142 88 C148 92, 150 102, 144 110 C140 114, 132 114, 124 114 H28 Z"
        fill="url(#cloud3d_white_clay)"
      />
      {/* Sculpted 3D Puffs for Clay Volume */}
      <circle cx="50" cy="86" r="22" fill="url(#cloud3d_cloud_puff)" />
      <circle cx="80" cy="68" r="28" fill="url(#cloud3d_cloud_puff)" />
      <circle cx="110" cy="84" r="22" fill="url(#cloud3d_cloud_puff)" />
      <ellipse cx="80" cy="102" rx="56" ry="14" fill="url(#cloud3d_white_clay)" />

      {/* Embedded 3D Dark Shield in Center */}
      <path
        d="M80 56 L58 64 V82 C58 98, 68 108, 80 113 C92 108, 102 98, 102 82 V64 L80 56 Z"
        fill="url(#cloud3d_dark_matte)"
        stroke="#71717A"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* Glowing 3D Blue Checkmark */}
      <path
        d="M70 84 L77 91 L92 75"
        stroke="url(#cloud3d_blue_clay)"
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  </svg>
);

// 6. 3D Cyber Globe Shield (Blue gridded 3D sphere with dark shield & white checkmark)
export const GlobeShield3DIcon: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 104 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 160 160"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`transition-transform ${className}`}
  >
    <Clay3DDefs idPrefix="globe3d" />
    <g filter="url(#globe3d_3d_shadow)">
      {/* Base Dark Sphere Core */}
      <circle cx="80" cy="80" r="52" fill="url(#globe3d_black_sphere)" />

      {/* 3D Blue Latitude & Longitude Grid Bands */}
      <circle
        cx="80"
        cy="80"
        r="50"
        stroke="url(#globe3d_blue_clay)"
        strokeWidth="5.5"
      />
      <ellipse
        cx="80"
        cy="80"
        rx="28"
        ry="50"
        stroke="url(#globe3d_blue_clay)"
        strokeWidth="5"
      />
      <ellipse
        cx="80"
        cy="80"
        rx="50"
        ry="24"
        stroke="url(#globe3d_blue_clay)"
        strokeWidth="5"
      />
      <line x1="80" y1="30" x2="80" y2="130" stroke="url(#globe3d_blue_clay)" strokeWidth="4.5" />
      <line x1="30" y1="80" x2="130" y2="80" stroke="url(#globe3d_blue_clay)" strokeWidth="4.5" />

      {/* Center 3D Dark Shield */}
      <path
        d="M80 50 L54 60 V82 C54 100, 66 112, 80 118 C94 112, 106 100, 106 82 V60 L80 50 Z"
        fill="url(#globe3d_dark_matte)"
        stroke="#60A5FA"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      {/* Crisp White 3D Checkmark */}
      <path
        d="M68 83 L76 91 L93 73"
        stroke="url(#globe3d_white_clay)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  </svg>
);

// 7. 3D Cyber Bug / Beetle (Blue 3D head & 6 legs with glossy split black carapace shell)
export const CyberBug3DIcon: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 104 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 160 160"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`transition-transform ${className}`}
  >
    <Clay3DDefs idPrefix="bug3d" />
    <g filter="url(#bug3d_3d_shadow)">
      {/* 6 3D Blue Articulated Legs */}
      {/* Front Pair */}
      <path d="M56 68 L38 56 L34 44" stroke="url(#bug3d_blue_clay)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M104 68 L122 56 L126 44" stroke="url(#bug3d_blue_clay)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      {/* Middle Pair */}
      <path d="M48 88 L28 84 L22 76" stroke="url(#bug3d_blue_clay)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M112 88 L132 84 L138 76" stroke="url(#bug3d_blue_clay)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      {/* Back Pair */}
      <path d="M54 112 L36 124 L30 136" stroke="url(#bug3d_blue_clay)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M106 112 L124 124 L130 136" stroke="url(#bug3d_blue_clay)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />

      {/* 3D Blue Dome Head */}
      <circle cx="80" cy="48" r="20" fill="url(#bug3d_blue_orb)" />
      {/* Head specular shine */}
      <ellipse cx="73" cy="40" rx="6" ry="3.5" transform="rotate(-20 73 40)" fill="#BFDBFE" fillOpacity="0.7" />

      {/* Glossy 3D Black Beetle Body / Shell */}
      <ellipse cx="80" cy="92" rx="34" ry="40" fill="url(#bug3d_black_sphere)" stroke="#52525B" strokeWidth="1.5" />

      {/* Center Wing Seam Split */}
      <line x1="80" y1="54" x2="80" y2="131" stroke="#09090B" strokeWidth="3.5" />
      <line x1="81.5" y1="56" x2="81.5" y2="128" stroke="#52525B" strokeWidth="1" strokeOpacity="0.6" />

      {/* Left Wing Gloss Highlight */}
      <ellipse
        cx="64"
        cy="78"
        rx="10"
        ry="18"
        transform="rotate(-12 64 78)"
        fill="#FFFFFF"
        fillOpacity="0.18"
      />
    </g>
  </svg>
);

// 8. 3D Server Stack (3 stacked dark server blades with glowing blue LED indicators & white side cables)
export const ServerStack3DIcon: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 104 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 160 160"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`transition-transform ${className}`}
  >
    <Clay3DDefs idPrefix="srv3d" />
    <g filter="url(#srv3d_3d_shadow)">
      {/* Right Side White 3D Loop Cables */}
      <path
        d="M122 52 H134 C140 52, 140 80, 134 80 H122"
        stroke="url(#srv3d_white_clay)"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        d="M122 80 H136 C142 80, 142 108, 136 108 H122"
        stroke="url(#srv3d_white_clay)"
        strokeWidth="7"
        strokeLinecap="round"
      />

      {/* Left Side Connector Pins */}
      <rect x="20" y="76" width="12" height="8" rx="4" fill="url(#srv3d_white_clay)" />

      {/* 3 Stacked Server Blades */}
      {[40, 68, 96].map((y, idx) => (
        <g key={idx}>
          {/* Blue Side Caps */}
          <rect x="28" y={y + 3} width="100" height="20" rx="8" fill="url(#srv3d_blue_clay)" />
          {/* Dark 3D Blade Chassis */}
          <rect
            x="34"
            y={y}
            width="86"
            height="24"
            rx="7"
            fill="url(#srv3d_dark_matte)"
            stroke="#52525B"
            strokeWidth="1.5"
          />
          {/* 3 Glowing 3D Blue LED Dots */}
          <circle cx="50" cy={y + 12} r="4.5" fill="url(#srv3d_blue_orb)" />
          <circle cx="68" cy={y + 12} r="4.5" fill="url(#srv3d_blue_orb)" />
          <circle cx="86" cy={y + 12} r="4.5" fill="url(#srv3d_blue_orb)" />
          {/* Right Slot Port */}
          <rect x="102" y={y + 9} width="10" height="6" rx="3" fill="#60A5FA" />
        </g>
      ))}

      {/* Bottom White Glow Base Strip */}
      <path d="M44 124 H112" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.85" />
    </g>
  </svg>
);

// 9. 3D Phishing Hook (Glossy 3D blue J-hook suspended on a metallic dark wire)
export const PhishingHook3DIcon: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 104 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 160 160"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`transition-transform ${className}`}
  >
    <Clay3DDefs idPrefix="hook3d" />
    <g filter="url(#hook3d_3d_shadow)">
      {/* Top Fishing Line / Wire Strand */}
      <line x1="98" y1="16" x2="96" y2="48" stroke="#A1A1AA" strokeWidth="3" strokeLinecap="round" />
      <line x1="102" y1="20" x2="99" y2="48" stroke="#71717A" strokeWidth="2" strokeLinecap="round" />

      {/* Hook Eye Ring (3D Blue & Dark Knot) */}
      <circle
        cx="96"
        cy="54"
        r="10"
        stroke="url(#hook3d_blue_clay)"
        strokeWidth="7"
      />
      <path
        d="M90 46 C94 42, 102 44, 102 52"
        stroke="#27272A"
        strokeWidth="4.5"
        strokeLinecap="round"
      />

      {/* Main 3D Glossy Blue J-Hook Shaft & Curve */}
      <path
        d="M96 64 V110 C96 130, 82 140, 66 140 C50 140, 40 128, 42 112 C43 105, 48 100, 54 96"
        stroke="url(#hook3d_blue_clay)"
        strokeWidth="13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Inner Barb Point */}
      <path
        d="M44 108 L56 95 L55 109"
        fill="#60A5FA"
      />
      {/* 3D Specular Highlight along Hook Shaft */}
      <path
        d="M94 68 V108 C94 124, 82 134, 66 134"
        stroke="#93C5FD"
        strokeWidth="3"
        strokeLinecap="round"
        strokeOpacity="0.75"
      />
    </g>
  </svg>
);

// 10. 3D Secure Browser / App Window (Dark 3D body, blue top header bar with 3 white dots, white shield with blue checkmark)
export const BrowserShield3DIcon: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 104 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 160 160"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`transition-transform ${className}`}
  >
    <Clay3DDefs idPrefix="win3d" />
    <g filter="url(#win3d_3d_shadow)">
      {/* Main Lower Dark 3D Window Body */}
      <rect
        x="24"
        y="32"
        width="112"
        height="96"
        rx="22"
        fill="url(#win3d_dark_matte)"
        stroke="#52525B"
        strokeWidth="2"
      />

      {/* Top 3D Blue Header Cap */}
      <path
        d="M24 54 C24 40, 34 32, 46 32 H114 C126 32, 136 40, 136 54 V62 H24 V54 Z"
        fill="url(#win3d_blue_clay)"
      />
      {/* Top Header Specular Shine */}
      <path d="M42 37 H118" stroke="#93C5FD" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.65" />

      {/* 3 White 3D Window Control Dots */}
      <circle cx="42" cy="48" r="4.5" fill="url(#win3d_white_clay)" />
      <circle cx="55" cy="48" r="4.5" fill="url(#win3d_white_clay)" />
      <circle cx="68" cy="48" r="4.5" fill="url(#win3d_white_clay)" />

      {/* 3D White Shield Centered on Dark Body */}
      <path
        d="M80 70 L60 77 V93 C60 107, 69 115, 80 120 C91 115, 100 107, 100 93 V77 L80 70 Z"
        fill="url(#win3d_white_clay)"
      />

      {/* 3D Blue Checkmark Inside Shield */}
      <path
        d="M71 94 L77 100 L90 86"
        stroke="url(#win3d_blue_clay)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
      colors: ['#3B82F6', '#60A5FA', '#F8FAFC', '#00A191', '#F05A28'],
    });
  };

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {/* 1. TOP-LEFT: 3D Cyber Bomb */}
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
        onClick={() => handleObjectClick('cyber-bomb', 0.14, 0.18)}
        title="Threat Payload"
      >
        <Bomb3DIcon size={102} />
      </motion.div>

      {/* 2. TOP-RIGHT: 3D Microchip Node */}
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
        onClick={() => handleObjectClick('chip-node', 0.86, 0.18)}
        title="Processor Core"
      >
        <ChipCircuit3DIcon size={102} />
      </motion.div>

      {/* 3. UPPER-MID-LEFT: 3D Biometric Fingerprint */}
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
        onClick={() => handleObjectClick('fingerprint-3d', 0.18, 0.32)}
        title="Biometric Scanner"
      >
        <Fingerprint3DIcon size={96} />
      </motion.div>

      {/* 4. UPPER-MID-RIGHT: 3D Cloud Shield */}
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
        onClick={() => handleObjectClick('cloud-shield-3d', 0.82, 0.32)}
        title="Cloud Security"
      >
        <CloudShield3DIcon size={100} />
      </motion.div>

      {/* 5. MID-LEFT: 3D Password Badge */}
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
        onClick={() => handleObjectClick('password-3d', 0.1, 0.52)}
        title="Password Security"
      >
        <PasswordPill3DIcon size={100} />
      </motion.div>

      {/* 6. MID-RIGHT: 3D Phishing Hook */}
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
        onClick={() => handleObjectClick('phishing-hook-3d', 0.9, 0.52)}
        title="Phishing Defense"
      >
        <PhishingHook3DIcon size={98} />
      </motion.div>

      {/* 7. LOWER-MID-LEFT: 3D Cyber Bug */}
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
        onClick={() => handleObjectClick('cyber-bug-3d', 0.18, 0.72)}
        title="Malware & Bug Detection"
      >
        <CyberBug3DIcon size={96} />
      </motion.div>

      {/* 8. LOWER-MID-RIGHT: 3D Server Stack */}
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
        onClick={() => handleObjectClick('server-stack-3d', 0.82, 0.72)}
        title="Data Infrastructure"
      >
        <ServerStack3DIcon size={98} />
      </motion.div>

      {/* 9. BOTTOM-LEFT: 3D Cyber Globe Shield */}
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
        onClick={() => handleObjectClick('globe-shield-3d', 0.14, 0.84)}
        title="Global Network Defense"
      >
        <GlobeShield3DIcon size={102} />
      </motion.div>

      {/* 10. BOTTOM-RIGHT: 3D Secure Browser Shield */}
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
        onClick={() => handleObjectClick('browser-shield-3d', 0.86, 0.84)}
        title="Application Security"
      >
        <BrowserShield3DIcon size={102} />
      </motion.div>

      {/* Ambient Floating 3D Blue/White Nodes */}
      <motion.div
        className="absolute top-1/3 left-1/4 w-3.5 h-3.5 rounded-full bg-gradient-to-br from-blue-300 via-blue-500 to-blue-800 shadow-lg shadow-blue-500/40 opacity-75"
        animate={{ y: [0, -24, 0], opacity: [0.4, 0.85, 0.4] }}
        transition={{ repeat: Infinity, duration: 4.2, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute top-1/4 right-1/3 w-3 h-3 rounded-full bg-gradient-to-br from-white via-zinc-200 to-zinc-500 shadow-lg shadow-white/30 opacity-70"
        animate={{ y: [0, -20, 0], opacity: [0.35, 0.8, 0.35] }}
        transition={{ repeat: Infinity, duration: 5.1, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-1/3 left-1/3 w-3.5 h-3.5 rounded-full bg-gradient-to-br from-blue-300 via-blue-500 to-blue-900 shadow-lg shadow-blue-500/40 opacity-65"
        animate={{ y: [0, 18, 0], opacity: [0.35, 0.75, 0.35] }}
        transition={{ repeat: Infinity, duration: 4.8, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-1/4 right-1/4 w-3 h-3 rounded-full bg-gradient-to-br from-white via-zinc-200 to-zinc-500 shadow-lg shadow-white/30 opacity-65"
        animate={{ y: [0, -18, 0], opacity: [0.3, 0.7, 0.3] }}
        transition={{ repeat: Infinity, duration: 3.9, ease: 'easeInOut' }}
      />
    </div>
  );
};
