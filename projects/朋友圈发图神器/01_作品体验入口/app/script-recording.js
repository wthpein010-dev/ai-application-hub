const state = {
  pace: "慢走",
  duration: "半日",
  style: "文艺",
  region: "domestic",
};

const travelLibrary = {
  杭州: {
    aliases: ["杭州", "西湖", "灵隐寺", "乌镇", "西溪"],
    title: "杭州慢游",
    summary: "把西湖、灵隐、清河坊和茶园拆成轻松路线，适合散步、喝茶和拍照。",
    budget: "半日约 120-260 元，一日约 220-480 元；门票、茶饮、简餐和市内交通会拉开差距。",
    highlights: ["西湖风景名胜区", "清河坊街", "灵隐寺", "雷峰塔", "苏堤", "断桥残雪", "西溪湿地", "龙井茶园"],
    themes: {
      慢走: ["西湖边散步", "龙井茶歇", "清河坊街慢逛", "傍晚看湖面和桥影"],
      经典: ["灵隐寺", "西湖游船", "雷峰塔", "苏堤或断桥"],
      探索: ["西溪湿地", "茶园小路", "河坊街背巷", "夜色湖滨"],
    },
  },
  新疆: {
    aliases: ["新疆", "乌鲁木齐", "伊犁", "阿勒泰", "喀纳斯", "禾木", "赛里木湖", "喀什", "吐鲁番", "那拉提"],
    title: "新疆大地路线",
    summary: "新疆更适合按北疆、南疆或伊犁分线，不要把景点塞得太满，留出长距离移动时间。",
    budget: "半日城市周边约 180-420 元；多日包车或跟团差异较大，出发前确认车程、门票和住宿。",
    highlights: ["赛里木湖", "那拉提草原", "喀纳斯景区", "禾木风景区", "新疆国际大巴扎", "果子沟大桥", "天山天池", "喀什老城"],
    themes: {
      慢走: ["新疆国际大巴扎", "城市咖啡或茶歇", "红山公园", "夜市轻食"],
      经典: ["赛里木湖", "那拉提草原", "喀纳斯湖", "禾木观景台"],
      探索: ["喀什老城", "吐鲁番葡萄沟", "独山子大峡谷", "伊宁市六星街"],
    },
  },
  成都: {
    aliases: ["成都", "都江堰", "青城山", "三星堆", "锦里", "宽窄巷子", "熊猫"],
    title: "成都松弛游",
    summary: "成都适合把城市烟火和周边自然文化拆开：熊猫、宽窄巷子、人民公园、都江堰都很稳。",
    budget: "半日约 100-260 元，一日约 240-520 元；周边一日游会增加门票和交通成本。",
    highlights: ["成都大熊猫繁育研究基地", "宽窄巷子", "三星堆博物馆", "都江堰景区", "青城山", "武侯祠", "人民公园", "锦里古街"],
    themes: {
      慢走: ["人民公园喝茶", "宽窄巷子", "文殊院", "锦里夜色"],
      经典: ["大熊猫基地", "武侯祠", "锦里古街", "九眼桥"],
      探索: ["三星堆博物馆", "都江堰", "青城山", "非遗川剧变脸"],
    },
  },
  西安: {
    aliases: ["西安", "兵马俑", "大唐不夜城", "华清宫", "回民街", "陕西历史博物馆", "城墙"],
    title: "西安古城路线",
    summary: "西安适合历史主线加夜游收尾，兵马俑、城墙、大唐不夜城和陕历博要注意预约。",
    budget: "半日约 120-300 元，一日约 260-600 元；含兵马俑、演出或包车时预算会上升。",
    highlights: ["秦始皇帝陵博物院(兵马俑)", "大唐不夜城", "华清宫", "回民街", "陕西历史博物馆", "西安城墙", "大雁塔", "钟鼓楼广场"],
    themes: {
      慢走: ["西安城墙", "钟鼓楼广场", "回民街", "大唐不夜城"],
      经典: ["兵马俑", "华清宫", "大雁塔", "大唐不夜城"],
      探索: ["陕西历史博物馆", "长安十二时辰", "碑林博物馆", "永兴坊"],
    },
  },
  上海: {
    aliases: ["上海", "外滩", "武康路", "豫园", "陆家嘴"],
    title: "上海城市切片",
    summary: "上海适合用街区串联城市质感：外滩、武康路、苏河湾、豫园和陆家嘴都能组成轻路线。",
    budget: "半日约 80-240 元，一日约 180-420 元；展览、观景台和餐厅会影响预算。",
    highlights: ["外滩", "武康路", "豫园", "陆家嘴", "苏河湾", "新天地", "上海博物馆", "田子坊"],
    themes: {
      慢走: ["武康路", "安福路咖啡", "苏河湾", "外滩夜景"],
      经典: ["豫园", "南京路", "外滩", "陆家嘴"],
      探索: ["M50 创意园", "城市展览馆", "小众街区", "屋顶夜景"],
    },
  },
  三亚: {
    aliases: ["三亚", "海南", "亚龙湾", "海棠湾", "蜈支洲岛"],
    title: "三亚海边假日",
    summary: "三亚的重点是海湾选择和节奏控制，适合把海边、日落、夜市和轻水上活动分开。",
    budget: "半日约 150-380 元，一日约 300-800 元；海上项目和度假酒店差异较大。",
    highlights: ["亚龙湾", "海棠湾", "蜈支洲岛", "椰梦长廊", "鹿回头", "第一市场", "南山文化旅游区", "天涯海角"],
    themes: {
      慢走: ["椰梦长廊", "海边咖啡", "鹿回头日落", "夜市"],
      经典: ["亚龙湾", "蜈支洲岛", "南山文化旅游区", "天涯海角"],
      探索: ["海棠湾", "后海村", "冲浪体验", "清晨看海"],
    },
  },
  北京: {
    aliases: ["北京", "故宫", "天坛", "颐和园", "什刹海"],
    title: "北京古都漫游",
    summary: "北京适合按片区规划，故宫、天坛、胡同和颐和园都需要留足步行和预约时间。",
    budget: "半日约 100-260 元，一日约 220-520 元；热门景点请提前预约。",
    highlights: ["故宫", "天坛", "颐和园", "什刹海", "景山公园", "南锣鼓巷", "国家博物馆", "前门"],
    themes: {
      慢走: ["什刹海", "胡同咖啡", "景山公园", "前门夜色"],
      经典: ["故宫", "景山", "天安门周边", "前门"],
      探索: ["国家博物馆", "杨梅竹斜街", "老书店", "天坛外圈"],
    },
  },
  苏州: {
    aliases: ["苏州", "拙政园", "山塘街", "平江路", "寒山寺"],
    title: "苏州园林水巷",
    summary: "苏州适合园林加水巷，节奏要轻，留时间给桥、巷、茶和评弹。",
    budget: "半日约 100-240 元，一日约 220-460 元。",
    highlights: ["拙政园", "山塘街", "平江路", "寒山寺", "苏州博物馆", "狮子林", "留园", "金鸡湖"],
    themes: {
      慢走: ["平江路", "苏州博物馆", "茶馆", "山塘街夜色"],
      经典: ["拙政园", "苏州博物馆", "狮子林", "平江路"],
      探索: ["双塔市集", "小巷评弹", "金鸡湖", "老街桥洞"],
    },
  },
  厦门: {
    aliases: ["厦门", "鼓浪屿", "环岛路", "沙坡尾", "曾厝垵"],
    title: "厦门海风路线",
    summary: "厦门适合海边慢行和老街探索，鼓浪屿、沙坡尾、环岛路可以拆成半日或一日。",
    budget: "半日约 120-280 元，一日约 240-520 元。",
    highlights: ["鼓浪屿", "环岛路", "沙坡尾", "曾厝垵", "厦门大学周边", "中山路", "植物园", "白城沙滩"],
    themes: {
      慢走: ["沙坡尾", "海边咖啡", "白城沙滩", "中山路"],
      经典: ["鼓浪屿", "中山路", "环岛路", "曾厝垵"],
      探索: ["植物园", "老街转角", "沙坡尾市集", "黄厝海滩"],
    },
  },
  重庆: {
    aliases: ["重庆", "洪崖洞", "解放碑", "李子坝", "磁器口"],
    title: "重庆山城路线",
    summary: "重庆适合立体城市体验，白天看街巷和轻轨，晚上看江景与灯火。",
    budget: "半日约 100-260 元，一日约 220-520 元。",
    highlights: ["洪崖洞", "解放碑", "李子坝", "磁器口", "山城步道", "长江索道", "鹅岭二厂", "南滨路"],
    themes: {
      慢走: ["山城步道", "鹅岭二厂", "江边茶歇", "南滨路夜景"],
      经典: ["解放碑", "洪崖洞", "李子坝", "长江索道"],
      探索: ["老街梯坎", "小面店", "居民楼机位", "夜色江桥"],
    },
  },
  南京: {
    aliases: ["南京", "秦淮河", "夫子庙", "中山陵", "玄武湖"],
    title: "南京金陵路线",
    summary: "南京适合历史和城市湖景组合，白天看梧桐与博物馆，晚上收在秦淮河。",
    budget: "半日约 100-240 元，一日约 220-460 元。",
    highlights: ["夫子庙秦淮河", "中山陵", "南京博物院", "玄武湖", "总统府", "老门东", "明孝陵", "鸡鸣寺"],
    themes: {
      慢走: ["玄武湖", "鸡鸣寺", "老门东", "秦淮河夜色"],
      经典: ["中山陵", "明孝陵", "南京博物院", "夫子庙"],
      探索: ["颐和路", "小西湖街区", "梧桐大道", "书店茶馆"],
    },
  },
  广州: {
    aliases: ["广州", "沙面", "永庆坊", "珠江", "陈家祠"],
    title: "广州岭南路线",
    summary: "广州适合早茶、骑楼、老街和珠江夜景，吃和走都要留节奏。",
    budget: "半日约 100-260 元，一日约 220-500 元。",
    highlights: ["沙面", "永庆坊", "陈家祠", "珠江夜游", "北京路", "越秀公园", "广州塔", "上下九"],
    themes: {
      慢走: ["早茶", "沙面", "永庆坊", "珠江边散步"],
      经典: ["陈家祠", "北京路", "广州塔", "珠江夜景"],
      探索: ["骑楼老街", "西关小吃", "东山口", "老字号甜品"],
    },
  },
  深圳: {
    aliases: ["深圳", "南山", "盐田", "大梅沙", "华侨城"],
    title: "深圳城市海岸",
    summary: "深圳适合把城市公园、海岸线和设计街区串起来，轻快但不赶。",
    budget: "半日约 100-240 元，一日约 220-520 元。",
    highlights: ["深圳湾公园", "欢乐海岸", "大梅沙", "华侨城创意园", "莲花山公园", "盐田海滨栈道", "南头古城", "人才公园"],
    themes: {
      慢走: ["深圳湾公园", "海边咖啡", "人才公园", "夜景"],
      经典: ["莲花山", "欢乐海岸", "南头古城", "深圳湾"],
      探索: ["华侨城创意园", "盐田海滨栈道", "小众展览", "城市天桥"],
    },
  },
  新加坡: {
    aliases: ["新加坡", "Singapore", "狮城", "鱼尾狮", "滨海湾", "圣淘沙", "牛车水", "小印度", "乌节路", "克拉码头"],
    title: "新加坡城市花园",
    summary: "新加坡适合把城市地标、花园夜景、南洋街区和海岛度假拆成轻巧路线；交通方便，但热门项目要留预约和排队时间。",
    budget: "半日约 300-700 元，一日约 700-1500 元；环球影城、滨海湾花园冷室、观景台和跨境通信会明显影响预算。",
    highlights: ["鱼尾狮公园", "滨海湾花园", "圣淘沙岛", "新加坡环球影城", "金沙空中花园", "牛车水", "小印度", "乌节路"],
    themes: {
      慢走: ["鱼尾狮公园", "滨海湾步道", "滨海湾花园灯光", "克拉码头夜色"],
      经典: ["滨海湾花园", "金沙空中花园", "鱼尾狮公园", "圣淘沙岛"],
      探索: ["牛车水", "小印度", "哈芝巷", "乌节路街景"],
    },
  },
  日本: {
    aliases: ["日本", "Japan", "东京", "Tokyo", "京都", "Kyoto", "大阪", "Osaka", "奈良", "Nara", "富士山", "河口湖", "箱根", "镰仓", "北海道", "札幌", "冲绳", "浅草", "涩谷", "新宿", "银座"],
    title: "日本城市古都路线",
    summary: "日本适合把东京城市街景、富士山自然视角、京都奈良古都和大阪夜色拆成关东关西路线；交通便利，但跨城移动、热门餐厅和主题乐园要提前预约。",
    budget: "半日约 300-800 元，一日约 800-1800 元；新干线、环球影城、温泉酒店、长距离交通和汇率会明显影响预算。",
    highlights: ["浅草寺", "涩谷十字路口", "新宿御苑", "银座", "富士山河口湖", "箱根", "京都清水寺", "伏见稻荷大社", "奈良公园", "大阪道顿堀", "日本环球影城", "小樽运河"],
    themes: {
      慢走: ["浅草寺与隅田川", "表参道或代官山咖啡", "京都鸭川散步", "大阪道顿堀夜色"],
      经典: ["东京浅草寺", "富士山河口湖", "京都清水寺", "奈良公园", "大阪道顿堀"],
      探索: ["镰仓高校前", "伏见稻荷清晨", "下北泽或中目黑小街", "小樽运河"],
    },
  },
  默认: {
    aliases: [],
    title: "城市轻旅行",
    summary: "先从一个不赶路的城市切片开始，把吃、走、看和拍照任务压缩进半日或一日。",
    budget: "半日约 80-220 元，一日约 180-420 元；实时价格、门票和营业时间出发前确认。",
    highlights: ["城市地标", "老街小巷", "本地小馆", "公园或水边", "博物馆", "夜景点"],
    themes: {
      慢走: ["安静咖啡店", "老街小巷", "公园水边", "简餐收尾"],
      经典: ["城市地标", "本地餐馆", "博物馆或街区", "日落视角"],
      探索: ["陌生街区", "独立小店", "城市角落", "临时终点"],
    },
  },
};

