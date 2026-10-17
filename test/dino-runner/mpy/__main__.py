import random
import time

try:
    import ujson as json
except ImportError:
    import json

import audio_service
import micropyxel as pyxel
from maopaoBleApp import BleAppService, DATA_TYPE_RAW
from pyxel_prompt_sound import PromptSoundPlayer
import mpy_button as touch_events


SCR_W = 32
SCR_H = 16
FPS = 30
SIMPLE_JUMP = 0x4A  # 'J': start, jump or restart, according to game state.
SIMPLE_JUMP_TTL_MS = 250
BANK = 0
ASSET_PATH = "assets/dino_assets.png"
INC_COLORS = True
COLKEY = 0

BG_U = 0
BG_V = 0
BG_W = 96
BG_H = 16
BG_START_X = 32
BG_STEP_PX = 1
BG_STEP_MS = 75
INTRO_STEP_MS = 75

DINO_RUN_FRAMES = (
    (0, 24, 8, 8, 10, 7),
    (16, 24, 8, 8, 10, 7),
)
DINO_JUMP_FRAMES = (
    (33, 18, 7, 8, 11, 2),
    (49, 16, 7, 8, 11, 0),
    (49, 16, 7, 8, 11, 0),
    (49, 16, 7, 8, 11, 0),
    (33, 18, 7, 8, 11, 2),
)
DINO_DEAD_FRAME = (65, 18, 7, 8, 11, 7)
RUN_ANIM_MS = 75
JUMP_FRAME_MS = BG_STEP_MS
JUMP_Y_FRAMES_EMPTY = (7, 6, 5, 5, 6, 7)
JUMP_Y_FRAMES_BY_RANK = (
    (),
    (7, 2, 0, 0, 0, 0, 0, 0, 0, 0, 2, 7),
    (7, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 7),
    (7, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 7),
    (7, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 7),
)

GROUND_Y = 14
SPAWN_GAP_BASE_MIN = 60
SPAWN_GAP_BASE_MAX = 96
SPAWN_GAP_SCORE_STEP = 100
SPAWN_GAP_DECAY_PX = 4
SPAWN_GAP_MIN_LIMIT = 42
SPAWN_GAP_MAX_LIMIT = 66
OBSTACLES = (
    {"u": 80, "v": 27, "w": 7, "h": 5, "rank": 3},
    {"u": 96, "v": 26, "w": 6, "h": 6, "rank": 2},
    {"u": 109, "v": 27, "w": 3, "h": 5, "rank": 1},
    {"u": 116, "v": 26, "w": 12, "h": 6, "rank": 4},
)

SCORE_X = (7, 11, 15, 19)
SCORE_Y = 0
SCORE_MAX = 9999
SCORE_INTERVAL_MS = 500
SCORE_SOUND_STEP = 20
BONUS_POINTS = 100
BONUS_RANK = 4
BONUS_BLINK_MS = 180
BONUS_BLINK_PHASES = 4

SOUND_VOLUME = 100
SOUND_PACKETS_PER_UPDATE = 5
JUMP_SOUND = "jump.ogg"
HIT_SOUND = "hit.ogg"
SCORE_SOUND = "score.ogg"
PLUS_SOUND = "plus.ogg"
SCORE_FILE = "dino_score.json"

TOUCH_EVENTS_PER_UPDATE = 8
TOUCH_CLICK_EVENTS = ("click", "single", "single_click", "tap", "hit")

COL_BLACK = 0
COL_WHITE = 7
COL_RED = 8
COL_YELLOW = 10

STATE_READY = "ready"
STATE_STARTING = "starting"
STATE_RUNNING = "running"
STATE_GAME_OVER = "gameover"

DIGITS_3X5 = (
    (0b111, 0b101, 0b101, 0b101, 0b111),
    (0b010, 0b110, 0b010, 0b010, 0b111),
    (0b111, 0b001, 0b111, 0b100, 0b111),
    (0b111, 0b001, 0b111, 0b001, 0b111),
    (0b101, 0b101, 0b111, 0b001, 0b001),
    (0b111, 0b100, 0b111, 0b001, 0b111),
    (0b111, 0b100, 0b111, 0b101, 0b111),
    (0b111, 0b001, 0b010, 0b010, 0b010),
    (0b111, 0b101, 0b111, 0b101, 0b111),
    (0b111, 0b101, 0b111, 0b001, 0b111),
)


def ticks_ms():
    return time.ticks_ms()


def ticks_diff(a, b):
    return time.ticks_diff(a, b)


