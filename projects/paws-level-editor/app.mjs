import { createRuntimeApiClient } from "./runtime-api-client.mjs";
import { WorkbenchController } from "./ui/workbench-controller.mjs";

const api = await createRuntimeApiClient();
const controller = new WorkbenchController(undefined, { api });
controller.init().catch((error) => {
  const connection = document.querySelector("#connection-state");
  connection.className = "connection-state is-error";
  connection.querySelector("span:last-child").textContent = `工作台启动失败：${error.message}`;
  console.error(error);
});

window.pawsWorkbench = controller;