const foreignCities = new Set(["新加坡", "日本"]);

const routeTimes = {
  半日: ["14:00", "15:20", "16:40", "18:00"],
  一日: ["09:30", "11:00", "13:30", "16:30", "19:00"],
};

const demoPhotoSets = {
  新疆: [
    "./assets/demo/xinjiang/3cebfc9d-fb3f-4165-8254-69ce6ed2d12c.png",
    "./assets/demo/xinjiang/41a1829a-82d8-455e-8779-1f2ee3552032.png",
    "./assets/demo/xinjiang/55e247e0-94d7-43f0-b70d-b3ad9ad608a6.png",
    "./assets/demo/xinjiang/71e29c1b-91c2-4e1f-bda5-2a95719ef025.png",
    "./assets/demo/xinjiang/75aeb149-c337-4f2f-a33f-d0f93f9d078d.png",
    "./assets/demo/xinjiang/8037c864-58a1-4ae8-9294-1d105ebfc2e4.png",
    "./assets/demo/xinjiang/e1579854-4f36-4031-9429-5e1a248b1229.png",
    "./assets/demo/xinjiang/ef60b719-6873-4c69-b0d5-6c73d329edf2.png",
    "./assets/demo/xinjiang/ff7859e9-705f-4f32-b07d-4da6b989449c.png",
  ],
  新加坡: [
    "./assets/demo/singapore/1795178b-81da-432f-8177-68e17e1d42d8.png",
    "./assets/demo/singapore/3f1b9ef1-48ae-4128-8742-a45674803469.png",
    "./assets/demo/singapore/6044917f-0527-47c5-8076-1d0e970b21c1.png",
    "./assets/demo/singapore/62177991-e594-489a-a543-bbbda3ed48a3.png",
    "./assets/demo/singapore/81c85f1a-0e13-4487-9e67-028d65f33c2e.png",
    "./assets/demo/singapore/99680746-246c-470b-b68b-e8ee88d852cd.png",
    "./assets/demo/singapore/c7646b40-84ea-4745-8015-858126cc14cc.png",
    "./assets/demo/singapore/cf2fc39a-2c38-4b50-b18e-30250272716f.png",
    "./assets/demo/singapore/d0b22bb6-23b4-44b7-8f31-3f23284ba4bd.png",
  ],
};

