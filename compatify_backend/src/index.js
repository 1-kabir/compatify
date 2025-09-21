const express = require('express');
const bodyParser = require('body-parser');
const { createBCDIndex, matchLineToFeatures } = require('./bcd-index');

const app = express();
app.use(bodyParser.json());

// Build flattened BCD index once at startup
const bcdIndex = createBCDIndex();

app.post('/check-line', (req, res) => {
  const { line, type } = req.body || {};
  if (typeof line !== 'string') return res.status(400).json({ error: 'line (string) required' });
  const fileType = (type || 'auto').toLowerCase();

  try {
    const matches = matchLineToFeatures(line, fileType, bcdIndex);
    res.json({ line, type: fileType, matches });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`baseline-linter-proto listening on http://localhost:${PORT}`);
});
