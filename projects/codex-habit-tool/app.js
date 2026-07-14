const notice = document.querySelector("#notice");
const shortcutOutput = document.querySelector("#shortcutOutput");

function updateShortcut() {
  const modifiers = [["#alt", "Alt"], ["#ctrl", "Ctrl"], ["#shift", "Shift"]]
    .filter(([selector]) => document.querySelector(selector).checked)
    .map(([, label]) => label);
  shortcutOutput.value = [...modifiers, document.querySelector("#key").value].join(" + ");
}

function showNotice(message) {
  notice.textContent = `演示模式：${message}`;
}

document.querySelectorAll("#alt, #ctrl, #shift, #key").forEach(node => node.addEventListener("change", updateShortcut));
document.querySelector("#model").addEventListener("change", event => showNotice(`默认模型已选择为 ${event.target.value}。`));
document.querySelector("#renameButton").addEventListener("click", () => showNotice("已模拟更新近期任务名称。"));
document.querySelector("#reportButton").addEventListener("click", () => showNotice("已模拟生成最新对话报告。"));
document.querySelector("#applyButton").addEventListener("click", () => showNotice(`已模拟应用设置，快捷键为 ${shortcutOutput.value}。`));
updateShortcut();
