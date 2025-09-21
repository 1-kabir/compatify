// tests.js
const { createBCDIndex, matchLineToFeatures } = require('./bcd-index');

function runTests() {
  const index = createBCDIndex();

  const samples = [
    {
      desc: "JS: Array.prototype.find",
      code: "const x = [1,2,3].find(n => n > 1);",
      type: "js",
    },
    {
      desc: "JS: Array.prototype.findLast",
      code: "const y = [1,2,3].findLast(n => n > 1);",
      type: "js",
    },
    {
      desc: "JS: Array.prototype.flat",
      code: "const z = [1,[2,[3]]].flat(2);",
      type: "js",
    },
    {
      desc: "JS: Array.from",
      code: "const arr = Array.from('hello');",
      type: "js",
    },
    {
      desc: "JS: Array.fromAsync",
      code: "const arr2 = await Array.fromAsync(asyncGen());",
      type: "js",
    },
    {
      desc: "JS: Array.group",
      code: "const grouped = [1,2,3].group(n => n % 2);",
      type: "js",
    },
    {
      desc: "JS: Array.includes",
      code: "if ([1,2,3].includes(2)) console.log('yes');",
      type: "js",
    },
    {
      desc: "JS: Array.isArray",
      code: "console.log(Array.isArray([1,2,3]));",
      type: "js",
    },
    {
      desc: "JS: Array iteration methods (map)",
      code: "const doubled = [1,2,3].map(n => n * 2);",
      type: "js",
    },
    {
      desc: "JS: Array iterators",
      code: "for (const v of [1,2,3].values()) console.log(v);",
      type: "js",
    },
    {
      desc: "JS: Array.of",
      code: "const nums = Array.of(1,2,3);",
      type: "js",
    },
    {
      desc: "JS: Array.splice",
      code: "arr.splice(1,2);",
      type: "js",
    },
    {
      desc: "HTML: <article> tag",
      code: "<article>This is an article</article>",
      type: "html",
    },
    {
      desc: "HTML: <aside> tag",
      code: "<aside>Note aside the main content</aside>",
      type: "html",
    },
  ];

  for (const sample of samples) {
    console.log(`\n=== ${sample.desc} ===`);
    const matches = matchLineToFeatures(sample.code, sample.type, index);
    for (const m of matches.slice(0, 5)) { // show top 5 matches
      console.log(
        `- key: ${m.key}, match: ${m.match}, reason: ${m.reason}, confidence: ${m.confidence}, baseline: ${m.baseline || "n/a"}`
      );
    }
  }
}

runTests();
