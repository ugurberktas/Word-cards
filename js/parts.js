window.EV = window.EV || {};
window.EV.utils = window.EV.utils || {};

window.EV.utils.splitIntoParts = function splitIntoParts(items, maxItemsPerPart = 25) {
  if (!Array.isArray(items) || items.length === 0 || maxItemsPerPart < 1) {
    return [];
  }

  const partCount = Math.ceil(items.length / maxItemsPerPart);
  const baseSize = Math.floor(items.length / partCount);
  const largerPartCount = items.length % partCount;
  const parts = [];
  let cursor = 0;

  for (let index = 0; index < partCount; index += 1) {
    const partSize = baseSize + (index < largerPartCount ? 1 : 0);
    parts.push(items.slice(cursor, cursor + partSize));
    cursor += partSize;
  }

  return parts;
};
