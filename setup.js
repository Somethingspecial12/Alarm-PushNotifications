// Run this once to create your .env file with Pushover credentials
// Usage: node setup.js

const fs       = require('fs');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║     Pushover Alarm Project - Setup           ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
  console.log('You need two things from https://pushover.net :');
  console.log('  1. Your USER KEY   (shown on the main dashboard)');
  console.log('  2. An APP TOKEN    (create an app under "Your Applications")');
  console.log('');

  const userKey  = (await ask('Enter your Pushover USER KEY  : ')).trim();
  const appToken = (await ask('Enter your Pushover APP TOKEN : ')).trim();
  const port     = (await ask('Port to run the server on [3000]: ')).trim() || '3000';

  if (!userKey || !appToken) {
    console.log('\nERROR: Both User Key and App Token are required.\n');
    rl.close();
    process.exit(1);
  }

  const envContent =
    `PUSHOVER_USER_KEY=${userKey}\n` +
    `PUSHOVER_APP_TOKEN=${appToken}\n` +
    `PORT=${port}\n`;

  fs.writeFileSync('.env', envContent);

  console.log('');
  console.log('SUCCESS! .env file created.');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Install the Pushover app on your phone');
  console.log('     Android : https://pushover.net/clients/android');
  console.log('     iOS     : https://pushover.net/clients/ios');
  console.log('  2. Log in to the app with your Pushover account');
  console.log('  3. Start the server : npm start');
  console.log(`  4. Open             : http://localhost:${port}`);
  console.log('  5. Press the big red button — your phone will scream!');
  console.log('');

  rl.close();
}

main();
