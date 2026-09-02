function heading(text) {
  const node = document.createElement("h3");
  node.tabIndex = -1;
  node.textContent = text;
  return node;
}

function action(label, id, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  if (id) button.id = id;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

export function showInlineFlow(container, name, nodes) {
  container.hidden = false;
  container.dataset.flow = name;
  container.replaceChildren(...nodes);
  container.querySelector("h3")?.focus({ preventScroll: true });
}

export function closeInlineFlow(container, restoreFocus) {
  container.hidden = true;
  container.dataset.flow = "";
  container.replaceChildren();
  if (restoreFocus?.isConnected) restoreFocus.focus({ preventScroll: true });
}

export function saveConfirmNodes({ itemName, onConfirm, onClose }) {
  const copy = document.createElement("p");
  copy.textContent = `将${itemName || "空手"}保存到当前角色的手持槽位？`;
  const actions = document.createElement("div");
  actions.className = "flow-actions";
  actions.append(action("确认保存", "confirm-save", onConfirm), action("再想想", "close-inline-flow", onClose));
  return [heading("确认保存装扮"), copy, actions];
}

export function warehouseNodes({ items, onPick, onClose, imageFor }) {
  const grid = document.createElement("div");
  grid.className = "warehouse-grid";
  for (const item of items) {
    const card = document.createElement("button");
    card.className = "warehouse-card";
    card.type = "button";
    const image = document.createElement("img");
    image.src = imageFor(item);
    image.alt = "";
    const copy = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = item.name;
    const count = document.createElement("small");
    count.textContent = `拥有 ×${item.ownedCount}`;
    copy.append(name, count);
    card.append(image, copy);
    card.addEventListener("click", () => onPick(item.id, card));
    grid.append(card);
  }
  const close = action("关闭仓库", "close-inline-flow", onClose);
  return [heading("随身小物仓库"), grid, close];
}

export function giftNodes({ itemName, onConfirm, onClose }) {
  const copy = document.createElement("p");
  copy.textContent = `这是浏览器本地赠送演示：${itemName} 会消耗 1 件，不会创建真实订单。`;
  const choices = ["小羊好友 A", "小羊好友 B", "测试好友 C"].map((friend, index) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "gift-friend";
    input.value = friend;
    input.checked = index === 0;
    label.append(input, document.createTextNode(friend));
    return label;
  });
  const actions = document.createElement("div");
  actions.className = "flow-actions";
  actions.append(action("确认赠送", "confirm-gift", onConfirm), action("取消", "close-inline-flow", onClose));
  return [heading("本地赠送演示"), copy, ...choices, actions];
}

export function successNodes(message, onClose) {
  const copy = document.createElement("p");
  copy.textContent = message;
  return [heading(message), action("关闭", "close-inline-flow", onClose)];
}
