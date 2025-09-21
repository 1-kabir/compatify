// bcd-index.js
// Refactored BCD indexer + matcher with web-features (Baseline) integration
// Usage: const { createBCDIndex, matchLineToFeatures } = require('./bcd-index');
// index = createBCDIndex(); matches = matchLineToFeatures(codeText, fileType, index);

const bcd = require('@mdn/browser-compat-data');
let webFeatures;
try {
  // web-features provides Baseline + feature -> compat (BCD) mappings
  webFeatures = require('web-features');
} catch (e) {
  // If web-features isn't installed, we'll still function without Baseline
  webFeatures = null;
}

/* ------------ Utilities ------------ */

function isFeatureNode(obj) {
  return obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, '__compat');
}

function normalizeIdentifier(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9-_]/g, '');
}

function splitTokens(s) {
  return (s || '')
    .split(/[^a-z0-9\-_]+/i)
    .map(t => t.toLowerCase())
    .filter(Boolean);
}

/* ------------ Flatten BCD ------------ */

/**
 * Recursively walk a BCD object and collect feature entries:
 * { key: 'css.properties.content-visibility', node: {...} }
 */
function flattenBCD(obj, path = [], out = []) {
  if (isFeatureNode(obj)) {
    out.push({ key: path.join('.'), node: obj });
  }
  for (const k of Object.keys(obj)) {
    if (k === '__compat') continue;
    const child = obj[k];
    if (child && typeof child === 'object') {
      flattenBCD(child, path.concat(k), out);
    }
  }
  return out;
}

/* ------------ Create Index (main entry) ------------ */

function createBCDIndex() {
  const all = flattenBCD(bcd);
  const lastSegmentMap = new Map(); // last segment -> [fullKey]
  const tokenMap = new Map(); // token -> [fullKey]
  const segmentMap = new Map(); // each segment -> [fullKey]
  const fullKeySet = new Set();
  const keyToNode = new Map();

  const pushTo = (map, k, v) => {
    if (!k) return;
    const a = map.get(k) || [];
    a.push(v);
    map.set(k, a);
  };

  for (const item of all) {
    const key = item.key;
    fullKeySet.add(key);
    keyToNode.set(key, item.node);
    const parts = key.split('.');
    const last = parts[parts.length - 1];

    pushTo(lastSegmentMap, last.toLowerCase(), key);

    // tokens from last segment (hyphen/underscore) and all parts
    const tokens = last.toLowerCase().split(/[-_]/).filter(Boolean);
    tokens.forEach(t => pushTo(tokenMap, t, key));
    parts.forEach(p => pushTo(tokenMap, p.toLowerCase(), key));

    // also maintain segment map
    parts.forEach(p => pushTo(segmentMap, p.toLowerCase(), key));
  }

  // Build mapping from BCD key -> web-features entries (featureId + baseline)
  const bcdToWebFeatures = new Map();
  if (webFeatures && webFeatures.features) {
    // web-features may export features as an array or object: handle both
    const featuresCollection = Array.isArray(webFeatures.features)
      ? webFeatures.features
      : Object.values(webFeatures.features || {});

    for (const feature of featuresCollection) {
      const featureId = feature.id || feature.featureId || feature.name || null;
      const baseline = feature.status && feature.status.baseline ? feature.status.baseline : null;
      // compat_features groups related BCD keys; different shapes exist, so be defensive
      const compat = feature.compat_features || feature.compat || feature.compatFeatures || [];
      for (const c of compat) {
        // common shapes:
        // - string: a BCD key like "css.properties.grid-template-columns"
        // - object: maybe { bcd: 'css.properties.foo' } or { bcd_keys: [...] } or { compat: { bcd: ... } }
        const collect = key => {
          if (!key) return;
          const prev = bcdToWebFeatures.get(key) || [];
          prev.push({ featureId, baseline, feature });
          bcdToWebFeatures.set(key, prev);
        };

        if (typeof c === 'string') {
          collect(c);
        } else if (c && typeof c === 'object') {
          // heuristics: find bcd keys inside object
          if (c.bcd) {
            if (typeof c.bcd === 'string') collect(c.bcd);
            else if (Array.isArray(c.bcd)) c.bcd.forEach(collect);
          }
          // older/alternate names
          if (c.bcd_key) collect(c.bcd_key);
          if (c.bcd_keys && Array.isArray(c.bcd_keys)) c.bcd_keys.forEach(collect);
          if (c.compat && c.compat.bcd) {
            if (typeof c.compat.bcd === 'string') collect(c.compat.bcd);
            else if (Array.isArray(c.compat.bcd)) c.compat.bcd.forEach(collect);
          }
          // there may be direct "key" or "keys"
          if (c.key) collect(c.key);
          if (c.keys && Array.isArray(c.keys)) c.keys.forEach(collect);
        }
      }
    }
  }

  return {
    lastSegmentMap,
    tokenMap,
    segmentMap,
    allKeys: Array.from(fullKeySet),
    keyToNode,
    bcdToWebFeatures,
  };
}