const wish = document.querySelector("#wish");
const route = document.querySelector("#route");
const title = document.querySelector("#trip-title");
const meta = document.querySelector("#trip-meta");
const summary = document.querySelector("#trip-summary");
const budget = document.querySelector("#budget");
const tips = document.querySelector("#tips");
const shareText = document.querySelector("#share-text");
const randomCopyButton = document.querySelector("#random-copy");
const generateButton = document.querySelector("#generate");
const generateFeedback = document.querySelector("#generate-feedback");
const tripCard = document.querySelector(".trip-card");
const photoCount = document.querySelector("#photo-count");
const momentsPreview = document.querySelector("#moments-preview");
const momentsText = document.querySelector("#moments-text");
const momentsGrid = document.querySelector("#moments-grid");
let generationCount = 0;
const MAX_PHOTOS_PER_TASK = 2;
const MAX_TOTAL_PHOTOS = 9;
let currentSteps = [];
let photoStore = [];
let itinerarySignature = "";
let momentsVisible = false;
let currentDestination = null;
let currentPlaces = [];
let copyVariantIndex = 0;

document.querySelectorAll("[data-pace]").forEach((button) => {
  button.addEventListener("click", () => {
    state.pace = button.dataset.pace;
    setActive("[data-pace]", button);
    render();
  });
});

