// const express = require('express');
// const fs = require('fs');
// const app = express();
// const PORT = process.env.PORT || 3000;
// const cors = require('cors');

// app.use(cors());

// app.use(express.json());

// // Load carriers from JSON file
// const carriers = JSON.parse(fs.readFileSync('carriers.json'));

// // Route to check carrier registration
// app.post('/check-carrier', (req, res) => {
//   const { mc_number, dot_number } = req.body;

//   const found = carriers.find(carrier =>
//     carrier.mc_number === mc_number && carrier.dot_number === dot_number
//   );

//   if (found) {
//     res.json({ status: "found", carrier: found });
//   } else {
//     res.json({ status: "not_found", message: "Carrier is not registered." });
//   }
// });

// app.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
// });

const express = require('express');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;
const cors = require('cors');
const path = require('path');

app.use(cors());
app.use(express.json());

const carriers = JSON.parse(fs.readFileSync('carriers.json'));
const responsesPath = path.join(__dirname, 'responses.json');

// Route to check carrier registration
app.post('/check-carrier', (req, res) => {
  const { mc_number, dot_number } = req.body;

  const found = carriers.find(carrier =>
    carrier.mc_number === mc_number && carrier.dot_number === dot_number
  );

  if (found) {
    res.json({ status: "found", carrier: found });
  } else {
    res.json({ status: "not_found", message: "Carrier is not registered." });
  }
});

// ✅ New route to store response data
app.post('/store-response', (req, res) => {
  const { response } = req.body;

  if (!response) {
    return res.status(400).json({ message: "Missing response data" });
  }

  const newEntry = {
    carrier_mc: response.carrier_mc || null,
    carrier_name: response.carrier_name || null,
    phone_number: response.phone_number || null,
    dispatcher_name: response.dispatcher_name || null,
    timestamp: new Date().toISOString() // optional, for tracking
  };

  let existingData = [];

  try {
    existingData = JSON.parse(fs.readFileSync(responsesPath));
  } catch (err) {
    console.error("Could not read existing responses:", err.message);
  }

  existingData.push(newEntry);

  try {
    fs.writeFileSync(responsesPath, JSON.stringify(existingData, null, 2));
    res.json({ message: "Data stored successfully", entry: newEntry });
  } catch (err) {
    console.error("Error saving data:", err.message);
    res.status(500).json({ message: "Failed to save response data" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});



