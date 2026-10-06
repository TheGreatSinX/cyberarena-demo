import { initializeApp } from 'firebase/app';
import { getAuth, sendPasswordResetEmail } from 'firebase/auth';
import * as readline from 'readline';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function run() {
  console.log('\n=======================================');
  console.log('   CYBER|ARENA: SEND PASSWORD RESET    ');
  console.log('=======================================\n');

  try {
    const email = await question('Enter user/admin email (defaults to webdev.cybernetics@gmail.com): ');
    const targetEmail = email.trim() || 'webdev.cybernetics@gmail.com';

    console.log(`\nDispatching password reset email to: ${targetEmail}...`);
    await sendPasswordResetEmail(auth, targetEmail);
    console.log('\n[SUCCESS] Password reset email successfully dispatched!');
    console.log(`Please check the inbox and spam folder for ${targetEmail} to choose a new password.\n`);
  } catch (err: any) {
    console.error('\n[ERROR] Failed to send password reset:', err?.message || err);
  } finally {
    rl.close();
    process.exit(0);
  }
}

run();
