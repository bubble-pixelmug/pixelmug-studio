import * as THREE from "/three.module.js";

const sceneElement = document.querySelector("#scene");
const statusDot = document.querySelector("#status-dot");
const statusText = document.querySelector("#status-text");
const yawElement = document.querySelector("#yaw");
const pitchElement = document.querySelector("#pitch");
const rollElement = document.querySelector("#roll");
const rateElement = document.querySelector("#rate");
const lostElement = document.querySelector("#lost");
const renderRateElement = document.querySelector("#render-rate");
const frameTimeElement = document.querySelector("#frame-time");
const resetButton = document.querySelector("#reset");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1a2d);
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
camera.position.set(0, 2.8, 7.8);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({
  antialias: false,
  alpha: false,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(0.75);
renderer.outputColorSpace = THREE.SRGBColorSpace;
sceneElement.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xbadfff, 0x172132, 2.2));
const keyLight = new THREE.DirectionalLight(0xffffff, 4.2);
keyLight.position.set(4, 7, 6);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x318cff, 2.4);
rimLight.position.set(-5, 2, -4);
scene.add(rimLight);


function createPixelDisplay() {
  const group = new THREE.Group();
  const letters = {
    h: ["10000", "10000", "10110", "11001", "10001", "10001", "10001"],
    e: ["00000", "00000", "01110", "10001", "11111", "10000", "01111"],
    l: ["01100", "00100", "00100", "00100", "00100", "00100", "01110"],
    o: ["00000", "00000", "01110", "10001", "10001", "10001", "01110"],
  };
  const pattern = Array.from({ length: 7 }, (_, row) =>
    "hello"
      .split("")
      .map((letter) => letters[letter][row])
      .join("0"),
  );
  const transforms = [];
  const transform = new THREE.Object3D();
  const radius = 0.72;
  const angularPitch = 0.045;
  const verticalPitch = 0.036;
  const centerColumn = (pattern[0].length - 1) / 2;

  for (let row = 0; row < pattern.length; row += 1) {
    for (let column = 0; column < pattern[row].length; column += 1) {
      if (pattern[row][column] !== "1") continue;

      const angle = (column - centerColumn) * angularPitch;
      transform.position.set(
        Math.sin(angle) * radius,
        (3 - row) * verticalPitch - 0.05,
        Math.cos(angle) * radius,
      );
      transform.rotation.set(0, angle, 0);
      transform.scale.set(1, 1, 1);
      transform.updateMatrix();
      transforms.push(transform.matrix.clone());
    }
  }

  const pixels = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.025, 0.025, 0.018),
    new THREE.MeshBasicMaterial({ color: 0x5ce1ff }),
    transforms.length,
  );
  for (let index = 0; index < transforms.length; index += 1) {
    pixels.setMatrixAt(index, transforms[index]);
  }
  pixels.instanceMatrix.needsUpdate = true;
  group.add(pixels);
  return group;
}
function createMug() {
  const mug = new THREE.Group();
  const segments = 16;
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x071018,
    metalness: 0.35,
    roughness: 0.28,
    side: THREE.DoubleSide,
  });
  const metalMaterial = new THREE.MeshStandardMaterial({
    color: 0xb8c0c7,
    metalness: 0.85,
    roughness: 0.2,
    side: THREE.DoubleSide,
  });
  const innerMaterial = new THREE.MeshStandardMaterial({
    color: 0x202a32,
    metalness: 0.65,
    roughness: 0.3,
    side: THREE.BackSide,
  });
  const cavityMaterial = new THREE.MeshStandardMaterial({
    color: 0x020609,
    metalness: 0.1,
    roughness: 0.9,
  });

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.66, 0.75, 1.65, segments, 1, true),
    bodyMaterial,
  );
  mug.add(body);

  const rimBand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.675, 0.66, 0.18, segments, 1, true),
    metalMaterial,
  );
  rimBand.position.y = 0.735;
  mug.add(rimBand);

  const rim = new THREE.Mesh(
    new THREE.RingGeometry(0.57, 0.675, segments),
    metalMaterial,
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.826;
  mug.add(rim);

  const innerWall = new THREE.Mesh(
    new THREE.CylinderGeometry(0.57, 0.59, 0.35, segments, 1, true),
    innerMaterial,
  );
  innerWall.position.y = 0.65;
  mug.add(innerWall);

  const cavity = new THREE.Mesh(
    new THREE.CircleGeometry(0.59, segments),
    cavityMaterial,
  );
  cavity.rotation.x = -Math.PI / 2;
  cavity.position.y = 0.474;
  mug.add(cavity);

  const bottom = new THREE.Mesh(
    new THREE.CylinderGeometry(0.75, 0.73, 0.06, segments),
    bodyMaterial,
  );
  bottom.position.y = -0.795;
  mug.add(bottom);

  const handleParts = [
    { size: [0.58, 0.12, 0.32], position: [0.935, 0.4525, 0] },
    { size: [0.58, 0.12, 0.32], position: [0.935, -0.5525, 0] },
    { size: [0.16, 0.885, 0.32], position: [1.145, -0.05, 0] },
  ];
  const handle = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    bodyMaterial,
    handleParts.length,
  );
  const handleTransform = new THREE.Object3D();
  for (let index = 0; index < handleParts.length; index += 1) {
    const part = handleParts[index];
    handleTransform.position.set(...part.position);
    handleTransform.scale.set(...part.size);
    handleTransform.updateMatrix();
    handle.setMatrixAt(index, handleTransform.matrix);
  }
  handle.instanceMatrix.needsUpdate = true;
  mug.add(handle);

  mug.add(createPixelDisplay());
  return mug;
}
const mug = createMug();
scene.add(mug);