/* ------------ Line(s) matcher ------------ */

/**
 * matchLineToFeatures
 *  - Accepts a line or a multi-line string (will parse every line)
 *  - fileType: 'auto'|'css'|'html'|'js'|'javascript'
 *  - bcdIndex: result of createBCDIndex()
 *
 * Returns: [{ key: 'css.properties.foo', match: 'foo', confidence: 0.95, reason: 'css-property', baseline: 'high', featureId: 'foo-feature' }, ...]
 */
function matchLineToFeatures(text, fileType = 'auto', bcdIndex) {
  if (!bcdIndex) throw new Error('bcdIndex required - call createBCDIndex() first');

  const matches = [];
  const lines = String(text || '').split(/\r?\n/);

  // helpers
  const lookupByToken = token => {
    const lower = normalizeIdentifier(token);
    const byLast = bcdIndex.lastSegmentMap.get(lower) || [];
    const byToken = bcdIndex.tokenMap.get(lower) || [];
    const bySegment = bcdIndex.segmentMap.get(lower) || [];
    // merge and dedupe
    const set = new Set([...byLast, ...byToken, ...bySegment]);
    return Array.from(set);
  };

  const addMatch = (key, match, confidence, reason) => {
    if (!key) return;
    const entry = { key, match, confidence, reason };
    // attach baseline info if available
    const wf = bcdIndex.bcdToWebFeatures.get(key);
    if (wf && wf.length) {
      // pick the best (first) mapping for now (features may map multiple ways)
      const pick = wf[0];
      entry.baseline = pick.baseline || null;
      entry.featureId = pick.featureId || null;
      // if multiple, attach quick summary
      if (wf.length > 1) entry.webFeatures = wf.map(w => ({ featureId: w.featureId, baseline: w.baseline }));
    } else {
      entry.baseline = null;
    }
    matches.push(entry);
  };

  // process each line
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Heuristics per file type. If auto, try to detect.
    const ft = (fileType || 'auto').toLowerCase();
    let effective = ft;
    if (ft === 'auto') {
      // quick heuristics: HTML tag look, CSS property look, JS token look
      if (/<\s*[a-zA-Z0-9-]+/.test(line)) effective = 'html';
      else if (/^[a-zA-Z-]+\s*:/.test(line) || /@[-a-z]+/.test(line) || /::?[-a-z]+/.test(line)) effective = 'css';
      else effective = 'js';
    }

    // --- CSS heuristics ---
    if (effective === 'css') {
      // property: value;
      const propMatch = line.match(/^\s*([a-zA-Z-]+)\s*:\s*([^;{]+)/);
      if (propMatch) {
        const prop = normalizeIdentifier(propMatch[1]);
        const value = (propMatch[2] || '').trim().replace(/\s*!(?:important)?/i, '');
        // direct lookup by property
        const keys = lookupByToken(prop);
        keys.forEach(k => addMatch(k, prop, 0.96, 'css-property'));

        // try property:value subfeature (e.g., grid-template-columns: subgrid)
        if (value) {
          const valToken = normalizeIdentifier(value.split(/\s+/)[0]);
          // try candidate key forms:
          // - css.properties.<prop>.value.<value>
          const candidates = [
            `css.properties.${prop}.value.${valToken}`,
            `css.properties.${prop}.values.${valToken}`,
            `css.properties.${prop}.${valToken}`,
          ];
          for (const c of candidates) {
            if (bcdIndex.allKeys.includes(c)) {
              addMatch(c, `${prop}:${valToken}`, 0.98, 'css-property-value');
            }
          }
          // fallback: lookup value tokens in tokenMap
          const vkeys = lookupByToken(valToken);
          vkeys.forEach(k => addMatch(k, valToken, 0.8, 'css-value-token'));
        }
      }

      // functions: image-set(), minmax(), env(), clamp(), attr(), color-mod()
      const funcRegex = /([a-zA-Z-]+)\s*\(/g;
      let fm;
      while ((fm = funcRegex.exec(line))) {
        const fname = normalizeIdentifier(fm[1]);
        const keys = lookupByToken(fname);
        keys.forEach(k => addMatch(k, fname, 0.9, 'css-function'));
      }

      // pseudo-classes/elements ::target-text, :has(), ::marker
      const pseudoRegex = /(::?[a-zA-Z-]+)/g;
      let pm;
      while ((pm = pseudoRegex.exec(line))) {
        const pseudo = normalizeIdentifier(pm[1].replace(/^:+/, ''));
        const pkeys = lookupByToken(pseudo);
        pkeys.forEach(k => addMatch(k, pseudo, 0.92, 'css-pseudo'));
      }

      // at-rules: @property, @keyframes, @supports
      const atRuleMatch = line.match(/@([a-zA-Z-]+)/);
      if (atRuleMatch) {
        const at = normalizeIdentifier(atRuleMatch[1]);
        const akeys = lookupByToken(at);
        akeys.forEach(k => addMatch(k, at, 0.95, 'css-atrule'));
      }
    }

    // --- HTML/DOM heuristics ---
    if (effective === 'html') {
      // tags: <dialog>, <picture>, <template>
      const tagMatch = line.match(/<\s*([a-zA-Z0-9-]+)/);
      if (tagMatch) {
        const tag = normalizeIdentifier(tagMatch[1]);
        const keys = lookupByToken(tag);
        keys.forEach(k => addMatch(k, tag, 0.95, 'html-tag'));
      }

      // attributes (attr= or boolean attr)
      const attrRegex = /([a-zA-Z-:]+)(?:\s*=\s*["'{\[]|(?=\s|>))/g;
      let am;
      while ((am = attrRegex.exec(line))) {
        const attr = normalizeIdentifier(am[1]);
        const keys = lookupByToken(attr);
        keys.forEach(k => addMatch(k, attr, 0.9, 'html-attribute'));
      }

      // DOM method calls: element.showModal(), dialog.show(), .show(), .animate()
      const dotMethodRegex = /([A-Za-z_$][\w$]*)\.(showModal|show|showPicker|close|open|animate|requestFullscreen|reportValidity)\b/g;
      let dm;
      while ((dm = dotMethodRegex.exec(line))) {
        const method = normalizeIdentifier(dm[2]);
        const keys = lookupByToken(method);
        keys.forEach(k => addMatch(k, method, 0.92, 'dom-method'));
      }
    }

    // --- JavaScript/Web API heuristics ---
    if (effective === 'js') {
      // dotted API usage (navigator.clipboard.readText, indexedDB.open, CSS.registerProperty)
      const dotted = line.match(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)/g);
      if (dotted) {
        dotted.forEach(d => {
          const parts = d.split('.');
          // try full dotted chains and segments
          for (let i = 0; i < parts.length; i++) {
            const token = normalizeIdentifier(parts.slice(i).join('.'));
            // prefer last segment token (method/prop)
            const last = normalizeIdentifier(parts[parts.length - 1]);
            const lastKeys = lookupByToken(last);
            lastKeys.forEach(k => addMatch(k, last, 0.92, 'js-dot'));
            // also try the piece itself
            const piece = normalizeIdentifier(parts[i]);
            lookupByToken(piece).forEach(k => addMatch(k, piece, 0.86, 'js-dot-seg'));
          }
        });
      }

      // look for JS keywords / operators: ??, ?. (optional chaining), #private, => (arrow), await, import()
      if (/\?\?/.test(line)) {
        // nullish coalescing
        const keys = lookupByToken('nullish-coalescing') || lookupByToken('??');
        (keys || []).forEach(k => addMatch(k, '??', 0.95, 'js-operator'));
      }
      if (/\?\./.test(line)) {
        lookupByToken('optional-chaining').forEach(k => addMatch(k, '?.', 0.95, 'js-operator'));
      }
      if (/#\w+/.test(line)) {
        // private fields / methods
        const priv = line.match(/#([A-Za-z0-9_]+)/g);
        if (priv) {
          priv.forEach(p => {
            const token = normalizeIdentifier(p.replace('#', ''));
            lookupByToken(token).forEach(k => addMatch(k, `#${token}`, 0.93, 'js-private-field'));
            lookupByToken('private-fields').forEach(k => addMatch(k, `#${token}`, 0.9, 'js-private-field-generic'));
          });
        }
      }
      // new Array.prototype features like findLast
      const wordRegex = /[A-Za-z_$][\w$-]*/g;
      let w;
      while ((w = wordRegex.exec(line))) {
        const token = normalizeIdentifier(w[0]);
        // skip common small words
        if (['const','let','var','function','return','if','else','for','while','class','new','import','from','export','default','extends','implements'].includes(token)) continue;
        const candidateKeys = lookupByToken(token);
        candidateKeys.forEach(k => addMatch(k, token, 0.75, 'js-token'));
      }

      // detect top-level global functions like fetch(), structuredClone(), queueMicrotask()
      const funcCallRegex = /([A-Za-z_$][\w$]*)\s*\(/g;
      let fc;
      while ((fc = funcCallRegex.exec(line))) {
        const fn = normalizeIdentifier(fc[1]);
        lookupByToken(fn).forEach(k => addMatch(k, fn, 0.9, 'js-function'));
      }
    }

    // Generic substring heuristics (low confidence): look for tokens that are in any key
    {
      const tokens = splitTokens(line);
      for (const t of tokens) {
        // skip trivial tokens
        if (t.length < 2) continue;
        const keys = bcdIndex.tokenMap.get(t) || [];
        keys.forEach(k => addMatch(k, t, 0.6, 'substring-token'));
      }
    }
  } // end lines loop

  // Deduplicate by key, keep highest confidence
  const best = new Map();
  for (const m of matches) {
    const prev = best.get(m.key);
    if (!prev || (m.confidence || 0) > (prev.confidence || 0)) best.set(m.key, m);
  }

  // Sort by confidence desc
  return Array.from(best.values()).sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
}

module.exports = { createBCDIndex, matchLineToFeatures };
