# G-sensor and screen interaction example: move the mug and observe the inertial response of the filled circle.
# Recommended pose: hold the mug in your right hand with the screen facing you, keeping the mug upright.
#
# Coordinate mapping:
# - When the mug moves left, inertia moves the circle to the right; moving right has the opposite effect.
# - When the mug moves down, inertia moves the circle upward; moving up has the opposite effect.
# - When the mug moves forward toward you, the circle becomes smaller; moving backward makes it larger.
#
# Horizontal movement keeps the entire circle inside the screen. Vertical movement only limits the center,
# allowing up to about half of the circle to extend beyond the screen. The diameter is limited to 2–8 pixels.
# A 32×16 white border is drawn around the screen, and the filled circle uses the default palette's purple.
# Demonstrates g_sensor.get_accel(), micropyxel.run(), elli(), and rectb().

import time
import g_sensor
import micropyxel as upyxel


FPS = 30
SAMPLE_INTERVAL_MS = 20
BASELINE_SAMPLES = 40

MIN_DIAMETER = 2.0
MAX_DIAMETER = 8.0
DEFAULT_DIAMETER = 5.0

MOTION_DEAD_ZONE = 0.012
BASELINE_TRACK_RATE = 0.025
POSITION_ACCEL = 0.80
SIZE_ACCEL = 0.24
VELOCITY_DAMPING = 0.92
SIZE_DAMPING = 0.90
POSITION_RETURN = 0.008
SIZE_RETURN = 0.015
IDLE_POSITION_RETURN = 0.035
IDLE_SIZE_RETURN = 0.045
MAX_POSITION_SPEED = 1.8
MAX_SIZE_SPEED = 0.35
BALL_COLOR = 2
BORDER_COLOR = 7


def clamp(value, minimum, maximum):
    if value < minimum:
        return minimum
    if value > maximum:
        return maximum
    return value


def remove_dead_zone(value):
    if value > MOTION_DEAD_ZONE:
        return value - MOTION_DEAD_ZONE
    if value < -MOTION_DEAD_ZONE:
        return value + MOTION_DEAD_ZONE
    return 0.0


def wait_until_ready(timeout_ms=5000):
    if not g_sensor.init():
        raise RuntimeError("g_sensor initialization failed")

    deadline = time.ticks_add(time.ticks_ms(), timeout_ms)
    while time.ticks_diff(deadline, time.ticks_ms()) > 0:
        if g_sensor.is_ready() == g_sensor.STATUS_OK:
            try:
                return g_sensor.get_accel()
            except RuntimeError:
                pass
        time.sleep_ms(20)

    raise RuntimeError("g_sensor is not ready")


def measure_baseline():
    sx = 0.0
    sy = 0.0
    sz = 0.0

    print("Keep the mug upright and still while recording the G-sensor baseline...")
    for _ in range(BASELINE_SAMPLES):
        ax, ay, az = g_sensor.get_accel()
        sx += ax
        sy += ay
        sz += az
        time.sleep_ms(SAMPLE_INTERVAL_MS)

    scale = 1.0 / BASELINE_SAMPLES
    baseline = sx * scale, sy * scale, sz * scale
    print(
        "Baseline: x={:.3f}, y={:.3f}, z={:.3f}".format(
            baseline[0], baseline[1], baseline[2]
        )
    )
    return baseline