// Sensor axes: +X left, +Y toward the user, +Z upward.
// Three.js model axes: +X right, +Y upward, +Z toward the camera.
// This proper rotation maps the complete sensor coordinate system into the model
// coordinate system. It is applied to the quaternion as B * Q * B^-1.
const basisMatrix = new THREE.Matrix4().set(
  -1, 0, 0, 0,
   0, 0, 1, 0,
   0, 1, 0, 0,
   0, 0, 0, 1,
);
const basisQuaternion = new THREE.Quaternion().setFromRotationMatrix(basisMatrix);
const inverseBasisQuaternion = basisQuaternion.clone().invert();
const sensorQuaternion = new THREE.Quaternion();
const mappedQuaternion = new THREE.Quaternion();
const relativeQuaternion = new THREE.Quaternion();
const neutralInverseQuaternion = new THREE.Quaternion();
const latestAbsoluteQuaternion = new THREE.Quaternion();
const renderedQuaternion = new THREE.Quaternion();
const correctedRelativeQuaternion = new THREE.Quaternion();
const filteredRelativeQuaternion = new THREE.Quaternion();
const displayEuler = new THREE.Euler(0, 0, 0, "ZYX");

const MIN_INTERPOLATION_DELAY_MS = 60;
const MAX_INTERPOLATION_DELAY_MS = 220;
const INTERPOLATION_PACKET_MULTIPLIER = 1.5;
const PACKET_INTERVAL_SMOOTHING = 0.15;
const POSE_FILTER_TIME_CONSTANT_MS = 100;
const METRIC_UPDATE_INTERVAL_MS = 100;
const MAX_POSE_SAMPLES = 12;
const poseSamples = [];
const reusablePoseSamples = [];

let hasPose = false;
let lastPacketAt = 0;
let lastSequence = null;
let packetsThisSecond = 0;
let lostPackets = 0;
let lastDeviceTimestamp = null;
let deviceTimeline = 0;
let lastFilterSampleTime = null;
let estimatedPacketIntervalMs = 40;
let interpolationDelayMs = MIN_INTERPOLATION_DELAY_MS;
let renderedFramesThisSecond = 0;
let lastAnimationFrameAt = null;
let maxFrameGapMs = 0;
let maxDrawTimeMs = 0;
let lastMetricUpdateAt = 0;
let connectionOnline = null;

function clearPoseSamples() {
  while (poseSamples.length > 0) {
    reusablePoseSamples.push(poseSamples.pop());
  }
}

function acquirePoseSample() {
  return reusablePoseSamples.pop() || {
    time: 0,
    quaternion: new THREE.Quaternion(),
  };
}

function negateQuaternion(quaternion) {
  quaternion.set(
    -quaternion.x,
    -quaternion.y,
    -quaternion.z,
    -quaternion.w,
  );
}

function mapSensorQuaternion(source, target) {
  return target
    .copy(basisQuaternion)
    .multiply(source)
    .multiply(inverseBasisQuaternion)
    .normalize();
}

function resetDeviceTimeline(packet) {
  lastDeviceTimestamp = packet.t;
  deviceTimeline = packet.receivedAt;
  return deviceTimeline;
}

