require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static('public'));
app.use(express.json());

// Temp upload storage
const upload = multer({ dest: 'uploads/' });

// Google Drive auth via OAuth2 refresh token
function getDriveClient() {
  const auth = new google.auth.OAuth2(
    process.env.OAUTH_CLIENT_ID,
    process.env.OAUTH_CLIENT_SECRET,
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google.drive({ version: 'v3', auth });
}

// Upload file to Google Drive
async function uploadToDrive(filePath, fileName, mimeType) {
  const drive = getDriveClient();
  const fileMetadata = {
    name: fileName,
    parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
  };
  const media = {
    mimeType,
    body: fs.createReadStream(filePath),
  };
  const response = await drive.files.create({
    requestBody: fileMetadata,
    media,
    fields: 'id, webViewLink',
  });
  // Make file viewable by anyone with the link
  await drive.permissions.create({
    fileId: response.data.id,
    requestBody: { role: 'reader', type: 'anyone' },
  });
  return response.data;
}

// Create or find contact in GHL and add note
async function sendToGHL(name, email, driveLink, textFeedback) {
  const headers = {
    Authorization: `Bearer ${process.env.GHL_API_KEY}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };

  // Search for existing contact
  let contactId;
  try {
    const search = await axios.get(
      `https://services.leadconnectorhq.com/contacts/search/duplicate?locationId=${process.env.GHL_LOCATION_ID}&email=${encodeURIComponent(email)}`,
      { headers }
    );
    contactId = search.data?.contact?.id;
  } catch (_) {}

  // Create contact if not found
  if (!contactId) {
    const nameParts = name.trim().split(' ');
    const create = await axios.post(
      'https://services.leadconnectorhq.com/contacts/',
      {
        locationId: process.env.GHL_LOCATION_ID,
        firstName: nameParts[0],
        lastName: nameParts.slice(1).join(' ') || '',
        email,
        tags: ['breathwork-testimonial'],
      },
      { headers }
    );
    contactId = create.data?.contact?.id;
  }

  // Add note with Drive link
  const noteBody = [
    `🎙️ New Breath of Oneness Testimonial`,
    `Name: ${name}`,
    `Email: ${email}`,
    textFeedback ? `Feedback: ${textFeedback}` : '',
    `Recording: ${driveLink}`,
  ]
    .filter(Boolean)
    .join('\n');

  await axios.post(
    'https://services.leadconnectorhq.com/contacts/' + contactId + '/notes',
    { body: noteBody, userId: contactId },
    { headers }
  );

  return contactId;
}

// Upload endpoint
app.post('/upload', upload.single('recording'), async (req, res) => {
  const { name, email, textFeedback, recordingType } = req.body;
  const file = req.file;

  if (!file || !name || !email) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const ext = recordingType === 'audio' ? 'webm' : 'webm';
  const fileName = `Testimonial_${name.replace(/\s+/g, '_')}_${timestamp}.${ext}`;
  const mimeType = 'video/webm';

  try {
    // Upload to Google Drive
    const driveFile = await uploadToDrive(file.path, fileName, mimeType);

    // Send to GHL
    await sendToGHL(name, email, driveFile.webViewLink, textFeedback);

    // Cleanup temp file
    fs.unlinkSync(file.path);

    res.json({ success: true, driveLink: driveFile.webViewLink });
  } catch (err) {
    console.error('Upload error:', err.response?.data || err.message);
    // Cleanup on error
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    res.status(500).json({ error: 'Upload failed. Please try again.' });
  }
});

// Ensure uploads dir exists
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

app.listen(PORT, () => {
  console.log(`Breath of Oneness Testimonials running at http://localhost:${PORT}`);
});
