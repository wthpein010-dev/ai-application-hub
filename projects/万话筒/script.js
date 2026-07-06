const STORAGE_KEY = "wanhuatong-history";

const modes = [
  {
    id: "emotion",
    title: "情绪翻译",
    category: "心情到表达",
    brief: "把混乱情绪翻成可沟通的话。",
    sample: "我不是非要你马上回复，但你一直没消息，我会觉得自己好像不重要。"
  },
  {
    id: "manual",
    title: "生活说明",
    category: "复杂到易懂",
    brief: "把说明、规则、提醒改成步骤卡。",
    sample: "本药每日两次，饭后服用。服药期间避免饮酒，如出现皮疹或持续头晕请及时咨询医生。"
  },
  {
    id: "love",
    title: "情书加工",
    category: "普通到心动",
    brief: "把直白喜欢写得更有温度。",
    sample: "我今天路过那家店，突然想到你，要是你在旁边就好了。"
  },
  {
    id: "secret",
    title: "暗语改写",
    category: "直白到隐晦",
    brief: "把不方便直说的话改成暗号、梗或朋友圈文。",
    sample: "我想见你，但不想显得我太主动。"
  },
  {
    id: "language",
    title: "多语言翻译",
    category: "中文到多语",
    brief: "把同一句话切换成不同语言表达。",
    sample: "请帮我把这段话改得礼貌一点：我需要你今天下班前给我确认结果。"
  },
  {
    id: "classical",
    title: "古诗古文",
    category: "今话到古风",
    brief: "现代话、古风短句和白话解释互转。",
    sample: "今晚月色很好，我很想念远方的朋友。"
  }
];

const languageName = {
  zh: "中文",
  en: "English",
  ja: "日本語",
  ko: "한국어",
  fr: "Français"
};

const toneName = {
  warm: "温和",
  clear: "清楚",
  romantic: "浪漫",
  formal: "正式",
  playful: "有梗"
};

const nodes = {
  modeList: document.querySelector("#modeList"),
  modeCategory: document.querySelector("#modeCategory"),
  modeTitle: document.querySelector("#modeTitle"),
  sourceText: document.querySelector("#sourceText"),
  counter: document.querySelector("#counter"),
  language: document.querySelector("#languageSelect"),
  tone: document.querySelector("#toneSelect"),
  length: document.querySelector("#lengthSelect"),
  result: document.querySelector("#result"),
  convert: document.querySelector("#convertButton"),
  sample: document.querySelector("#sampleButton"),
  copy: document.querySelector("#copyButton"),
  quickChips: document.querySelector("#quickChips"),
  history: document.querySelector("#historyList"),
  clearHistory: document.querySelector("#clearHistory")
};

const state = {
  modeId: "emotion",
  history: loadHistory()
};

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveHistory() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.history.slice(0, 8)));
}

function currentMode() {
  return modes.find((mode) => mode.id === state.modeId) || modes[0];
}

function init() {
  renderModes();
  renderQuickChips();
  renderHistory();
  setMode("emotion");
  nodes.sourceText.addEventListener("input", updateCounter);
  nodes.convert.addEventListener("click", convert);
  nodes.sample.addEventListener("click", useNextSample);
  nodes.copy.addEventListener("click", copyResult);
  nodes.clearHistory.addEventListener("click", () => {
    state.history = [];
    saveHistory();
    renderHistory();
  });
  [nodes.language, nodes.tone, nodes.length].forEach((node) => node.addEventListener("change", convert));
}

function renderModes() {
  nodes.modeList.innerHTML = modes.map((mode) => `
    <button class="mode-button" type="button" data-mode="${mode.id}">
      <strong>${mode.title}</strong>
      <span>${mode.brief}</span>
    </button>
  `).join("");
  nodes.modeList.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });
}

function renderQuickChips() {
  nodes.quickChips.innerHTML = modes.map((mode) => `
    <button class="chip" type="button" data-mode="${mode.id}">${mode.title}</button>
  `).join("");
  nodes.quickChips.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });
}

function setMode(modeId) {
  state.modeId = modeId;
  const mode = currentMode();
  nodes.modeTitle.textContent = mode.title;
  nodes.modeCategory.textContent = mode.category;
  nodes.sourceText.value = mode.sample;
  document.querySelectorAll(".mode-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === modeId);
  });
  updateCounter();
  convert();
}

function updateCounter() {
  const count = nodes.sourceText.value.trim().length;
  nodes.counter.textContent = `${count} 字`;
}

function useNextSample() {
  const index = modes.findIndex((mode) => mode.id === state.modeId);
  const next = modes[(index + 1) % modes.length];
  setMode(next.id);
}

function normalizeInput() {
  return nodes.sourceText.value.trim() || currentMode().sample;
}

function sentenceParts(text) {
  return text.split(/[。！？!?；;\n]+/).map((item) => item.trim()).filter(Boolean).slice(0, 5);
}

function convert() {
  const text = normalizeInput();
  const options = {
    language: nodes.language.value,
    tone: nodes.tone.value,
    length: nodes.length.value
  };
  const sections = transformText(text, currentMode().id, options);
  nodes.result.innerHTML = sections.map(renderSection).join("");
  addHistory(text);
}

function renderSection(section) {
  const body = Array.isArray(section.body)
    ? `<ol>${section.body.map((item) => `<li>${item}</li>`).join("")}</ol>`
    : `<p>${section.body}</p>`;
  return `<section class="result-section"><h4>${section.title}</h4>${body}</section>`;
}

