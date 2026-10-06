# QuizArena

A production-ready real-time multiplayer quiz platform built on Firebase, React, TypeScript, and Tailwind CSS. Players participate from their mobile devices using a 6-digit game PIN, receiving real-time questions, submitting answers, and watching score changes and leaderboard rankings unfold. Administrators manage quiz catalogs, question time limits, speed scoring, and live arena sessions protected by mandatory TOTP multi-factor authentication (MFA).

---

## 1. Architecture Overview

QuizArena adheres strictly to the **Non-Authoritative Frontend Principle**:
- The browser is **never trusted** for scores, correct answers, game progression, timer expirations, or administrator privileges.
- Authoritative game state is maintained across Firestore documents with immutable question snapshots (`games/{gameId}/questions`) and isolated private evaluation records (`games/{gameId}/privateQuestions`).
- Real-time synchronization is powered by Firestore snapshot listeners (`onSnapshot`), allowing responsive multi-user experiences without unnecessary polling.
- Security and access control are enforced via Attribute-Based Access Control (ABAC) in `firestore.rules` and Cloud Functions.

```text
Player / Admin Browser
        │
        ▼
 Firebase Authentication (Email/Password + Google + TOTP MFA)
        │
        ├──────────────────────┬──────────────────────┐
        ▼                      ▼                      ▼
  Firestore Rules       Cloud Functions       Firebase Storage
  (Immutable Snapshot)  (Scoring Engine)      (Media Assets)
        │                      │
        └──────────────────────┼──────────────────────┘
                               ▼
                    Authoritative Game State
```

---

## 2. Firebase Services Used

1. **Firebase Authentication**: Administrator authentication with Email/Password and Google Sign-In, coupled with TOTP Authenticator application multi-factor authentication (Google Authenticator, Microsoft Authenticator, 1Password, Authy).
2. **Cloud Firestore**: Real-time database synchronizing live multiplayer lobbies, countdowns, question progression, player answer submissions, and audit trails.
3. **Cloud Functions**: Authoritative backend routines (`createGame`, `joinGame`, `submitAnswer`, `advanceGameState`) ensuring answer secrets never leak to the client.
4. **Firebase Cloud Storage**: Media storage for quiz covers and question illustration assets with MIME-type and size guards in `storage.rules`.
5. **Firebase App Check**: Client integrity layer defending against abuse and unauthorized scrapers.
6. **Firebase Emulator Suite**: Local sandbox supporting offline development and automated testing for Auth, Firestore, Functions, and Storage.

---

## 3. Project Structure

```text
├── firebase-applet-config.json    # Live Firebase project connection credentials
├── firebase-blueprint.json        # Formal data model intermediate representation
├── firebase.json                  # Firebase configuration & emulator ports
├── firestore.rules                # Hardened Firestore security rules (ABAC)
├── firestore.indexes.json         # Composite indexes for queries
├── storage.rules                  # Firebase Storage security rules
├── security_spec.md               # Threat modeling & Dirty Dozen attack payloads
├── scripts/
│   └── create-admin.ts            # Secure administrator CLI bootstrap
├── functions/                     # Cloud Functions backend package
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       └── index.ts               # Authoritative game & scoring engine
├── src/
│   ├── types/
│   │   └── index.ts               # Domain TypeScript interfaces
│   ├── lib/
│   │   ├── firebase/
│   │   │   ├── config.ts          # Firebase SDK initialization with databaseId
│   │   │   ├── errors.ts          # Structured Firestore error formatting
│   │   │   └── testConnection.ts  # Startup connection validation
│   │   ├── auth/
│   │   │   └── authContext.tsx    # Auth state, TOTP MFA challenge & enrollment
│   │   ├── game/
│   │   │   └── gameEngine.ts      # Authoritative session, scoring & state machine
│   │   └── seed/
│   │       └── seedData.ts        # 10 original multi-discipline quiz questions
│   ├── components/
│   │   └── Navbar.tsx             # Responsive header with status and role badges
│   └── features/
│       ├── landing/
│       │   └── LandingView.tsx    # PIN Join screen & Host portal entry
│       ├── player/
│       │   └── PlayerView.tsx     # Mobile-first player game interface
│       └── admin/
│           ├── AdminDashboard.tsx # Overview metrics & navigation
│           ├── AdminLoginMfa.tsx  # Admin login & mandatory TOTP MFA setup
│           ├── AdminHostView.tsx  # Host live control room & response telemetry
│           ├── QuizManager.tsx    # Quiz & question CRUD with reordering
│           ├── QuizPreview.tsx    # Interactive sandbox preview simulator
│           ├── ResultsView.tsx    # Historical performance reports & CSV export
│           ├── AdminUsersView.tsx # Super Admin RBAC & administrator management
│           └── AuditLogsView.tsx  # Append-only security activity trail
└── README.md
```

---

## 4. Firestore Data Model

