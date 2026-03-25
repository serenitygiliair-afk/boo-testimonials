/**
 * One-time setup script: creates the Breathwork Testimonials folder
 * in serenitygiliair@gmail.com Drive and saves the folder ID to .env
 *
 * Run with: node setup-drive.js
 */
require('dotenv').config();
const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const fs = require('fs');
const { exec } = require('child_process');

// ── You need a Desktop OAuth client ID for this script ──
// Go to: https://console.cloud.google.com/apis/credentials?project=breathwork-testimonials-491308&authuser=1
// Create > OAuth client ID > Desktop app > Download JSON > paste values below
const CLIENT_ID = process.env.OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.log('\n❌  Missing OAUTH_CLIENT_ID or OAUTH_CLIENT_SECRET in .env');
  console.log('\nTo get these:');
  console.log('1. Go to https://console.cloud.google.com/apis/credentials?project=breathwork-testimonials-491308&authuser=1');
  console.log('2. Click "+ Create Credentials" > "OAuth client ID"');
  console.log('3. Application type: Desktop app, Name: breathwork-setup');
  console.log('4. Click Create, then Download JSON');
  console.log('5. Add to .env:');
  console.log('   OAUTH_CLIENT_ID=your_client_id');
  console.log('   OAUTH_CLIENT_SECRET=your_client_secret');
  process.exit(1);
}

const REDIRECT_URI = 'http://localhost:3001/oauth2callback';
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent',
  login_hint: 'serenitygiliair@gmail.com',
});

console.log('\n🌐  Opening browser to authorize Google Drive access...\n');
exec(`open "${authUrl}"`);

// Local server to catch the OAuth callback
const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith('/oauth2callback')) return;
  const { code } = url.parse(req.url, true).query;
  res.end('<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>✅ Authorized! You can close this tab.</h2></body></html>');
  server.close();

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Save refresh token to .env
    let env = fs.readFileSync('.env', 'utf8');
    if (tokens.refresh_token) {
      if (env.includes('GOOGLE_REFRESH_TOKEN=')) {
        env = env.replace(/GOOGLE_REFRESH_TOKEN=.*/, `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
      } else {
        env += `\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`;
      }
      fs.writeFileSync('.env', env);
      console.log('✅  Refresh token saved to .env');
    }

    // Use existing folder ID from .env if already set
    let folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    if (!folderId) {
      const folder = await drive.files.create({
        requestBody: { name: 'Breath of Oneness Testimonials', mimeType: 'application/vnd.google-apps.folder' },
        fields: 'id, name',
      });
      folderId = folder.data.id;
      env = env.replace(/GOOGLE_DRIVE_FOLDER_ID=.*/, `GOOGLE_DRIVE_FOLDER_ID=${folderId}`);
      fs.writeFileSync('.env', env);
      console.log(`✅  Folder created (ID: ${folderId})`);
    } else {
      console.log(`✅  Using existing folder ID: ${folderId}`);
    }

    console.log('\n🎉  Setup complete! Run: npm run dev\n');
  } catch (err) {
    console.error('Error:', err.message);
  }
});

server.listen(3001, () => {
  console.log('Waiting for authorization on port 3001...');
});