function sampleTimeForPacket(packet) {
  if (lastDeviceTimestamp === null || packet.t < lastDeviceTimestamp) {
    return resetDeviceTimeline(packet);
  }

  const elapsed = packet.t - lastDeviceTimestamp;
  lastDeviceTimestamp = packet.t;

  if (elapsed > 0 && elapsed <= 1000) {
    estimatedPacketIntervalMs +=
      (elapsed - estimatedPacketIntervalMs) * PACKET_INTERVAL_SMOOTHING;
    interpolationDelayMs = THREE.MathUtils.clamp(
      estimatedPacketIntervalMs * INTERPOLATION_PACKET_MULTIPLIER,
      MIN_INTERPOLATION_DELAY_MS,
      MAX_INTERPOLATION_DELAY_MS,
    );
  }

  if (elapsed > 1000) {
    deviceTimeline = packet.receivedAt;
  } else {
    deviceTimeline += elapsed;
    const clockError = packet.receivedAt - deviceTimeline;
    deviceTimeline += THREE.MathUtils.clamp(clockError * 0.02, -1, 1);
  }
  return deviceTimeline;
}

function beginPose(packet, absoluteQuaternion) {
  hasPose = true;
  latestAbsoluteQuaternion.copy(absoluteQuaternion);
  neutralInverseQuaternion.copy(absoluteQuaternion).invert();
  clearPoseSamples();
  resetDeviceTimeline(packet);
  renderedQuaternion.identity();
  filteredRelativeQuaternion.identity();
  lastFilterSampleTime = null;
  estimatedPacketIntervalMs = 40;
  interpolationDelayMs = MIN_INTERPOLATION_DELAY_MS;
  mug.quaternion.identity();
  resetButton.disabled = false;
}

function setNeutralPose() {
  if (!hasPose) return;
  neutralInverseQuaternion.copy(latestAbsoluteQuaternion).invert();
  clearPoseSamples();
  renderedQuaternion.identity();
  filteredRelativeQuaternion.identity();
  lastFilterSampleTime = null;
  mug.quaternion.identity();
}

function acceptPacket(packet) {
  if (
    packet === null ||
    packet.v !== 2 ||
    !Number.isInteger(packet.seq) ||
    !Number.isInteger(packet.t) ||
    !Array.isArray(packet.q) ||
    packet.q.length !== 4 ||
    !packet.q.every(Number.isFinite)
  ) {
    return;
  }

  let senderRestarted = false;
  let lostPacketsChanged = false;
  if (lastSequence !== null) {
    if (packet.seq === 0 && lastSequence !== 0) {
      lostPackets = 0;
      lostPacketsChanged = true;
      senderRestarted = true;
    } else if (packet.seq <= lastSequence) {
      return;
    } else if (packet.seq > lastSequence + 1) {
      lostPackets += packet.seq - lastSequence - 1;
      lostPacketsChanged = true;
    }
  }

  if (senderRestarted) {
    hasPose = false;
    clearPoseSamples();
    lastDeviceTimestamp = null;
  }

  lastSequence = packet.seq;
  lastPacketAt = performance.now();
  packetsThisSecond += 1;
  if (lostPacketsChanged) {
    lostElement.textContent = `lost ${lostPackets}`;
  }

  sensorQuaternion.fromArray(packet.q);
  const normSquared = sensorQuaternion.lengthSq();
  if (normSquared < 0.25 || normSquared > 2.25) return;
  sensorQuaternion.normalize();

  const metricNow = performance.now();
  if (metricNow - lastMetricUpdateAt >= METRIC_UPDATE_INTERVAL_MS) {
    displayEuler.setFromQuaternion(sensorQuaternion, "ZYX");
    yawElement.textContent = `${THREE.MathUtils.radToDeg(displayEuler.z).toFixed(1)}°`;
    pitchElement.textContent = `${THREE.MathUtils.radToDeg(displayEuler.y).toFixed(1)}°`;
    rollElement.textContent = `${THREE.MathUtils.radToDeg(displayEuler.x).toFixed(1)}°`;
    lastMetricUpdateAt = metricNow;
  }

  mapSensorQuaternion(sensorQuaternion, mappedQuaternion);
  if (hasPose && latestAbsoluteQuaternion.dot(mappedQuaternion) < 0) {
    negateQuaternion(mappedQuaternion);
  }

  if (!hasPose) {
    beginPose(packet, mappedQuaternion);
  } else {
    latestAbsoluteQuaternion.copy(mappedQuaternion);
  }

  // Express the current pose in the coordinate frame captured at zeroing.
  // Left-multiplying by the inverse neutral pose keeps rotations around the
  // mug's local X/Y/Z axes instead of mixing them in the world frame.
  relativeQuaternion
    .copy(neutralInverseQuaternion)
    .multiply(mappedQuaternion)
    .normalize();

  // The sensor-to-model basis above now produces the physical rotation
  // directions directly, so no additional quaternion-axis correction is needed.
  correctedRelativeQuaternion.copy(relativeQuaternion);

  const sampleTime = sampleTimeForPacket(packet);
  if (lastFilterSampleTime === null) {
    filteredRelativeQuaternion.copy(correctedRelativeQuaternion);
  } else {
    if (filteredRelativeQuaternion.dot(correctedRelativeQuaternion) < 0) {
      negateQuaternion(correctedRelativeQuaternion);
    }
    const elapsed = Math.max(1, sampleTime - lastFilterSampleTime);
    const alpha = 1 - Math.exp(-elapsed / POSE_FILTER_TIME_CONSTANT_MS);
    filteredRelativeQuaternion.slerp(
      correctedRelativeQuaternion,
      THREE.MathUtils.clamp(alpha, 0, 1),
    );
  }
  lastFilterSampleTime = sampleTime;

  const poseSample = acquirePoseSample();
  poseSample.time = sampleTime;
  poseSample.quaternion.copy(filteredRelativeQuaternion);
  poseSamples.push(poseSample);
  while (poseSamples.length > MAX_POSE_SAMPLES) {
    reusablePoseSamples.push(poseSamples.shift());
  }
}

