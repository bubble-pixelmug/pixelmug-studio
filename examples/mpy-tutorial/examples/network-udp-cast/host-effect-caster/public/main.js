const deviceIpInput = document.querySelector("#device-ip");
const udpPortInput = document.querySelector("#udp-port");
const effectsElement = document.querySelector("#effects");
const brightnessInput = document.querySelector("#brightness");
const brightnessValue = document.querySelector("#brightness-value");
const speedInput = document.querySelector("#speed");
const speedValue = document.querySelector("#speed-value");
const pauseButton = document.querySelector("#pause");
const stopButton = document.querySelector("#stop");
const statusDot = document.querySelector("#status-dot");
const statusText = document.querySelector("#status-text");
const statsElement = document.querySelector("#stats");
const errorElement = document.querySelector("#error");
const canvas = document.querySelector("#preview");
const context = canvas.getContext("2d", { alpha: false });
context.imageSmoothingEnabled = false;

const effectIcons = {
  fire: "🔥",
  rain: "🌧️",
  plasma: "🌈",
  aurora: "🌌",
  ripple: "💧",
};

let state = null;
let palette = [[0, 0, 0]];
let paletteId = -1;

function configuration() {
  return {
    deviceIp: deviceIpInput.value.trim(),
    udpPort: Number(udpPortInput.value),
    brightness: Number(brightnessInput.value) / 100,
    speed: Number(speedInput.value) / 100,
  };
}

function showError(message = "") {
  errorElement.textContent = message;
}

async function control(changes) {
  showError();
  const response = await fetch("/api/control", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(changes),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "设置失败");
  renderState(payload);
}

function renderEffects() {
  effectsElement.replaceChildren();
  for (const item of state.effects) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `effect${item.id === state.effect ? " active" : ""}`;
    button.textContent = `${effectIcons[item.id] || "✨"} ${item.label}`;
    button.addEventListener("click", async () => {
      try {
        await control({ ...configuration(), effect: item.id, playing: true, paused: false });
      } catch (error) {
        showError(error.message);
      }
    });
    effectsElement.append(button);
  }
}

function renderState(nextState) {
  state = nextState;
  palette = nextState.palette;
  paletteId = nextState.paletteId;
  if (document.activeElement !== deviceIpInput) deviceIpInput.value = nextState.deviceIp;
  if (document.activeElement !== udpPortInput) udpPortInput.value = nextState.udpPort;
  if (document.activeElement !== brightnessInput) brightnessInput.value = Math.round(nextState.brightness * 100);
  if (document.activeElement !== speedInput) speedInput.value = Math.round(nextState.speed * 100);
  brightnessValue.value = `${Math.round(nextState.brightness * 100)}%`;
  speedValue.value = `${nextState.speed.toFixed(1)}×`;
  statusDot.classList.toggle("playing", nextState.playing);
  statusText.textContent = nextState.paused
    ? "已暂停"
    : nextState.playing
      ? `正在向 ${nextState.deviceIp}:${nextState.udpPort} 发送 UDP`
      : "尚未开始投屏";
  pauseButton.textContent = nextState.paused ? "继续" : "暂停";
  pauseButton.disabled = !nextState.playing;
  statsElement.textContent = `${nextState.sentFrames} 帧 · ${nextState.sendErrors} 个发送错误`;
  renderEffects();
}

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function drawFrame(packed) {
  context.fillStyle = "rgb(0 0 0)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  let pixel = 0;
  for (const value of packed) {
    const colors = [value >> 4, value & 0x0F];
    for (const colorIndex of colors) {
      const color = palette[colorIndex] || [0, 0, 0];
      context.fillStyle = `rgb(${color[0]} ${color[1]} ${color[2]})`;
      context.fillRect(pixel % 32, Math.floor(pixel / 32), 1, 1);
      pixel += 1;
    }
  }
}

brightnessInput.addEventListener("input", () => {
  brightnessValue.value = `${brightnessInput.value}%`;
});
speedInput.addEventListener("input", () => {
  speedValue.value = `${(Number(speedInput.value) / 100).toFixed(1)}×`;
});
for (const input of [brightnessInput, speedInput]) {
  input.addEventListener("change", async () => {
    try {
      await control(configuration());
    } catch (error) {
      showError(error.message);
    }
  });
}

async function saveTarget() {
  try {
    await control({
      deviceIp: deviceIpInput.value.trim(),
      udpPort: Number(udpPortInput.value),
    });
  } catch (error) {
    showError(error.message);
  }
}

deviceIpInput.addEventListener("change", saveTarget);
udpPortInput.addEventListener("change", saveTarget);

pauseButton.addEventListener("click", async () => {
  try {
    await control({ paused: !state.paused, playing: true });
  } catch (error) {
    showError(error.message);
  }
});

stopButton.addEventListener("click", async () => {
  try {
    await control({ playing: false, paused: false });
  } catch (error) {
    showError(error.message);
  }
});

const eventSource = new EventSource("/events");
eventSource.addEventListener("state", (event) => renderState(JSON.parse(event.data)));
eventSource.addEventListener("frame", (event) => {
  const frame = JSON.parse(event.data);
  if (frame.paletteId === paletteId) drawFrame(decodeBase64(frame.pixels));
});
eventSource.onerror = () => showError("与上位机服务的连接已断开，正在重连……");
eventSource.onopen = () => showError();

try {
  const response = await fetch("/api/state");
  renderState(await response.json());
} catch (error) {
  showError(error.message);
}

