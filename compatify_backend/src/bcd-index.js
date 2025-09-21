// bcd-index.js (parser-backed) - patched for safer token matching / heuristics
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

/* ------------ Utilities (same as before, minor tweak) ------------ */

function isFeatureNode(obj) { return obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, '__compat'); }
function normalizeIdentifier(s) { return (s || '').toLowerCase().replace(/[^a-z0-9-_]/g, ''); }
// keep hyphens/underscores in tokens (helpful for CSS props), but guard where we apply token lookups later
function splitTokens(s) { return (s || '').split(/[^a-z0-9\-_]+/i).map(t => t.toLowerCase()).filter(Boolean); }

/* ------------ Improved safe lookup (fixes loose token matching + namespace heuristics) ------------ */

/**
 * safeLookupByToken(bcdIndex, token, prefix)
 * - token: string token to look up
 * - prefix: optional string or array of prefixes to restrict (e.g. 'html.elements' or ['api','javascript.builtins'])
 *
 * Behavior changes:
 *  - Prefer exact last-segment matches first (high precision).
 *  - If last-segment matches exist, return those (filtered by prefix if provided).
 *  - Otherwise, when searching token/segment maps, prefer keys where token appears close to the tail
 *    (within the last 2 segments) to avoid distant false positives.
 *  - Add special-case filtering for common namespaces (e.g. 'html.elements') so tags match direct element keys.
 */
function safeLookupByToken(bcdIndex, token, prefix) {
  const lower = normalizeIdentifier(token);
  if (!lower) return [];
  const prefixes = Array.isArray(prefix) ? prefix : (prefix ? [prefix] : null);

  const applyPrefixesFilter = (keys) => {
    if (!prefixes || !prefixes.length) return keys;
    return keys.filter(k => prefixes.some(p => k.startsWith(p)));
  };

  // 1) exact last-segment matches
  const byLast = bcdIndex.lastSegmentMap.get(lower) || [];
  const lastFiltered = applyPrefixesFilter(byLast);
  if (lastFiltered.length) return Array.from(new Set(lastFiltered));

  // 2) candidates from tokenMap & segmentMap
  let candidates = Array.from(new Set([
    ...(bcdIndex.tokenMap.get(lower) || []),
    ...(bcdIndex.segmentMap.get(lower) || [])
  ]));
  if (prefixes && prefixes.length) candidates = applyPrefixesFilter(candidates);

  // 3) prefer tail matches
  const tailPreferred = [], tailAllowed = [];
  const N = 2;
  for (const k of candidates) {
    const segs = k.split('.');
    const tail = segs.slice(-N).map(s => s.toLowerCase());
    (tail.includes(lower) ? tailPreferred : tailAllowed).push(k);
  }

  let result = tailPreferred.length ? tailPreferred : tailAllowed;

  // 4) HTML element special case
  if (prefixes?.includes('html.elements')) {
    const directElements = result.filter(k => {
      const segs = k.split('.');
      return segs.length >= 3 && segs[0] === 'html' && segs[1] === 'elements' && segs[2].toLowerCase() === lower;
    });
    if (directElements.length) return Array.from(new Set(directElements));
  }

  return Array.from(new Set(result));
}

/* ------------ Flatten BCD (same) ------------ */
function flattenBCD(obj, path = [], out = []) {
  if (isFeatureNode(obj)) out.push({ key: path.join('.'), node: obj });
  for (const k of Object.keys(obj)) {
    if (k === '__compat') continue;
    const child = obj[k];
    if (child && typeof child === 'object') flattenBCD(child, path.concat(k), out);
  }
  return out;
}

