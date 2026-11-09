const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const context = { window: { EV: {} } };
vm.createContext(context);

for (const file of ["js/categories.js", "js/words.js", "js/study.js", "js/grammar.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
}

const { categories, words, grammar } = context.window.EV.data;
const { shuffle, requeueWord } = context.window.EV.study;

test("kategori, kelime ve gramer verileri tutarlı", () => {
  const subcategories = categories.flatMap((category) => category.subcategories);
  const subcategoryIds = new Set(subcategories.map((item) => item.id));
  const topics = grammar.stages.flatMap((stage) => stage.topics);

  assert.equal(categories.length, 5);
  assert.equal(subcategories.length, 45);
  assert.equal(words.length, 1248);
  assert.equal(new Set(words.map((word) => word.id)).size, words.length);
  assert.ok(words.every((word) => subcategoryIds.has(word.subcategoryId)));
  assert.equal(grammar.stages.length, 5);
  assert.equal(topics.length, 79);
  assert.deepEqual(Array.from(topics, (topic) => topic.id), Array.from({ length: 79 }, (_, index) => `grammar-${String(index + 1).padStart(3, "0")}`));
});

test("ezber turu alt kategorideki bütün kelimeleri kapsıyor", () => {
  for (const count of [6, 15, 20, 25, 30, 35, 40, 50, 60]) {
    const ids = Array.from({ length: count }, (_, index) => String(index));
    const tourIds = shuffle(ids, () => 0.5);
    assert.equal(tourIds.length, count);
    assert.deepEqual([...tourIds].sort(), [...ids].sort());
  }
});

test("bilinmeyen kelime sıraya geri ekleniyor", () => {
  const queue = Array.from({ length: 12 }, (_, index) => `other-${index}`);
  const afterSeven = requeueWord(queue, "engineer", () => 0);
  const afterEight = requeueWord(queue, "engineer", () => 0.99);
  const shortQueue = requeueWord(queue.slice(0, 4), "engineer", () => 0);
  const lastWord = requeueWord([], "engineer", () => 0);

  assert.equal(afterSeven.indexOf("engineer"), 7);
  assert.equal(afterEight.indexOf("engineer"), 8);
  assert.equal(shortQueue.indexOf("engineer"), 4);
  assert.deepEqual(Array.from(lastWord), ["engineer"]);
  assert.equal(new Set(afterSeven).size, afterSeven.length);
});
