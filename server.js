// server.js
const express = require('express');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;
const cors = require('cors');
const path = require('path');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const carriersPath = path.join(__dirname, 'carriers.json');
const responsesPath = path.join(__dirname, 'responses.json');

let carriers = [];
try {
  carriers = JSON.parse(fs.readFileSync(carriersPath, 'utf8'));
  if (!Array.isArray(carriers)) throw new Error('carriers.json must be an array');
} catch (e) {
  console.error('Failed to load carriers.json:', e.message);
  process.exit(1);
}

try {
  if (!fs.existsSync(responsesPath)) {
    fs.writeFileSync(responsesPath, JSON.stringify([], null, 2));
  }
} catch (e) {
  console.error('Failed to init responses.json:', e.message);
}

const toStr = v => (v === undefined || v === null ? '' : String(v).trim());

const getFirst = (...vals) => {
  for (const v of vals) {
    const s = toStr(v);
    if (s !== '') return s;
  }
  return '';
};

app.get('/health', (_req, res) => {
  res.status(200).send('ok');
});

app.get('/', (_req, res) => {
  res.send('carrier-checker: up');
});

// Check carrier (accepts mc_number OR dot_number; camelCase and query supported)
app.post('/check-carrier', (req, res) => {
  const mc_number  = getFirst(req.body.mc_number,  req.body.mcNumber,  req.query.mc_number,  req.query.mcNumber);
  const dot_number = getFirst(req.body.dot_number, req.body.dotNumber, req.query.dot_number, req.query.dotNumber);

  if (!mc_number && !dot_number) {
    return res.status(400).json({ status: 'bad_request', message: 'Provide mc_number and/or dot_number.' });
  }

  const found = carriers.find(c =>
    (!mc_number  || c.mc_number  === mc_number) &&
    (!dot_number || c.dot_number === dot_number)
  );

  if (!found) {
    return res.json({ status: 'not_found', message: 'Carrier is not registered.' });
  }

  if ((found.status || '').toLowerCase() !== 'active') {
    return res.json({ status: 'inactive', message: 'Carrier found but is not active.', carrier: found });
  }

  return res.json({ status: 'found', carrier: found });
});

// List carriers with filters
app.get('/carriers', (req, res) => {
  const q = {
    status: toStr(req.query.status).toLowerCase(),
    city:   toStr(req.query.city).toLowerCase(),
    zip:    toStr(req.query.zip),
    name:   toStr(req.query.name).toLowerCase(),
    mc:     getFirst(req.query.mc_number, req.query.mcNumber),
    dot:    getFirst(req.query.dot_number, req.query.dotNumber)
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

// Get single carrier by either MC or DOT
app.get('/carrier/:id', (req, res) => {
  const id = toStr(req.params.id);
  const found = carriers.find(c => c.mc_number === id || c.dot_number === id);
  if (!found) return res.status(404).json({ message: 'Carrier not found.' });
  res.json(found);
});

app.get('/carrier/dot/:dot', (req, res) => {
  const dot = toStr(req.params.dot);
  const found = carriers.find(c => c.dot_number === dot);
  if (!found) return res.status(404).json({ message: 'Carrier not found.' });
  res.json(found);
});

app.get('/carrier/mc/:mc', (req, res) => {
  const mc = toStr(req.params.mc);
  const found = carriers.find(c => c.mc_number === mc);
  if (!found) return res.status(404).json({ message: 'Carrier not found.' });
  res.json(found);
});

// Store response (auto-enrich from carriers.json when carrier_mc provided)
app.post('/store-response', (req, res) => {
  const { response } = req.body;

  if (!response) {
    return res.status(400).json({ message: 'Missing response data' });
  }

  let carrierMeta = {};
  const carrierMcDigits = toStr(response.carrier_mc);
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
    carrier_name: toStr(response.carrier_name) || null,
    phone_number: toStr(response.phone_number) || null,
    dispatcher_name: toStr(response.dispatcher_name) || null,
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