/* ------------ Create Index (same) ------------ */
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
    // tokens: split each path segment on - and _ to populate tokenMap
    const tokens = last.toLowerCase().split(/[-_]/).filter(Boolean);
    tokens.forEach(t => pushTo(tokenMap, t, key));
    parts.forEach(p => pushTo(segmentMap, p.toLowerCase(), key));
  }

  /* ----------------- web-features baseline-aware mapping ----------------- */
  const bcdToWebFeatures = new Map();

  if (webFeatures) {
    // support both exports: webFeatures.features (object) or webFeatures as collection
    const featuresCollectionRoot = webFeatures.features || webFeatures;
    // get keys array as you requested
    const wfKeys = featuresCollectionRoot
      ? (typeof featuresCollectionRoot.get === 'function' ? [...featuresCollectionRoot.keys()] : Object.keys(featuresCollectionRoot))
      : [];
    const wfKeySet = new Set(wfKeys.map(k => String(k).toLowerCase()));

    // heuristics: from BCD key produce candidate baseline feature keys (kebab-case variants)
    function inferBaselineCandidates(bcdKey) {
      if (!bcdKey || typeof bcdKey !== 'string') return [];
      const parts = bcdKey.split('.').filter(Boolean).map(p => p.toLowerCase());
      const last = parts[parts.length - 1] || '';
      const candidates = new Set();

      // straightforward possibilities
      candidates.add(last); // e.g. "embed", "em"
      if (parts.length >= 2) candidates.add(`${parts[parts.length - 2]}-${last}`); // e.g. "element-timing"
      // some broader combos
      for (let i = Math.max(0, parts.length - 3); i < parts.length; i++) {
        candidates.add(parts.slice(i).join('-')); // tail joins
      }
      // full key with dashes
      candidates.add(parts.join('-'));

      // common namespace heuristics
      if (parts.includes('elements')) candidates.add(`element-${last}`); // html.elements.foo => element-foo
      if (parts.includes('properties')) candidates.add(last); // css.properties.font-size => font-size
      if (parts.includes('values')) candidates.add(last);
      if (parts.includes('selectors')) candidates.add(last);
      if (parts.includes('methods') && parts.length >= 2) candidates.add(parts.slice(-2).join('-')); // e.g. "array-find" fallback

      // normalize candidates (remove empties)
      return Array.from(candidates).map(s => String(s).toLowerCase()).filter(Boolean);
    }

    function baselineExistsForBCDKey(bcdKey) {
      const candidates = inferBaselineCandidates(bcdKey);
      for (const c of candidates) {
        if (wfKeySet.has(c)) return c; // return the first matching baseline key
      }
      return null;
    }

    // When iterating web-features, only collect mappings where a baseline key exists
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
          if (!baselineMatch) return; // <-- only collect when baseline feature key exists in web-features
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
  // parts: array of tokens in original case (e.g. ['Array','find'])
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
      // prefer keys where penultimate equals ownerHint; otherwise accept if owner occurs anywhere
      if (penultimate) {
        if (penultimate === ownerLower) return true;
      }
      // fallback: accept if owner appears anywhere
      if (segs.map(s => s.toLowerCase()).includes(ownerLower)) return true;
      // if requireOwner is true, disallow if not matched
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


/* JS: acorn-based AST traversal with light-weight type inference and stricter single-token rules */
function parseJSWithAcorn(code, bcdIndex, addMatch) {
  if (!acorn || !walkAcorn) return false;
  let ast;
  try {
    ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true });
  } catch (e) {
    try { ast = acorn.parse(code, { ecmaVersion: 2020, sourceType: 'module' }); } catch (_) { return false; }
  }

  // varTypes: map identifier -> inferred constructor/owner (e.g. 'Array', 'Int32Array', 'TypedArray', 'Map', etc.)
  const varTypes = new Map();
  // identifiers that are part of a member chain we already handled; prevents identifier visitor duplicates
  const seenIdentifiersInChains = new Set();

    // usage inside parseJSWithAcorn
    const baseType = varTypes.get(base) || (base === 'Array' ? 'Array' : null);
    if (!baseType && /^[A-Z]/.test(base) && base.toLowerCase() !== 'arguments') {
    baseType = canonicalOwnerFromCtor(base);
    }

  // Populate varTypes by looking for common initializers
  walkAcorn.simple(ast, {
    VariableDeclarator(node) {
      try {
        if (!node.id || node.id.type !== 'Identifier') return;
        const name = node.id.name;
        const init = node.init;
        if (!init) return;
        if (init.type === 'ArrayExpression') {
          varTypes.set(name, 'Array');
        } else if (init.type === 'NewExpression' && init.callee && init.callee.type === 'Identifier') {
          const ctor = init.callee.name;
          varTypes.set(name, canonicalOwnerFromCtor(ctor));
        } else if (init.type === 'CallExpression' && init.callee) {
          // Array.from(...) or Array.of(...)
          if (init.callee.type === 'MemberExpression' && init.callee.object && init.callee.object.name === 'Array') {
            varTypes.set(name, 'Array');
          } else if (init.callee.type === 'Identifier' && init.callee.name === 'Array') {
            varTypes.set(name, 'Array');
          }
        } else if (init.type === 'Identifier' && init.name === 'document') {
          varTypes.set(name, 'Document');
        }
      } catch (e) { /* ignore */ }
    },
    AssignmentExpression(node) {
      try {
        if (node.left && node.left.type === 'Identifier' && node.right) {
          const name = node.left.name;
          const right = node.right;
          if (right.type === 'ArrayExpression') varTypes.set(name, 'Array');
          else if (right.type === 'NewExpression' && right.callee && right.callee.type === 'Identifier') varTypes.set(name, canonicalOwnerFromCtor(right.callee.name));
          else if (right.type === 'CallExpression' && right.callee && right.callee.type === 'MemberExpression' && right.callee.object && right.callee.object.name === 'Array') varTypes.set(name, 'Array');
        }
      } catch (e) {}
    }
  });

  const lookupAndAdd = (parts, opts = {}) => {
    // opts: { reason, confidence, allowSingle, ownerHint, requireOwner }
    const reason = opts.reason || 'js-ast';
    const confidence = typeof opts.confidence === 'number' ? opts.confidence : 0.95;
    const allowSingle = !!opts.allowSingle;
    let ownerHint = opts.ownerHint || null;
    const requireOwner = !!opts.requireOwner;

    const partsArr = Array.isArray(parts) ? parts.slice() : String(parts).split('.').filter(Boolean);
    if (!partsArr.length) return;

    // Safety: avoid weird fallback for "arguments" base (arguments.callee -> Function.arguments is false positive)
    if (partsArr[0] && partsArr[0].toLowerCase() === 'arguments') {
      // There's no reliable BCD mapping for arguments.callee; skip fallback mapping.
      // However, still attempt any exact match if present.
      const exactAttempt = findExactChainKeys(bcdIndex, partsArr, ['api','javascript.builtins']);
      if (exactAttempt && exactAttempt.length) exactAttempt.forEach(k => addMatch(k, partsArr.join('.'), Math.max(confidence, 0.96), `${reason}-exact`));
      return;
    }

    // Prefer exact chain matches — attempt with ownerHint first (if provided)
    if (ownerHint) {
      const exactWithOwner = findExactChainKeys(bcdIndex, partsArr, ['api','javascript.builtins'], ownerHint, true);
      if (exactWithOwner.length) {
        exactWithOwner.forEach(k => addMatch(k, partsArr.join('.'), Math.max(confidence, 0.96), `${reason}-exact-owner`));
        return;
      }
      // if requireOwner was set and we didn't find it, stop early
      if (requireOwner) return;
    }

    const exact = findExactChainKeys(bcdIndex, partsArr, ['api','javascript.builtins']);
    if (exact && exact.length) {
      exact.forEach(k => addMatch(k, partsArr.join('.'), Math.max(confidence, 0.96), `${reason}-exact`));
      return;
    }

    // If chain has length > 1, try contextual lookup using inferred base type
    if (partsArr.length > 1) {
      const base = partsArr[0];
      const member = partsArr[partsArr.length - 1];
      let baseType = varTypes.get(base) || (base === 'Array' ? 'Array' : null);

      // IMPROVEMENT: If base looks like a constructor/namespace (capitalized), treat as owner hint.
      // But explicitly avoid treating 'arguments' as a constructor.
      if (!baseType && /^[A-Z]/.test(base) && base.toLowerCase() !== 'arguments') {
        baseType = canonicalOwnerFromCtor(base);
      }

      if (baseType) {
        const canonicalOwner = canonicalOwnerFromCtor(baseType);
        // find keys where member token appears and owner's segment is present near tail
        const keysForMember = (bcdIndex.tokenMap.get(member.toLowerCase()) || []).filter(k => {
          const seg = k.split('.');
          // accept if owner appears anywhere in the path (prefer near tail)
          return seg.some(s => s.toLowerCase() === canonicalOwner.toLowerCase() || s.toLowerCase() === base.toLowerCase());
        });

        if (keysForMember.length) {
          keysForMember.forEach(k => addMatch(k, member, Math.max(confidence, 0.94), `${reason}-context`));
          return;
        }
      }
    }

    // Single-part tokens: only allow if explicitly allowed (call context) or ownerHint is present (we'll try owner-aware exact above)
    if (partsArr.length === 1 && !allowSingle) return; 

    // Final fallback (lower confidence) - use safeLookupByToken but limited to JS/API namespaces and require token length >= 3
    const last = partsArr[partsArr.length - 1];
    if (String(last).length < 3) return;
    const keys = safeLookupByToken(bcdIndex, last, ['api', 'javascript.builtins']);
    keys.forEach(k => addMatch(k, last, confidence * 0.9, `${reason}-fallback`));
  };

  // traverse for MemberExpression, CallExpression, OptionalChain, BinaryOperators, Identifiers
  walkAcorn.simple(ast, {
    MemberExpression(node) {
      try {
        const parts = [];
        let cur = node;
        // owner hint detection
        let ownerHint = null;
        while (cur && (cur.type === 'MemberExpression' || cur.type === 'Identifier' || cur.type === 'ThisExpression' || cur.type === 'ArrayExpression' || cur.type === 'NewExpression')) {
          if (cur.type === 'MemberExpression') {
            if (cur.property && (cur.property.name || (cur.property.value && typeof cur.property.value === 'string'))) {
              parts.unshift(cur.property.name || cur.property.value);
            }
            // detect owner if object is array literal or new expression
            if (cur.object && cur.object.type === 'ArrayExpression') ownerHint = 'Array';
            if (cur.object && cur.object.type === 'NewExpression' && cur.object.callee && cur.object.callee.type === 'Identifier') ownerHint = canonicalOwnerFromCtor(cur.object.callee.name);
            // mark identifier names seen so identifier visitor can skip
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
          } else break;
        }
        if (parts.length) lookupAndAdd(parts, { reason: 'js-api-chain', confidence: 0.96, ownerHint: ownerHint || null });
      } catch (e) { /* ignore */ }
    },
    CallExpression(node) {
      if (node.callee) {
        if (node.callee.type === 'Identifier') {
          // global function call like fetch(...) — allow single-token matching
          lookupAndAdd([node.callee.name], { reason: 'js-global-function', confidence: 0.9, allowSingle: true });
        } else if (node.callee.type === 'MemberExpression') {
          try {
            // attempt to extract full chain if possible (e.g. Array.from)
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
      if (node.name && node.name.length >= 3) {
        // suppress identifier-only matches if this identifier was part of a member chain we already handled
        if (seenIdentifiersInChains.has(node.name)) return;
        // standalone identifier — treat as lower-confidence and do NOT allow single-token builtins unless in call context
        // We still attempt identifier matches but using lookupAndAdd with allowSingle=false (so it won't do single-token fallback)
        lookupAndAdd([node.name], { reason: 'js-identifier', confidence: 0.8, allowSingle: false });
      }
    },
    PrivateIdentifier(node) {
      if (node.name) {
        const keys = safeLookupByToken(bcdIndex, 'private-fields', ['api', 'javascript.builtins']);
        keys.forEach(k => addMatch(k, 'private-fields', 0.9, 'js-private-field'));
      }
    },
    VariableDeclarator(node) {
      // duplicate inference to be safe (keeps varTypes updated)
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

/* HTML: parse5-based traversal (improved: prefer direct element keys) */
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
          // be conservative when tokenizing attribute values: avoid very short tokens
          const tokens = splitTokens(a.value).filter(t => t.length >= 3);
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

/* CSS: postcss-based parsing (safer value handling; avoid broad lookups on small tokens) */
function parseCSSWithPostCSS(cssText, bcdIndex, addMatch) {
  if (!postcss) return false;
  let root;
  try { root = postcss.parse(cssText); } catch (e) { return false; }

  root.walk(node => {
    if (node.type === 'decl') {
      const prop = normalizeIdentifier(node.prop || '');
      const keys = safeLookupByToken(bcdIndex, prop, 'css.properties');
      keys.forEach(k => addMatch(k, prop, 0.97, 'css-property'));

      // For values, be explicit: try property-specific value keys first (high confidence).
      // Avoid performing a broad safeLookup across the entire 'css' namespace for every small token.
    if (node.value && valueParser) {
    const parsed = valueParser(node.value);
    parsed.walk(n => {
        if (n.type === 'word') {
        const tok = normalizeIdentifier(n.value);
        if (tok.length >= 2) {
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
      safeLookupByToken(bcdIndex, at, 'css.at-rules').forEach(k => addMatch(k, at, 0.95, 'css-atrule'));
    } else if (node.type === 'rule') {
      const sel = node.selector || '';
      const pseudoMatches = sel.match(/::?:[a-zA-Z-]+/g) || [];
      pseudoMatches.forEach(p => {
        const pseudo = normalizeIdentifier(p.replace(/^:+/, ''));
        safeLookupByToken(bcdIndex, pseudo, 'css.selectors').forEach(k => addMatch(k, pseudo, 0.92, 'css-pseudo'));
      });
    }
  });

  return true;
}

/* ------------ Line(s) matcher (main) ------------ */

/**
 * matchLineToFeatures
 *  - Accepts a line or a multi-line string (will parse every line)
 *  - fileType: 'auto'|'css'|'html'|'js'|'javascript'
 *  - bcdIndex: result of createBCDIndex()
 *  - options: { enableMinConfidence: boolean, minConfidence: number }
 *
 * Returns: [{ key: 'css.properties.foo', match: 'foo', confidence: 0.95, reason: 'css-property', baseline: 'high', featureId: 'foo-feature' }, ...]
 */
function matchLineToFeatures(text, fileType = 'auto', bcdIndex, options = {}) {
  if (!bcdIndex) throw new Error('bcdIndex required - call createBCDIndex() first');

  const matches = [];

  // only allow these baseline values (explicit false or 'low' or 'high')
  const allowedBaselines = new Set([false, 'low', 'high']);

  // options for min-confidence filter
  const enableMinConfidence = !!options.enableMinConfidence;
  const minConfidence = typeof options.minConfidence === 'number' ? options.minConfidence : 0.85;

  const addMatch = (key, match, confidence, reason) => {
    if (!key) return;

    // enforce optional min confidence
    if (enableMinConfidence && (typeof confidence !== 'number' || confidence < minConfidence)) return;

    const wf = bcdIndex.bcdToWebFeatures.get(key) || [];

    const entry = { key, match, confidence, reason };

    if (wf.length) {
      const pick = wf[0];

      if (pick.baseline !== undefined && pick.baseline !== null) {
        entry.baseline = pick.baseline;
      }

      if (pick.featureId !== undefined && pick.featureId !== null) {
        entry.featureId = pick.featureId;
      }

      if (wf.length > 1) {
        entry.webFeatures = wf
          .map(w => {
            const obj = {};
            if (w.featureId !== undefined && w.featureId !== null) obj.featureId = w.featureId;
            if (w.baseline !== undefined && w.baseline !== null) obj.baseline = w.baseline;
            return obj;
          })
          .filter(o => Object.keys(o).length > 0);
      }
    }

    matches.push(entry);
  };


  const ft = (fileType || 'auto').toLowerCase();

  // Try parser-backed detection first when appropriate and available
  let jsAstHandled = false;
  try {
    if (ft === 'js' || ft === 'javascript' || (ft === 'auto' && (!/^[\s\S]*<[^>]+>/.test(text) && /[\{\};]/.test(text)))) {
      const ok = parseJSWithAcorn(text, bcdIndex, addMatch);
      if (ok) {
        jsAstHandled = true;
        // operators & private fields: restrict to JS/API namespaces
        if (/\?\?/.test(text)) safeLookupByToken(bcdIndex, 'nullish-coalescing', ['api','javascript.builtins']).forEach(k => addMatch(k, '??', 0.95, 'js-operator'));
        if (/\?\./.test(text)) safeLookupByToken(bcdIndex, 'optional-chaining', ['api','javascript.builtins']).forEach(k => addMatch(k, '?.', 0.95, 'js-operator'));
        if (/#\w+/.test(text)) safeLookupByToken(bcdIndex, 'private-fields', ['api','javascript.builtins']).forEach(k => addMatch(k, '#private', 0.9, 'js-private-field'));
      } else {
        // fall through to regex-line heuristics below
      }
    }

    if (ft === 'html' || (ft === 'auto' && /<\s*[a-zA-Z0-9-]+(?:\s|>)/.test(text))) {
      const ok = parseHTMLWithParse5(text, bcdIndex, addMatch);
      if (!ok) {
        // continue to regex fallback
      }
    }

    if (ft === 'css' || (ft === 'auto' && /[{};:@]/.test(text))) {
      const ok = parseCSSWithPostCSS(text, bcdIndex, addMatch);
      if (!ok) {
        // continue to regex fallback
      }
    }
  } catch (e) {
    // parser may throw for weird code — we'll gracefully fall back to line-level heuristics below
  }

  // Fallback: original line-by-line heuristics (keeps previous behavior)
  // NOTE: If JS AST parsing succeeded, skip JS heuristics to avoid noisy fallback hits.
  const lines = String(text || '').split(/\r?\n/);
  const lookupByToken = (token, prefix) => safeLookupByToken(bcdIndex, token, prefix);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // quick file-type detection if auto
    let effective = ft;
    if (ft === 'auto') {
      if (/<[a-zA-Z0-9-]+\s*.*>/.test(line)) effective = 'html';
      else if (/^[a-zA-Z-]+\s*:/.test(line) || /@[-a-z]+/.test(line) || /::?[-a-z]+/.test(line)) effective = 'css';
      else effective = 'js';
    }

    // CSS heuristics
    if (effective === 'css') {
      const propMatch = line.match(/^\s*([a-zA-Z-]+)\s*:\s*([^;{]+)/);
      if (propMatch) {
        const prop = normalizeIdentifier(propMatch[1]);
        const value = (propMatch[2] || '').trim().replace(/\s*!(?:important)?/i, '');
        lookupByToken(prop, 'css.properties').forEach(k => addMatch(k, prop, 0.96, 'css-property'));

        if (value) {
          // Be conservative: only attempt property-specific value candidates (already implemented in parseCSSWithPostCSS)
          const valTokens = splitTokens(value).filter(t => t.length >= 2);
          if (valTokens.length > 0) {
            const valToken = valTokens[0];
            const candidates = [
              `css.properties.${prop}.value.${valToken}`,
              `css.properties.${prop}.values.${valToken}`,
              `css.properties.${prop}.${valToken}`,
            ];
            for (const c of candidates) if (bcdIndex.allKeys.includes(c)) addMatch(c, `${prop}:${valToken}`, 0.98, 'css-property-value');
          }
        }
      }

      const funcRegex = /([a-zA-Z-]+)\s*\(/g;
      let fm;
      while ((fm = funcRegex.exec(line))) {
        const fname = normalizeIdentifier(fm[1]);
        lookupByToken(fname, 'css.functions').forEach(k => addMatch(k, fname, 0.9, 'css-function'));
      }

      const pseudoRegex = /(::?[a-zA-Z-]+)/g;
      let pm;
      while ((pm = pseudoRegex.exec(line))) {
        const pseudo = normalizeIdentifier(pm[1].replace(/^:+/, ''));
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
        // prefer direct element key if present
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
        lookupByToken(attr, 'html.attributes').forEach(k => addMatch(k, attr, 0.9, 'html-attribute'));
      }

      const dotMethodRegex = /\.([A-Za-z_$][\w$]*)\s*\(/g;
      let dm;
      while ((dm = dotMethodRegex.exec(line))) {
        const method = normalizeIdentifier(dm[1]);
        lookupByToken(method, 'api').forEach(k => { if (k.endsWith(method)) addMatch(k, method, 0.92, 'dom-method'); });
      }
    }

    // JS heuristics (regex fallback when parser unavailable)
    if (effective === 'js') {
      if (jsAstHandled) {
        // Skip regex-based JS heuristics when AST parsing succeeded — prevents noisy fallback matches
      } else {
        const dotted = line.match(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)/g);
        if (dotted) dotted.forEach(d => {
          const parts = d.split('.');
          // Prefer exact chain keys when possible
          const exact = findExactChainKeys(bcdIndex, parts, ['api']);
          if (exact.length) exact.forEach(k => addMatch(k, parts.join('.'), 0.95, 'js-api-chain-exact-regex'));
          else {
            const fullKey = normalizeIdentifier(parts.join('.'));
            lookupByToken(fullKey, 'api').forEach(k => addMatch(k, fullKey, 0.95, 'js-api-chain'));
          }
        });

        if (/\?\?/.test(line)) {
          (lookupByToken('nullish-coalescing', ['api','javascript.builtins']) || []).forEach(k => addMatch(k, '??', 0.95, 'js-operator'));
        }
        if (/\?\./.test(line)) lookupByToken('optional-chaining', ['api','javascript.builtins']).forEach(k => addMatch(k, '?.', 0.95, 'js-operator'));
        if (/#\w+/.test(line)) {
          const priv = line.match(/#([A-Za-z0-9_]+)/g);
          if (priv) priv.forEach(p => lookupByToken('private-fields', ['api','javascript.builtins']).forEach(k => addMatch(k, `#${p.replace('#', '')}`, 0.9, 'js-private-field')));
        }

        const wordRegex = /[A-Za-z_$][\w$-]*/g;
        let w;
        while ((w = wordRegex.exec(line))) {
          const token = normalizeIdentifier(w[0]);
          if (token.length < 3) continue;
          lookupByToken(token, 'javascript.builtins').forEach(k => addMatch(k, token, 0.85, 'js-builtin-method'));
        }

        const funcCallRegex = /([A-Za-z_$][\w$]*)\s*\(/g;
        let fc;
        while ((fc = funcCallRegex.exec(line))) {
          const fn = normalizeIdentifier(fc[1]);
          lookupByToken(fn, 'api').forEach(k => addMatch(k, fn, 0.9, 'js-global-function'));
        }
      }
    }

    // spec-bundle fallback
    {
      // be conservative: only consider longer tokens for this broad fallback to avoid small-word false positives (e.g. "any")
      const tokens = splitTokens(line).filter(t => t.length >= 4);
      for (const t of tokens) {
        const specKeys = bcdIndex.segmentMap.get(t) || [];
        specKeys.forEach(k => { if (k.startsWith('web-features')) addMatch(k, t, 0.6, 'spec-bundle'); });
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