function updateRenderedPose(now) {
  if (poseSamples.length === 0) return;

  const renderTime = now - interpolationDelayMs;
  while (
    poseSamples.length >= 2 &&
    poseSamples[1].time <= renderTime
  ) {
    reusablePoseSamples.push(poseSamples.shift());
  }

  if (
    poseSamples.length >= 2 &&
    poseSamples[1].time > poseSamples[0].time
  ) {
    const first = poseSamples[0];
    const second = poseSamples[1];
    const alpha = THREE.MathUtils.clamp(
      (renderTime - first.time) / (second.time - first.time),
      0,
      1,
    );
    renderedQuaternion
      .copy(first.quaternion)
      .slerp(second.quaternion, alpha);
  } else {
    renderedQuaternion.copy(poseSamples[0].quaternion);
  }

  mug.quaternion.copy(renderedQuaternion);
}

const eventSource = new EventSource("/events");
eventSource.onmessage = (event) => {
  try {
    acceptPacket(JSON.parse(event.data));
  } catch (error) {
    console.warn("Ignored SSE message:", error);
  }
};
eventSource.onerror = () => {
  statusDot.classList.remove("online");
  statusText.textContent = "正在重新连接查看器";
};

resetButton.addEventListener("click", setNeutralPose);

setInterval(() => {
  rateElement.textContent = `${packetsThisSecond} packets/s`;
  renderRateElement.textContent = `render ${renderedFramesThisSecond} fps`;
  frameTimeElement.textContent =
    `gap ${Math.round(maxFrameGapMs)} ms · draw ${maxDrawTimeMs.toFixed(1)} ms`;
  packetsThisSecond = 0;
  renderedFramesThisSecond = 0;
  maxFrameGapMs = 0;
  maxDrawTimeMs = 0;
}, 1000);

function updateConnectionStatus(now) {
  const online = hasPose && now - lastPacketAt <= 1000;
  if (online === connectionOnline) return;

  connectionOnline = online;
  statusDot.classList.toggle("online", online);
  statusText.textContent = online ? "正在接收 PixelMug 姿态" : "等待 PixelMug 数据";
}

function resize() {
  const width = sceneElement.clientWidth;
  const height = sceneElement.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate(nowMilliseconds) {
  if (lastAnimationFrameAt !== null) {
    maxFrameGapMs = Math.max(maxFrameGapMs, nowMilliseconds - lastAnimationFrameAt);
  }
  lastAnimationFrameAt = nowMilliseconds;
  renderedFramesThisSecond += 1;

  updateRenderedPose(Date.now());
  updateConnectionStatus(nowMilliseconds);

  const drawStartedAt = performance.now();
  renderer.render(scene, camera);
  maxDrawTimeMs = Math.max(maxDrawTimeMs, performance.now() - drawStartedAt);
  requestAnimationFrame(animate);
}

window.addEventListener("resize", resize);
resize();
requestAnimationFrame(animate);
