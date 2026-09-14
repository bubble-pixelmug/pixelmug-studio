import { BubbleWebApp } from "/sdk/WebApp.js";

const output = document.querySelector("#result");
let webapp;
if (globalThis.JeeWeb) {
  webapp = new BubbleWebApp({ debug: false, ble: false });
  console.info("WebApp 已连接 JeeWeb");
} else {
  console.warn("当前不在冒泡 App 内：可测试浏览器日志，真实 bot 请求需在冒泡 App 中操作。");
  document.querySelector("#echo").disabled = true;
  document.querySelector("#fail").disabled = true;
}
console.log("WebApp 入口已执行", { userAgent: navigator.userAgent });

document.querySelector("#log").onclick = () => {
  const data = { message: "Hello from WebApp", count: 42n, token: "example-secret-token" };
  data.self = data;
  console.log("按钮点击", data);
  output.textContent = "已输出 console.log，请在 Studio 查看 webapp 来源。";
};
document.querySelector("#warn").onclick = () => {
  console.warn("Demo warning", { reason: "测试告警" });
  console.error("Demo handled error", new Error("WebApp error stack"));
};
document.querySelector("#throw").onclick = () => {
  setTimeout(() => { throw new Error("Demo: uncaught WebApp error"); }, 0);
};
document.querySelector("#reject").onclick = () => {
  void Promise.reject(new Error("Demo: unhandled WebApp rejection"));
};
async function request(fail) {
  const requestId = Date.now().toString(36);
  console.log("发起 bot 请求", { requestId, fail });
  try {
    const response = await webapp.request("studio.echo", { text: "Hello bot", requestId, fail });
    console.log("收到 bot 响应", { requestId, response });
    output.textContent = JSON.stringify(response, null, 2);
  } catch (error) {
    console.error("bot 请求失败", { requestId, error });
    output.textContent = error.message;
  }
}
document.querySelector("#echo").onclick = () => request(false);
document.querySelector("#fail").onclick = () => request(true);
