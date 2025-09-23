// tests.js
const { createBCDIndex, matchLineToFeatures } = require('./bcd-index');

function runTests(options = { fields: ['key', 'confidence', 'baseline'] }) {
  const index = createBCDIndex();

const samples = [
    // -------------------- JS features --------------------
    { desc: "JS: Array.prototype.group", code: "const grouped = [1,2,3,4].group(n => n % 2);", type: "js" },
    { desc: "JS: Array.prototype.findLast", code: "const lastEven = [1,2,3,4].findLast(n => n % 2 === 0);", type: "js" },
    { desc: "JS: async generators", code: "async function* gen() { yield 1; yield 2; }", type: "js" },
    { desc: "JS: arguments.callee", code: "function f() { return arguments.callee; }", type: "js" },
    { desc: "JS: AbortSignal.any", code: "const anySignal = AbortSignal.any([signal1, signal2]);", type: "js" },
    { desc: "JS: BigInt64Array", code: "const arr = new BigInt64Array([1n, 2n]);", type: "js" },
    { desc: "JS: array-by-copy (slice)", code: "const copy = [1,2,3].toSorted();", type: "js" },
    { desc: "JS: spread operator", code: "const arr2 = [...arr1];", type: "js" },
    { desc: "JS: stable array sort", code: "[3,1,2].sort((a,b)=>a-b);", type: "js" },
    { desc: "JS: string methods (includes, matchAll, normalize)", code: `"hello".includes("h"); "hello".matchAll(/l/g); "é".normalize();`, type: "js" },
    { desc: "JS: string padding", code: `"x".padStart(5).padEnd(6);`, type: "js" },
    { desc: "JS: string repeat", code: `"abc".repeat(3);`, type: "js" },
    { desc: "JS: string replaceAll", code: `"foofoo".replaceAll("foo","bar");`, type: "js" },
    { desc: "JS: string starts/ends with", code: `"hello".startsWith("he"); "hello".endsWith("lo");`, type: "js" },

    // -------------------- HTML features --------------------
    { desc: "HTML: <a> tag", code: "<a href='https://example.com'>Link</a>", type: "html" },
    { desc: "HTML: autofocus attribute", code: '<input type="text" autofocus>', type: "html" },
    { desc: "HTML: <article> tag", code: "<article>Article content</article>", type: "html" },
    { desc: "HTML: <aside> tag", code: "<aside>Sidebar content</aside>", type: "html" },
    { desc: "HTML: accesskey attribute", code: '<button accesskey="k">Click me</button>', type: "html" },
    { desc: "HTML: <address> tag", code: "<address>123 Street, City</address>", type: "html" },
    { desc: "HTML: alt-text for images", code: "<img src='img.jpg' alt='Description'>", type: "html" },
    { desc: "HTML: app-share-targets", code: "<link rel='share-target'>", type: "html" },
    { desc: "HTML: <span> tag", code: "<span>Inline text</span>", type: "html" },
    { desc: "HTML: spellcheck attribute", code: "<textarea spellcheck='true'></textarea>", type: "html" },
    { desc: "HTML: speech attributes", code: "<p speak='none' speak-as='spell-out'>Hello</p>", type: "html" },
    { desc: "HTML: srcset attribute", code: "<img src='small.jpg' srcset='large.jpg 2x'>", type: "html" },

    // -------------------- CSS features --------------------
    { desc: "CSS: aspect-ratio", code: "div { aspect-ratio: 16 / 9; }", type: "css" },
    { desc: "CSS: accent-color", code: "input { accent-color: green; }", type: "css" },
    { desc: "CSS: animation-composition", code: "div { animation-composition: replace; }", type: "css" },
    { desc: "CSS: backdrop-filter", code: "section { backdrop-filter: blur(5px); }", type: "css" },
    { desc: "CSS: align-content-block", code: "section { align-content: center; }", type: "css" },
    { desc: "CSS: background-clip-text", code: "h1 { background-clip: text; -webkit-background-clip: text; }", type: "css" },
    { desc: "CSS: cascade-layers", code: "div { layer-name: 'theme'; }", type: "css" },
    { desc: "CSS: box-decoration-break", code: "p { box-decoration-break: clone; }", type: "css" },
    { desc: "CSS: static positioning", code: "div { position: static; }", type: "css" },
    { desc: "CSS: sticky positioning", code: "header { position: sticky; top: 0; }", type: "css" },
    { desc: "CSS: steps easing function", code: "div { transition-timing-function: steps(4, end); }", type: "css" },
    { desc: "CSS: stretch alignment", code: "div { align-items: stretch; }", type: "css" },
    { desc: "CSS: starting-style (counter-reset)", code: "ol { counter-reset: item 5; }", type: "css" },
];

  for (const sample of samples) {
    console.log(`\n=== ${sample.desc} ===`);
    const matches = matchLineToFeatures(sample.code, sample.type, index, { enableMinConfidence: true, minConfidence: 0.90 });
    for (const m of matches.slice(0, 5)) { // top 5 matches
      const output = options.fields.map(f => `${f}: ${m[f]}`).join(', ');
      console.log(output);
    }
  }
}

// Example usage: only key, confidence, baseline
runTests({ fields: ['key', 'match', 'confidence', 'baseline'] });

// Example usage: key, match, reason
// runTests({ fields: ['key', 'match', 'reason'] });