document.querySelectorAll("[data-duration]").forEach((button) => {
  button.addEventListener("click", () => {
    state.duration = button.dataset.duration;
    setActive("[data-duration]", button);
    render();
  });
});

document.querySelectorAll("[data-style]").forEach((button) => {
  button.addEventListener("click", () => {
    state.style = button.dataset.style;
    copyVariantIndex = getRandomCopyVariantIndex();
    setActive("[data-style]", button);
    render();
    if (momentsVisible) renderMomentsPreview();
  });
});

document.querySelectorAll("[data-region]").forEach((button) => {
  button.addEventListener("click", () => {
    state.region = button.dataset.region;
    setActive("[data-region]", button);
    document.querySelectorAll("[data-region]").forEach((tab) => {
      tab.setAttribute("aria-selected", String(tab === button));
    });
    document.querySelectorAll("[data-region-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.regionPanel !== state.region;
    });
  });
});

document.querySelectorAll("[data-city]").forEach((button) => {
  button.addEventListener("click", () => {
    const city = button.dataset.city;
    wish.value = `我想去${city}，想要一条${state.pace}、不太赶的${state.duration}路线`;
    render();
  });
});

initDemoTools();

generateButton.addEventListener("click", () => {
  generateButton.classList.add("is-generating");
  generateButton.textContent = "正在生成...";
  momentsVisible = true;
  render(true);
  window.setTimeout(() => {
    generateButton.classList.remove("is-generating");
    generateButton.textContent = "点击生成朋友圈";
  }, 220);
});

