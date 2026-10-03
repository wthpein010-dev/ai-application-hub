const canvas = document.getElementById("lighthouse-canvas");
const loading = document.getElementById("loading");
const progress = document.getElementById("progress");

if (typeof createUnityInstance !== "function") {
  progress.textContent = "Unity 装载器不可用，请刷新页面重试。";
} else {
  createUnityInstance(canvas, {
    dataUrl: "./game/Build/game.data",
    frameworkUrl: "./game/Build/game.framework.js",
    codeUrl: "./game/Build/game.wasm",
    streamingAssetsUrl: "./game/StreamingAssets",
    companyName: "Lighthouse Rescue Studio",
    productName: "灯塔救援队",
    productVersion: "1.4.3"
  }, value => { progress.textContent = `正在装载 ${Math.round(value * 100)}%`; })
    .then(() => { loading.hidden = true; })
    .catch(error => { progress.textContent = "装载失败：" + String(error); });
}
