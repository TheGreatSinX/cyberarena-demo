import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import * as readline from 'readline';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = firebaseConfig.firestoreDatabaseId
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function runBootstrap() {
  console.log('\n=======================================');
  console.log('   CYBER|ARENA: SECURE ADMIN BOOTSTRAP ');
  console.log('=======================================\n');

  try {
    const email = await question('Enter Administrator Email: ');
    const password = await question('Enter Administrator Password (min 6 chars): ');
    const displayName = await question('Enter Display Name: ');

    if (!email.trim() || !password.trim()) {
      console.error('Email and password are required.');
      process.exit(1);
    }

    console.log('\nCreating Firebase Authentication account...');
    const userCred = await createUserWithEmailAndPassword(auth, email.trim(), password.trim());
    const uid = userCred.user.uid;

    console.log('Creating Firestore Administrator Profile...');
    await setDoc(doc(db, 'users', uid), {
      uid,
      email: email.trim(),
      displayName: displayName.trim() || 'Super Administrator',
      role: 'SUPER_ADMIN',
      mfaRequired: true,
      mfaEnrolled: false,
      disabled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    console.log('\n[SUCCESS] Administrator successfully provisioned!');
    console.log(`UID: ${uid}`);
    console.log(`Role: SUPER_ADMIN`);
    console.log('MFA: REQUIRED (Will be prompted on first login in the browser)\n');
    console.log('Note: To disable this script, remove the "create-admin" script from package.json.');
  } catch (err: any) {
    console.error('\n[ERROR] Bootstrap failed:', err?.message || err);
  } finally {
    rl.close();
    process.exit(0);
  }
}

runBootstrap();