function transformText(text, modeId, options) {
  const base = text.replace(/\s+/g, " ");
  const lang = languageName[options.language];
  const tone = toneName[options.tone];
  const parts = sentenceParts(base);

  if (modeId === "emotion") {
    return localize([
      { title: "真实需求", body: `我在意的不是表面这件事，而是希望被看见、被认真回应，并确认关系里的安全感。` },
      { title: "可以这样说", body: `我想用更${tone}的方式表达：${base}。如果你现在不方便，也请告诉我一个大概时间，我会安心很多。` },
      { title: "下一步", body: ["先说感受，不先定罪。", "提出一个具体请求。", "给对方留出解释和回应空间。"] }
    ], options.language);
  }

  if (modeId === "manual") {
    const steps = parts.length ? parts : [base];
    return localize([
      { title: "易懂版本", body: `这件事可以按步骤处理：先确认要做什么，再看注意事项，最后遇到异常及时停下来求助。` },
      { title: "步骤卡", body: steps.map((part, index) => `${index + 1}. ${part}`) },
      { title: "风险提醒", body: "如果内容涉及药品、合同、财务或安全操作，请以原说明和专业人员意见为准。" }
    ], options.language);
  }

  if (modeId === "love") {
    return localize([
      { title: "情书版", body: `我把一句普通的话放在心里转了一圈，最后还是想告诉你：${base}。它不是临时起意，是今天所有细小瞬间里最温柔的一部分。` },
      { title: "短句版", body: `今天的风景有很多，可我最想分享给你。` },
      { title: "更进一步", body: options.length === "detailed" ? "可以补一个具体记忆、一个共同场景和一个轻轻的邀请。" : "补一个具体细节，会更真诚。" }
    ], options.language);
  }

  if (modeId === "secret") {
    return localize([
      { title: "暗语版", body: `今天的信号有点明显：某个坐标正在申请一次短暂会面，接收方如果愿意，可以回一个天气暗号。` },
      { title: "朋友圈版", body: `有些路过不是偶然，是心里那个定位又偷偷刷新了一次。` },
      { title: "克制版", body: `如果你刚好也有空，我们可以把“改天”改成一个具体时间。` }
    ], options.language);
  }

  if (modeId === "language") {
    return [
      { title: `${lang}版本`, body: translateLite(base, options.language, tone) },
      { title: "语气说明", body: `当前结果按“${tone}”语气处理，适合消息、邮件或社交平台初稿。` },
      { title: "可继续加工", body: ["改得更短", "改得更正式", "改成情书", "改成暗语"] }
    ];
  }

  return localize([
    { title: "古风版", body: `今宵清光如水，忽念远人。山川相隔，心声未远，愿一纸微言，抵达君侧。` },
    { title: "七言短句", body: `月明忽起故人思，千里清辉共此时。` },
    { title: "白话解释", body: `这句话是在说：${base}。重点是借月色表达想念，让情绪更含蓄。` }
  ], options.language);
}

function localize(sections, language) {
  if (language === "zh") return sections;
  return sections.map((section) => ({
    title: `${languageName[language]} ${section.title}`,
    body: Array.isArray(section.body)
      ? section.body.map((item) => translateLite(item, language, "clear"))
      : translateLite(section.body, language, "clear")
  }));
}

function translateLite(text, language, tone) {
  if (language === "zh") return text;
  const prefix = {
    en: tone === "formal" ? "Polished version" : "Natural version",
    ja: "自然な表現",
    ko: "자연스러운 표현",
    fr: "Version naturelle"
  }[language];
  const note = {
    en: "Please keep the meaning, soften the tone, and make it easy to understand.",
    ja: "意味を保ちながら、やわらかく伝わる表現にします。",
    ko: "의미는 유지하고 더 부드럽고 이해하기 쉽게 바꿉니다.",
    fr: "Le sens est conservé avec un ton plus clair et plus doux."
  }[language];
  return `${prefix}: ${text}。${note}`;
}

function addHistory(text) {
  const item = {
    modeId: state.modeId,
    text,
    time: Date.now()
  };
  state.history = [item, ...state.history.filter((old) => old.text !== text)].slice(0, 8);
  saveHistory();
  renderHistory();
}

function renderHistory() {
  if (!state.history.length) {
    nodes.history.innerHTML = `<li class="empty">还没有转换记录。</li>`;
    return;
  }
  nodes.history.innerHTML = state.history.map((item) => {
    const mode = modes.find((entry) => entry.id === item.modeId) || modes[0];
    return `<li><button type="button" data-mode="${item.modeId}" data-text="${escapeAttr(item.text)}">${mode.title}：${escapeHtml(item.text.slice(0, 36))}</button></li>`;
  }).join("");
  nodes.history.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.modeId = button.dataset.mode;
      const mode = currentMode();
      nodes.modeTitle.textContent = mode.title;
      nodes.modeCategory.textContent = mode.category;
      nodes.sourceText.value = button.dataset.text;
      document.querySelectorAll(".mode-button").forEach((modeButton) => {
        modeButton.classList.toggle("active", modeButton.dataset.mode === state.modeId);
      });
      updateCounter();
      convert();
    });
  });
}

function copyResult() {
  const text = nodes.result.innerText.trim();
  navigator.clipboard.writeText(text).then(() => {
    nodes.copy.textContent = "已复制";
    setTimeout(() => {
      nodes.copy.textContent = "复制";
    }, 1200);
  });
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

init();
