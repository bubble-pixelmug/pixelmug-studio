// Effects adapted for a 32x16 canvas from andzhelo/leds_wall niji.py (MIT).
// Each effect owns its animation state and returns one RGB frame per render call.

export const WIDTH = 32;
export const HEIGHT = 16;
const PIXELS = WIDTH * HEIGHT;

function clamp(value, low = 0, high = 1) {
  return Math.max(low, Math.min(high, value));
}

function hsvToRgb(hue, saturation = 1, value = 1) {
  const h = ((hue % 1) + 1) % 1 * 6;
  const sector = Math.floor(h);
  const fraction = h - sector;
  const p = value * (1 - saturation);
  const q = value * (1 - saturation * fraction);
  const t = value * (1 - saturation * (1 - fraction));
  const variants = [
    [value, t, p], [q, value, p], [p, value, t],
    [p, q, value], [t, p, value], [value, p, q],
  ];
  return variants[sector].map((channel) => Math.round(channel * 255));
}

function gradientPalette(stops) {
  const palette = [];
  for (let index = 0; index < 16; index += 1) {
    const position = index / 15;
    let left = stops[0];
    let right = stops.at(-1);
    for (let stop = 1; stop < stops.length; stop += 1) {
      if (position <= stops[stop][0]) {
        left = stops[stop - 1];
        right = stops[stop];
        break;
      }
    }
    const span = right[0] - left[0];
    const mix = span === 0 ? 0 : (position - left[0]) / span;
    palette.push(left[1].map((channel, i) =>
      Math.round(channel + (right[1][i] - channel) * mix),
    ));
  }
  return palette;
}

function paintGradient(frame, offset, value, palette) {
  const scaled = clamp(value) * 15;
  const lower = Math.floor(scaled);
  const upper = Math.min(15, lower + 1);
  const mix = scaled - lower;
  for (let channel = 0; channel < 3; channel += 1) {
    frame[offset + channel] = Math.round(
      palette[lower][channel] * (1 - mix) + palette[upper][channel] * mix,
    );
  }
}

function createFire() {
  const palette = gradientPalette([
    [0, [0, 0, 0]],
    [0.25, [90, 0, 0]],
    [0.5, [220, 40, 0]],
    [0.75, [255, 150, 0]],
    [1, [255, 245, 180]],
  ]);
  let heat = new Float32Array(PIXELS);
  let next = new Float32Array(PIXELS);

  return {
    palette,
    render(speed) {
      const cooling = 0.035 + speed * 0.018;
      for (let y = 0; y < HEIGHT - 2; y += 1) {
        for (let x = 0; x < WIDTH; x += 1) {
          const below = heat[(y + 1) * WIDTH + x];
          const below2 = heat[(y + 2) * WIDTH + x];
          const left = heat[(y + 1) * WIDTH + ((x + WIDTH - 1) % WIDTH)];
          const right = heat[(y + 1) * WIDTH + ((x + 1) % WIDTH)];
          next[y * WIDTH + x] = clamp(
            below * 0.52 + below2 * 0.22 + (left + right) * 0.1
              - Math.random() * cooling,
          );
        }
      }
      for (let x = 0; x < WIDTH; x += 1) {
        next[(HEIGHT - 2) * WIDTH + x] = 0.45 + Math.random() * 0.45;
        next[(HEIGHT - 1) * WIDTH + x] = 0.68 + Math.random() * 0.32;
      }
      [heat, next] = [next, heat];

      const frame = new Uint8Array(PIXELS * 3);
      for (let pixel = 0; pixel < PIXELS; pixel += 1) {
        paintGradient(frame, pixel * 3, heat[pixel], palette);
      }
      return frame;
    },
  };
}

function createRain() {
  const palette = gradientPalette([
    [0, [0, 0, 0]],
    [0.3, [0, 35, 16]],
    [0.65, [0, 190, 70]],
    [0.85, [80, 255, 145]],
    [1, [220, 255, 235]],
  ]);
  const canvas = new Float32Array(PIXELS * 3);
  const drops = new Float32Array(WIDTH);
  const speeds = new Float32Array(WIDTH);
  for (let x = 0; x < WIDTH; x += 1) {
    drops[x] = -Math.random() * HEIGHT;
    speeds[x] = 0.25 + Math.random() * 0.55;
  }

  return {
    palette,
    render(speed) {
      for (let index = 0; index < canvas.length; index += 1) canvas[index] *= 0.74;
      for (let x = 0; x < WIDTH; x += 1) {
        drops[x] += speeds[x] * speed;
        const y = Math.floor(drops[x]);
        if (y >= 0 && y < HEIGHT) {
          const head = (y * WIDTH + x) * 3;
          canvas[head] = 210;
          canvas[head + 1] = 255;
          canvas[head + 2] = 225;
          if (y > 0) {
            const tail = ((y - 1) * WIDTH + x) * 3;
            canvas[tail] = 0;
            canvas[tail + 1] = 220;
            canvas[tail + 2] = 70;
          }
        }
        if (drops[x] > HEIGHT + Math.random() * 8) {
          drops[x] = -2 - Math.random() * 10;
          speeds[x] = 0.25 + Math.random() * 0.55;
        }
      }
      return Uint8Array.from(canvas, (value) => Math.round(clamp(value, 0, 255)));
    },
  };
}

