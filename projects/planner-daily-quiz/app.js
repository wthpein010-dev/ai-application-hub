const STORAGE_KEY = "planner-daily-quiz-records-v1";
const PROFILE_KEY = "planner-daily-quiz-profile-v1";
const TODAY_KEY = "planner-daily-quiz-today-v1";

const state = {
  config: {
    dailyQuestionCount: 10,
    timeLimitSeconds: 900,
    unlockHour: 0,
    submitEndpoint: "",
    aiFeedbackEndpoint: "",
    version: "local"
  },
  questions: [],
  dailyQuestions: [],
  answers: new Map(),
  startedAt: null,
  timer: null,
  remainingSeconds: 0,
  lastResult: null
};

const nodes = {
  startButton: document.querySelector("#startButton"),
  historyButton: document.querySelector("#historyButton"),
  reviewTodayButton: document.querySelector("#reviewTodayButton"),
  profileForm: document.querySelector("#profileForm"),
  userName: document.querySelector("#userName"),
  userRole: document.querySelector("#userRole"),
  setupPanel: document.querySelector("#setupPanel"),
  quizPanel: document.querySelector("#quizPanel"),
  quizForm: document.querySelector("#quizForm"),
  resultPanel: document.querySelector("#resultPanel"),
  historyPanel: document.querySelector("#historyPanel"),
  historyList: document.querySelector("#historyList"),
  lockedPanel: document.querySelector("#lockedPanel"),
  lockedSummary: document.querySelector("#lockedSummary"),
  syncState: document.querySelector("#syncState"),
  todayCount: document.querySelector("#todayCount"),
  timerPreview: document.querySelector("#timerPreview"),
  timerText: document.querySelector("#timerText"),
  timerBar: document.querySelector("#timerBar"),
  progressText: document.querySelector("#progressText"),
  questionDots: document.querySelector("#questionDots"),
  template: document.querySelector("#questionTemplate")
};

init();

async function init() {
  await loadData();
  hydrateProfile();
  state.dailyQuestions = pickDailyQuestions(state.questions, state.config.dailyQuestionCount);
  nodes.todayCount.textContent = state.dailyQuestions.length;
  nodes.timerPreview.textContent = formatTime(state.config.timeLimitSeconds);
  const todayRecord = getTodayRecord();
  if (todayRecord) {
    showLocked(todayRecord);
  }
  bindEvents();
}

async function loadData() {
  const [configResponse, questionResponse] = await Promise.all([
    fetch("./data/config.json").catch(() => null),
    fetch("./data/questions.json")
  ]);
  if (configResponse?.ok) {
    state.config = { ...state.config, ...(await configResponse.json()) };
  }
  state.questions = await questionResponse.json();
}

function bindEvents() {
  nodes.startButton.addEventListener("click", () => {
    nodes.setupPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    nodes.userName.focus();
  });
  nodes.historyButton.addEventListener("click", toggleHistory);
  nodes.reviewTodayButton.addEventListener("click", () => {
    const todayRecord = getTodayRecord();
    if (todayRecord) renderResult(todayRecord, { readonly: true });
  });
  nodes.profileForm.addEventListener("submit", event => {
    event.preventDefault();
    startQuiz();
  });
  nodes.quizForm.addEventListener("change", handleAnswerChange);
  nodes.quizForm.addEventListener("submit", event => {
    event.preventDefault();
    submitQuiz("manual");
  });
}

function hydrateProfile() {
  const profile = readJson(PROFILE_KEY, {});
  if (profile.userName) nodes.userName.value = profile.userName;
  if (profile.userRole) nodes.userRole.value = profile.userRole;
}

