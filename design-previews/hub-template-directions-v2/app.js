const projects = [
  {
    name: "AI 游戏需求工坊",
    category: "辅助工具",
    platform: "网页 · Windows",
    scene: "游戏立项与需求整理",
    brief: "组合灵感、玩法和美术方向，生成能够直接交给 AI 或开发团队的需求说明。",
    image: "./assets/ai-workshop.jpg"
  },
  {
    name: "Codex 对话评分工具",
    category: "桌面工具",
    platform: "Windows",
    scene: "对话复盘与质量评分",
    brief: "扫描对话并输出逐条评分、问题分布和可以继续改进的提示。",
    image: "./assets/codex-review.png"
  },
  {
    name: "小游戏立项工具",
    category: "辅助工具",
    platform: "网页 · Windows",
    scene: "小游戏策划与交接",
    brief: "从核心问题到缺失检查，快速形成可以交给开发执行的小游戏方案。",
    image: "./assets/minigame-tool.png"
  },
  {
    name: "朋友圈发图神器",
    category: "生活工具",
    platform: "网页",
    scene: "旅行图片整理与发布",
    brief: "选择图片并组织发布顺序，让旅行照片和朋友圈文案更快形成完整表达。",
    image: "./assets/moments-photo.png"
  },
  {
    name: "小游戏需求生成器",
    category: "内容工具",
    platform: "Windows",
    scene: "微信小游戏需求生成",
    brief: "回答核心问题后生成结构清晰的需求内容，减少立项阶段的反复补充。",
    image: "./assets/game-brief.png"
  },
  {
    name: "AI 应用方案整理器",
    category: "辅助工具",
    platform: "网页 · 视频",
    scene: "应用方向汇总与筛选",
    brief: "集中整理应用想法、适用场景和实现建议，帮助快速判断下一步方向。",
    image: "./assets/hero-companion.png"
  }
];

const directionNotes = {
  a: {
    letter: "A",
    title: "动态作品展馆",
    text: "推荐：图片丰富，同时仍能快速浏览大量项目。"
  },
  b: {
    letter: "B",
    title: "横向故事画廊",
    text: "单项目最沉浸，适合讲解和重点作品展示。"
  },
  c: {
    letter: "C",
    title: "可拖拽应用桌面",
    text: "互动感最强，更像一个自由探索的数字展台。"
  }
};

const directionTabs = [...document.querySelectorAll("[data-direction]")];
const directionViews = [...document.querySelectorAll("[data-view]")];
const themeButtons = [...document.querySelectorAll("[data-theme-value]")];
const noteLetter = document.querySelector("[data-note-letter]");
const noteTitle = document.querySelector("[data-note-title]");
const noteText = document.querySelector("[data-note-text]");
const selectDirection = document.querySelector("[data-select-direction]");

let activeDirection = "a";
let activeProject = 0;
let storyProject = 0;

function setDirection(direction, updateHash = true) {
  if (!directionNotes[direction]) return;
  activeDirection = direction;

  directionTabs.forEach((tab) => {
    const active = tab.dataset.direction === direction;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-pressed", String(active));
  });

  directionViews.forEach((view) => {
    const active = view.dataset.view === direction;
    view.hidden = !active;
    view.classList.toggle("is-active", active);
  });

  const note = directionNotes[direction];
  noteLetter.textContent = note.letter;
  noteTitle.textContent = note.title;
  noteText.textContent = note.text;

  if (updateHash) history.replaceState(null, "", `#${direction}`);
  window.scrollTo({ top: 0, behavior: "auto" });
}

directionTabs.forEach((tab) => {
  tab.addEventListener("click", () => setDirection(tab.dataset.direction));
});

selectDirection.addEventListener("click", () => {
  const note = directionNotes[activeDirection];
  selectDirection.textContent = `已选择 ${note.letter}`;
  selectDirection.dataset.selected = activeDirection;
  window.setTimeout(() => {
    selectDirection.textContent = "选择这个方向";
  }, 1600);
});

themeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    document.documentElement.dataset.theme = button.dataset.themeValue;
    themeButtons.forEach((item) => item.classList.toggle("is-active", item === button));
  });
});

const stage = document.querySelector("[data-tilt-stage]");
const stageVisual = document.querySelector(".museum-visual");
const stageImage = document.querySelector("[data-stage-image]");
const stageName = document.querySelector("[data-stage-name]");
const stageBrief = document.querySelector("[data-stage-brief]");
const stageCategory = document.querySelector("[data-stage-category]");
const stagePlatform = document.querySelector("[data-stage-platform]");
const stageIndex = document.querySelector("[data-stage-index]");
const stageProgress = document.querySelector("[data-stage-progress]");
const museumCards = [...document.querySelectorAll("[data-project]")];

