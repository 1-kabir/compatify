// bcd-index.js (parser-backed) - stricter owner-aware heuristics & precision-first fallbacks
// Usage: const { createBCDIndex, matchLineToFeatures } = require('./bcd-index');

const bcd = require('@mdn/browser-compat-data');
let webFeatures;
try { webFeatures = require('web-features'); } catch (e) { webFeatures = null; }

// Optional parser libs (best-effort)
let acorn, walkAcorn, parse5, postcss, valueParser;
try { acorn = require('acorn'); } catch (e) { acorn = null; }
try { walkAcorn = require('acorn-walk'); } catch (e) { walkAcorn = null; }
try { parse5 = require('parse5'); } catch (e) { parse5 = null; }
try { postcss = require('postcss'); valueParser = require('postcss-value-parser'); } catch (e) { postcss = null; valueParser = null; }

/* ------------ Utilities (minor) ------------ */

function isFeatureNode(obj) { return obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, '__compat'); }
function normalizeIdentifier(s) { return (s || '').toLowerCase().replace(/[^a-z0-9-_]/g, ''); }
// keep hyphens/underscores in tokens (helpful for CSS props)
function splitTokens(s) { return (s || '').split(/[^a-z0-9\-_]+/i).map(t => t.toLowerCase()).filter(Boolean); }

/* ------------ Helpers used by heuristics ------------ */

// Return true if the BCD key contains an owner token near the tail (within the last 3 segments)
function containsOwnerNearTail(bcdKey, ownerLower) {
  if (!bcdKey || !ownerLower) return false;
  const segs = bcdKey.split('.').map(s => s.toLowerCase());
  const tailWindow = segs.slice(Math.max(0, segs.length - 4), segs.length - 1); // check up to 3 segments before final
  return tailWindow.includes(ownerLower);
}

// Return true if bcdKey is a strict last-segment match for token
function isStrictLastSegmentMatch(bcdKey, tokenLower) {
  const segs = bcdKey.split('.');
  return segs[segs.length - 1].toLowerCase() === tokenLower;
}

/* ------------ Improved safe lookup (precision-first) ------------ */

/**
 * safeLookupByToken(bcdIndex, token, prefix)
 * - token: string token to look up
 * - prefix: optional string or array of prefixes to restrict
 *
 * Returns a list of candidate BCD keys (de-duplicated), but this function purposefully
 * does not attempt to disambiguate owners — that's handled in caller logic (JS owner checks).
 */
function safeLookupByToken(bcdIndex, token, prefix) {
  const lower = normalizeIdentifier(token);
  if (!lower) return [];
  const prefixes = Array.isArray(prefix) ? prefix : (prefix ? [prefix] : null);

  // Defensive: in API/Javascript context avoid very short tokens which cause noise
  if (prefixes && prefixes.some(p => p.includes('api') || p.includes('javascript')) && lower.length < 3) return [];

  const applyPrefixesFilter = (keys) => {
    if (!prefixes || !prefixes.length) return keys;
    return keys.filter(k => prefixes.some(p => k.startsWith(p)));
  };

  // 1) prefer exact last-segment matches (most precise)
  const byLast = bcdIndex.lastSegmentMap.get(lower) || [];
  const lastFiltered = applyPrefixesFilter(byLast);
  if (lastFiltered.length) return Array.from(new Set(lastFiltered));

  // 2) gather candidates from tokenMap & segmentMap but keep them minimal
  let candidates = Array.from(new Set([
    ...(bcdIndex.tokenMap.get(lower) || []),
    ...(bcdIndex.segmentMap.get(lower) || [])
  ]));
  if (prefixes && prefixes.length) candidates = applyPrefixesFilter(candidates);

  // 3) prefer keys where token is near tail (last 2 segments). Avoid distant matches.
  const tailPreferred = [], tailAllowed = [];
  const N = 2;
  for (const k of candidates) {
    const segs = k.split('.');
    const tail = segs.slice(-N).map(s => s.toLowerCase());
    (tail.includes(lower) ? tailPreferred : tailAllowed).push(k);
  }

  let result = tailPreferred.length ? tailPreferred : tailAllowed;

  // 4) HTML element special case: prefer exact element keys
  if (prefixes?.includes('html.elements')) {
    const directElements = result.filter(k => {
      const segs = k.split('.');
      return segs.length >= 3 && segs[0] === 'html' && segs[1] === 'elements' && segs[2].toLowerCase() === lower;
    });
    if (directElements.length) return Array.from(new Set(directElements));
  }

  // 5) CSS properties: stricter - require last segment contains all token parts (preserve order not required)
  if (prefixes && prefixes.some(p => p === 'css.properties')) {
    const propParts = lower.split(/[-_]/).filter(Boolean);
    result = result.filter(k => {
      const segs = k.split('.');
      const lastSeg = segs[segs.length - 1].toLowerCase();
      if (lastSeg === lower) return true;
      const lastTokens = lastSeg.split(/[-_]/).filter(Boolean);
      return propParts.every(pp => lastTokens.includes(pp));
    });
  }

  return Array.from(new Set(result));
}

/* ------------ Flatten BCD & index builder ------------ */

function flattenBCD(obj, path = [], out = []) {
  if (isFeatureNode(obj)) out.push({ key: path.join('.'), node: obj });
  for (const k of Object.keys(obj)) {
    if (k === '__compat') continue;
    const child = obj[k];
    if (child && typeof child === 'object') flattenBCD(child, path.concat(k), out);
  }
  return out;
}

