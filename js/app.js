(function bootstrapEnglishVocabulary() {
  const EV = window.EV || {};
  const categories = EV.data?.categories || [];
  const words = EV.data?.words || [];
  const grammarStages = EV.data?.grammar?.stages || [];
  const grammarTopics = grammarStages.flatMap((stage) => stage.topics || []);
  const grammarTopicIds = new Set(grammarTopics.map((topic) => topic.id));
  const grammarTopicNumbers = new Map(grammarTopics.map((topic, index) => [topic.id, index + 1]));
  const main = document.querySelector("#main-content");
  const navContext = document.querySelector("#nav-context-label");

  if (!main || categories.length === 0) {
    return;
  }

  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const subcategoryById = new Map();

  categories.forEach((category) => {
    category.subcategories.forEach((subcategory) => {
      subcategoryById.set(subcategory.id, { subcategory, category });
    });
  });

  const wordsBySubcategoryId = new Map();
  words.forEach((word) => {
    const subcategoryWords = wordsBySubcategoryId.get(word.subcategoryId) || [];
    subcategoryWords.push(word);
    wordsBySubcategoryId.set(word.subcategoryId, subcategoryWords);
  });

  const splitIntoParts = EV.utils?.splitIntoParts || ((items, maxItemsPerPart = 25) => {
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
  });

  const studyTools = EV.study || {};
  const STUDY_STORAGE_KEY = "english-vocabulary:sprint4:v1";
  const GRAMMAR_STORAGE_KEY = "ev.grammar.progress.v1";
  const MAX_STUDY_WORDS = 20;
  let studyActionLocked = false;

  function emptyProgress() {
    return {
      version: 1,
      active: null,
      selectionHistory: {},
      completedTours: [],
      lastCompleted: null,
    };
  }

  function safeReadProgress() {
    try {
      const stored = window.localStorage.getItem(STUDY_STORAGE_KEY);
      if (!stored) {
        return emptyProgress();
      }

      const parsed = JSON.parse(stored);
      if (!parsed || parsed.version !== 1 || typeof parsed !== "object") {
        return emptyProgress();
      }

      const selectionHistory = parsed.selectionHistory && typeof parsed.selectionHistory === "object"
        ? Object.fromEntries(Object.entries(parsed.selectionHistory).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.filter((id) => typeof id === "string") : [],
        ]))
        : {};

      return {
        ...emptyProgress(),
        ...parsed,
        selectionHistory,
        completedTours: Array.isArray(parsed.completedTours) ? parsed.completedTours.slice(-20) : [],
        lastCompleted: parsed.lastCompleted && typeof parsed.lastCompleted === "object" ? parsed.lastCompleted : null,
      };
    } catch {
      return emptyProgress();
    }
  }

  let progress = safeReadProgress();

  function safeReadGrammarProgress() {
    try {
      const stored = window.localStorage.getItem(GRAMMAR_STORAGE_KEY);
      if (!stored) {
        return new Set();
      }

      const parsed = JSON.parse(stored);
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.completedIds)) {
        return new Set();
      }

      return new Set(parsed.completedIds.filter((id) => grammarTopicIds.has(id)));
    } catch {
      return new Set();
    }
  }

  let grammarProgress = safeReadGrammarProgress();

  function persistGrammarProgress() {
    try {
      window.localStorage.setItem(GRAMMAR_STORAGE_KEY, JSON.stringify({
        version: 1,
        completedIds: [...grammarProgress],
      }));
    } catch {
      // LocalStorage kullanılamıyorsa seçimler yalnızca mevcut sekmede korunur.
    }
  }

  function persistProgress() {
    try {
      window.localStorage.setItem(STUDY_STORAGE_KEY, JSON.stringify(progress));
    } catch {
      // LocalStorage kullanılamıyorsa tur yalnızca mevcut sekmede çalışmaya devam eder.
    }
  }

  function currentWordIds(subcategory, partNumber) {
    const actualWords = wordsBySubcategoryId.get(subcategory.id) || [];
    const parts = splitIntoParts(actualWords, 25);
    const validPart = Number.isInteger(partNumber) && partNumber >= 1 && partNumber <= parts.length;
    return {
      actualWords,
      parts,
      selectedWords: validPart ? parts[partNumber - 1] : actualWords,
      selectedPart: validPart ? partNumber : null,
      partKey: validPart ? String(partNumber) : "all",
    };
  }

  function studyRouteKey(subcategoryId, partKey) {
    return `${subcategoryId}:${partKey}`;
  }

  function sameIds(first, second) {
    if (!Array.isArray(first) || !Array.isArray(second) || first.length !== second.length) {
      return false;
    }

    const firstSet = new Set(first);
    const secondSet = new Set(second);
    return firstSet.size === first.length
      && secondSet.size === second.length
      && firstSet.size === secondSet.size
      && second.every((id) => firstSet.has(id));
  }

  function validActiveTour(active, subcategory, partNumber) {
    if (!active || active.subcategoryId !== subcategory.id) {
      return null;
    }

    const context = currentWordIds(subcategory, partNumber);
    const contextIds = context.selectedWords.map((word) => word.id);
    const contextSet = new Set(contextIds);
    const sourceIds = Array.isArray(active.sourceWordIds) ? active.sourceWordIds : [];
    const sourceSet = new Set(sourceIds);
    const sourceIdsAreAvailable = sourceIds.length > 0
      && sameIds(sourceIds, [...sourceSet])
      && sourceIds.every((id) => contextSet.has(id));

    // Veri listesine yeni kelimeler eklendiğinde, eski turun seçtiği kelimeler
    // hâlâ mevcutsa LocalStorage'daki devam eden tur korunur.
    if (active.partKey !== context.partKey || !sourceIdsAreAvailable) {
      return null;
    }

    const selectedIds = Array.isArray(active.selectedWordIds) ? active.selectedWordIds : [];
    const selectedSet = new Set(selectedIds);
    const knownIds = Array.isArray(active.knownWordIds) ? active.knownWordIds : [];
    const knownSet = new Set(knownIds);
    const queue = Array.isArray(active.queue) ? active.queue : [];
    const currentWordId = typeof active.currentWordId === "string" ? active.currentWordId : null;

    const selectedIdsAreValid = selectedIds.length > 0
      && selectedSet.size === selectedIds.length
      && selectedIds.every((id) => sourceSet.has(id));
    const knownIdsAreValid = knownSet.size === knownIds.length
      && knownIds.every((id) => selectedSet.has(id));
    const queueIsValid = new Set(queue).size === queue.length
      && queue.every((id) => selectedSet.has(id) && !knownSet.has(id));
    const currentIsValid = Boolean(currentWordId)
      && selectedSet.has(currentWordId)
      && !knownSet.has(currentWordId)
      && !queue.includes(currentWordId);
    const activeIds = new Set([...knownSet, currentWordId, ...queue]);
    const stateCoversSelectedIds = activeIds.size === selectedSet.size
      && [...selectedSet].every((id) => activeIds.has(id));

    if (!selectedIdsAreValid
      || !knownIdsAreValid
      || !queueIsValid
      || !currentIsValid
      || !stateCoversSelectedIds) {
      return null;
    }

    return {
      ...active,
      queue: [...queue],
      knownWordIds: [...knownIds],
      unknownWordIds: Array.isArray(active.unknownWordIds) ? [...new Set(active.unknownWordIds)].filter((id) => selectedSet.has(id)) : [],
      shownUniqueWordIds: Array.isArray(active.shownUniqueWordIds) ? [...new Set(active.shownUniqueWordIds)].filter((id) => selectedSet.has(id)) : [],
      unknownAttempts: Number.isFinite(active.unknownAttempts) && active.unknownAttempts >= 0 ? active.unknownAttempts : 0,
      currentWordId,
    };
  }

  function clearInvalidActiveTour() {
    if (progress.active) {
      progress.active = null;
      persistProgress();
    }
  }

  const iconPaths = {
    book: '<path d="M5 5.25A2.25 2.25 0 0 1 7.25 3H19v14.5a2.5 2.5 0 0 0-2.5-2.5H5V5.25Z"/><path d="M5 15h11.5a2.5 2.5 0 0 1 2.5 2.5V21H7.25A2.25 2.25 0 0 1 5 18.75V15Z"/><path d="M9 7h6M9 10h4"/>',
    verbs: '<path d="M5 12h14M12 5l7 7-7 7"/><path d="m5 7 5 5-5 5"/>',
    sparkles: '<path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z"/><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"/>',
    question: '<circle cx="12" cy="12" r="8.5"/><path d="M9.7 9.1a2.55 2.55 0 1 1 4.3 1.85c-.95.78-2 1.15-2 2.55M12 16.7h.01"/>',
    link: '<path d="m9.5 14.5 5-5"/><path d="m7.25 17.75-1.1 1.1a3.2 3.2 0 0 1-4.5-4.5l3.3-3.3a3.2 3.2 0 0 1 4.5 0"/><path d="m16.75 6.25 1.1-1.1a3.2 3.2 0 1 1 4.5 4.5l-3.3 3.3a3.2 3.2 0 0 1-4.5 0"/>',
    hash: '<path d="M9 3 7 21M17 3l-2 18M4 9h17M3 15h17"/>',
    calendar: '<rect x="3.5" y="5.5" width="17" height="15" rx="2"/><path d="M7 3.5v4M17 3.5v4M3.5 10h17M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/>',
    coins: '<circle cx="9" cy="9" r="5.2"/><path d="M13 13a5.2 5.2 0 1 0 1.7-1.7M9 6.8v4.4M7.5 8.2h2.2a1.1 1.1 0 0 1 0 2.2H8.3a1.1 1.1 0 0 1 0-2.2"/>',
    at: '<circle cx="12" cy="12" r="8.5"/><path d="M15.5 10.5v3.25a2.25 2.25 0 0 0 4.5 0v-1.75a8 8 0 1 0-2 5.25"/><circle cx="11.8" cy="12" r="2.8"/>',
    sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.72 5.28l-1.56 1.56M6.84 17.16l-1.56 1.56M18.72 18.72l-1.56-1.56M6.84 6.84 5.28 5.28"/>',
    briefcase: '<rect x="3.5" y="7.5" width="17" height="12.5" rx="2.5"/><path d="M8 7.5V5.75A1.75 1.75 0 0 1 9.75 4h4.5A1.75 1.75 0 0 1 16 5.75V7.5M3.5 12.5h17M10 12.5v1.25a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V12.5"/>',
    users: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.9M17 14a4.5 4.5 0 0 1 3.5 4.4"/>',
    cloud: '<path d="M7.5 18.5h9.75a3.25 3.25 0 0 0 .5-6.46A5.75 5.75 0 0 0 6.7 10.8 3.9 3.9 0 0 0 7.5 18.5Z"/>',
    palette: '<path d="M12 3.5a8.5 8.5 0 0 0 0 17h1.4a1.6 1.6 0 0 0 .6-3.08 1.6 1.6 0 0 1 .6-3.08H17A3.5 3.5 0 0 0 20.5 11 7.5 7.5 0 0 0 12 3.5Z"/><circle cx="7.8" cy="10" r=".7"/><circle cx="10" cy="7.3" r=".7"/><circle cx="14" cy="7.3" r=".7"/>',
    utensils: '<path d="M7 3v7M4.5 3v4.5A2.5 2.5 0 0 0 7 10a2.5 2.5 0 0 0 2.5-2.5V3M7 10v11M16.5 3v18M16.5 3c2.2 2.4 2.2 5.2 0 7.5"/>',
    home: '<path d="m3.5 11 8.5-7.5 8.5 7.5v8.25a1.75 1.75 0 0 1-1.75 1.75H5.25a1.75 1.75 0 0 1-1.75-1.75V11Z"/><path d="M9 21v-6h6v6"/>',
    shirt: '<path d="m8 4 4 2 4-2 4 3.5-2.5 4-2-1.3V21h-7v-10.8L6.5 11.5 4 7.5 8 4Z"/>',
    heart: '<path d="M20.5 8.8c0 5.1-8.5 10.7-8.5 10.7S3.5 13.9 3.5 8.8a4.2 4.2 0 0 1 7.5-2.6 4.2 4.2 0 0 1 7.5 2.6Z"/><path d="M8 10.5h2l1-2 2 5 1-3h2"/>',
    building: '<rect x="4" y="3.5" width="16" height="17" rx="1.5"/><path d="M8 7.5h2M14 7.5h2M8 11.5h2M14 11.5h2M8 15.5h2M14 15.5h2M10 20.5v-3h4v3"/>',
    car: '<path d="m5 11 1.5-4h11L19 11l1.5 1.5v5h-17v-5L5 11Z"/><path d="M3.5 12.5h17M7 16h.01M17 16h.01M6.5 7h11"/>',
    smile: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.5a4.2 4.2 0 0 0 7 0M9 9.5h.01M15 9.5h.01"/>',
    hobby: '<circle cx="12" cy="12" r="8.5"/><path d="m8.5 8.5 7 7M15.5 8.5l-7 7M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4"/>',
    leaf: '<path d="M20.5 3.5C11 3.5 5 6.2 5 12.2c0 3.1 2.2 5.3 5.3 5.3 6 0 8.7-6 10.2-14Z"/><path d="M4 20.5c2.7-5.4 6.6-8.7 11.5-11.5"/>',
    chat: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h8A2.5 2.5 0 0 1 17 5.5v5a2.5 2.5 0 0 1-2.5 2.5H9l-4.5 3v-3.1A2.5 2.5 0 0 1 4 10.5v-5Z"/><path d="M17 8.5h.5A2.5 2.5 0 0 1 20 11v5a2.5 2.5 0 0 1-2.5 2.5H16L12.5 21v-2.5"/><path d="M8 7.5h5M8 10.5h3"/>',
    hand: '<path d="M7.5 12.5V6.25a1.25 1.25 0 0 1 2.5 0V10M10 10V4.75a1.25 1.25 0 0 1 2.5 0V10M12.5 10V6a1.25 1.25 0 0 1 2.5 0v5M15 11V8.5a1.25 1.25 0 0 1 2.5 0v5.75A5.75 5.75 0 0 1 11.75 20H11a5.5 5.5 0 0 1-4.45-2.27L4.7 14a1.3 1.3 0 0 1 2.1-1.5l.7.8"/>',
    help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.5 9.5a2.6 2.6 0 1 1 4.7 1.55c-.75.95-2.2 1.15-2.2 2.7M12 16.5h.01"/><path d="M17.5 17.5 21 21"/>',
    cart: '<path d="M3.5 4h2l1.7 10.5h10.9L20.5 7H6.1"/><circle cx="9" cy="18.5" r="1.2"/><circle cx="17" cy="18.5" r="1.2"/>',
    map: '<path d="m3.5 5.5 5.5-2 6 2 5.5-2v15l-5.5 2-6-2-5.5 2v-15Z"/><path d="M9 3.5v15M15 5.5v15"/>',
    phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M10 6h4M11.5 18h1"/>',
    office: '<rect x="3.5" y="5" width="17" height="15" rx="1.5"/><path d="M8 5V3h8v2M7.5 9h2M14.5 9h2M7.5 13h2M14.5 13h2M7.5 17h2M14.5 17h2"/>',
    meeting: '<circle cx="12" cy="7" r="3"/><path d="M6 19a6 6 0 0 1 12 0M4 12h4M16 12h4M6 10l-2-2M18 10l2-2"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4.5 7 7.5 5.5L19.5 7"/>',
    profile: '<circle cx="12" cy="8" r="3"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0M17 4.5h3.5v3.5"/>',
    code: '<path d="m8.5 7-4 5 4 5M15.5 7l4 5-4 5M13.5 4l-3 16"/>',
    laptop: '<rect x="4" y="4" width="16" height="11" rx="1.5"/><path d="M2.5 19h19M8 19l.8-2h6.4l.8 2"/>',
    terminal: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="m7 9 2.5 2.5L7 14M12 14h4"/>',
    network: '<rect x="9" y="3.5" width="6" height="5" rx="1"/><rect x="3" y="15.5" width="6" height="5" rx="1"/><rect x="15" y="15.5" width="6" height="5" rx="1"/><path d="M12 8.5v3M6 15.5v-2h12v2M12 11.5l-6 2M12 11.5l6 2"/>',
    container: '<path d="M4 8.5h16v9.25A2.25 2.25 0 0 1 17.75 20h-11A2.75 2.75 0 0 1 4 17.25V8.5Z"/><path d="M7 5h3v3.5H7zM11 5h3v3.5h-3zM15 5h2v3.5h-2zM3 12h18"/>',
    branch: '<path d="M7 4v8a5 5 0 0 0 5 5h5"/><circle cx="7" cy="4" r="2"/><circle cx="17" cy="17" r="2"/><path d="M17 7V4h3"/>',
    shield: '<path d="M12 3.5 19 6v5.3c0 4.2-2.9 7.6-7 9.2-4.1-1.6-7-5-7-9.2V6l7-2.5Z"/><path d="m8.5 12 2.2 2.2 4.8-4.8"/>',
    database: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.5"/><path d="M4.5 5.5v6c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-6M4.5 11.5v6c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-6"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/><path d="m4 7 5-3 6 4 5-5"/>',
  };

  const iconSvg = (key, className = "") => `
    <svg class="${className}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        ${iconPaths[key] || iconPaths.book}
      </g>
    </svg>`;

  const linkForCategory = (category) => `#/category/${category.id}`;
  const linkForSubcategory = (subcategory) => `#/subcategory/${subcategory.id}`;
  const linkForStudy = (subcategory, partNumber = null) => partNumber
    ? `#/study/${subcategory.id}?part=${partNumber}`
    : `#/study/${subcategory.id}`;

  function parseRoute() {
    let hash = location.hash.replace(/^#/, "") || "/";

    try {
      hash = decodeURIComponent(hash);
    } catch {
      return { type: "not-found" };
    }

    const [path, queryString = ""] = hash.split("?");
    const parts = path.split("/").filter(Boolean);
    const query = new URLSearchParams(queryString);
    const partParam = query.get("part");
    const partNumber = partParam && /^\d+$/.test(partParam) ? Number(partParam) : null;

    if (parts.length === 0) {
      return { type: "home" };
    }

    if (parts[0] === "grammar" && parts.length === 1) {
      return { type: "grammar" };
    }

    if (parts[0] === "category" && parts[1]) {
      const category = categoryById.get(parts[1]);
      return category ? { type: "category", category } : { type: "not-found" };
    }

    if (parts[0] === "subcategory" && parts[1]) {
      const entry = subcategoryById.get(parts[1]);
      return entry ? { type: "subcategory", ...entry, partNumber } : { type: "not-found" };
    }

    if (parts[0] === "study" && parts[1]) {
      const entry = subcategoryById.get(parts[1]);
      return entry ? { type: "study", ...entry, partNumber } : { type: "not-found" };
    }

    return { type: "not-found" };
  }

  function breadcrumb(items) {
    return `
      <nav class="breadcrumbs" aria-label="Sayfa yolu">
        ${items
          .map((item, index) => {
            const isLast = index === items.length - 1;
            return `${index > 0 ? '<span class="breadcrumb-separator" aria-hidden="true">/</span>' : ""}
              ${isLast ? `<span aria-current="page">${item.label}</span>` : `<a href="${item.href}">${item.label}</a>`}`;
          })
          .join("")}
      </nav>`;
  }

  function renderHome() {
    const section = document.createElement("section");
    section.className = "home-view";
    section.innerHTML = `
      <section class="hero container" aria-labelledby="page-title">
        <div class="hero-copy">
          <p class="eyebrow"><span aria-hidden="true">✦</span> Kendi öğrenme alanın</p>
          <h1 id="page-title">Kelimelerle kurduğun dünyayı <em>genişlet.</em></h1>
          <p class="hero-description">
            İngilizce kelime öğrenme yolculuğunu ilgi alanlarına göre düzenle,
            ihtiyacın olan kelimelere daha kolay ulaş.
          </p>
        </div>

        <div class="hero-note" aria-label="Yaklaşan özellik bilgisi">
          <span class="hero-note-icon" aria-hidden="true">${iconSvg("sparkles")}</span>
          <span>
            <strong>Adım adım öğren</strong>
            <small>İhtiyacına uygun bir alanla başla</small>
          </span>
        </div>
      </section>

      <section class="categories-section container" aria-labelledby="categories-title">
        <div class="section-heading">
          <div>
            <p class="section-kicker">Keşfetmeye başla</p>
            <h2 id="categories-title">Bir kategori seç</h2>
          </div>
          <p class="section-intro">Merak ettiğin konuya yaklaş, kelime dağarcığını doğal bir akışla büyüt.</p>
        </div>

        <div class="category-grid" aria-live="polite">
          ${categories.map((category, index) => `
            <a class="category-card" style="--card-accent: ${category.accent}; --card-tint: ${category.tint};" href="${linkForCategory(category)}" aria-labelledby="category-title-${category.id}">
              <span class="card-topline">
                <span class="card-icon">${iconSvg(category.icon)}</span>
                <span class="card-index">${String(index + 1).padStart(2, "0")}</span>
              </span>
              <h3 class="card-title" id="category-title-${category.id}">${category.title}</h3>
              <span class="card-description">${category.description}</span>
              <span class="card-arrow" aria-hidden="true">↗</span>
            </a>`).join("")}
        </div>
        <a class="grammar-home-link" href="#/grammar">
          <span class="grammar-home-icon" aria-hidden="true">${iconSvg("book")}</span>
          <span><strong>Gramer çalışmalarım</strong><small>79 konuluk çalışma planını aç</small></span>
          <span class="grammar-home-arrow" aria-hidden="true">↗</span>
        </a>
      </section>`;
    return section;
  }

  function renderCategory(category) {
    const section = document.createElement("section");
    section.className = "route-view category-view";
    section.innerHTML = `
      <div class="container">
        ${breadcrumb([
          { label: "Ana sayfa", href: "#/" },
          { label: category.title },
        ])}

        <header class="route-hero" style="--route-accent: ${category.accent}; --route-tint: ${category.tint};">
          <div class="route-hero-copy">
            <p class="section-kicker">Kategori</p>
            <h1>${category.title}</h1>
            <p class="route-description">${category.description}</p>
          </div>
          <div class="route-icon" aria-hidden="true">${iconSvg(category.icon)}</div>
        </header>

        <section class="subcategory-section" aria-labelledby="subcategory-title">
          <div class="section-heading">
            <div>
              <p class="section-kicker">Konu alanları</p>
              <h2 id="subcategory-title">Alt kategoriler</h2>
            </div>
            <p class="section-intro">İlgini çeken konuya geçerek kelime öğrenme alanını daralt.</p>
          </div>

          <div class="subcategory-grid">
            ${category.subcategories.map((subcategory, index) => `
              <a class="subcategory-card" style="--card-accent: ${category.accent}; --card-tint: ${category.tint};" href="${linkForSubcategory(subcategory)}" aria-labelledby="subcategory-title-${subcategory.id}">
                <span class="subcategory-number">${String(index + 1).padStart(2, "0")}</span>
                <span class="subcategory-icon">${iconSvg(subcategory.icon)}</span>
                <span class="subcategory-content">
                  <strong id="subcategory-title-${subcategory.id}">${subcategory.title}</strong>
                  <span class="target-count">${subcategory.targetCount} planlanan kelime</span>
                </span>
                <span class="subcategory-arrow" aria-hidden="true">↗</span>
              </a>`).join("")}
          </div>
        </section>
      </div>`;
    return section;
  }

  function linkForPart(subcategory, partNumber) {
    return partNumber ? `${linkForSubcategory(subcategory)}?part=${partNumber}` : linkForSubcategory(subcategory);
  }

  function wordCardTemplate(word, index) {
    const isPhrase = word.partOfSpeech === "Phrase";
    const isTechnical = Boolean(word.descriptionTr);
    return `
      <article class="word-card${isTechnical ? " word-card-technical" : ""}" data-word-id="${word.id}">
        <button class="word-card-trigger" type="button" aria-pressed="false" aria-label="${word.english} kartını çevir">
          <span class="word-card-face word-card-front">
            <span class="word-card-topline">
              <span class="word-card-label">${isPhrase ? "İngilizce ifade" : "İngilizce kelime"}</span>
              <span class="word-card-index">${String(index + 1).padStart(2, "0")}</span>
            </span>
            <strong class="word-card-word">${word.english}</strong>
            <span class="word-card-hint"><span aria-hidden="true">↻</span> Çevirmek için dokun</span>
          </span>

          <span class="word-card-face word-card-back" aria-hidden="true">
            <span class="word-card-topline">
              <span class="word-card-label">${isPhrase ? "Türkçe karşılığı" : "Türkçe anlamı"}</span>
              <span class="word-card-index">${String(index + 1).padStart(2, "0")}</span>
            </span>
            <strong class="word-card-meaning">${word.turkish}</strong>
            ${isTechnical ? `
            <span class="word-card-description">
              <span class="word-card-description-label">Bu nedir?</span>
              <em>${word.descriptionTr}</em>
            </span>` : ""}
            <span class="word-card-example word-card-example-en">
              <span>İngilizce örnek</span>
              <em>${word.exampleEn}</em>
            </span>
            <span class="word-card-example word-card-example-tr">
              <span>Türkçe çeviri</span>
              <em>${word.exampleTr}</em>
            </span>
            <span class="word-card-type"><span>Kelime türü</span><strong>${word.partOfSpeech}</strong></span>
          </span>
        </button>
      </article>`;
  }

  function renderPartNavigation(subcategory, actualWords, parts, selectedPart) {
    return `
      <div class="part-toolbar">
        <div>
          <p class="part-label">Görünüm</p>
          <nav class="part-selector" aria-label="Kelime partları">
            <a class="part-chip${selectedPart === null ? " is-active" : ""}" href="${linkForPart(subcategory, null)}"${selectedPart === null ? ' aria-current="page"' : ""}>
              Tüm kelimeler <span>${actualWords.length}</span>
            </a>
            ${parts.map((part, index) => `
              <a class="part-chip${selectedPart === index + 1 ? " is-active" : ""}" href="${linkForPart(subcategory, index + 1)}"${selectedPart === index + 1 ? ' aria-current="page"' : ""}>
                Part ${index + 1} <span>${part.length}</span>
              </a>`).join("")}
          </nav>
        </div>
        <p class="part-note">${actualWords.length} eklenmiş kart · Boş hedefler karta dönüştürülmez.</p>
      </div>`;
  }

  function renderWordLibrary(subcategory, category, actualWords, route) {
    const parts = splitIntoParts(actualWords, 25);
    const selectedPart = Number.isInteger(route.partNumber) && route.partNumber >= 1 && route.partNumber <= parts.length
      ? route.partNumber
      : null;
    const visibleWords = selectedPart === null ? actualWords : parts[selectedPart - 1];
    const section = document.createElement("section");
    section.className = "route-view subcategory-view word-library-view";
    section.innerHTML = `
      <div class="container">
        ${breadcrumb([
          { label: "Ana sayfa", href: "#/" },
          { label: category.title, href: linkForCategory(category) },
          { label: subcategory.title },
        ])}

        <header class="route-hero subcategory-hero" style="--route-accent: ${category.accent}; --route-tint: ${category.tint};">
          <div class="route-hero-copy">
            <p class="section-kicker">Alt kategori</p>
            <h1>${subcategory.title}</h1>
            <p class="route-description">${category.title} içinde eklenen kelimeleri kartlarla çalış.</p>
          </div>
          <div class="route-icon" aria-hidden="true">${iconSvg(subcategory.icon)}</div>
        </header>

        <section class="word-library" aria-labelledby="word-library-title">
          <div class="word-library-heading">
            <div>
              <p class="section-kicker">Kelime kartları</p>
              <h2 id="word-library-title">Eklenen kelimeler</h2>
            </div>
            <p class="word-library-summary"><strong>${actualWords.length} gerçek kart</strong><span>Bu sprintte eklenen içerik</span></p>
            <a class="study-start-button" href="${linkForStudy(subcategory, selectedPart)}" data-start-new-tour="archive">
              <span aria-hidden="true">✦</span> Ezberlemeye başla
            </a>
          </div>

          ${renderPartNavigation(subcategory, actualWords, parts, selectedPart)}

          <div class="word-card-grid" aria-live="polite">
            ${visibleWords.map((word, index) => wordCardTemplate(word, index)).join("")}
          </div>
        </section>

        <a class="back-link" href="${linkForCategory(category)}"><span aria-hidden="true">←</span> ${category.title} kategorisine dön</a>
      </div>`;
    return section;
  }

  function renderEmptySubcategory(subcategory, category) {
    const section = document.createElement("section");
    section.className = "route-view subcategory-view";
    section.innerHTML = `
      <div class="container">
        ${breadcrumb([
          { label: "Ana sayfa", href: "#/" },
          { label: category.title, href: linkForCategory(category) },
          { label: subcategory.title },
        ])}

        <header class="route-hero subcategory-hero" style="--route-accent: ${category.accent}; --route-tint: ${category.tint};">
          <div class="route-hero-copy">
            <p class="section-kicker">Alt kategori</p>
            <h1>${subcategory.title}</h1>
            <p class="route-description">${category.title} içinde bu konuya ait kelimeleri bir araya getiriyoruz.</p>
          </div>
          <div class="route-icon" aria-hidden="true">${iconSvg(subcategory.icon)}</div>
        </header>

        <section class="subcategory-detail" aria-labelledby="detail-title">
          <div class="detail-summary">
            <p class="section-kicker">Öğrenme alanı</p>
            <h2 id="detail-title">Kelime kartları yakında</h2>
            <p>Bu alt kategori için kelime kartları bir sonraki sprintte eklenecek.</p>
            <dl class="detail-facts">
              <div>
                <dt>Bağlı kategori</dt>
                <dd>${category.title}</dd>
              </div>
              <div>
                <dt>Planlanan kelime sayısı</dt>
                <dd>${subcategory.targetCount}</dd>
              </div>
            </dl>
          </div>
          <div class="empty-state-icon" aria-hidden="true">${iconSvg("book")}</div>
        </section>

        <a class="back-link" href="${linkForCategory(category)}"><span aria-hidden="true">←</span> ${category.title} kategorisine dön</a>
      </div>`;
    return section;
  }

  function renderSubcategory(subcategory, category, route) {
    const actualWords = wordsBySubcategoryId.get(subcategory.id) || [];
    return actualWords.length > 0
      ? renderWordLibrary(subcategory, category, actualWords, route)
      : renderEmptySubcategory(subcategory, category);
  }

  function createNewTour(subcategory, partNumber) {
    const context = currentWordIds(subcategory, partNumber);
    const sourceWordIds = context.selectedWords.map((word) => word.id);
    const historyKey = studyRouteKey(subcategory.id, context.partKey);
    const savedSelection = progress.selectionHistory[historyKey] || [];
    const selection = studyTools.selectTourWords(sourceWordIds, savedSelection, MAX_STUDY_WORDS);
    const selectedWordIds = selection.selectedIds;
    const queue = typeof studyTools.shuffle === "function" ? studyTools.shuffle(selectedWordIds) : [...selectedWordIds];
    const currentWordId = queue.shift();

    if (!currentWordId) {
      return null;
    }

    progress.selectionHistory[historyKey] = selection.historyIds;
    progress.lastCompleted = null;
    progress.active = {
      version: 1,
      subcategoryId: subcategory.id,
      partKey: context.partKey,
      sourceWordIds,
      selectedWordIds,
      queue,
      currentWordId,
      knownWordIds: [],
      unknownWordIds: [],
      shownUniqueWordIds: [currentWordId],
      unknownAttempts: 0,
      startedAt: new Date().toISOString(),
    };
    persistProgress();
    return progress.active;
  }

  function startFreshTour(subcategory, partNumber) {
    progress.active = null;
    progress.lastCompleted = null;
    return createNewTour(subcategory, partNumber);
  }

  function partLabel(partKey) {
    return partKey === "all" ? "Tüm kelimeler" : `Part ${partKey}`;
  }

  function renderStudyCompletion(subcategory, category, summary) {
    const section = document.createElement("section");
    section.className = "route-view study-completion-view container";
    section.innerHTML = `
      ${breadcrumb([
        { label: "Ana sayfa", href: "#/" },
        { label: category.title, href: linkForCategory(category) },
        { label: subcategory.title },
      ])}
      <div class="completion-card">
        <div class="completion-icon" aria-hidden="true">✓</div>
        <p class="section-kicker">Tur tamamlandı</p>
        <h1>Harika, bu turu tamamladın.</h1>
        <p>${subcategory.title} · ${partLabel(summary.partKey)}</p>
        <div class="completion-stats">
          <div><strong>${summary.selectedCount}</strong><span>Çalışılan benzersiz kelime</span></div>
          <div><strong>${summary.knownCount}</strong><span>Bilinen kelime</span></div>
          <div><strong>${summary.unknownWordCount}</strong><span>Bilinmeyen benzersiz kelime</span></div>
          <div><strong>${summary.unknownAttempts}</strong><span>Toplam tekrar denemesi</span></div>
        </div>
        <div class="completion-actions">
          <button class="study-primary-button" type="button" data-restart-tour>Turu yeniden başlat</button>
          <a class="study-secondary-button" href="${linkForCategory(category)}">Kategoriye dön</a>
        </div>
      </div>`;
    return section;
  }

  function renderStudyPaused(subcategory, category, active) {
    const activeEntry = subcategoryById.get(active.subcategoryId);
    const activePart = active.partKey === "all" ? null : Number(active.partKey);
    const section = document.createElement("section");
    section.className = "route-view study-completion-view container";
    section.innerHTML = `
      ${breadcrumb([
        { label: "Ana sayfa", href: "#/" },
        { label: category.title, href: linkForCategory(category) },
        { label: subcategory.title },
      ])}
      <div class="completion-card">
        <p class="section-kicker">Devam eden çalışma</p>
        <h1>Bir turun devam ediyor.</h1>
        <p>${activeEntry.subcategory.title} · ${partLabel(active.partKey)} çalışmasına kaldığın yerden dönebilirsin.</p>
        <div class="completion-actions">
          <a class="study-primary-button" href="${linkForStudy(activeEntry.subcategory, activePart)}">Devam eden tura dön</a>
          <button class="study-secondary-button" type="button" data-start-new-tour>Bu konuda yeni tur başlat</button>
        </div>
      </div>`;
    return section;
  }

  function renderStudyActive(subcategory, category, active) {
    const currentWord = words.find((word) => word.id === active.currentWordId);
    if (!currentWord) {
      progress.active = null;
      persistProgress();
      return renderEmptySubcategory(subcategory, category);
    }

    const knownCount = active.knownWordIds.length;
    const selectedCount = active.selectedWordIds.length;
    const progressPercent = Math.round((knownCount / selectedCount) * 100);
    const isPhrase = currentWord.partOfSpeech === "Phrase";
    const isTechnical = Boolean(currentWord.descriptionTr);
    const section = document.createElement("section");
    section.className = "route-view study-view";
    section.innerHTML = `
      <div class="container">
        ${breadcrumb([
          { label: "Ana sayfa", href: "#/" },
          { label: category.title, href: linkForCategory(category) },
          { label: subcategory.title },
        ])}

        <header class="study-header">
          <div>
            <p class="section-kicker">Ezber modu · ${partLabel(active.partKey)}</p>
            <h1>${subcategory.title}</h1>
            <p>Önce İngilizceyi gör, kartı çevir ve bildiklerini turdan çıkar.</p>
          </div>
          <button class="study-restart-button" type="button" data-start-new-tour>Yeni tur</button>
        </header>

        <div class="study-progress-row" aria-label="Tur ilerlemesi">
          <div class="study-progress-track"><span style="width: ${progressPercent}%;"></span></div>
          <strong>${knownCount} / ${selectedCount} bilinen</strong>
        </div>

        <div class="study-card-stage">
          <div
            class="study-card-surface${isTechnical ? " study-card-technical" : ""}"
            data-study-card
            role="button"
            tabindex="0"
            aria-pressed="false"
            aria-label="${currentWord.english} kartını çevir"
          >
            <span class="study-card-face study-card-front">
              <span class="study-card-label">${isPhrase ? "İngilizce ifade" : "İngilizce kelime"}</span>
              <strong>${currentWord.english}</strong>
              <span class="study-card-hint"><span aria-hidden="true">↻</span> Çevirmek için dokun</span>
            </span>
            <span class="study-card-face study-card-back" aria-hidden="true">
              <span class="study-card-label">${isPhrase ? "Türkçe karşılığı" : "Türkçe anlamı"}</span>
              <strong>${currentWord.turkish}</strong>
              ${isTechnical ? `<span class="study-card-description"><small>Bu nedir?</small>${currentWord.descriptionTr}</span>` : ""}
              <span class="study-card-example study-card-example-en"><small>İngilizce örnek</small>${currentWord.exampleEn}</span>
              <span class="study-card-example study-card-example-tr"><small>Türkçe çeviri</small>${currentWord.exampleTr}</span>
              <span class="study-card-type">${currentWord.partOfSpeech}</span>
            </span>
          </div>
        </div>

        <div class="study-controls" aria-label="Kart kontrolleri">
          <button class="study-control study-control-unknown" type="button" data-study-unknown disabled>
            <span aria-hidden="true">↺</span> Tekrar göster
          </button>
          <button class="study-control study-control-known" type="button" data-study-known disabled>
            <span aria-hidden="true">✓</span> Biliyorum
          </button>
        </div>
        <p class="study-help-text">Kartın arka yüzünde ortasına dokun: biliyorum · Sağa/sola kaydır: tekrar göster · Enter / Space ile kullan</p>
        <p class="study-attempt-summary">Bu turdaki toplam tekrar denemesi: <strong>${active.unknownAttempts}</strong></p>
      </div>`;
    return section;
  }

  function completeTour(active) {
    const summary = {
      routeKey: studyRouteKey(active.subcategoryId, active.partKey),
      subcategoryId: active.subcategoryId,
      partKey: active.partKey,
      selectedCount: active.selectedWordIds.length,
      knownCount: active.knownWordIds.length,
      unknownWordCount: active.unknownWordIds.length,
      unknownAttempts: active.unknownAttempts,
      completedAt: new Date().toISOString(),
    };

    progress.completedTours = [...progress.completedTours, summary].slice(-20);
    progress.lastCompleted = summary;
    progress.active = null;
    persistProgress();
  }

  function advanceActiveTour(active) {
    const nextWordId = active.queue.shift();
    if (!nextWordId) {
      return false;
    }

    active.currentWordId = nextWordId;
    if (!active.shownUniqueWordIds.includes(nextWordId)) {
      active.shownUniqueWordIds.push(nextWordId);
    }
    progress.active = active;
    return true;
  }

  function currentStudyRouteMatches(route) {
    const latestRoute = parseRoute();
    if (latestRoute.type !== "study" || latestRoute.subcategory.id !== route.subcategory.id) {
      return false;
    }

    const latestContext = currentWordIds(latestRoute.subcategory, latestRoute.partNumber);
    const routeContext = currentWordIds(route.subcategory, route.partNumber);
    return latestContext.partKey === routeContext.partKey;
  }

  function performStudyAction(action, direction = "right") {
    if (studyActionLocked) {
      return;
    }

    const route = parseRoute();
    if (route.type !== "study") {
      return;
    }

    const card = main.querySelector("[data-study-card]");
    const active = validActiveTour(progress.active, route.subcategory, route.partNumber);
    if (!card || !active || !card.classList.contains("is-flipped")) {
      return;
    }

    studyActionLocked = true;
    const animationClass = action === "known"
      ? "is-known"
      : direction === "left" ? "is-swiping-left" : "is-swiping-right";
    card.classList.add(animationClass);
    main.querySelectorAll("[data-study-known], [data-study-unknown]").forEach((button) => {
      button.disabled = true;
    });

    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 10 : 390;
    window.setTimeout(() => {
      if (!currentStudyRouteMatches(route)) {
        studyActionLocked = false;
        return;
      }

      if (action === "known") {
        if (!active.knownWordIds.includes(active.currentWordId)) {
          active.knownWordIds.push(active.currentWordId);
        }

        if (active.knownWordIds.length >= active.selectedWordIds.length) {
          completeTour(active);
        } else {
          advanceActiveTour(active);
          persistProgress();
        }
      } else {
        active.unknownAttempts += 1;
        if (!active.unknownWordIds.includes(active.currentWordId)) {
          active.unknownWordIds.push(active.currentWordId);
        }

        active.queue = typeof studyTools.requeueWord === "function"
          ? studyTools.requeueWord(active.queue, active.currentWordId)
          : [...active.queue, active.currentWordId];
        advanceActiveTour(active);
        persistProgress();
      }

      studyActionLocked = false;
      render();
    }, duration);
  }

  function flipStudyCard() {
    const card = main.querySelector("[data-study-card]");
    if (!card || studyActionLocked || card.classList.contains("is-flipped")) {
      return;
    }

    card.classList.add("is-flipped");
    card.setAttribute("aria-pressed", "true");
    card.setAttribute("aria-label", "Kartın arka yüzü açık. Biliyorsan ortasına dokun.");
    card.querySelector(".study-card-front")?.setAttribute("aria-hidden", "true");
    card.querySelector(".study-card-back")?.setAttribute("aria-hidden", "false");
    main.querySelectorAll("[data-study-known], [data-study-unknown]").forEach((button) => {
      button.disabled = false;
    });
  }

  function bindStudyInteractions() {
    const card = main.querySelector("[data-study-card]");
    if (!card) {
      return;
    }

    let pointerStart = null;
    const swipeThreshold = 56;

    card.addEventListener("pointerdown", (event) => {
      if (studyActionLocked) {
        return;
      }

      pointerStart = {
        id: event.pointerId,
        type: event.pointerType,
        x: event.clientX,
        y: event.clientY,
        startedOnDescription: Boolean(event.target.closest?.(".study-card-description")),
      };

      if (event.pointerType === "mouse") {
        card.setPointerCapture?.(event.pointerId);
      }
    });

    card.addEventListener("pointerup", (event) => {
      if (!pointerStart || pointerStart.id !== event.pointerId) {
        return;
      }

      const deltaX = event.clientX - pointerStart.x;
      const deltaY = event.clientY - pointerStart.y;
      const horizontalSwipe = Math.abs(deltaX) >= swipeThreshold && Math.abs(deltaX) > Math.abs(deltaY);
      const smallTap = Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10;
      const startedOnDescription = pointerStart.startedOnDescription;
      const endedOnDescription = Boolean(event.target.closest?.(".study-card-description"));
      pointerStart = null;

      if (startedOnDescription || endedOnDescription) {
        if (horizontalSwipe && card.classList.contains("is-flipped")) {
          performStudyAction("unknown", deltaX < 0 ? "left" : "right");
        }
        return;
      }

      if (horizontalSwipe) {
        if (card.classList.contains("is-flipped")) {
          performStudyAction("unknown", deltaX < 0 ? "left" : "right");
        }
        return;
      }

      if (smallTap) {
        if (card.classList.contains("is-flipped")) {
          performStudyAction("known");
        } else {
          flipStudyCard();
        }
      }
    });

    card.addEventListener("pointercancel", () => {
      pointerStart = null;
    });

    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (card.classList.contains("is-flipped")) {
          performStudyAction("known");
        } else {
          flipStudyCard();
        }
      }

      if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && card.classList.contains("is-flipped")) {
        event.preventDefault();
        performStudyAction("unknown", event.key === "ArrowLeft" ? "left" : "right");
      }
    });

    main.querySelector("[data-study-known]")?.addEventListener("click", () => performStudyAction("known"));
    main.querySelector("[data-study-unknown]")?.addEventListener("click", () => performStudyAction("unknown", "right"));
  }

  function bindStudyNavigation() {
    main.querySelectorAll("[data-start-new-tour]").forEach((button) => {
      button.addEventListener("click", () => {
        const route = parseRoute();
        if (route.type === "subcategory" && button.dataset.startNewTour === "archive") {
          startFreshTour(route.subcategory, route.partNumber);
          location.hash = linkForStudy(route.subcategory, route.partNumber).slice(1);
          return;
        }

        if (route.type !== "study") {
          return;
        }

        startFreshTour(route.subcategory, route.partNumber);
        render();
      });
    });

    main.querySelector("[data-restart-tour]")?.addEventListener("click", () => {
      const route = parseRoute();
      if (route.type !== "study") {
        return;
      }

      startFreshTour(route.subcategory, route.partNumber);
      render();
    });
  }

  function renderStudy(subcategory, category, route) {
    const context = currentWordIds(subcategory, route.partNumber);
    if (context.actualWords.length === 0) {
      return renderEmptySubcategory(subcategory, category);
    }

    const requestedKey = studyRouteKey(subcategory.id, context.partKey);
    const active = progress.active;

    if (active) {
      const activeEntry = subcategoryById.get(active.subcategoryId);
      const activePartNumber = active.partKey === "all" ? null : Number(active.partKey);
      const validOtherActive = activeEntry ? validActiveTour(active, activeEntry.subcategory, activePartNumber) : null;

      if (!validOtherActive) {
        clearInvalidActiveTour();
      } else if (studyRouteKey(active.subcategoryId, active.partKey) !== requestedKey) {
        return renderStudyPaused(subcategory, category, validOtherActive);
      }
    }

    const currentActive = validActiveTour(progress.active, subcategory, route.partNumber);
    if (currentActive) {
      progress.active = currentActive;
      return renderStudyActive(subcategory, category, currentActive);
    }

    const completed = progress.lastCompleted;
    if (completed?.routeKey === requestedKey) {
      return renderStudyCompletion(subcategory, category, completed);
    }

    const newTour = createNewTour(subcategory, route.partNumber);
    return newTour ? renderStudyActive(subcategory, category, newTour) : renderEmptySubcategory(subcategory, category);
  }

  function renderNotFound() {
    const section = document.createElement("section");
    section.className = "route-view not-found-view container";
    section.innerHTML = `
      <div class="empty-state-icon" aria-hidden="true">${iconSvg("question")}</div>
      <p class="section-kicker">Sayfa bulunamadı</p>
      <h1>Bu öğrenme alanı henüz yok.</h1>
      <p>İstersen ana sayfaya dönüp başka bir kategori seçebilirsin.</p>
      <a class="back-link" href="#/"><span aria-hidden="true">←</span> Ana sayfaya dön</a>`;
    return section;
  }

  function renderGrammar() {
    const completedCount = grammarTopics.filter((topic) => grammarProgress.has(topic.id)).length;
    const totalCount = grammarTopics.length;
    const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    const section = document.createElement("section");
    section.className = "route-view grammar-view";
    section.innerHTML = `
      <div class="container">
        ${breadcrumb([
          { label: "Ana sayfa", href: "#/" },
          { label: "Gramer" },
        ])}

        <header class="grammar-hero">
          <div class="grammar-hero-copy">
            <p class="section-kicker">Adım adım ilerle</p>
            <h1>Gramer çalışmalarım</h1>
            <p class="route-description">Temel yapılardan B1 konularına uzanan çalışma planını takip et, öğrendiğin konuları işaretle.</p>
          </div>
          <div class="grammar-hero-icon" aria-hidden="true">${iconSvg("book")}</div>
        </header>

        <section class="grammar-overview" aria-labelledby="grammar-overview-title">
          <div class="grammar-overview-heading">
            <div>
              <p class="section-kicker">Genel ilerleme</p>
              <h2 id="grammar-overview-title">Gramer yolculuğun</h2>
            </div>
            <strong class="grammar-percentage" data-grammar-percentage>${percentage}%</strong>
          </div>
          <div class="grammar-progress-track" role="progressbar" aria-label="Gramer ilerlemesi" aria-valuemin="0" aria-valuemax="${totalCount}" aria-valuenow="${completedCount}">
            <span data-grammar-progress-bar style="width: ${percentage}%;"></span>
          </div>
          <div class="grammar-overview-stats">
            <span><strong data-grammar-completed>${completedCount}</strong> / ${totalCount} konu tamamlandı</span>
            <span>${totalCount} konuluk plan</span>
          </div>
        </section>

        <section class="grammar-stage-list" aria-label="Gramer aşamaları">
          ${grammarStages.map((stage, stageIndex) => {
            const stageCompleted = stage.topics.filter((topic) => grammarProgress.has(topic.id)).length;
            const stageIsComplete = stageCompleted === stage.topics.length;
            return `
              <details class="grammar-stage${stageIsComplete ? " is-complete" : ""}"${stageIndex === 0 ? " open" : ""}>
                <summary class="grammar-stage-summary">
                  <span class="grammar-stage-number">${String(stageIndex + 1).padStart(2, "0")}</span>
                  <span class="grammar-stage-heading">
                    <span class="section-kicker">Aşama ${stageIndex + 1}</span>
                    <strong>${stage.title.replace(/^Aşama \d+ — /, "")}</strong>
                    <small>${stage.description}</small>
                  </span>
                  <span class="grammar-stage-count" data-grammar-stage-count="${stage.id}">${stageCompleted}/${stage.topics.length}</span>
                  <span class="grammar-stage-chevron" aria-hidden="true">⌄</span>
                </summary>
                <div class="grammar-topic-list">
                  ${stage.topics.map((topic) => `
                    <label class="grammar-topic-row${grammarProgress.has(topic.id) ? " is-complete" : ""}" data-grammar-topic-row="${topic.id}">
                      <span class="grammar-topic-number">${String(grammarTopicNumbers.get(topic.id)).padStart(2, "0")}</span>
                      <span class="grammar-topic-copy">
                        <strong>${topic.title}</strong>
                        ${topic.detail ? `<small>${topic.detail}</small>` : ""}
                        ${topic.example ? `<em><span>Örnek</span>${topic.example}</em>` : ""}
                      </span>
                      <span class="grammar-topic-check">
                        <input class="grammar-topic-checkbox" type="checkbox" data-grammar-checkbox="${topic.id}"${grammarProgress.has(topic.id) ? " checked" : ""} aria-label="${topic.title} tamamlandı">
                        <span class="grammar-checkmark" aria-hidden="true">✓</span>
                      </span>
                    </label>`).join("")}
                </div>
              </details>`;
          }).join("")}
        </section>
      </div>`;
    return section;
  }

  function updateGrammarProgressUI() {
    const completedCount = grammarTopics.filter((topic) => grammarProgress.has(topic.id)).length;
    const totalCount = grammarTopics.length;
    const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    const percentageElement = main.querySelector("[data-grammar-percentage]");
    const completedElement = main.querySelector("[data-grammar-completed]");
    const progressBar = main.querySelector("[data-grammar-progress-bar]");
    const progressTrack = progressBar?.parentElement;

    if (percentageElement) percentageElement.textContent = `${percentage}%`;
    if (completedElement) completedElement.textContent = completedCount;
    if (progressBar) progressBar.style.width = `${percentage}%`;
    progressTrack?.setAttribute("aria-valuenow", String(completedCount));

    grammarStages.forEach((stage) => {
      const stageCompleted = stage.topics.filter((topic) => grammarProgress.has(topic.id)).length;
      const stageElement = main.querySelector(`[data-grammar-stage-count="${stage.id}"]`);
      const stageDetails = stageElement?.closest(".grammar-stage");
      if (stageElement) stageElement.textContent = `${stageCompleted}/${stage.topics.length}`;
      stageDetails?.classList.toggle("is-complete", stageCompleted === stage.topics.length);
    });

    main.querySelectorAll("[data-grammar-topic-row]").forEach((row) => {
      row.classList.toggle("is-complete", grammarProgress.has(row.dataset.grammarTopicRow));
    });
  }

  function bindGrammarInteractions() {
    main.querySelectorAll("[data-grammar-checkbox]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const topicId = checkbox.dataset.grammarCheckbox;
        if (!grammarTopicIds.has(topicId)) return;

        if (checkbox.checked) {
          grammarProgress.add(topicId);
        } else {
          grammarProgress.delete(topicId);
        }

        persistGrammarProgress();
        updateGrammarProgressUI();
      });
    });
  }

  function updatePageTitle(route) {
    if (route.type === "category") {
      document.title = `${route.category.title} | English Vocabulary`;
    } else if (route.type === "grammar") {
      document.title = "Gramer Çalışmalarım | English Vocabulary";
    } else if (route.type === "subcategory") {
      document.title = `${route.subcategory.title} | English Vocabulary`;
    } else if (route.type === "study") {
      document.title = `Ezber Modu · ${route.subcategory.title} | English Vocabulary`;
    } else {
      document.title = "English Vocabulary | Ana Sayfa";
    }
  }

  function updateNavContext(route) {
    if (!navContext) {
      return;
    }

    const labels = {
      home: "Sprint 3 · Kategoriler",
      category: "Sprint 3 · Alt kategoriler",
      grammar: "Gramer · Çalışma planı",
      subcategory: "Sprint 3 · Kelime kartları",
      study: "Sprint 4 · Ezber modu",
      "not-found": "Sprint 4 · Kategoriler",
    };
    navContext.textContent = labels[route.type] || labels.home;
  }

  function setWordCardState(button, isFlipped) {
    const card = button.closest(".word-card");
    const front = button.querySelector(".word-card-front");
    const back = button.querySelector(".word-card-back");
    const word = card?.dataset.wordId ? words.find((item) => item.id === card.dataset.wordId) : null;

    button.setAttribute("aria-pressed", String(isFlipped));
    button.setAttribute("aria-label", word
      ? `${word.english} kartını ${isFlipped ? "ön yüzüne" : "arka yüzüne"} çevir`
      : "Kelime kartını çevir");
    card?.classList.toggle("is-flipped", isFlipped);
    front?.setAttribute("aria-hidden", String(isFlipped));
    back?.setAttribute("aria-hidden", String(!isFlipped));
  }

  function bindWordCardInteractions() {
    const flipDuration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 10 : 450;

    main.querySelectorAll(".word-card-trigger").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.animating === "true") {
          return;
        }

        const isFlipped = button.getAttribute("aria-pressed") === "true";
        button.dataset.animating = "true";
        setWordCardState(button, !isFlipped);

        window.setTimeout(() => {
          delete button.dataset.animating;
        }, flipDuration);
      });
    });
  }

  let isFirstRender = true;

  function render() {
    const route = parseRoute();
    const view = route.type === "home"
      ? renderHome()
      : route.type === "category"
        ? renderCategory(route.category)
        : route.type === "grammar"
          ? renderGrammar()
        : route.type === "subcategory"
          ? renderSubcategory(route.subcategory, route.category, route)
          : route.type === "study"
            ? renderStudy(route.subcategory, route.category, route)
          : renderNotFound();

    main.replaceChildren(view);
    bindWordCardInteractions();
    bindStudyInteractions();
    bindStudyNavigation();
    bindGrammarInteractions();
    updatePageTitle(route);
    updateNavContext(route);

    if (!isFirstRender) {
      main.focus({ preventScroll: true });
    }
    isFirstRender = false;
  }

  window.addEventListener("hashchange", render);
  render();
})();
