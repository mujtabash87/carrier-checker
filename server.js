// server.js
const express = require('express');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;
const cors = require('cors');
const path = require('path');

app.use(cors());
app.use(express.json());

const carriersPath = path.join(__dirname, 'carriers.json');
const responsesPath = path.join(__dirname, 'responses.json');

// Load carriers (fail fast with clear logs if missing/invalid)
let carriers = [];
try {
  carriers = JSON.parse(fs.readFileSync(carriersPath, 'utf8'));
  if (!Array.isArray(carriers)) throw new Error('carriers.json must be an array');
} catch (e) {
  console.error('Failed to load carriers.json:', e.message);
  process.exit(1);
}

// Ensure responses.json exists
try {
  if (!fs.existsSync(responsesPath)) {
    fs.writeFileSync(responsesPath, JSON.stringify([], null, 2));
  }
} catch (e) {
  console.error('Failed to init responses.json:', e.message);
}

// Helpers
const toDigits = v => {
  if (v === undefined || v === null) return '';
  return String(v).trim();
};

// --- Health & root ---

app.get('/health', (_req, res) => {
  res.status(200).send('ok');
});

app.get('/', (_req, res) => {
  res.send('carrier-checker: up');
});

// --- Routes ---

// Route to check carrier registration
app.post('/check-carrier', (req, res) => {
  const mc_number = toDigits(req.body.mc_number);
  const dot_number = toDigits(req.body.dot_number);

  if (!mc_number && !dot_number) {
    return res
      .status(400)
      .json({ status: 'bad_request', message: 'Provide mc_number and/or dot_number.' });
  }

  const found = carriers.find(c =>
    (!mc_number || c.mc_number === mc_number) &&
    (!dot_number || c.dot_number === dot_number)
  );

  if (!found) {
    return res.json({ status: 'not_found', message: 'Carrier is not registered.' });
  }

  if ((found.status || '').toLowerCase() !== 'active') {
    return res.json({
      status: 'inactive',
      message: 'Carrier found but is not active.',
      carrier: found
    });
  }

  return res.json({ status: 'found', carrier: found });
});

// Flexible list query with filters
// Example: /carriers?status=Active&city=Chicago&zip=60601
app.get('/carriers', (req, res) => {
  const q = {
    status: (req.query.status || '').trim().toLowerCase(),
    city:   (req.query.city || '').trim().toLowerCase(),
    zip:    (req.query.zip || '').trim(),
    name:   (req.query.name || '').trim().toLowerCase(),
    mc:     toDigits(req.query.mc_number),
    dot:    toDigits(req.query.dot_number)
  };

  let results = carriers.filter(c => {
    if (q.status && (c.status || '').toLowerCase() !== q.status) return false;
    if (q.city && (c.city || '').toLowerCase() !== q.city) return false;
    if (q.zip && (c.zip || '') !== q.zip) return false;
    if (q.name && !(c.carrier_name || '').toLowerCase().includes(q.name)) return false;
    if (q.mc && c.mc_number !== q.mc) return false;
    if (q.dot && c.dot_number !== q.dot) return false;
    return true;
  });

  const limit = parseInt(req.query.limit, 10);
  const max = Number.isFinite(limit) ? limit : undefined;
  if (max) results = results.slice(0, max);

  res.json({ count: results.length, results });
});

// Get single carrier by MC or DOT
app.get('/carrier/:id', (req, res) => {
  const id = toDigits(req.params.id);
  const found = carriers.find(c => c.mc_number === id || c.dot_number === id);
  if (!found) return res.status(404).json({ message: 'Carrier not found.' });
  res.json(found);
});

app.get('/carrier/dot/:dot', (req, res) => {
  const dot = toDigits(req.params.dot);
  const found = carriers.find(c => c.dot_number === dot);
  if (!found) return res.status(404).json({ message: 'Carrier not found.' });
  res.json(found);
});

app.get('/carrier/mc/:mc', (req, res) => {
  const mc = toDigits(req.params.mc);
  const found = carriers.find(c => c.mc_number === mc);
  if (!found) return res.status(404).json({ message: 'Carrier not found.' });
  res.json(found);
});

// Store response data (auto-enrich with carrier metadata)
app.post('/store-response', (req, res) => {
  const { response } = req.body;

  if (!response) {
    return res.status(400).json({ message: 'Missing response data' });
  }

  let carrierMeta = {};
  const carrierMcDigits = toDigits(response.carrier_mc);
  if (carrierMcDigits) {
    const hit = carriers.find(c => c.mc_number === carrierMcDigits);
    if (hit) {
      carrierMeta = {
        carrier_name: hit.carrier_name,
        carrier_status: hit.status || null,
        carrier_city: hit.city || null,
        carrier_zip: hit.zip || null,
        carrier_dot: hit.dot_number || null
      };
      if (!response.carrier_name) response.carrier_name = hit.carrier_name;
    }
  }

  const newEntry = {
    carrier_mc: carrierMcDigits || null,
    carrier_name: response.carrier_name || null,
    phone_number: response.phone_number ? String(response.phone_number).trim() : null,
    dispatcher_name: response.dispatcher_name ? String(response.dispatcher_name).trim() : null,
    timestamp: new Date().toISOString(),
    ...carrierMeta
  };

  let existingData = [];
  try {
    const raw = fs.readFileSync(responsesPath, 'utf8');
    existingData = JSON.parse(raw);
    if (!Array.isArray(existingData)) existingData = [];
  } catch (err) {
    console.error('Could not read existing responses:', err.message);
  }

  existingData.push(newEntry);

  try {
    fs.writeFileSync(responsesPath, JSON.stringify(existingData, null, 2));
    res.json({ message: 'Data stored successfully', entry: newEntry });
  } catch (err) {
    console.error('Error saving data:', err.message);
    res.status(500).json({ message: 'Failed to save response data' });
  }
});

// Read stored responses
app.get('/responses', (req, res) => {
  try {
    const data = fs.readFileSync(responsesPath, 'utf8');
    const parsed = JSON.parse(data);
    res.json(parsed);
  } catch (err) {
    console.error('Error reading responses.json:', err.message);
    res.status(500).json({ message: 'Failed to load data' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