```text
users/{uid}
├── uid: string
├── email: string
├── displayName: string
├── role: "ADMIN" | "SUPER_ADMIN"
├── mfaRequired: boolean
├── mfaEnrolled: boolean
├── disabled: boolean
└── createdAt, updatedAt: timestamp

quizzes/{quizId}
├── title: string
├── description: string
├── category: string
├── status: "DRAFT" | "PUBLISHED" | "ARCHIVED"
├── questionCount: number
├── createdBy: uid
└── questions/{questionId}
    ├── questionType: "MULTIPLE_CHOICE" | "TRUE_FALSE"
    ├── questionText: string
    ├── timeLimitSeconds: number (e.g. 20)
    ├── points: number (e.g. 1000)
    ├── sortOrder: number
    ├── options: [{ id, text, sortOrder }]
    ├── correctOptionId: string
    └── explanation: string

games/{gameId}
├── quizId: string
├── quizTitle: string
├── gamePin: string (6-digit numeric)
├── status: "WAITING" | "COUNTDOWN" | "QUESTION_ACTIVE" | "QUESTION_LOCKED" | "ANSWER_RESULTS" | "LEADERBOARD" | "FINISHED"
├── currentQuestionIndex: number
├── currentQuestionId: string
├── totalQuestions: number
├── playerCount: number
├── questionStartedAt: timestamp (ms)
├── questionEndsAt: timestamp (ms)
├── createdBy: uid
├── questions/{questionId}           # Public immutable snapshot (NO correct answers)
├── privateQuestions/{questionId}    # Private authoritative answers (client read blocked)
├── players/{playerId}               # Live participants & scores
├── answers/{answerId}               # Submitted answers with latency & points awarded
└── results/{playerId}               # Final aggregated analytics per player

auditLogs/{auditLogId}               # Immutable security audit trail
```

---

## 5. Security Rules Explanation

The deployed `firestore.rules` implements the **Eight Pillars of Hardened Firestore Security**:
1. **Default Deny Catch-All**: Blocks all unmatched collections.
2. **Answer Confidentiality**: The `games/{gameId}/privateQuestions/{questionId}` subcollection is strictly `allow read, write: if false;`, making client answer inspection impossible.
3. **Path Variable Hardening**: Document IDs are validated via `isValidId()` enforcing `^[a-zA-Z0-9_\-]+$` within 128 characters.
4. **Validation Blueprints**: Dedicated standalone functions (`isValidUser`, `isValidQuiz`, `isValidGame`, etc.) run on both `create` and `update` checking required and allowed keys.
5. **Score Protection**: Players cannot modify other players' records or elevate their own score.
6. **Audit Immutability**: `auditLogs` is strictly append-only; update and delete operations are forbidden.
7. **Bootstrapped Admin**: Runtime administrator `webdev.cybernetics@gmail.com` with `email_verified == true` receives root administrative privileges.

---

## 6. Cloud Functions Explanation

Functions in `functions/src/index.ts`:
- `createGame`: Validates that the requested quiz is published, generates a non-colliding cryptographically secure 6-digit PIN, and copies question snapshots.
- `joinGame`: Atomically checks game state, validates nickname uniqueness within the session, registers the player with a secure `sessionToken`, and increments `playerCount`.
- `submitAnswer`: Executes inside a Firestore transaction. Verifies that the question is active and not expired, retrieves the private answer, computes points with latency multiplier:
  $$\text{points} = \text{basePoints} \times \left(1 - \frac{\text{responseTime}}{\text{totalTime} \times 2}\right)$$
  and records the submission to prevent duplicate answers.
- `advanceGameState`: Controls state transitions and calculates final leaderboard rankings.

---

## 7. MFA Implementation

Multi-Factor Authentication is **mandatory** for all administrator accounts:
1. **Enrollment**: First-time administrators are presented with a TOTP URI and QR Code rendered dynamically via `qrcode`.
2. **Verification**: The admin scans the code using Google Authenticator, Microsoft Authenticator, 1Password, or Authy, and inputs the 6-digit TOTP code.
3. **Validation**: The backend verifies the token using standard RFC 6238 TOTP algorithms with a 1-step clock skew window.
4. **Challenge**: On subsequent logins, after password validation, the user must satisfy the TOTP MFA challenge before accessing any administrative routes or data.
5. **No Bypass**: Administrative UI routes redirect unverified sessions directly to the MFA challenge screen.

---

## 8. Environment Variables

Client and deployment environment variables (`.env.example`):

```bash
# Firebase Client SDK Configuration
NEXT_PUBLIC_FIREBASE_API_KEY="AIzaSy..."
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="csam-2026.firebaseapp.com"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="csam-2026"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="csam-2026.firebasestorage.app"
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="739890292802"
NEXT_PUBLIC_FIREBASE_APP_ID="1:739890292802:web:..."
```

---

## 9. Creating the First Administrator

To bootstrap an administrator account without exposing passwords:

```bash
npm run create-admin
```

The interactive prompt will:
1. Prompt for administrator email, password, and display name.
2. Create the Firebase Authentication account.
3. Provision the Firestore profile with `SUPER_ADMIN` role and `mfaRequired: true`.
4. Prompt the user to enroll in TOTP MFA upon first web console login.

---

## 10. Local Development & Firebase Emulator

Start local development:

```bash
# 1. Install dependencies
npm install

# 2. Start Firebase Emulators (Auth, Firestore, Functions, Storage)
firebase emulators:start

# 3. Start Frontend Development Server
npm run dev
```

Open `http://localhost:3000` to interact with the application.

---

## 11. Deployment Instructions

```bash
# 1. Deploy Firestore Security Rules & Indexes
firebase deploy --only firestore

# 2. Deploy Storage Security Rules
firebase deploy --only storage

# 3. Deploy Cloud Functions
firebase deploy --only functions

# 4. Build and Deploy Hosting
npm run build
firebase deploy --only hosting
```

---

## 12. Testing Instructions

Run syntax and type validation:

```bash
npm run lint
```

Security rules and integration scenarios:
- **PIN Collision**: Attempt to join games with non-existent or inactive PINs.
- **Nickname Collision**: Verify duplicate nickname rejection in the same lobby.
- **Answer Tampering**: Verify that answers submitted after `questionEndsAt` are discarded.
- **Answer Confidentiality**: Verify that client SDK requests to `games/{gameId}/privateQuestions` are blocked with `PERMISSION_DENIED`.

---

## 13. Known Limitations

- Offline answers submitted after internet reconnection are rejected if the question timer expired while offline (by design, to preserve live competitive integrity).
- Free-tier Spark projects have standard Cloud Firestore daily read/write limits.