randomCopyButton.addEventListener("click", () => {
  if (!currentDestination || !currentPlaces.length) return;
  const variants = buildShareVariants(currentDestination, currentPlaces);
  copyVariantIndex = (copyVariantIndex + 1 + Math.floor(Math.random() * Math.max(1, variants.length - 1))) % variants.length;
  shareText.textContent = variants[copyVariantIndex];
  if (momentsVisible) renderMomentsPreview();
  showPhotoNotice("已随机换一句文案");
});

route.addEventListener("click", (event) => {
  const addButton = event.target.closest(".photo-add");
  if (addButton) {
    const stepIndex = Number(addButton.dataset.step);
    const input = route.querySelector(`.photo-input[data-step="${stepIndex}"]`);
    if (input) input.click();
    return;
  }

  const removeButton = event.target.closest(".photo-remove");
  if (removeButton) {
    const stepIndex = Number(removeButton.dataset.step);
    const photoIndex = Number(removeButton.dataset.photo);
    removePhoto(stepIndex, photoIndex);
  }
});

route.addEventListener("change", (event) => {
  if (!event.target.matches(".photo-input")) return;
  const stepIndex = Number(event.target.dataset.step);
  handlePhotoFiles(stepIndex, event.target.files);
  event.target.value = "";
});

function setActive(selector, activeButton) {
  document.querySelectorAll(selector).forEach((button) => {
    button.classList.toggle("active", button === activeButton);
  });
}