function startQuiz() {
  if (getTodayRecord()) {
    showLocked(getTodayRecord());
    return;
  }
  const profile = getProfile();
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  state.answers = new Map();
  state.startedAt = new Date();
  state.remainingSeconds = state.config.timeLimitSeconds;
  renderQuiz();
  nodes.setupPanel.hidden = true;
  nodes.lockedPanel.hidden = true;
  nodes.historyPanel.hidden = true;
  nodes.resultPanel.hidden = true;
  nodes.quizPanel.hidden = false;
  startTimer();
  nodes.quizPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderQuiz() {
  nodes.quizForm.innerHTML = "";
  state.dailyQuestions.forEach((question, index) => {
    const card = nodes.template.content.firstElementChild.cloneNode(true);
    card.dataset.questionId = question.id;
    card.querySelector(".question-index").textContent = `第 ${index + 1} 题`;
    card.querySelector(".question-category").textContent = question.category;
    card.querySelector("h3").textContent = question.question;
    const optionList = card.querySelector(".option-list");
    const inputType = question.type === "multiple" ? "checkbox" : "radio";
    question.options.forEach((option, optionIndex) => {
      const optionId = `${question.id}-${optionIndex}`;
      const label = document.createElement("label");
      label.className = "option";
      label.innerHTML = `
        <input id="${optionId}" type="${inputType}" name="${question.id}" value="${optionIndex}" />
        <span>${escapeHtml(option)}</span>
      `;
      optionList.appendChild(label);
    });
    nodes.quizForm.appendChild(card);
  });
  const submitRow = document.createElement("div");
  submitRow.className = "submit-row";
  submitRow.innerHTML = `
    <button class="secondary-button" type="button" id="saveDraftButton">保存本地草稿</button>
    <button class="primary-button" type="submit">提交批改</button>
  `;
  nodes.quizForm.appendChild(submitRow);
  document.querySelector("#saveDraftButton").addEventListener("click", saveDraft);
  renderProgress();
}

function handleAnswerChange(event) {
  const input = event.target;
  if (!input.name) return;
  const question = state.dailyQuestions.find(item => item.id === input.name);
  if (!question) return;
  const selected = Array.from(nodes.quizForm.querySelectorAll(`input[name="${cssEscape(input.name)}"]:checked`)).map(item => Number(item.value));
  state.answers.set(input.name, selected);
  renderProgress();
}

function renderProgress() {
  const answered = state.dailyQuestions.filter(question => (state.answers.get(question.id) || []).length > 0).length;
  nodes.progressText.textContent = `${answered}/${state.dailyQuestions.length}`;
  nodes.questionDots.innerHTML = state.dailyQuestions.map(question => {
    const done = (state.answers.get(question.id) || []).length > 0;
    return `<span class="${done ? "is-done" : ""}"></span>`;
  }).join("");
}

function startTimer() {
  clearInterval(state.timer);
  updateTimer();
  state.timer = setInterval(() => {
    state.remainingSeconds -= 1;
    updateTimer();
    if (state.remainingSeconds <= 0) {
      submitQuiz("timeout");
    }
  }, 1000);
}

function updateTimer() {
  const total = Math.max(1, state.config.timeLimitSeconds);
  const remaining = Math.max(0, state.remainingSeconds);
  nodes.timerText.textContent = formatTime(remaining);
  nodes.timerBar.style.width = `${Math.max(0, remaining / total) * 100}%`;
  if (remaining <= 60) {
    nodes.timerText.style.color = "var(--coral)";
  }
}

function submitQuiz(reason) {
  clearInterval(state.timer);
  const profile = getProfile();
  const result = gradeQuiz(reason, profile);
  persistResult(result);
  renderResult(result);
  submitResult(result);
}

function gradeQuiz(reason, profile) {
  const finishedAt = new Date();
  const reviews = state.dailyQuestions.map((question, index) => {
    const selected = state.answers.get(question.id) || [];
    const correct = sameSet(selected, question.answer);
    return {
      index: index + 1,
      id: question.id,
      type: question.type,
      category: question.category,
      question: question.question,
      options: question.options,
      selected,
      answer: question.answer,
      correct,
      explanation: question.explanation,
      tags: question.tags || []
    };
  });
  const correctCount = reviews.filter(item => item.correct).length;
  const score = Math.round((correctCount / reviews.length) * 100);
  const weakTags = collectWeakTags(reviews);
  return {
    id: `${todayKey()}-${profile.userName || "anonymous"}-${Date.now()}`,
    date: todayKey(),
    profile,
    reason,
    score,
    correctCount,
    total: reviews.length,
    durationSeconds: state.config.timeLimitSeconds - Math.max(0, state.remainingSeconds),
    startedAt: state.startedAt?.toISOString() || new Date().toISOString(),
    finishedAt: finishedAt.toISOString(),
    reviews,
    weakTags,
    practice: buildPractice(weakTags, reviews),
    synced: false,
    appVersion: state.config.version
  };
}

function renderResult(result, options = {}) {
  state.lastResult = result;
  nodes.quizPanel.hidden = true;
  nodes.setupPanel.hidden = true;
  nodes.lockedPanel.hidden = false;
  nodes.lockedSummary.textContent = `今日得分 ${result.score}，答对 ${result.correctCount}/${result.total} 题。下一轮将在本地时间 0 点后开启。`;
  nodes.resultPanel.hidden = false;
  const angle = `${Math.round(result.score * 3.6)}deg`;
  const title = result.score >= 90 ? "今天状态拉满" : result.score >= 75 ? "基本功在线" : result.score >= 60 ? "有几处要回炉" : "先别慌，错题才是金币";
  const wrongReviews = result.reviews.filter(item => !item.correct);
  nodes.resultPanel.style.setProperty("--score-angle", angle);
  nodes.resultPanel.innerHTML = `
    <div class="score-hero">
      <div class="score-ring"><strong>${result.score}</strong></div>
      <div>
        <p class="eyebrow">批改完成</p>
        <h2>${escapeHtml(title)}</h2>
        <p>答对 ${result.correctCount}/${result.total} 题，用时 ${formatDuration(result.durationSeconds)}。${options.readonly ? "这是今日已完成记录。" : "记录已保存，明天 0 点后解锁下一轮每日训练。"}</p>
        <div class="tag-strip">${result.weakTags.length ? result.weakTags.map(tag => `<span>${escapeHtml(tag)}</span>`).join("") : "<span>暂无明显短板</span>"}</div>
        <div class="result-actions">
          <button class="secondary-button" type="button" id="showHistoryAfterResult">查看历史</button>
          <button class="secondary-button" type="button" id="copyResultButton">复制结果</button>
        </div>
      </div>
    </div>

    <section class="review-list">
      ${result.reviews.map(renderReviewItem).join("")}
    </section>

    <section class="practice-list">
      <div class="section-title">
        <p class="eyebrow">错题强化</p>
        <h2>明天前可以看这 3 个练习方向</h2>
      </div>
      ${result.practice.map(renderPracticeItem).join("")}
    </section>
  `;
  document.querySelector("#showHistoryAfterResult").addEventListener("click", toggleHistory);
  document.querySelector("#copyResultButton").addEventListener("click", () => copyResult(result));
  nodes.resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderReviewItem(review) {
  const selectedText = review.selected.length ? review.selected.map(index => review.options[index]).join("、") : "未作答";
  const answerText = review.answer.map(index => review.options[index]).join("、");
  return `
    <article class="review-item ${review.correct ? "is-correct" : "is-wrong"}">
      <h3>${review.correct ? "答对" : "需订正"} · 第 ${review.index} 题：${escapeHtml(review.question)}</h3>
      <p>你的答案：${escapeHtml(selectedText)}</p>
      <p class="answer-line">正确答案：${escapeHtml(answerText)}</p>
      <p>${escapeHtml(review.explanation)}</p>
      <div class="tag-strip">${review.tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
    </article>
  `;
}

function renderPracticeItem(item, index) {
  return `
    <article class="practice-item">
      <h3>练习 ${index + 1}：${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.description)}</p>
    </article>
  `;
}

function showLocked(record) {
  nodes.setupPanel.hidden = true;
  nodes.quizPanel.hidden = true;
  nodes.lockedPanel.hidden = false;
  nodes.lockedSummary.textContent = `今日得分 ${record.score}，答对 ${record.correctCount}/${record.total} 题。下一轮将在本地时间 0 点后开启。`;
}

function toggleHistory() {
  const isHidden = nodes.historyPanel.hidden;
  if (isHidden) renderHistory();
  nodes.historyPanel.hidden = !isHidden;
  if (isHidden) nodes.historyPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderHistory() {
  const records = getRecords().sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt)));
  nodes.historyList.innerHTML = records.length
    ? records.map(record => `
      <article class="history-item">
        <strong>${escapeHtml(record.date)} · ${record.score} 分</strong>
        <p>${escapeHtml(record.profile.userName || "匿名")}，答对 ${record.correctCount}/${record.total} 题，用时 ${formatDuration(record.durationSeconds)}。</p>
        <div class="tag-strip">${(record.weakTags || []).map(tag => `<span>${escapeHtml(tag)}</span>`).join("") || "<span>暂无明显短板</span>"}</div>
      </article>
    `).join("")
    : `<article class="history-item"><strong>还没有记录</strong><p>完成一次每日训练后，这里会出现分数和薄弱能力。</p></article>`;
}

