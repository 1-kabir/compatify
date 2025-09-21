const express = require('express');
const bodyParser = require('body-parser');
const { createBCDIndex, matchLineToFeatures } = require('./bcd-index');

const app = express();
app.use(bodyParser.json());

// Build flattened BCD index once at startup
const bcdIndex = createBCDIndex();

// Route: check line for matches (existing)
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

// New Route: fetch baseline for a given BCD key
app.get('/baseline/:key', (req, res) => {
  const key = req.params.key;
  if (!key) return res.status(400).json({ error: 'BCD key required in URL' });

  const node = bcdIndex.keyToNode.get(key);
  const wf = bcdIndex.bcdToWebFeatures.get(key);

  const baselineInfo = wf && wf.length > 0
    ? wf.map(f => ({
        featureId: f.featureId || null,
        baseline: f.baseline || null,
        spec: f.feature?.spec || null
      }))
    : node && node.__compat && node.__compat.support === false
      ? [{ baseline: false }]
      : [{ baseline: null }];

  res.json({ key, baseline: baselineInfo });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`baseline-linter-proto listening on http://localhost:${PORT}`);
});