function createBCDIndex() {
  const all = flattenBCD(bcd);
  const lastSegmentMap = new Map();
  const tokenMap = new Map();
  const segmentMap = new Map();
  const fullKeySet = new Set();
  const keyToNode = new Map();

  const pushTo = (map, k, v) => { if (!k) return; const a = map.get(k) || []; a.push(v); map.set(k, a); };

  for (const item of all) {
    const key = item.key;
    fullKeySet.add(key);
    keyToNode.set(key, item.node);
    const parts = key.split('.');
    const last = parts[parts.length - 1];
    pushTo(lastSegmentMap, last.toLowerCase(), key);
    // tokens: split each path segment on - and _
    const tokens = last.toLowerCase().split(/[-_]/).filter(Boolean);
    tokens.forEach(t => pushTo(tokenMap, t, key));
    parts.forEach(p => pushTo(segmentMap, p.toLowerCase(), key));
  }

  // Map to web-features where possible (unchanged behavior)
  const bcdToWebFeatures = new Map();

  if (webFeatures) {
    const featuresCollectionRoot = webFeatures.features || webFeatures;
    const wfKeys = featuresCollectionRoot
      ? (typeof featuresCollectionRoot.get === 'function' ? [...featuresCollectionRoot.keys()] : Object.keys(featuresCollectionRoot))
      : [];
    const wfKeySet = new Set(wfKeys.map(k => String(k).toLowerCase()));

    function inferBaselineCandidates(bcdKey) {
      if (!bcdKey || typeof bcdKey !== 'string') return [];
      const parts = bcdKey.split('.').filter(Boolean).map(p => p.toLowerCase());
      const last = parts[parts.length - 1] || '';
      const candidates = new Set();

      candidates.add(last);
      if (parts.length >= 2) candidates.add(`${parts[parts.length - 2]}-${last}`);
      for (let i = Math.max(0, parts.length - 3); i < parts.length; i++) {
        candidates.add(parts.slice(i).join('-'));
      }
      candidates.add(parts.join('-'));
      if (parts.includes('elements')) candidates.add(`element-${last}`);
      if (parts.includes('properties')) candidates.add(last);
      if (parts.includes('values')) candidates.add(last);
      if (parts.includes('selectors')) candidates.add(last);
      if (parts.includes('methods') && parts.length >= 2) candidates.add(parts.slice(-2).join('-'));

      return Array.from(candidates).map(s => String(s).toLowerCase()).filter(Boolean);
    }

    function baselineExistsForBCDKey(bcdKey) {
      const candidates = inferBaselineCandidates(bcdKey);
      for (const c of candidates) {
        if (wfKeySet.has(c)) return c;
      }
      return null;
    }

    const featuresCollection = Array.isArray(featuresCollectionRoot)
      ? featuresCollectionRoot
      : Object.values(featuresCollectionRoot || {});

    for (const feature of featuresCollection) {
      const featureId = feature.id || feature.featureId || feature.name || null;
      const baseline = feature.status && feature.status.baseline ? feature.status.baseline : null;
      const compat = feature.compat_features || feature.compat || feature.compatFeatures || [];

      for (const c of compat) {
        const collectIfBaseline = (key) => {
          if (!key) return;
          const baselineMatch = baselineExistsForBCDKey(key);
          if (!baselineMatch) return;
          const prev = bcdToWebFeatures.get(key) || [];
          prev.push({ featureId, baseline, feature, baselineKeyMatched: baselineMatch });
          bcdToWebFeatures.set(key, prev);
        };

        if (typeof c === 'string') collectIfBaseline(c);
        else if (c && typeof c === 'object') {
          if (c.bcd) {
            if (typeof c.bcd === 'string') collectIfBaseline(c.bcd);
            else if (Array.isArray(c.bcd)) c.bcd.forEach(collectIfBaseline);
          }
          if (c.bcd_key) collectIfBaseline(c.bcd_key);
          if (c.bcd_keys && Array.isArray(c.bcd_keys)) c.bcd_keys.forEach(collectIfBaseline);
          if (c.compat && c.compat.bcd) {
            if (typeof c.compat.bcd === 'string') collectIfBaseline(c.compat.bcd);
            else if (Array.isArray(c.compat.bcd)) c.compat.bcd.forEach(collectIfBaseline);
          }
          if (c.key) collectIfBaseline(c.key);
          if (c.keys && Array.isArray(c.keys)) c.keys.forEach(collectIfBaseline);
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

/* ------------ Helper utilities for improved JS matching ------------ */

function findExactChainKeys(bcdIndex, parts, prefixes = ['api','javascript.builtins'], ownerHint = null, requireOwner = false) {
  const lowerParts = parts.map(p => p.toLowerCase());
  return bcdIndex.allKeys.filter(k => {
    if (prefixes && prefixes.length) {
      if (!prefixes.some(pfx => k.startsWith(pfx))) return false;
    }
    const segs = k.split('.');
    const tail = segs.slice(-lowerParts.length).map(s => s.toLowerCase());
    if (tail.length !== lowerParts.length) return false;
    for (let i = 0; i < tail.length; i++) if (tail[i] !== lowerParts[i]) return false;

    if (ownerHint) {
      const ownerLower = ownerHint.toLowerCase();
      const penultimate = segs.length >= (lowerParts.length + 1) ? segs[segs.length - lowerParts.length - 1].toLowerCase() : null;
      if (penultimate) {
        if (penultimate === ownerLower) return true;
      }
      if (segs.map(s => s.toLowerCase()).includes(ownerLower)) return true;
      if (requireOwner) return false;
    }
    return true;
  });
}

function canonicalOwnerFromCtor(name) {
  if (!name) return null;
  if (/^(int|uint|float|big)(8|16|32|64)?array$/i.test(name) || /^(Int8Array|Int16Array|Int32Array|Uint8Array|Uint16Array|Uint32Array|Float32Array|Float64Array|BigInt64Array|BigUint64Array)$/i.test(name)) return 'TypedArray';
  const n = name.toLowerCase();
  return ['array','map','set','string','iterator'].includes(n) ? name[0].toUpperCase() + n.slice(1) : name;
}

/* ------------ JS parsing & matching (acorn) ------------ */

function parseJSWithAcorn(code, bcdIndex, addMatch) {
  if (!acorn || !walkAcorn) return false;
  let ast;
  try {
    ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true });
  } catch (e) {
    try { ast = acorn.parse(code, { ecmaVersion: 2020, sourceType: 'module' }); } catch (_) { return false; }
  }

  // high-precision preference -> prefer fewer fallback matches
  const varTypes = new Map();
  const seenIdentifiersInChains = new Set();

  // infer var types from initializers (including document.createElement)
  walkAcorn.simple(ast, {
    VariableDeclarator(node) {
      try {
        if (node.id && node.id.type === 'Identifier' && node.init) {
          const id = node.id.name;
          const init = node.init;
          if (init.type === 'ArrayExpression') varTypes.set(id, 'Array');
          else if (init.type === 'NewExpression' && init.callee && init.callee.type === 'Identifier') varTypes.set(id, canonicalOwnerFromCtor(init.callee.name));
          else if (init.type === 'CallExpression' && init.callee) {
            if (init.callee.type === 'MemberExpression' && init.callee.object && init.callee.object.name === 'Array') varTypes.set(id, 'Array');
            else if (init.callee.type === 'Identifier' && init.callee.name === 'Array') varTypes.set(id, 'Array');
            else if (init.callee.type === 'MemberExpression' &&
                     init.callee.object && init.callee.object.type === 'Identifier' &&
                     init.callee.object.name === 'document' &&
                     init.callee.property && (init.callee.property.name === 'createElement')) {
              const arg = init.arguments && init.arguments[0];
              if (arg && (arg.type === 'Literal' || arg.type === 'StringLiteral') && typeof arg.value === 'string') {
                varTypes.set(id, `Element:${arg.value.toLowerCase()}`);
              } else {
                varTypes.set(id, 'Element');
              }
            }
          }
        }
      } catch (e) {}
    },
    AssignmentExpression(node) {
      try {
        if (node.left && node.left.type === 'Identifier' && node.right) {
          const name = node.left.name;
          const r = node.right;
          if (r.type === 'ArrayExpression') varTypes.set(name, 'Array');
          else if (r.type === 'NewExpression' && r.callee && r.callee.type === 'Identifier') varTypes.set(name, canonicalOwnerFromCtor(r.callee.name));
        }
      } catch (e) {}
    }
  });

  // ambiguous prototype-level methods that appear on many hosts — require owner disambiguation
  const ambiguousPrototypeMethods = new Set([
    'includes', 'matchall', 'match', 'repeat', 'indexof', 'find', 'filter', 'map', 'reduce', 'keys', 'values'
  ]);

  // well-known globals allowed for single-token matching
  const knownGlobals = new Set([
    'fetch','promise','json','console','settimeout','setinterval','cleartimeout','clearinterval',
    'require','import','decodeuri','encodeuri'
  ]);

  const lookupAndAdd = (parts, opts = {}) => {
    const reason = opts.reason || 'js-ast';
    const confidence = typeof opts.confidence === 'number' ? opts.confidence : 0.95;
    const allowSingle = !!opts.allowSingle;
    let ownerHint = opts.ownerHint || null;
    const requireOwner = !!opts.requireOwner;

    const partsArr = Array.isArray(parts) ? parts.slice() : String(parts).split('.').filter(Boolean);
    if (!partsArr.length) return;

    // avoid bogus 'arguments' cases
    if (partsArr[0] && partsArr[0].toLowerCase() === 'arguments') {
      const exactAttempt = findExactChainKeys(bcdIndex, partsArr, ['api','javascript.builtins']);
      const exactFiltered = exactAttempt.filter(k => !k.split('.').some(seg => seg.toLowerCase() === 'function'));
      if (exactFiltered && exactFiltered.length) exactFiltered.forEach(k => addMatch(k, partsArr.join('.'), Math.max(confidence, 0.96), `${reason}-exact`));
      return;
    }

    // ownerHint normalization: prefer varTypes-derived owner if available
    if (!ownerHint && partsArr.length > 1) {
      const base = partsArr[0];
      ownerHint = varTypes.get(base) || (base === 'Array' ? 'Array' : null);
      if (!ownerHint && /^[A-Z]/.test(base) && base.toLowerCase() !== 'arguments') ownerHint = canonicalOwnerFromCtor(base);
    }

    // 1) exact chain matches (owner-aware)
    if (ownerHint) {
      const exactWithOwner = findExactChainKeys(bcdIndex, partsArr, ['api','javascript.builtins'], ownerHint, true);
      if (exactWithOwner.length) {
        exactWithOwner.forEach(k => addMatch(k, partsArr.join('.'), Math.max(confidence, 0.98), `${reason}-exact-owner`));
        return;
      }
      if (requireOwner) return; // don't proceed if owner required but not found
    }

    const exact = findExactChainKeys(bcdIndex, partsArr, ['api','javascript.builtins']);
    if (exact && exact.length) {
      exact.forEach(k => addMatch(k, partsArr.join('.'), Math.max(confidence, 0.97), `${reason}-exact`));
      return;
    }

    // 2) contextual lookup when chain length > 1: require owner presence near tail
    if (partsArr.length > 1) {
      const base = partsArr[0];
      const member = partsArr[partsArr.length - 1];
      const memberLower = member.toLowerCase();
      let baseType = varTypes.get(base) || (base === 'Array' ? 'Array' : null);
      if (!baseType && /^[A-Z]/.test(base) && base.toLowerCase() !== 'arguments') baseType = canonicalOwnerFromCtor(base);

      if (baseType) {
        const canonicalOwner = canonicalOwnerFromCtor(baseType);
        let keysForMember = (bcdIndex.tokenMap.get(memberLower) || []).filter(k => {
          const segs = k.split('.');
          // Element:tag support
          if (typeof baseType === 'string' && baseType.startsWith('Element:')) {
            const tag = baseType.split(':')[1];
            return segs.some(s => s.toLowerCase() === 'elements') && segs.some(s => s.toLowerCase() === tag);
          }
          // require owner to appear near tail for confidence (avoid distant false positives)
          return containsOwnerNearTail(k, canonicalOwner.toLowerCase()) || containsOwnerNearTail(k, base.toLowerCase());
        });

        // If the member is an ambiguous prototype method, be even stricter: require owner near tail
        if (ambiguousPrototypeMethods.has(memberLower)) {
          keysForMember = keysForMember.filter(k => containsOwnerNearTail(k, canonicalOwner.toLowerCase()) || containsOwnerNearTail(k, base.toLowerCase()));
        }

        if (keysForMember.length) {
          keysForMember.forEach(k => addMatch(k, member, Math.max(confidence, 0.94), `${reason}-context`));
          return;
        }
      }
    }

    // 3) single-part tokens: only if allowed and exact last-segment exists or whitelisted global
    if (partsArr.length === 1 && !allowSingle) return;

    if (partsArr.length === 1 && allowSingle) {
      const last = partsArr[0];
      const lastLower = last.toLowerCase();
      const exactLast = bcdIndex.lastSegmentMap.get(lastLower) || [];
      if (exactLast.length) {
        // STRICT: filter exactLast to require either (a) ownerHint near tail (if ownerHint exists) OR (b) exact semantic global
        const filtered = exactLast.filter(k => {
          if (!ownerHint) return true;
          const ownerLower = ownerHint.toLowerCase();
          return containsOwnerNearTail(k, ownerLower) || k.split('.').map(s => s.toLowerCase()).includes(ownerLower);
        });
        const use = filtered.length ? filtered : exactLast; // if filter removes everything, keep exactLast (less strict fallback)
        use.forEach(k => addMatch(k, last, Math.max(confidence, 0.92), `${reason}-single-exact`));
        return;
      }
      if (knownGlobals.has(lastLower)) {
        const candidates = safeLookupByToken(bcdIndex, last, ['api','javascript.builtins']);
        // require owner proximity if ownerHint exists
        const use = ownerHint ? candidates.filter(k => containsOwnerNearTail(k, ownerHint.toLowerCase()) || k.split('.').map(s => s.toLowerCase()).includes(ownerHint.toLowerCase())) : candidates;
        use.forEach(k => addMatch(k, last, Math.max(confidence, 0.88), `${reason}-single-known-global`));
      }
      return;
    }

    // 4) final fallback (very low confidence): only when token long enough and pass owner-proximity checks
    const last = partsArr[partsArr.length - 1];
    if (String(last).length < 4) return; // stricter threshold
    let keys = safeLookupByToken(bcdIndex, last, ['api', 'javascript.builtins']);
    if (ownerHint) keys = keys.filter(k => containsOwnerNearTail(k, ownerHint.toLowerCase()) || k.split('.').map(s => s.toLowerCase()).includes(ownerHint.toLowerCase()));
    // If ambiguous method, do not fallback at all
    if (ambiguousPrototypeMethods.has(String(last).toLowerCase())) keys = [];
    keys.forEach(k => addMatch(k, last, (confidence * 0.5), `${reason}-fallback`));
  };

  // Walk AST for chains / calls / identifiers
  walkAcorn.simple(ast, {
    MemberExpression(node) {
      try {
        const parts = [];
        let cur = node;
        let ownerHint = null;
        while (cur && (cur.type === 'MemberExpression' || cur.type === 'Identifier' || cur.type === 'ThisExpression' || cur.type === 'ArrayExpression' || cur.type === 'NewExpression')) {
          if (cur.type === 'MemberExpression') {
            if (cur.property && (cur.property.name || (cur.property.value && typeof cur.property.value === 'string'))) {
              parts.unshift(cur.property.name || cur.property.value);
            }
            if (cur.object && cur.object.type === 'ArrayExpression') ownerHint = 'Array';
            if (cur.object && cur.object.type === 'NewExpression' && cur.object.callee && cur.object.callee.type === 'Identifier') ownerHint = canonicalOwnerFromCtor(cur.object.callee.name);
            if (cur.object && cur.object.type === 'Identifier') seenIdentifiersInChains.add(cur.object.name);
            cur = cur.object;
          } else if (cur.type === 'Identifier') {
            parts.unshift(cur.name);
            seenIdentifiersInChains.add(cur.name);
            break;
          } else if (cur.type === 'ThisExpression') { parts.unshift('this'); break; }
          else if (cur.type === 'ArrayExpression') { parts.unshift('Array'); ownerHint = 'Array'; break; }
          else if (cur.type === 'NewExpression') {
            if (cur.callee && cur.callee.type === 'Identifier') { parts.unshift(cur.callee.name); ownerHint = canonicalOwnerFromCtor(cur.callee.name); }
            break;
          } else if (cur.type === 'Literal' && typeof cur.value === 'string') {
            parts.unshift('String');
            ownerHint = 'String';
            break;
          } else if (cur.type === 'TemplateLiteral') {
            parts.unshift('String');
            ownerHint = 'String';
            break;
          } else break;
        }
        if (parts.length) lookupAndAdd(parts, { reason: 'js-api-chain', confidence: 0.96, ownerHint: ownerHint || null });
      } catch (e) {}
    },
    CallExpression(node) {
      if (node.callee) {
        if (node.callee.type === 'Identifier') {
          lookupAndAdd([node.callee.name], { reason: 'js-global-function', confidence: 0.9, allowSingle: true });
        } else if (node.callee.type === 'MemberExpression') {
          try {
            const parts = [];
            let cur = node.callee;
            let ownerHint = null;
            while (cur && (cur.type === 'MemberExpression' || cur.type === 'Identifier' || cur.type === 'ArrayExpression' || cur.type === 'NewExpression')) {
              if (cur.type === 'MemberExpression') {
                if (cur.property && (cur.property.name || (cur.property.value && typeof cur.property.value === 'string'))) parts.unshift(cur.property.name || cur.property.value);
                if (cur.object && cur.object.type === 'ArrayExpression') ownerHint = 'Array';
                if (cur.object && cur.object.type === 'NewExpression' && cur.object.callee && cur.object.callee.type === 'Identifier') ownerHint = canonicalOwnerFromCtor(cur.object.callee.name);
                if (cur.object && cur.object.type === 'Identifier') seenIdentifiersInChains.add(cur.object.name);
                cur = cur.object;
              } else if (cur.type === 'Identifier') { parts.unshift(cur.name); seenIdentifiersInChains.add(cur.name); break; }
              else if (cur.type === 'ArrayExpression') { parts.unshift('Array'); ownerHint = 'Array'; break; }
              else if (cur.type === 'NewExpression') { if (cur.callee && cur.callee.type === 'Identifier') { parts.unshift(cur.callee.name); ownerHint = canonicalOwnerFromCtor(cur.callee.name); } break; }
              else break;
            }
            if (parts.length) lookupAndAdd(parts, { reason: 'js-method-call', confidence: 0.9, allowSingle: false, ownerHint });
          } catch (e) {}
        }
      }
    },
    Identifier(node) {
      if (node.name && node.name.length >= 5) { // stricter threshold for standalone identifiers
        if (seenIdentifiersInChains.has(node.name)) return;
        lookupAndAdd([node.name], { reason: 'js-identifier', confidence: 0.8, allowSingle: false });
      }
    },
    PrivateIdentifier(node) {
      if (node.name) {
        const name = node.name;
        const keys = safeLookupByToken(bcdIndex, 'private-fields', ['api', 'javascript.builtins']);
        keys.forEach(k => addMatch(k, `#${name}`, 0.9, 'js-private-field'));
      }
    },
    VariableDeclarator(node) {
      try {
        if (node.id && node.id.type === 'Identifier' && node.init) {
          const id = node.id.name;
          const init = node.init;
          if (init.type === 'ArrayExpression') varTypes.set(id, 'Array');
          else if (init.type === 'NewExpression' && init.callee && init.callee.type === 'Identifier') varTypes.set(id, canonicalOwnerFromCtor(init.callee.name));
          else if (init.type === 'CallExpression' && init.callee && init.callee.type === 'MemberExpression' && init.callee.object && init.callee.object.name === 'Array') varTypes.set(id, 'Array');
        }
      } catch (e) {}
    },
    AssignmentExpression(node) {
      try {
        if (node.left && node.left.type === 'Identifier' && node.right) {
          const name = node.left.name;
          const r = node.right;
          if (r.type === 'ArrayExpression') varTypes.set(name, 'Array');
          else if (r.type === 'NewExpression' && r.callee && r.callee.type === 'Identifier') varTypes.set(name, canonicalOwnerFromCtor(r.callee.name));
        }
      } catch (e) {}
    }
  });

  return true;
}

/* ------------ HTML parsing (unchanged aside from using safeLookup) ------------ */

function parseHTMLWithParse5(html, bcdIndex, addMatch) {
  if (!parse5) return false;
  let document;
  try { document = parse5.parseFragment(html, { sourceCodeLocationInfo: false }); } catch (e) {
    try { document = parse5.parse(html); } catch (e2) { return false; }
  }

  function walk(node) {
    if (!node) return;
    if (node.nodeName && typeof node.nodeName === 'string') {
      if (node.tagName) {
        const tag = normalizeIdentifier(node.tagName);
        const keys = safeLookupByToken(bcdIndex, tag, 'html.elements');
        const direct = keys.filter(k => {
          const segs = k.split('.');
          return segs.length >= 3 && segs[0] === 'html' && segs[1] === 'elements' && segs[2].toLowerCase() === tag;
        });
        const toUse = direct.length ? direct : keys;
        toUse.forEach(k => addMatch(k, tag, 0.95, 'html-tag'));
      }
      const attrs = node.attrs || node.attributes || [];
      attrs.forEach(a => {
        const attrName = normalizeIdentifier(a.name || a.nodeName || '');
        const keys = safeLookupByToken(bcdIndex, attrName, 'html.attributes');
        keys.forEach(k => addMatch(k, attrName, 0.9, 'html-attribute'));

        if (/^on[A-Za-z]+$/.test(a.name || '')) {
          const ev = a.name.replace(/^on/, '');
          const evKeys = safeLookupByToken(bcdIndex, ev, ['api', 'html.attributes']);
          evKeys.forEach(k => addMatch(k, ev, 0.85, 'html-inline-event'));
        }

        if (a.value) {
          const tokens = splitTokens(a.value).filter(t => t.length >= 4);
          tokens.forEach(t => {
            const tk = safeLookupByToken(bcdIndex, t, ['api', 'html.attributes']);
            tk.forEach(k => addMatch(k, t, 0.7, 'html-attr-value'));
          });
        }
      });
    }

    if (node.childNodes && node.childNodes.length) node.childNodes.forEach(walk);
    if (node.content) walk(node.content);
  }
  walk(document);
  return true;
}

/* ------------ CSS parsing (stricter property/value matching) ------------ */

function parseCSSWithPostCSS(cssText, bcdIndex, addMatch) {
  if (!postcss) return false;
  let root;
  try { root = postcss.parse(cssText); } catch (e) { return false; }

  root.walk(node => {
    if (node.type === 'decl') {
      const prop = normalizeIdentifier(node.prop || '');
      // only accept strict property matches (last segment must match)
      const keys = (bcdIndex.lastSegmentMap.get(prop) || []).filter(k => k.startsWith('css.properties'));
      if (keys.length) keys.forEach(k => addMatch(k, prop, 0.97, 'css-property'));

      // values: only property-specific candidates (do not do broad css token lookups)
      if (node.value && valueParser) {
        const parsed = valueParser(node.value);
        parsed.walk(n => {
          if (n.type === 'word') {
            const tok = normalizeIdentifier(n.value);
            if (tok.length >= 3) {
              const candidates = [
                `css.properties.${prop}.value.${tok}`,
                `css.properties.${prop}.values.${tok}`,
                `css.properties.${prop}.${tok}`,
              ];
              for (const c of candidates) if (bcdIndex.allKeys.includes(c)) addMatch(c, `${prop}:${tok}`, 0.98, 'css-property-value');
            }
          }
        });
      }
    } else if (node.type === 'atrule') {
      const at = normalizeIdentifier(node.name || '');
      const atCandidates = (bcdIndex.lastSegmentMap.get(at) || []).filter(k => k.startsWith('css.at-rules'));
      (atCandidates.length ? atCandidates : safeLookupByToken(bcdIndex, at, 'css.at-rules')).forEach(k => addMatch(k, at, 0.95, 'css-atrule'));
    } else if (node.type === 'rule') {
      const sel = node.selector || '';
      const pseudoMatches = sel.match(/::?:[a-zA-Z-]+/g) || [];
      pseudoMatches.forEach(p => {
        const pseudo = normalizeIdentifier(p.replace(/^:+/, ''));
        const pseudoCandidates = (bcdIndex.lastSegmentMap.get(pseudo) || []).filter(k => k.startsWith('css.selectors'));
        (pseudoCandidates.length ? pseudoCandidates : safeLookupByToken(bcdIndex, pseudo, 'css.selectors')).forEach(k => addMatch(k, pseudo, 0.92, 'css-pseudo'));
      });
    }
  });

  return true;
}

/* ------------ Main matching function (line/file matching) ------------ */

/**
 * matchLineToFeatures(text, fileType, bcdIndex, options)
 *  - fileType: 'auto'|'css'|'html'|'js'|'javascript'
 *  - options: { enableMinConfidence: boolean, minConfidence: number, strict: boolean }
 *
 * This implementation is precision-first: it prefers exact and owner-disambiguated matches,
 * intentionally dropping broad fallbacks that tend to produce false positives.
 */
function matchLineToFeatures(text, fileType = 'auto', bcdIndex, options = {}) {
  if (!bcdIndex) throw new Error('bcdIndex required - call createBCDIndex() first');

  const matches = [];
  const allowedBaselines = new Set([false, 'low', 'high']);
  const enableMinConfidence = !!options.enableMinConfidence;
  const minConfidence = typeof options.minConfidence === 'number' ? options.minConfidence : 0.85;
  // strict mode: even more conservative; default true to prioritize precision
  const strictMode = options.strict !== undefined ? !!options.strict : true;

  const addMatch = (key, match, confidence, reason) => {
    if (!key) return;
    if (enableMinConfidence && (typeof confidence !== 'number' || confidence < minConfidence)) return;
    const wf = bcdIndex.bcdToWebFeatures.get(key) || [];
    const entry = { key, match, confidence, reason };
    if (wf.length) {
      const pick = wf[0];
      if (pick.baseline !== undefined && pick.baseline !== null && allowedBaselines.has(pick.baseline)) entry.baseline = pick.baseline;
      if (pick.featureId !== undefined && pick.featureId !== null) entry.featureId = pick.featureId;
      if (wf.length > 1) {
        entry.webFeatures = wf.map(w => {
          const obj = {};
          if (w.featureId !== undefined && w.featureId !== null) obj.featureId = w.featureId;
          if (w.baseline !== undefined && w.baseline !== null) obj.baseline = w.baseline;
          return obj;
        }).filter(o => Object.keys(o).length > 0);
      }
    }
    matches.push(entry);
  };

  const ft = (fileType || 'auto').toLowerCase();

  // Try parser-backed detection first
  let jsAstHandled = false;
  try {
    if (ft === 'js' || ft === 'javascript' || (ft === 'auto' && (!/^[\s\S]*<[^>]+>/.test(text) && /[\{\};]/.test(text)))) {
      const ok = parseJSWithAcorn(text, bcdIndex, addMatch);
      if (ok) {
        jsAstHandled = true;
        if (/\?\?/.test(text)) safeLookupByToken(bcdIndex, 'nullish-coalescing', ['api','javascript.builtins']).forEach(k => addMatch(k, '??', 0.95, 'js-operator'));
        if (/\?\./.test(text)) safeLookupByToken(bcdIndex, 'optional-chaining', ['api','javascript.builtins']).forEach(k => addMatch(k, '?.', 0.95, 'js-operator'));
        if (/#\w+/.test(text)) safeLookupByToken(bcdIndex, 'private-fields', ['api','javascript.builtins']).forEach(k => addMatch(k, '#private', 0.9, 'js-private-field'));
      }
    }

    if (ft === 'html' || (ft === 'auto' && /<\s*[a-zA-Z0-9-]+(?:\s|>)/.test(text))) parseHTMLWithParse5(text, bcdIndex, addMatch);
    if (ft === 'css' || (ft === 'auto' && /[{};:@]/.test(text))) parseCSSWithPostCSS(text, bcdIndex, addMatch);
  } catch (e) {
    // graceful fallback to regex heuristics
  }

  // line-by-line fallback heuristics (but conservative)
  const lines = String(text || '').split(/\r?\n/);
  const lookupByToken = (token, prefix) => safeLookupByToken(bcdIndex, token, prefix);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    let effective = ft;
    if (ft === 'auto') {
      if (/<[a-zA-Z0-9-]+\s*.*>/.test(line)) effective = 'html';
      else if (/^[a-zA-Z-]+\s*:/.test(line) || /@[-a-z]+/.test(line) || /::?[-a-z]+/.test(line)) effective = 'css';
      else effective = 'js';
    }

    // CSS heuristics (conservative)
    if (effective === 'css') {
      const propMatch = line.match(/^\s*([a-zA-Z-]+)\s*:\s*([^;{]+)/);
      if (propMatch) {
        const prop = normalizeIdentifier(propMatch[1]);
        const value = (propMatch[2] || '').trim().replace(/\s*!(?:important)?/i, '');
        // strict: match only exact last-segment property keys
        (bcdIndex.lastSegmentMap.get(prop) || []).filter(k => k.startsWith('css.properties')).forEach(k => addMatch(k, prop, 0.96, 'css-property'));

        if (value && valueParser) {
          const valTokens = splitTokens(value).filter(t => t.length >= 3);
          if (valTokens.length > 0) {
            for (const valToken of valTokens) {
              const candidates = [
                `css.properties.${prop}.value.${valToken}`,
                `css.properties.${prop}.values.${valToken}`,
                `css.properties.${prop}.${valToken}`,
              ];
              for (const c of candidates) if (bcdIndex.allKeys.includes(c)) addMatch(c, `${prop}:${valToken}`, 0.98, 'css-property-value');
            }
          }
        }
      }

      // functions/pseudos/atrules: but only if token length >=4 to avoid 'top' etc.
      const funcRegex = /([a-zA-Z-]+)\s*\(/g;
      let fm;
      while ((fm = funcRegex.exec(line))) {
        const fname = normalizeIdentifier(fm[1]);
        if (fname.length < 4) continue;
        lookupByToken(fname, 'css.functions').forEach(k => addMatch(k, fname, 0.9, 'css-function'));
      }

      const pseudoRegex = /(::?[a-zA-Z-]+)/g;
      let pm;
      while ((pm = pseudoRegex.exec(line))) {
        const pseudo = normalizeIdentifier(pm[1].replace(/^:+/, ''));
        if (pseudo.length < 3) continue;
        lookupByToken(pseudo, 'css.selectors').forEach(k => addMatch(k, pseudo, 0.92, 'css-pseudo'));
      }

      const atRuleMatch = line.match(/@([a-zA-Z-]+)/);
      if (atRuleMatch) {
        const at = normalizeIdentifier(atRuleMatch[1]);
        lookupByToken(at, 'css.at-rules').forEach(k => addMatch(k, at, 0.95, 'css-atrule'));
      }
    }

    // HTML heuristics
    if (effective === 'html') {
      const tagMatch = line.match(/<\s*([a-zA-Z0-9-]+)/);
      if (tagMatch) {
        const tag = normalizeIdentifier(tagMatch[1]);
        const keys = lookupByToken(tag, 'html.elements');
        const direct = keys.filter(k => {
          const segs = k.split('.');
          return segs.length >= 3 && segs[0] === 'html' && segs[1] === 'elements' && segs[2].toLowerCase() === tag;
        });
        const toUse = direct.length ? direct : keys;
        toUse.forEach(k => addMatch(k, tag, 0.95, 'html-tag'));
      }

      const attrRegex = /([a-zA-Z-:]+)(?:\s*=\s*["'{\[]|(?=\s|>))/g;
      let am;
      while ((am = attrRegex.exec(line))) {
        const attr = normalizeIdentifier(am[1]);
        if (attr.length < 3) continue;
        lookupByToken(attr, 'html.attributes').forEach(k => addMatch(k, attr, 0.9, 'html-attribute'));
      }

      const dotMethodRegex = /\.([A-Za-z_$][\w$]*)\s*\(/g;
      let dm;
      while ((dm = dotMethodRegex.exec(line))) {
        const method = normalizeIdentifier(dm[1]);
        if (method.length < 4) continue;
        const candidatesJsBuiltin = lookupByToken(method, ['javascript.builtins']);
        if (candidatesJsBuiltin && candidatesJsBuiltin.length) {
          // ensure candidate has method as last segment
          candidatesJsBuiltin.filter(k => isStrictLastSegmentMatch(k, method)).forEach(k => addMatch(k, method, 0.92, 'dom-method-jsbuiltin'));
        } else {
          lookupByToken(method, ['api']).forEach(k => { if (k.endsWith(method)) addMatch(k, method, 0.92, 'dom-method-api'); });
        }
      }
    }

    // JS heuristics
    if (effective === 'js') {
      if (!jsAstHandled) {
        const dotted = line.match(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)/g);
        if (dotted) dotted.forEach(d => {
          const parts = d.split('.');
          const exact = findExactChainKeys(bcdIndex, parts, ['api','javascript.builtins']);
          if (exact.length) exact.forEach(k => addMatch(k, parts.join('.'), 0.95, 'js-api-chain-exact-regex'));
          else {
            // do not fall back to generic normalized fullKey lookups; too noisy
          }
        });

        if (/\?\?/.test(line)) (lookupByToken('nullish-coalescing', ['api','javascript.builtins']) || []).forEach(k => addMatch(k, '??', 0.95, 'js-operator'));
        if (/\?\./.test(line)) lookupByToken('optional-chaining', ['api','javascript.builtins']).forEach(k => addMatch(k, '?.', 0.95, 'js-operator'));
        if (/#\w+/.test(line)) {
          const priv = line.match(/#([A-Za-z0-9_]+)/g);
          if (priv) priv.forEach(p => lookupByToken('private-fields', ['api','javascript.builtins']).forEach(k => addMatch(k, `#${p.replace('#', '')}`, 0.9, 'js-private-field')));
        }

        // builtin method token matches (but require >=5 chars to reduce false positives)
        const wordRegex = /[A-Za-z_$][\w$-]*/g;
        let w;
        while ((w = wordRegex.exec(line))) {
          const token = normalizeIdentifier(w[0]);
          if (token.length < 5) continue;
          const candidates = (bcdIndex.tokenMap.get(token) || []).filter(k => k.startsWith('javascript.builtins'));
          // require that last segment equals token (strict)
          candidates.filter(k => isStrictLastSegmentMatch(k, token)).forEach(k => addMatch(k, token, 0.85, 'js-builtin-method'));
        }

        // function calls: only short whitelist allowed; others require >=5
        const funcCallRegex = /([A-Za-z_$][\w$]*)\s*\(/g;
        let fc;
        const knownGlobalsShort = new Set(['fetch','console','require']);
        while ((fc = funcCallRegex.exec(line))) {
          const fn = normalizeIdentifier(fc[1]);
          if (fn.length >= 5 || knownGlobalsShort.has(fn)) {
            lookupByToken(fn, ['api','javascript.builtins']).filter(k => isStrictLastSegmentMatch(k, fn)).forEach(k => addMatch(k, fn, 0.9, 'js-global-function'));
          }
        }
      }
    }

    // spec-bundle fallback (very strict to avoid false positives)
    {
      // require tokens >= 5 chars — prioritize precision
      const tokens = splitTokens(line).filter(t => t.length >= 5);
      for (const t of tokens) {
        const specKeys = bcdIndex.segmentMap.get(t) || [];
        specKeys.forEach(k => { if (k.startsWith('web-features')) addMatch(k, t, 0.5, 'spec-bundle'); });
      }
    }
  }

  // Deduplicate by key, keep highest confidence
  const best = new Map();
  for (const m of matches) {
    const prev = best.get(m.key);
    if (!prev || (m.confidence || 0) > (prev.confidence || 0)) best.set(m.key, m);
  }

  return Array.from(best.values()).sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
}

module.exports = { createBCDIndex, matchLineToFeatures };