function initDemoTools() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("demo")) return;

  document.body.classList.add("demo-mode");

  const panel = document.createElement("div");
  panel.className = "demo-tools";
  panel.innerHTML = `
    <button class="demo-load" type="button" data-demo-city="新疆">载入新疆9图</button>
    <button class="demo-load" type="button" data-demo-city="新加坡">载入新加坡9图</button>
  `;
  panel.addEventListener("click", (event) => {
    const button = event.target.closest("[data-demo-city]");
    if (!button) return;
    loadDemoDestination(button.dataset.demoCity);
  });

  const controls = document.querySelector(".controls");
  controls.insertAdjacentElement("beforebegin", generateButton);
  generateButton.insertAdjacentElement("afterend", generateFeedback);
  generateFeedback.insertAdjacentElement("afterend", panel);
}

function loadDemoDestination(city) {
  const photoPaths = demoPhotoSets[city] || [];
  if (!photoPaths.length) return;

  const region = foreignCities.has(city) ? "foreign" : "domestic";
  state.region = region;
  state.duration = "一日";
  wish.value = `我想去${city}，想要一条${state.pace}、不太赶的一日路线`;
  setActive("[data-duration]", document.querySelector('[data-duration="一日"]'));
  setActive("[data-region]", document.querySelector(`[data-region="${region}"]`));
  document.querySelectorAll("[data-region]").forEach((tab) => {
    tab.setAttribute("aria-selected", String(tab.dataset.region === region));
  });
  document.querySelectorAll("[data-region-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.regionPanel !== region;
  });

  momentsVisible = true;
  render(true);
  photoStore = currentSteps.map(() => []);
  photoPaths.slice(0, MAX_TOTAL_PHOTOS).forEach((src, index) => {
    const stepIndex = Math.min(Math.floor(index / MAX_PHOTOS_PER_TASK), currentSteps.length - 1);
    photoStore[stepIndex].push({
      name: src.split("/").pop(),
      src,
    });
  });
  renderRoute(currentSteps);
  renderMomentsPreview();
  showPhotoNotice(`已载入 ${city} 演示图片 ${getTotalPhotos()} / ${MAX_TOTAL_PHOTOS}`);
}

function render(fromButton = false) {
  if (fromButton) {
    generationCount += 1;
  }
  const destination = matchDestination(wish.value);
  const places = destination.themes[state.pace] || destination.themes.慢走;
  const steps = buildRoute(places, destination);
  currentDestination = destination;
  currentPlaces = places;
  const nextSignature = steps.map((step) => `${step.time}|${step.place}|${step.photo}`).join("||");

  if (nextSignature !== itinerarySignature) {
    itinerarySignature = nextSignature;
    photoStore = steps.map(() => []);
  }

  currentSteps = steps;

  title.textContent = `${getDisplayCity(destination)}${state.pace}${state.duration === "半日" ? "小行程" : "一日行程"}`;
  meta.textContent = `${state.duration} / ${state.pace}`;
  summary.textContent = buildSummary(destination, places);
  budget.textContent = destination.budget;
  shareText.textContent = buildShareText(destination, places);

  renderRoute(steps);

  tips.innerHTML = buildTips(destination).map((item) => `<li>${item}</li>`).join("");

  if (fromButton && generateFeedback) {
    const now = new Date();
    generateFeedback.textContent = `已生成 ${generationCount} 次 · ${now.toLocaleTimeString("zh-CN", { hour12: false })}`;
    tripCard.classList.remove("updated");
    void tripCard.offsetWidth;
    tripCard.classList.add("updated");
  }

  if (momentsVisible) {
    renderMomentsPreview();
  }
}

function renderRoute(steps) {
  route.innerHTML = steps.map((step, index) => `
    <li>
      <div class="time">${step.time}</div>
      <div>
        <p class="place">${step.place}</p>
        <p class="activity">${step.activity}</p>
        <p class="photo">拍照任务：${step.photo}</p>
        <div class="photo-uploader" data-step="${index}">
          <div class="photo-grid">
            ${renderPhotoSlots(index)}
          </div>
          <input class="photo-input" data-step="${index}" type="file" accept="image/*" multiple hidden>
          <p class="photo-hint">本项 ${getStepPhotoCount(index)} / ${MAX_PHOTOS_PER_TASK}，全卡 ${getTotalPhotos()} / ${MAX_TOTAL_PHOTOS}</p>
        </div>
      </div>
    </li>
  `).join("");
  updatePhotoCount();
}