class DinoRunnerApp:
    def __init__(self):
        self.ble = BleAppService("DinoRunner", app_version="1.0.5", max_message=384)
        self._register_ble_protocol()
        self.audio = audio_service.audio
        self.audio_initialized = False
        self.sound = PromptSoundPlayer(
            audio=self.audio,
            asset_root="assets",
            debug=False,
            log_prefix="[DinoSound]",
            packets_per_update=SOUND_PACKETS_PER_UPDATE,
            stop_handler=self.stop_sound,
        )
        self.last_round_score = 0
        self.best_score = self.load_best_score()

        pyxel.init(start_audio=False)
        self.clear_touch_events()
        pyxel.images(BANK).load_from_png(0, 0, ASSET_PATH, INC_COLORS)
        self.prepare_sound()
        self.reset_world(STATE_READY)

    def start(self):
        self.ble.start()
        pyxel.run(self.update, self.draw, fps=FPS, on_exit=self.on_exit)

    def on_exit(self, rt, reason, exc):
        try:
            self.sound.deinit()
        except Exception:
            pass
        if self.audio_initialized:
            try:
                self.audio.deinit()
            except Exception:
                pass
            self.audio_initialized = False
        try:
            pyxel.destroy()
        except Exception:
            pass
        self.ble.deinit()

    def reset_world(self, state=STATE_RUNNING):
        now = ticks_ms()
        self.state = state
        self.bg_scroll = 0
        self.last_bg_step_ms = now
        self.run_anim_index = 0
        self.last_run_anim_ms = now
        self.jump_started_ms = 0
        self.last_jump_frame_ms = now
        self.jump_index = -1
        self.jump_y_frames = JUMP_Y_FRAMES_EMPTY
        self.obstacles = []
        self.next_spawn_px = SPAWN_GAP_BASE_MIN
        self.last_pressed = False
        self.suppress_next_click = False
        self.score = 0
        self.last_score_ms = now
        self.last_score_sound = 0
        self.bonus_started_ms = 0
        self.bonus_pending = 0
        self.collision_obstacle = None
        self.dead_x = 10
        self.dead_y = 7

    def _register_ble_protocol(self):
        self.ble.on_simple(self._handle_simple_jump)
        self.ble.command("dinoGetState", self._cmd_get_state, priority=1, mutates=False)
        self.ble.command("getState", self._cmd_get_state, priority=1, mutates=False)
        self.ble.set_state_provider(self.state_payload)

    def _handle_simple_jump(self, data_type, payload, context):
        if data_type != DATA_TYPE_RAW or len(payload) != 1 or payload[0] != SIMPLE_JUMP:
            return
        received_ms = context.get("received_ms")
        if received_ms is not None and ticks_diff(ticks_ms(), received_ms) >= SIMPLE_JUMP_TTL_MS:
            return
        self.jump()

    def _cmd_get_state(self, params, message=None):
        return self.state_payload()

    def restart(self):
        self.reset_world(STATE_RUNNING)

    def start_intro(self):
        self.reset_world(STATE_STARTING)

    def begin_running(self):
        now = ticks_ms()
        self.state = STATE_RUNNING
        self.bg_scroll = SCR_W
        self.last_bg_step_ms = now
        self.last_score_ms = now
        self.obstacles = []
        self.next_spawn_px = SPAWN_GAP_BASE_MIN

    def jump(self):
        if self.state == STATE_READY:
            self.start_intro()
            return
        if self.state == STATE_GAME_OVER:
            self.restart()
            return
        if self.state != STATE_RUNNING or self.jump_index >= 0:
            return
        now = ticks_ms()
        self.jump_started_ms = now
        self.last_jump_frame_ms = now
        self.jump_index = 1
        self.jump_y_frames = self.choose_jump_y_frames()
        self.play_sound(JUMP_SOUND, interrupt=True)

    def choose_jump_y_frames(self):
        dino_x = DINO_RUN_FRAMES[0][4]
        target = None
        for obstacle in self.obstacles:
            if obstacle["x"] + obstacle["w"] <= dino_x:
                continue
            if obstacle["x"] >= SCR_W:
                continue
            if target is None or obstacle["x"] < target["x"]:
                target = obstacle
        if target is None:
            return JUMP_Y_FRAMES_EMPTY
        return JUMP_Y_FRAMES_BY_RANK[target["rank"]]

    def update(self, rt):
        self.ble.poll(budget_ms=1, max_messages=1, max_simple_messages=2)
        self.update_touch()
        self.sound.update(budget_packets=SOUND_PACKETS_PER_UPDATE)
        self.ble.poll(budget_ms=2, max_messages=1, max_simple_messages=2)

        if self.state == STATE_READY:
            self.update_ready_animation()
        elif self.state == STATE_STARTING:
            self.update_starting_animation()
        elif self.state == STATE_RUNNING:
            self.update_game()


    def update_touch(self):
        pressed = self.button_is_pressed()
        if pressed and not self.last_pressed:
            self.jump()
            self.suppress_next_click = True
        self.last_pressed = pressed

        for _ in range(TOUCH_EVENTS_PER_UPDATE):
            event = touch_events.get()
            if event is None:
                break
            if self.normalize_touch_event(event) == "click":
                if self.suppress_next_click:
                    self.suppress_next_click = False
                    continue
                self.jump()

    def button_is_pressed(self):
        try:
            return bool(touch_events.is_pressed())
        except Exception:
            return False

    def normalize_touch_event(self, event):
        try:
            name = str(event).strip().lower()
        except Exception:
            return None
        if name in TOUCH_CLICK_EVENTS:
            return "click"
        return None

    def update_ready_animation(self):
        now = ticks_ms()
        if ticks_diff(now, self.last_run_anim_ms) >= RUN_ANIM_MS:
            self.last_run_anim_ms = now
            self.run_anim_index ^= 1

    def update_starting_animation(self):
        now = ticks_ms()
        while ticks_diff(now, self.last_bg_step_ms) >= INTRO_STEP_MS:
            self.last_bg_step_ms = time.ticks_add(self.last_bg_step_ms, INTRO_STEP_MS)
            if self.bg_scroll < SCR_W:
                self.bg_scroll += BG_STEP_PX
            if self.bg_scroll >= SCR_W:
                self.begin_running()
                break

        if ticks_diff(now, self.last_run_anim_ms) >= RUN_ANIM_MS:
            self.last_run_anim_ms = now
            self.run_anim_index ^= 1

    def update_game(self):
        now = ticks_ms()
        moved = False
        while ticks_diff(now, self.last_bg_step_ms) >= BG_STEP_MS:
            self.last_bg_step_ms = time.ticks_add(self.last_bg_step_ms, BG_STEP_MS)
            self.bg_scroll = (self.bg_scroll + BG_STEP_PX) % BG_W
            self.update_obstacles(BG_STEP_PX)
            moved = True

        if ticks_diff(now, self.last_run_anim_ms) >= RUN_ANIM_MS:
            self.last_run_anim_ms = now
            self.run_anim_index ^= 1

        if self.jump_index >= 0:
            while ticks_diff(now, self.last_jump_frame_ms) >= JUMP_FRAME_MS:
                self.last_jump_frame_ms = time.ticks_add(self.last_jump_frame_ms, JUMP_FRAME_MS)
                self.jump_index += 1
                if self.jump_index >= len(self.jump_y_frames):
                    self.jump_index = -1
                    break

        while ticks_diff(now, self.last_score_ms) >= SCORE_INTERVAL_MS:
            self.last_score_ms = time.ticks_add(self.last_score_ms, SCORE_INTERVAL_MS)
            if self.score < SCORE_MAX:
                self.score += 1
                if self.score % SCORE_SOUND_STEP == 0 and self.score != self.last_score_sound:
                    self.last_score_sound = self.score
                    self.play_sound(SCORE_SOUND, interrupt=True)

        self.update_bonus(now)
        if moved and self.check_collision():
            self.game_over()

    def update_obstacles(self, step):
        alive = []
        for obstacle in self.obstacles:
            obstacle["x"] -= step
            self.check_obstacle_bonus(obstacle)
            if obstacle["x"] > -obstacle["w"]:
                alive.append(obstacle)
        self.obstacles = alive

        self.next_spawn_px -= step
        if self.next_spawn_px <= 0:
            self.spawn_obstacle()
            self.next_spawn_px = random.randint(self.spawn_gap_min(), self.spawn_gap_max())

    def difficulty_level(self):
        return self.score // SPAWN_GAP_SCORE_STEP

    def spawn_gap_min(self):
        gap = SPAWN_GAP_BASE_MIN - self.difficulty_level() * SPAWN_GAP_DECAY_PX
        if gap < SPAWN_GAP_MIN_LIMIT:
            return SPAWN_GAP_MIN_LIMIT
        return gap

    def spawn_gap_max(self):
        gap = SPAWN_GAP_BASE_MAX - self.difficulty_level() * SPAWN_GAP_DECAY_PX
        if gap < SPAWN_GAP_MAX_LIMIT:
            return SPAWN_GAP_MAX_LIMIT
        return gap

    def choose_obstacle_type(self):
        roll = random.randint(1, 100)
        if self.score < 25:
            weights = (12, 22, 62, 4)
        elif self.score < 70:
            weights = (22, 30, 36, 12)
        else:
            weights = (28, 28, 22, 22)
        total = 0
        for i, weight in enumerate(weights):
            total += weight
            if roll <= total:
                return OBSTACLES[i]
        return OBSTACLES[0]

    def spawn_obstacle(self):
        tp = self.choose_obstacle_type()
        self.obstacles.append({
            "x": SCR_W,
            "u": tp["u"],
            "v": tp["v"],
            "w": tp["w"],
            "h": tp["h"],
            "rank": tp["rank"],
            "bonus_done": False,
            "y": GROUND_Y - tp["h"] + 1,
        })


    def check_obstacle_bonus(self, obstacle):
        if obstacle["rank"] != BONUS_RANK or obstacle["bonus_done"]:
            return
        dx, dy, dw, dh = self.dino_rect()
        if obstacle["x"] + obstacle["w"] < dx:
            obstacle["bonus_done"] = True
            self.start_bonus()

    def start_bonus(self):
        if self.bonus_started_ms:
            return
        self.bonus_started_ms = ticks_ms()
        self.bonus_pending = BONUS_POINTS
        self.play_sound(PLUS_SOUND, interrupt=True)

    def update_bonus(self, now):
        if not self.bonus_started_ms:
            return
        elapsed = ticks_diff(now, self.bonus_started_ms)
        if elapsed < BONUS_BLINK_MS * BONUS_BLINK_PHASES:
            return
        self.score = min(SCORE_MAX, self.score + self.bonus_pending)
        self.bonus_started_ms = 0
        self.bonus_pending = 0

    def bonus_visible(self):
        if not self.bonus_started_ms:
            return False
        elapsed = ticks_diff(ticks_ms(), self.bonus_started_ms)
        if elapsed >= BONUS_BLINK_MS * BONUS_BLINK_PHASES:
            return False
        return (elapsed // BONUS_BLINK_MS) % 2 == 0

    def current_dino_frame(self):
        if self.jump_index >= 0:
            y = self.jump_y_frames[self.jump_index]
            frame = DINO_JUMP_FRAMES[0] if y == 2 else DINO_JUMP_FRAMES[1]
            return (frame[0], frame[1], frame[2], frame[3], frame[4], y)
        return DINO_RUN_FRAMES[self.run_anim_index]

    def dino_rect(self):
        frame = self.current_dino_frame()
        x = frame[4] + 1
        y = frame[5] + 1
        return x, y, frame[2] - 2, frame[3] - 2

    def check_collision(self):
        dx, dy, dw, dh = self.dino_rect()
        for obstacle in self.obstacles:
            ox = int(obstacle["x"])
            oy = obstacle["y"]
            ow = obstacle["w"]
            oh = obstacle["h"]
            if dx < ox + ow and dx + dw > ox and dy < oy + oh and dy + dh > oy:
                self.collision_obstacle = obstacle
                return True
        return False

    def game_over(self):
        frame = self.current_dino_frame()
        self.dead_x = frame[4]
        self.dead_y = frame[5]
        self.state = STATE_GAME_OVER
        self.play_sound(HIT_SOUND, interrupt=True)
        self.finish_round()

    def draw(self, rt):
        pyxel.cls(COL_BLACK)
        if self.state != STATE_READY:
            self.draw_background()
            for obstacle in self.obstacles:
                pyxel.blt(int(obstacle["x"]), obstacle["y"], BANK,
                          obstacle["u"], obstacle["v"], obstacle["w"], obstacle["h"], COLKEY)
            if self.state == STATE_RUNNING:
                self.draw_score()
        self.draw_dino()
        if self.state == STATE_GAME_OVER:
            pyxel.text(8, 0, "OVER", COL_RED)

    def draw_background(self):
        x0 = BG_START_X - self.bg_scroll
        if self.state == STATE_STARTING:
            pyxel.blt(x0, 0, BANK, BG_U, BG_V, BG_W, BG_H, COLKEY)
            return
        for dx in (-BG_W, 0, BG_W):
            x = x0 + dx
            if x < SCR_W and x + BG_W > 0:
                pyxel.blt(x, 0, BANK, BG_U, BG_V, BG_W, BG_H, COLKEY)



    def draw_dino(self):
        if self.state == STATE_GAME_OVER:
            frame = DINO_DEAD_FRAME
            pyxel.blt(self.dead_x, self.dead_y, BANK, frame[0], frame[1], frame[2], frame[3], COLKEY)
            return
        frame = self.current_dino_frame()
        pyxel.blt(frame[4], frame[5], BANK, frame[0], frame[1], frame[2], frame[3], COLKEY)

    def draw_score(self):
        if self.bonus_started_ms:
            if self.bonus_visible():
                self.draw_plus(SCORE_X[0] - 4, SCORE_Y, COL_YELLOW)
                self.draw_digit(SCORE_X[0], SCORE_Y, 1, COL_YELLOW)
                self.draw_digit(SCORE_X[1], SCORE_Y, 0, COL_YELLOW)
                self.draw_digit(SCORE_X[2], SCORE_Y, 0, COL_YELLOW)
            return
        score = min(SCORE_MAX, self.score)
        thousands = score // 1000
        hundreds = (score // 100) % 10
        tens = (score // 10) % 10
        ones = score % 10
        self.draw_digit(SCORE_X[0], SCORE_Y, thousands, COL_RED)
        self.draw_digit(SCORE_X[1], SCORE_Y, hundreds, COL_RED)
        self.draw_digit(SCORE_X[2], SCORE_Y, tens, COL_RED)
        self.draw_digit(SCORE_X[3], SCORE_Y, ones, COL_RED)

    def draw_plus(self, x, y, color):
        pyxel.pset(x + 1, y + 1, color)
        pyxel.pset(x, y + 2, color)
        pyxel.pset(x + 1, y + 2, color)
        pyxel.pset(x + 2, y + 2, color)
        pyxel.pset(x + 1, y + 3, color)

    def draw_digit(self, x, y, digit, color):
        rows = DIGITS_3X5[digit]
        for yy in range(5):
            bits = rows[yy]
            for xx in range(3):
                if bits & (1 << (2 - xx)):
                    pyxel.pset(x + xx, y + yy, color)

    def prepare_sound(self):
        if not self.ensure_audio():
            return False
        ok = True
        for path in (JUMP_SOUND, HIT_SOUND, SCORE_SOUND):
            if not self.sound.preload(path):
                print("[DinoRunner] preload sound failed:", path, self.sound.last_error)
                ok = False
        return ok

    def play_sound(self, path, interrupt=True):
        if not self.ensure_audio():
            return False
        ok = self.sound.play(path, interrupt=interrupt)
        if not ok:
            print("[DinoRunner] sound failed:", path, self.sound.last_error)
        return ok

    def stop_sound(self, player=None):
        if player is None:
            player = self.sound
        return player.cancel()

    def ensure_audio(self):
        if self.audio_initialized:
            return True
        try:
            self.audio.init(
                enable_input=False,
                enable_output=True,
                with_opus_encoder=False,
                with_opus_decoder=True,
            )
            self.audio.configure(output_volume=SOUND_VOLUME, input_gain=1.0)
            self.audio_initialized = True
            return True
        except Exception as exc:
            print("[DinoRunner] audio init failed:", exc)
            return False

    def clear_touch_events(self):
        try:
            touch_events.clear()
        except Exception as exc:
            print("[DinoRunner] touch clear failed:", exc)

    def finish_round(self):
        self.last_round_score = self.score
        if self.score > self.best_score:
            self.best_score = self.score
        self.save_score_record(self.last_round_score, self.best_score)
        self.report_game_over()

    def report_game_over(self):
        if not self.ble.connected:
            return False
        return self.ble.send_event("dinoGameOver", self.state_payload(), priority=1)

    def state_payload(self):
        return {
            "state": self.state,
            "score": self.score,
            "lastScore": self.last_round_score,
            "bestScore": self.best_score,
        }

    def load_best_score(self):
        try:
            with open(SCORE_FILE, "r") as fp:
                data = json.loads(fp.read() or "{}")
            return max(0, int(data.get("bestScore", 0)))
        except Exception:
            return 0

    def save_score_record(self, score, best_score):
        try:
            with open(SCORE_FILE, "w") as fp:
                fp.write(json.dumps({
                    "score": max(0, int(score)),
                    "bestScore": max(0, int(best_score)),
                }))
            return True
        except Exception as exc:
            print("[DinoRunner] score save failed:", exc)
            return False


def appMain():
    DinoRunnerApp().start()


if __name__ == "__main__":
    appMain()