function saveDraft() {
  const draft = {
    date: todayKey(),
    answers: Object.fromEntries(state.answers),
    savedAt: new Date().toISOString()
  };
  localStorage.setItem(`${TODAY_KEY}-draft`, JSON.stringify(draft));
  nodes.syncState.textContent = "草稿已保存";
}

async function submitResult(result) {
  const endpoint = state.config.submitEndpoint || window.PLANNER_DAILY_QUIZ_SUBMIT_ENDPOINT || "";
  if (!endpoint) {
    nodes.syncState.textContent = "本地已保存";
    nodes.syncState.classList.remove("is-synced");
    return;
  }
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    markSynced(result.id);
    nodes.syncState.textContent = "云端已同步";
    nodes.syncState.classList.add("is-synced");
  } catch (error) {
    nodes.syncState.textContent = "同步失败，本地已保存";
    nodes.syncState.classList.remove("is-synced");
    console.warn("Submit failed:", error);
  }
}

function markSynced(id) {
  const records = getRecords().map(record => record.id === id ? { ...record, synced: true } : record);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function persistResult(result) {
  const records = getRecords().filter(record => record.date !== result.date || record.profile.userName !== result.profile.userName);
  records.push(result);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function getTodayRecord() {
  const profile = getProfile(false);
  const records = getRecords();
  if (!profile.userName) return null;
  return records.find(record => record.date === todayKey() && record.profile.userName === profile.userName);
}

function getRecords() {
  return readJson(STORAGE_KEY, []);
}

function getProfile(requireName = true) {
  const profile = {
    userName: nodes.userName.value.trim(),
    userRole: nodes.userRole.value
  };
  if (requireName && !profile.userName) {
    nodes.userName.focus();
    throw new Error("Missing user name");
  }
  return profile;
}

function pickDailyQuestions(questionBank, count) {
  const date = todayKey();
  const shuffled = seededShuffle(questionBank, hashString(date));
  const mostlyChoice = shuffled.filter(item => ["single", "multiple", "true_false"].includes(item.type));
  return mostlyChoice.slice(0, Math.min(count, mostlyChoice.length));
}

function seededShuffle(items, seed) {
  const result = [...items];
  let value = seed || 1;
  for (let i = result.length - 1; i > 0; i -= 1) {
    value = (value * 1664525 + 1013904223) % 4294967296;
    const j = value % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function hashString(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function collectWeakTags(reviews) {
  const counts = new Map();
  reviews.filter(item => !item.correct).forEach(item => {
    [...item.tags, item.category].forEach(tag => counts.set(tag, (counts.get(tag) || 0) + 1));
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([tag]) => tag);
}

function buildPractice(weakTags, reviews) {
  const wrong = reviews.filter(item => !item.correct);
  const primary = weakTags.slice(0, 3);
  if (!primary.length) {
    return [
      { title: "规则复述", description: "任选一个今天答对的规则题，用触发条件、判断顺序、结果、异常四段重新写一遍。" },
      { title: "美需精简", description: "把一条模糊美需改写为“（类别）资源名称及交付内容”的格式。" },
      { title: "流程补边界", description: "给任意一个道具流程补 3 个边界情况和期望结果。" }
    ];
  }
  return primary.map(tag => {
    const related = wrong.find(item => item.tags.includes(tag) || item.category === tag);
    return {
      title: `${tag}专项`,
      description: related
        ? `围绕“${related.question}”重写一版规则说明，要求包含为什么错、正确判断和可验收表达。`
        : `围绕 ${tag} 写 3 条容易漏掉的边界或验收点。`
    };
  });
}

function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const left = [...a].sort((x, y) => x - y);
  const right = [...b].sort((x, y) => x - y);
  return left.every((value, index) => value === right[index]);
}

function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(seconds) {
  const safe = Math.max(0, seconds);
  const minutes = String(Math.floor(safe / 60)).padStart(2, "0");
  const rest = String(safe % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "0 分钟";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes <= 0) return `${rest} 秒`;
  return `${minutes} 分 ${rest} 秒`;
}

function copyResult(result) {
  const text = [
    `每日策划知识考核：${result.date}`,
    `答题人：${result.profile.userName}（${result.profile.userRole}）`,
    `得分：${result.score}`,
    `答对：${result.correctCount}/${result.total}`,
    `薄弱点：${result.weakTags.join("、") || "暂无明显短板"}`
  ].join("\n");
  navigator.clipboard?.writeText(text);
}

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    localStorage.removeItem(key);
    return fallback;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}