def main():
    display_ready = False

    try:
        wait_until_ready()
        baseline_x, baseline_y, baseline_z = measure_baseline()

        upyxel.init(start_audio=False)
        display_ready = True

        center_x = (upyxel.width - 1) / 2
        center_y = (upyxel.height - 1) / 2

        x = center_x
        y = center_y
        diameter = DEFAULT_DIAMETER
        velocity_x = 0.0
        velocity_y = 0.0
        size_velocity = 0.0
        filtered_x = 0.0
        filtered_y = 0.0
        filtered_z = 0.0

        def update(rt):
            nonlocal x, y, diameter
            nonlocal velocity_x, velocity_y, size_velocity
            nonlocal filtered_x, filtered_y, filtered_z
            nonlocal baseline_x, baseline_y, baseline_z

            ax, ay, az = g_sensor.get_accel()

            # Slowly track the static gravity component. Long-term bias from the holding angle is absorbed,
            # while short translational movements remain as dynamic acceleration.
            baseline_x += (ax - baseline_x) * BASELINE_TRACK_RATE
            baseline_y += (ay - baseline_y) * BASELINE_TRACK_RATE
            baseline_z += (az - baseline_z) * BASELINE_TRACK_RATE

            dynamic_x = remove_dead_zone(ax - baseline_x)
            dynamic_y = remove_dead_zone(ay - baseline_y)
            dynamic_z = remove_dead_zone(az - baseline_z)

            # Apply light low-pass filtering to preserve motion response and suppress single-frame noise.
            filtered_x = filtered_x * 0.55 + dynamic_x * 0.45
            filtered_y = filtered_y * 0.55 + dynamic_y * 0.45
            filtered_z = filtered_z * 0.55 + dynamic_z * 0.45

            # G-sensor +X points to the user's left. When the mug accelerates left, ax is positive;
            # the circle moves right as a virtual inertial object, so use +ax directly.
            velocity_x += filtered_x * POSITION_ACCEL

            # G-sensor +Z points upward. When the mug accelerates down, az is negative and the circle moves up.
            velocity_y += filtered_z * POSITION_ACCEL

            # G-sensor +Y points toward the user. When the mug moves forward, ay is positive and the circle shrinks.
            size_velocity -= filtered_y * SIZE_ACCEL

            # Strengthen the return-to-center force without dynamic input and weaken it during motion to preserve inertia.
            moving = dynamic_x != 0.0 or dynamic_y != 0.0 or dynamic_z != 0.0
            position_return = POSITION_RETURN if moving else IDLE_POSITION_RETURN
            size_return = SIZE_RETURN if moving else IDLE_SIZE_RETURN
            velocity_x += (center_x - x) * position_return
            velocity_y += (center_y - y) * position_return
            size_velocity += (DEFAULT_DIAMETER - diameter) * size_return

            velocity_x *= VELOCITY_DAMPING
            velocity_y *= VELOCITY_DAMPING
            size_velocity *= SIZE_DAMPING

            # Limit the maximum change speed after increasing sensitivity to avoid sudden jumps during fast swings.
            velocity_x = clamp(
                velocity_x, -MAX_POSITION_SPEED, MAX_POSITION_SPEED
            )
            velocity_y = clamp(
                velocity_y, -MAX_POSITION_SPEED, MAX_POSITION_SPEED
            )
            size_velocity = clamp(
                size_velocity, -MAX_SIZE_SPEED, MAX_SIZE_SPEED
            )

            x += velocity_x
            y += velocity_y
            diameter += size_velocity
            diameter = clamp(diameter, MIN_DIAMETER, MAX_DIAMETER)

            # Keep the entire circle within the left and right boundaries.
            half = diameter / 2
            min_x = half
            max_x = rt.width - half
            if x < min_x:
                x = min_x
                velocity_x = 0.0
            elif x > max_x:
                x = max_x
                velocity_x = 0.0

            # Limit only the center vertically, allowing part of the circle to extend beyond the screen.
            if y < 0:
                y = 0.0
                velocity_y = 0.0
            elif y > rt.height - 1:
                y = rt.height - 1
                velocity_y = 0.0

            if diameter <= MIN_DIAMETER and size_velocity < 0:
                size_velocity = 0.0
            elif diameter >= MAX_DIAMETER and size_velocity > 0:
                size_velocity = 0.0

        def draw(rt):
            rt.cls(0)
            size = int(diameter + 0.5)
            size = int(clamp(size, int(MIN_DIAMETER), int(MAX_DIAMETER)))
            left = int(x - size / 2)
            top = int(y - size / 2)
            rt.elli(left, top, size, size, BALL_COLOR)
            # Draw the border last so the circle appears blocked when it reaches an edge.
            rt.rectb(0, 0, rt.width, rt.height, BORDER_COLOR)

        print("Motion interaction started: move the mug left, right, up, down, forward, and backward")
        upyxel.run(update, draw, fps=FPS)
    finally:
        try:
            if display_ready:
                upyxel.destroy()
        finally:
            g_sensor.deinit()


main()