function createPlasma() {
  const palette = [[0, 0, 0]];
  for (let index = 0; index < 15; index += 1) palette.push(hsvToRgb(index / 15, 0.92, 1));
  let time = 0;
  return {
    palette,
    render(speed) {
      time += 0.065 * speed;
      const frame = new Uint8Array(PIXELS * 3);
      for (let y = 0; y < HEIGHT; y += 1) {
        for (let x = 0; x < WIDTH; x += 1) {
          const radial = Math.hypot(x - WIDTH / 2, y - HEIGHT / 2);
          const value = (
            Math.sin(x / 3.2 + time)
            + Math.sin(y / 2.4 - time * 0.7)
            + Math.sin((x + y) / 3.5 + time * 0.5)
            + Math.sin(radial / 2.8 - time)
          ) / 4;
          const rgb = hsvToRgb((value + 1) / 2, 0.9, 1);
          frame.set(rgb, (y * WIDTH + x) * 3);
        }
      }
      return frame;
    },
  };
}

function createAurora() {
  const palette = gradientPalette([
    [0, [0, 0, 0]],
    [0.35, [0, 45, 35]],
    [0.58, [0, 190, 115]],
    [0.78, [70, 255, 195]],
    [1, [175, 75, 255]],
  ]);
  let time = 0;
  return {
    palette,
    render(speed) {
      time += 0.045 * speed;
      const frame = new Uint8Array(PIXELS * 3);
      for (let y = 0; y < HEIGHT; y += 1) {
        for (let x = 0; x < WIDTH; x += 1) {
          const band = Math.sin(x / 4 + time)
            + 0.6 * Math.sin(x / 2 - time * 1.7)
            + Math.sin(y / 7 + time);
          const fade = 1 - y / HEIGHT * 0.55;
          const intensity = clamp((band + 2.6) / 5.2) * fade;
          paintGradient(frame, (y * WIDTH + x) * 3, intensity, palette);
        }
      }
      return frame;
    },
  };
}

function createRipple() {
  const palette = gradientPalette([
    [0, [0, 4, 20]],
    [0.45, [0, 45, 115]],
    [0.72, [0, 145, 215]],
    [0.9, [90, 215, 255]],
    [1, [210, 250, 255]],
  ]);
  const drops = [];
  let time = 0;
  return {
    palette,
    render(speed) {
      time += speed;
      if (Math.random() < 0.12 * speed && drops.length < 4) {
        drops.push({ x: Math.random() * (WIDTH - 1), y: Math.random() * (HEIGHT - 1), born: time });
      }
      const frame = new Uint8Array(PIXELS * 3);
      for (let y = 0; y < HEIGHT; y += 1) {
        for (let x = 0; x < WIDTH; x += 1) {
          let field = 0;
          for (const drop of drops) {
            const age = time - drop.born;
            const front = Math.hypot(x - drop.x, y - drop.y) - age * 0.35;
            field += Math.cos(front * 1.7) * Math.exp(-0.42 * Math.abs(front)) * Math.exp(-age * 0.022);
          }
          paintGradient(frame, (y * WIDTH + x) * 3, (field + 1) / 2, palette);
        }
      }
      for (let index = drops.length - 1; index >= 0; index -= 1) {
        if (time - drops[index].born > 48) drops.splice(index, 1);
      }
      return frame;
    },
  };
}

const DEFINITIONS = {
  fire: { label: "火焰", create: createFire },
  rain: { label: "数字雨", create: createRain },
  plasma: { label: "等离子", create: createPlasma },
  aurora: { label: "极光", create: createAurora },
  ripple: { label: "涟漪", create: createRipple },
};

export const EFFECTS = Object.entries(DEFINITIONS).map(([id, definition]) => ({
  id,
  label: definition.label,
}));

export function createEffect(id) {
  const definition = DEFINITIONS[id];
  if (!definition) throw new Error(`Unknown effect: ${id}`);
  return definition.create();
}

