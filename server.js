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

// Load carriers (with status, city, zip)
const carriers = JSON.parse(fs.readFileSync(carriersPath));

// Ensure responses.json exists
if (!fs.existsSync(responsesPath)) {
  fs.writeFileSync(responsesPath, JSON.stringify([], null, 2));
}

// Helpers
const norm = v => (typeof v === 'string' ? v.trim() : v);
const isMatch = (carrier, mc, dot) => {
  // If both provided, require both; if one provided, match that one.
  const mcOk = mc ? carrier.mc_number === mc : true;
  const dotOk = dot ? carrier.dot_number === dot : true;
  return mcOk && dotOk;
};

// --- Routes ---

// Route to check carrier registration (now returns status/city/zip)
// Also surfaces "inactive" when carrier exists but status !== 'Active'
app.post('/check-carrier', (req, res) => {
  const mc_number = norm(req.body.mc_number);
  const dot_number = norm(req.body.dot_number);

  if (!mc_number && !dot_number) {
    return res.status(400).json({ status: 'bad_request', message: 'Provide mc_number and/or dot_number.' });
  }

  const found = carriers.find(c => isMatch(c, mc_number, dot_number));

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

// New: flexible list query with filters (status, city, zip, name)
// Example: /carriers?status=Active&city=Chicago&zip=60601
app.get('/carriers', (req, res) => {
  const { status, city, zip, name, mc_number, dot_number, limit } = req.query;

  const q = {
    status: status ? status.trim().toLowerCase() : null,
    city: city ? city.trim().toLowerCase() : null,
    zip: zip ? zip.trim() : null,
    name: name ? name.trim().toLowerCase() : null,
    mc: mc_number ? mc_number.trim() : null,
    dot: dot_number ? dot_number.trim() : null
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

  const max = Number.isFinite(parseInt(limit, 10)) ? parseInt(limit, 10) : undefined;
  if (max) results = results.slice(0, max);

  res.json({ count: results.length, results });
});

// New: get single carrier by MC or DOT
// Example: /carrier/123456  OR /carrier/dot/654321
app.get('/carrier/:id', (req, res) => {
  const id = norm(req.params.id);
  const found = carriers.find(c => c.mc_number === id || c.dot_number === id);
  if (!found) return res.status(404).json({ message: 'Carrier not found.' });
  res.json(found);
});

app.get('/carrier/dot/:dot', (req, res) => {
  const dot = norm(req.params.dot);
  const found = carriers.find(c => c.dot_number === dot);
  if (!found) return res.status(404).json({ message: 'Carrier not found.' });
  res.json(found);
});

app.get('/carrier/mc/:mc', (req, res) => {
  const mc = norm(req.params.mc);
  const found = carriers.find(c => c.mc_number === mc);
  if (!found) return res.status(404).json({ message: 'Carrier not found.' });
  res.json(found);
});

// Store response data (now auto-enriches with carrier status/city/zip when carrier_mc provided)
app.post('/store-response', (req, res) => {
  const { response } = req.body;

  if (!response) {
    return res.status(400).json({ message: 'Missing response data' });
  }

  // Enrichment: if carrier_mc present, attach known carrier metadata
  let carrierMeta = {};
  if (response.carrier_mc) {
    const hit = carriers.find(c => c.mc_number === String(response.carrier_mc).trim());
    if (hit) {
      carrierMeta = {
        carrier_name: hit.carrier_name,
        carrier_status: hit.status || null,
        carrier_city: hit.city || null,
        carrier_zip: hit.zip || null,
        carrier_dot: hit.dot_number || null
      };
      // Default carrier_name to dataset value if not provided by client
      if (!response.carrier_name) response.carrier_name = hit.carrier_name;
    }
  }

  const newEntry = {
    carrier_mc: response.carrier_mc || null,
    carrier_name: response.carrier_name || null,
    phone_number: response.phone_number || null,
    dispatcher_name: response.dispatcher_name || null,
    timestamp: new Date().toISOString(),
    ...carrierMeta
  };

  let existingData = [];
  try {
    const raw = fs.readFileSync(responsesPath);
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
    const data = fs.readFileSync(responsesPath);
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