function updateMuseum(index) {
  const project = projects[index];
  if (!project) return;
  activeProject = index;
  stageVisual.classList.add("is-switching");

  window.setTimeout(() => {
    stageImage.src = project.image;
    stageImage.alt = `${project.name}界面`;
    stageName.textContent = project.name;
    stageBrief.textContent = project.brief;
    stageCategory.textContent = project.category;
    stagePlatform.textContent = project.platform;
    stageIndex.textContent = `${String(index + 1).padStart(2, "0")} / ${String(projects.length).padStart(2, "0")}`;
    stageProgress.style.width = `${((index + 1) / projects.length) * 100}%`;
    museumCards.forEach((card) => card.classList.toggle("is-selected", Number(card.dataset.project) === index));
    stageVisual.classList.remove("is-switching");
  }, 160);
}

museumCards.forEach((card) => {
  card.addEventListener("click", () => updateMuseum(Number(card.dataset.project)));
});

if (window.matchMedia("(pointer: fine) and (prefers-reduced-motion: no-preference)").matches) {
  stage.addEventListener("pointermove", (event) => {
    const rect = stageVisual.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    stageVisual.style.setProperty("--tilt-x", `${x * 3.4}deg`);
    stageVisual.style.setProperty("--tilt-y", `${y * -3.4}deg`);
  });

  stage.addEventListener("pointerleave", () => {
    stageVisual.style.setProperty("--tilt-x", "0deg");
    stageVisual.style.setProperty("--tilt-y", "0deg");
  });
}

const storySlide = document.querySelector(".story-slide");
const storyImage = document.querySelector("[data-story-image]");
const storyCount = document.querySelector("[data-story-count]");
const storyCategory = document.querySelector("[data-story-category]");
const storyName = document.querySelector("[data-story-name]");
const storyBrief = document.querySelector("[data-story-brief]");
const storyPlatform = document.querySelector("[data-story-platform]");
const storyScene = document.querySelector("[data-story-scene]");
const storyItems = [...document.querySelectorAll("[data-story-project]")];

function updateStory(index) {
  storyProject = (index + projects.length) % projects.length;
  const project = projects[storyProject];
  storySlide.classList.add("is-switching");

  window.setTimeout(() => {
    storyImage.src = project.image;
    storyImage.alt = `${project.name}界面`;
    storyCount.textContent = `${String(storyProject + 1).padStart(2, "0")} / ${String(projects.length).padStart(2, "0")}`;
    storyCategory.textContent = project.category;
    storyName.textContent = project.name;
    storyBrief.textContent = project.brief;
    storyPlatform.textContent = project.platform;
    storyScene.textContent = project.scene;
    storyItems.forEach((item) => item.classList.toggle("is-active", Number(item.dataset.storyProject) === storyProject));
    storySlide.classList.remove("is-switching");
  }, 160);
}

document.querySelector(".story-prev").addEventListener("click", () => updateStory(storyProject - 1));
document.querySelector(".story-next").addEventListener("click", () => updateStory(storyProject + 1));
storyItems.forEach((item) => item.addEventListener("click", () => updateStory(Number(item.dataset.storyProject))));

let topWindow = 10;
document.querySelectorAll("[data-window]").forEach((windowCard) => {
  let dragState = null;

  const bringToFront = () => {
    topWindow += 1;
    windowCard.style.zIndex = String(topWindow);
  };

  windowCard.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    bringToFront();
    const rect = windowCard.getBoundingClientRect();
    const desktopRect = windowCard.parentElement.getBoundingClientRect();
    dragState = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      desktopRect
    };
    windowCard.setPointerCapture(event.pointerId);
    windowCard.classList.add("is-dragging");
  });

  windowCard.addEventListener("pointermove", (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const rect = windowCard.getBoundingClientRect();
    const maxLeft = dragState.desktopRect.width - rect.width;
    const maxTop = dragState.desktopRect.height - rect.height;
    const left = Math.max(0, Math.min(maxLeft, event.clientX - dragState.desktopRect.left - dragState.offsetX));
    const top = Math.max(0, Math.min(maxTop, event.clientY - dragState.desktopRect.top - dragState.offsetY));
    windowCard.style.left = `${left}px`;
    windowCard.style.top = `${top}px`;
    windowCard.style.right = "auto";
    windowCard.style.bottom = "auto";
    windowCard.style.transform = "none";
  });

  const finishDrag = (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    windowCard.classList.remove("is-dragging");
    dragState = null;
  };

  windowCard.addEventListener("pointerup", finishDrag);
  windowCard.addEventListener("pointercancel", finishDrag);
  windowCard.addEventListener("focus", bringToFront);
});

const initialDirection = window.location.hash.slice(1).toLowerCase();
setDirection(directionNotes[initialDirection] ? initialDirection : "a", false);
updateMuseum(activeProject);
