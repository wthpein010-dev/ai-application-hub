import { WorkbenchController } from "./ui/workbench-controller.mjs";

const controller = new WorkbenchController();
controller.init().catch((error) => {
  const connection = document.querySelector("#connection-state");
  connection.className = "connection-state is-error";
  connection.querySelector("span:last-child").textContent = `工作台启动失败：${error.message}`;
  console.error(error);
});

window.pawsWorkbench = controller;
