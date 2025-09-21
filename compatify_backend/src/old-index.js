// bcd-index.js (parser-backed)
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

/* ------------ Utilities (same as before) ------------ */

function isFeatureNode(obj) { return obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, '__compat'); }
function normalizeIdentifier(s) { return (s || '').toLowerCase().replace(/[^a-z0-9-_]/g, ''); }
function splitTokens(s) { return (s || '').split(/[^a-z0-9\-_]+/i).map(t => t.toLowerCase()).filter(Boolean); }
function safeLookupByToken(bcdIndex, token, prefix) {
  const lower = normalizeIdentifier(token);
  const byLast = bcdIndex.lastSegmentMap.get(lower) || [];
  let keys = [];
  if (byLast.length) {
    keys = byLast.slice();
  } else {
    const byToken = bcdIndex.tokenMap.get(lower) || [];
    const bySegment = bcdIndex.segmentMap.get(lower) || [];
    keys = Array.from(new Set([...byToken, ...bySegment]));
  }

  if (!prefix) return keys;
  const prefixes = Array.isArray(prefix) ? prefix : [prefix];
  return keys.filter(k => prefixes.some(p => k.startsWith(p)));
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
    const tokens = last.toLowerCase().split(/[-_]/).filter(Boolean);
    tokens.forEach(t => pushTo(tokenMap, t, key));
    parts.forEach(p => pushTo(tokenMap, p.toLowerCase(), key));
    parts.forEach(p => pushTo(segmentMap, p.toLowerCase(), key));
  }

  // map BCD -> web-features (best-effort)
  const bcdToWebFeatures = new Map();
  if (webFeatures && webFeatures.features) {
    const featuresCollection = Array.isArray(webFeatures.features)
      ? webFeatures.features
      : Object.values(webFeatures.features || {});
    for (const feature of featuresCollection) {
      const featureId = feature.id || feature.featureId || feature.name || null;
      const baseline = feature.status && feature.status.baseline ? feature.status.baseline : null;
      const compat = feature.compat_features || feature.compat || feature.compatFeatures || [];
      for (const c of compat) {
        const collect = key => {
          if (!key) return;
          const prev = bcdToWebFeatures.get(key) || [];
          prev.push({ featureId, baseline, feature });
          bcdToWebFeatures.set(key, prev);
        };
        if (typeof c === 'string') collect(c);
        else if (c && typeof c === 'object') {
          if (c.bcd) {
            if (typeof c.bcd === 'string') collect(c.bcd);
            else if (Array.isArray(c.bcd)) c.bcd.forEach(collect);
          }
          if (c.bcd_key) collect(c.bcd_key);
          if (c.bcd_keys && Array.isArray(c.bcd_keys)) c.bcd_keys.forEach(collect);
          if (c.compat && c.compat.bcd) {
            if (typeof c.compat.bcd === 'string') collect(c.compat.bcd);
            else if (Array.isArray(c.compat.bcd)) c.compat.bcd.forEach(collect);
          }
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

function isTypedArrayConstructor(name) {
  if (!name) return false;
  return /^(int|uint|float|big)(8|16|32|64)?array$/i.test(name) || /^(Int8Array|Int16Array|Int32Array|Uint8Array|Uint16Array|Uint32Array|Float32Array|Float64Array|BigInt64Array|BigUint64Array)$/i.test(name);
}

function canonicalOwnerFromCtor(name) {
  if (!name) return null;
  if (isTypedArrayConstructor(name)) return 'TypedArray';
  const n = name.toLowerCase();
  if (n === 'array') return 'Array';
  if (n === 'map') return 'Map';
  if (n === 'set') return 'Set';
  if (n === 'string') return 'String';
  if (n === 'iterator') return 'Iterator';
  return name; // fallback: constructor name
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

    const varTypes = new Map();
    const seenIdentifiersInChains = new Set();

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
        const reason = opts.reason || 'js-ast';
        const confidence = typeof opts.confidence === 'number' ? opts.confidence : 0.95;
        const allowSingle = !!opts.allowSingle;
        const ownerHint = opts.ownerHint || null;
        const requireOwner = !!opts.requireOwner;

        const partsArr = Array.isArray(parts) ? parts.slice() : String(parts).split('.').filter(Boolean);
        if (!partsArr.length) return;

        if (ownerHint) {
            const exactWithOwner = findExactChainKeys(bcdIndex, partsArr, ['api','javascript.builtins'], ownerHint, true);
            if (exactWithOwner.length) {
                exactWithOwner.forEach(k => addMatch(k, partsArr.join('.'), Math.max(confidence, 0.96), `${reason}-exact-owner`));
                return;
            }
            if (requireOwner) return;
        }

        const exact = findExactChainKeys(bcdIndex, partsArr, ['api','javascript.builtins']);
        if (exact && exact.length) {
            exact.forEach(k => addMatch(k, partsArr.join('.'), Math.max(confidence, 0.96), `${reason}-exact`));
            return;
        }

        if (partsArr.length > 1) {
            const base = partsArr[0];
            const member = partsArr[partsArr.length - 1];
            const baseType = varTypes.get(base) || (base === 'Array' ? 'Array' : null);
            if (baseType) {
                const canonicalOwner = canonicalOwnerFromCtor(baseType);
                const keys = (bcdIndex.tokenMap.get(member.toLowerCase()) || []).filter(k => {
                    const seg = k.split('.');
                    return seg.some(s => s.toLowerCase() === canonicalOwner.toLowerCase() || s.toLowerCase() === base.toLowerCase());
                });
                if (keys.length) {
                    keys.forEach(k => addMatch(k, member, Math.max(confidence, 0.94), `${reason}-context`));
                    return;
                }
            }
        }

        if (partsArr.length === 1 && !allowSingle) return;

        const last = partsArr[partsArr.length - 1];
        const keys = safeLookupByToken(bcdIndex, last, ['api', 'javascript.builtins']);
        keys.forEach(k => addMatch(k, last, confidence * 0.9, `${reason}-fallback`));
    };

    walkAcorn.simple(ast, {
        ForOfStatement(node) {
            if (node.await === true) {
                addMatch('javascript.statements.for-await-of', 'for-await-of', 1.0, 'js-syntax');
            }
        },
        FunctionDeclaration(node) {
            if (node.async && node.generator) {
                addMatch('javascript.statements.async_generator_function', 'async-generator', 1.0, 'js-syntax');
            }
        },
        FunctionExpression(node) {
            if (node.async && node.generator) {
                addMatch('javascript.statements.async_generator_function', 'async-generator', 1.0, 'js-syntax');
            }
        },
        MemberExpression(node) {
            try {
                if (node.object && node.object.type === 'Identifier' && node.object.name === 'arguments' &&
                    node.property && node.property.type === 'Identifier' && node.property.name === 'callee') {
                    addMatch('javascript.functions.arguments.callee', 'arguments.callee', 1.0, 'js-syntax-property');
                    return;
                }

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
                    } else break;
                }
                if (parts.length) lookupAndAdd(parts, { reason: 'js-api-chain', confidence: 0.96, ownerHint: ownerHint || null });
            } catch (e) { /* ignore */ }
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
            if (node.name && node.name.length >= 3) {
                if (seenIdentifiersInChains.has(node.name)) return;
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

/* HTML: parse5-based traversal */
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
        keys.forEach(k => addMatch(k, tag, 0.95, 'html-tag'));
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
          const tokens = splitTokens(a.value);
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

/* CSS: postcss-based parsing */
function parseCSSWithPostCSS(cssText, bcdIndex, addMatch) {
    if (!postcss) return false;
    let root;
    try { root = postcss.parse(cssText); } catch (e) { return false; }

    root.walk(node => {
        if (node.type === 'decl') {
            // UPDATED: Strip vendor prefixes for more reliable lookups
            const prop = normalizeIdentifier(node.prop || '').replace(/^-(\w+)-/, '');
            const keys = safeLookupByToken(bcdIndex, prop, 'css.properties');
            keys.forEach(k => addMatch(k, prop, 0.97, 'css-property'));

            if (node.value && valueParser) {
                const parsed = valueParser(node.value);
                parsed.walk(n => {
                    if (n.type === 'word') {
                        const tok = normalizeIdentifier(n.value);
                        const candidates = [
                            `css.properties.${prop}.value.${tok}`,
                            `css.properties.${prop}.values.${tok}`,
                            `css.properties.${prop}.${tok}`,
                            `css.properties.${prop}.${tok}_value`,
                        ];
                        candidates.forEach(c => {
                            if (bcdIndex.allKeys.includes(c)) addMatch(c, `${prop}:${tok}`, 0.98, 'css-property-value');
                        });
                        const generic = safeLookupByToken(bcdIndex, tok, ['css', 'web-animation']);
                        generic.forEach(k => addMatch(k, tok, 0.7, 'css-value-token'));
                    } else if (n.type === 'function') {
                        const fname = normalizeIdentifier(n.value);
                        safeLookupByToken(bcdIndex, fname, 'css.functions').forEach(k => addMatch(k, fname, 0.92, 'css-function'));
                    }
                });
            }
        } else if (node.type === 'atrule') {
            const at = normalizeIdentifier(node.name || '');
            safeLookupByToken(bcdIndex, at, 'css.at-rules').forEach(k => addMatch(k, at, 0.95, 'css-atrule'));

            // NEW: Detect compound features like `@import ... layer()`
            if (node.name === 'import' && node.params && node.params.includes('layer(')) {
                safeLookupByToken(bcdIndex, 'layer', 'css.at-rules').forEach(k => addMatch(k, '@import-layer', 0.96, 'css-atrule-compound'));
            }
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

    // Only accept matches that are registered in web-features baseline and whose baseline is allowed
    const wf = bcdIndex.bcdToWebFeatures.get(key) || [];
    // filter to only baseline-registered entries with allowed baseline values
    const filtered = wf.filter(w => allowedBaselines.has(w.baseline));
    if (!filtered.length) {
      // not part of baseline or baseline not in allowed set — skip
      return;
    }

    const entry = { key, match, confidence, reason };

    // pick the first allowed baseline mapping and attach the allowed mappings summary
    const pick = filtered[0];
    entry.baseline = pick.baseline;
    entry.featureId = pick.featureId || null;
    if (filtered.length > 1) entry.webFeatures = filtered.map(w => ({ featureId: w.featureId, baseline: w.baseline }));

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
          const valTokens = splitTokens(value);
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
        lookupByToken(tag, 'html.elements').forEach(k => addMatch(k, tag, 0.95, 'html-tag'));
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
      const tokens = splitTokens(line);
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