function renderPhotoSlots(stepIndex) {
  const photos = photoStore[stepIndex] || [];
  const thumbs = photos.map((photo, photoIndex) => `
    <div class="photo-thumb">
      <img src="${photo.src}" alt="${escapeHtml(photo.name || "已添加图片")}">
      <button class="photo-remove" type="button" data-step="${stepIndex}" data-photo="${photoIndex}" aria-label="移除图片">×</button>
    </div>
  `).join("");
  const canAdd = photos.length < MAX_PHOTOS_PER_TASK && getTotalPhotos() < MAX_TOTAL_PHOTOS;
  const addSlot = canAdd
    ? `<button class="photo-add" type="button" data-step="${stepIndex}" aria-label="添加图片">+</button>`
    : "";
  return `${thumbs}${addSlot}`;
}

function getStepPhotoCount(stepIndex) {
  return (photoStore[stepIndex] || []).length;
}

function getTotalPhotos() {
  return photoStore.reduce((sum, photos) => sum + photos.length, 0);
}

function updatePhotoCount() {
  if (!photoCount) return;
  photoCount.textContent = `已添加 ${getTotalPhotos()} / ${MAX_TOTAL_PHOTOS} 张图片`;
}

function handlePhotoFiles(stepIndex, files) {
  const stepPhotos = photoStore[stepIndex] || [];
  const roomInStep = MAX_PHOTOS_PER_TASK - stepPhotos.length;
  const roomTotal = MAX_TOTAL_PHOTOS - getTotalPhotos();
  const canTake = Math.min(roomInStep, roomTotal);

  if (canTake <= 0) {
    showPhotoNotice("图片已达上限：每项最多 2 张，全卡最多 9 张");
    return;
  }

  const selected = Array.from(files || [])
    .filter((file) => file.type.startsWith("image/"))
    .slice(0, canTake);

  if (!selected.length) {
    showPhotoNotice("请选择图片文件");
    return;
  }

  Promise.all(selected.map(readImageFile)).then((photos) => {
    photoStore[stepIndex] = [...stepPhotos, ...photos];
    renderRoute(currentSteps);
    if (momentsVisible) renderMomentsPreview();
    const extra = selected.length < (files || []).length ? "，其余已按上限忽略" : "";
    showPhotoNotice(`已添加 ${photos.length} 张图片${extra}`);
  });
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, src: reader.result });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function removePhoto(stepIndex, photoIndex) {
  const photos = photoStore[stepIndex] || [];
  photoStore[stepIndex] = photos.filter((_, index) => index !== photoIndex);
  renderRoute(currentSteps);
  if (momentsVisible) renderMomentsPreview();
  showPhotoNotice("已移除图片");
}

function renderMomentsPreview() {
  if (!momentsPreview || !momentsText || !momentsGrid) return;
  momentsPreview.hidden = false;
  momentsText.textContent = shareText.textContent || "今天的旅行照片，已经整理好发圈文案。";

  const photos = photoStore.flat().slice(0, MAX_TOTAL_PHOTOS);
  momentsGrid.innerHTML = Array.from({ length: MAX_TOTAL_PHOTOS }).map((_, index) => {
    const photo = photos[index];
    if (photo) {
      return `<div class="moments-cell has-image"><img src="${photo.src}" alt="${escapeHtml(photo.name || "朋友圈图片")}"></div>`;
    }
    return `<div class="moments-cell empty"><span>${index + 1}</span></div>`;
  }).join("");
}

