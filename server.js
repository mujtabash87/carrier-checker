const express = require('express');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;
const cors = require('cors');

app.use(cors());

app.use(express.json());

// Load carriers from JSON file
const carriers = JSON.parse(fs.readFileSync('carriers.json'));

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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Let's test this!