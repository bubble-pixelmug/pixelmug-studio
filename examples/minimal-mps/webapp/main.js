import { BubbleWebApp } from "/sdk/WebApp.js";
const status = document.querySelector("#status"), select = document.querySelector("#devices"), button = document.querySelector("#launch");
if (!globalThis.JeeWeb) {
  document.querySelector("#refresh").disabled = true;
  status.textContent = "需要在冒泡 App 内打开；不提供设备模拟。";
} else {
  const webapp = new BubbleWebApp({ ble: false });
  let devices = [];
  async function refresh() {
    try {
      devices = await webapp.getDevices();
      select.replaceChildren(...devices.map((device, index) => {
        const option = document.createElement("option"); option.value = index;
        option.textContent = device.name + " · " + device.deviceId; return option;
      }));
      button.disabled = !devices.length;
      status.textContent = JSON.stringify(devices.map(d => ({ deviceId: d.deviceId, slotId: d.slotId })), null, 2);
    } catch (error) { status.textContent = error.message; console.error(error); }
  }
  webapp.onDeviceEvent(event => console.log("MPS device event", event));
  webapp.on("studio.launch", event => {
    status.textContent = event.payload.state + (event.payload.message ? "\n" + event.payload.message : "");
    button.disabled = !["running", "completed", "failed", "unknown", "stopped"].includes(event.payload.state);
  });
  document.querySelector("#refresh").onclick = refresh;
  button.onclick = async () => {
    button.disabled = true;
    try {
      const response = await webapp.callDevice(devices[Number(select.value)], {
        method: "talMpyExecOneScript", params: { id: "", version: "" },
      });
      console.log("Launch RPC response", response);
      status.textContent = "RPC " + response.result.value + "；等待设备部署和运行状态…";
    } catch (error) { status.textContent = error.message; console.error("Launch failed", error); button.disabled = false; }
  };
  await refresh();
}