function showPhotoNotice(message) {
  if (!generateFeedback) return;
  generateFeedback.textContent = message;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function matchDestination(text) {
  const normalized = text || "";
  const entries = Object.entries(travelLibrary);
  const matched = entries.find(([, item]) => item.aliases.some((alias) => normalized.includes(alias)));
  return matched ? { key: matched[0], ...matched[1] } : { key: "城市", ...travelLibrary.默认 };
}

function getDisplayCity(destination) {
  return destination.key === "默认" ? "城市" : destination.key;
}

function buildRoute(places, destination) {
  const times = routeTimes[state.duration];
  const expandedPlaces = state.duration === "一日"
    ? [destination.highlights[0], ...places, destination.highlights[1]].filter(Boolean)
    : places;

  return expandedPlaces.slice(0, times.length).map((place, index) => ({
    time: times[index],
    place,
    activity: buildActivity(place, index),
    photo: buildPhotoTask(place, index),
  }));
}

function buildActivity(place, index) {
  const activities = [
    `从${place}开始，把今天的节奏先放慢。`,
    `在${place}停留一段时间，选择一件最想认真看的小事。`,
    `沿着${place}周边慢慢走，不追求打卡数量。`,
    `把${place}作为收尾，让路线有一个轻松的记忆点。`,
    `用${place}结束今天，留一点空白给临时发现。`,
  ];
  return activities[index] || `在${place}停下来，给自己一点自由时间。`;
}

function buildPhotoTask(place, index) {
  const tasks = [
    `拍一张能认出${place}气质的开场图。`,
    "拍一个路边细节，比如门牌、树影、杯子或招牌。",
    "拍一张不用摆拍的行走瞬间。",
    "拍下今天最像电影截图的一刻。",
    "拍一张夜色、灯光或回程路上的收尾图。",
  ];
  return tasks[index] || "拍下一个意外遇见的小画面。";
}

function buildSummary(destination, places) {
  const city = getDisplayCity(destination);
  const core = places.slice(0, 3).join("、");
  return `${destination.summary} 这次会围绕${core}展开，适合“${state.pace}”节奏的${state.duration}旅行。`;
}

function buildTips(destination) {
  const city = getDisplayCity(destination);
  return [
    `${city}热门景点、门票、营业时间和预约规则请出发前再次确认。`,
    `今天最多保留 ${state.duration === "半日" ? "4" : "5"} 个节点，避免把轻旅行变成任务清单。`,
    `参考亮点：${destination.highlights.slice(0, 5).join("、")}。`,
  ];
}

function buildShareText(destination, places) {
  const variants = buildShareVariants(destination, places);
  return variants[copyVariantIndex % variants.length];
}

function getRandomCopyVariantIndex() {
  const destination = currentDestination || matchDestination(wish.value);
  const places = currentPlaces.length
    ? currentPlaces
    : destination.themes[state.pace] || destination.themes.慢走;
  const variants = buildShareVariants(destination, places);
  return Math.floor(Math.random() * variants.length);
}

function buildShareVariants(destination, places) {
  const city = getDisplayCity(destination);
  const first = places[0];
  const second = places[1] || "一段散步";
  const styleMap = {
    文艺: [
      `把今天交给${city}的风和光。${first}、${second}，都刚好落在心上。`,
      `在${city}慢慢走，风景没有催我，时间也没有。`,
      `今日收藏：${first}的光，${second}的风，还有一点刚好的自己。`,
    ],
    高冷: [
      `${city}。来过，拍了，挺好。`,
      `不解释。${city}这组，自己会说话。`,
      `今天状态：已抵达，不营业，只发图。`,
    ],
    搞怪: [
      `今日份出逃成功。人在${city}，CPU 已降温，九宫格正在加载中。`,
      `出门前：随便走走。出门后：这不得发个朋友圈？`,
      `${city}已拿下，本人负责快乐，照片负责营业。`,
    ],
    迷人: [
      `${city}有点会撩，${first}负责氛围，${second}负责心动。`,
      `今天的风很懂事，把我拍得刚刚好。`,
      `把浪漫调成高亮，把${city}放进九宫格。`,
    ],
    可爱: [
      `和${city}贴贴的一天！${first}好看，${second}也好看，我的快乐宣布满格。`,
      `今天是会发光的小旅行，连路过的风都很可爱。`,
      `出门捕捉快乐，已在${city}成功逮到一大把。`,
    ],
    松弛: [
      `不赶路，不打卡。今天只在${city}慢慢走，把${first}和${second}装进生活里。`,
      `今天主线任务：松弛。支线任务：拍几张喜欢的照片。`,
      `允许自己慢一点，风景会自己靠近。`,
    ],
  };
  return styleMap[state.style] || styleMap.文艺;
}

render();
