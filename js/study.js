window.EV = window.EV || {};
window.EV.study = window.EV.study || {};

function shuffleStudyItems(items, random = Math.random) {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

window.EV.study.shuffle = shuffleStudyItems;

window.EV.study.selectWordIds = function selectWordIds(wordIds, selectionHistory = [], maxWords = 20, random = Math.random) {
  const uniqueWordIds = [...new Set(wordIds)];
  const history = new Set(selectionHistory);
  const notSelectedYet = uniqueWordIds.filter((wordId) => !history.has(wordId));
  const selectedBefore = uniqueWordIds.filter((wordId) => history.has(wordId));
  const prioritized = [
    ...shuffleStudyItems(notSelectedYet, random),
    ...shuffleStudyItems(selectedBefore, random),
  ];

  return prioritized.slice(0, Math.min(maxWords, uniqueWordIds.length));
};

window.EV.study.requeueWord = function requeueWord(queue, wordId, random = Math.random) {
  const nextQueue = [...queue].filter((queuedWordId) => queuedWordId !== wordId);

  if (nextQueue.length === 0) {
    return [wordId];
  }

  const minimumGap = Math.min(2, nextQueue.length);
  const maximumGap = Math.min(4, nextQueue.length);
  const gap = minimumGap + Math.floor(random() * (maximumGap - minimumGap + 1));
  nextQueue.splice(gap, 0, wordId);
  return nextQueue;
};
