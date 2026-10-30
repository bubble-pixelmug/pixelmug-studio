# G-sensor coordinate calibration example.
# Follow the prompts to move the mug up, down, forward (toward you), backward (away from you), left, and right.
# The program subtracts the gravity component from the stationary baseline and captures the first clear acceleration
# after each translation begins, then cross-checks opposite directions to map mug directions to g_sensor X/Y/Z axes.
# Face the mug throughout the test and keep its orientation unchanged; do not tilt, rotate, or swing it.

import time
import g_sensor


SAMPLE_INTERVAL_MS = 20
BASELINE_SAMPLES = 30
MOVE_TIMEOUT_MS = 1800
FIRST_MOTION_WINDOW_MS = 160
MOTION_THRESHOLD_G = 0.16

TESTS = (
    ("up", "up", "Move the mug upward about 10 to 20 cm"),
    ("down", "down", "Move the mug downward about 10 to 20 cm"),
    ("front", "forward (toward you)", "Move the mug forward, toward you"),
    ("back", "backward (away from you)", "Move the mug backward, away from you"),
    ("left", "left", "Move the mug toward your left hand"),
    ("right", "right", "Move the mug toward your right hand"),
)


def wait_until_ready(timeout_ms=5000):
    if not g_sensor.init():
        raise RuntimeError("g_sensor init failed")

    deadline = time.ticks_add(time.ticks_ms(), timeout_ms)
    while time.ticks_diff(deadline, time.ticks_ms()) > 0:
        if g_sensor.is_ready() == g_sensor.STATUS_OK:
            try:
                return g_sensor.get_accel()
            except RuntimeError:
                pass
        time.sleep_ms(20)

    raise RuntimeError("g_sensor not ready")


def average_accel():
    sx = 0.0
    sy = 0.0
    sz = 0.0

    for _ in range(BASELINE_SAMPLES):
        x, y, z = g_sensor.get_accel()
        sx += x
        sy += y
        sz += z
        time.sleep_ms(SAMPLE_INTERVAL_MS)

    scale = 1.0 / BASELINE_SAMPLES
    return sx * scale, sy * scale, sz * scale


def dominant_axis(vector):
    values = (abs(vector[0]), abs(vector[1]), abs(vector[2]))
    index = 0
    if values[1] > values[index]:
        index = 1
    if values[2] > values[index]:
        index = 2
    return index


def axis_result(vector):
    index = dominant_axis(vector)
    axis = ("X", "Y", "Z")[index]
    sign = "+" if vector[index] >= 0 else "-"
    return index, axis, sign, vector[index]


def _capture_first_motion_once(label, instruction):
    print("")
    print("Preparing test: {}".format(label))
    print(instruction)
    print("Keep the mug orientation unchanged; move it once as soon as you see 'Move now'.")

    print("Countdown 3")
    time.sleep_ms(1000)
    print("Countdown 2")
    time.sleep_ms(1000)
    print("Countdown 1: stay still while recording the stationary baseline")
    baseline = average_accel()

    print(
        "Stationary baseline: x={:.3f}, y={:.3f}, z={:.3f}".format(
            baseline[0], baseline[1], baseline[2]
        )
    )
    print("Move now: {}".format(label))

    deadline = time.ticks_add(time.ticks_ms(), MOVE_TIMEOUT_MS)
    detected_at = None
    trigger_axis = None
    trigger_sign = 0
    best = None
    best_strength = -1.0

    while time.ticks_diff(deadline, time.ticks_ms()) > 0:
        x, y, z = g_sensor.get_accel()
        delta = (
            x - baseline[0],
            y - baseline[1],
            z - baseline[2],
        )
        largest = max(abs(delta[0]), abs(delta[1]), abs(delta[2]))
        now = time.ticks_ms()

        if detected_at is None and largest >= MOTION_THRESHOLD_G:
            detected_at = now
            trigger_axis = dominant_axis(delta)
            trigger_sign = 1 if delta[trigger_axis] >= 0 else -1
            best = delta
            best_strength = abs(delta[trigger_axis])

        if detected_at is not None:
            # Track peaks only in the initial motion direction so that deceleration while stopping
            # is not mistaken for the requested movement direction.
            same_direction = delta[trigger_axis] * trigger_sign > 0
            if dominant_axis(delta) == trigger_axis and same_direction:
                strength = abs(delta[trigger_axis])
                if strength > best_strength:
                    best_strength = strength
                    best = delta

            if time.ticks_diff(now, detected_at) >= FIRST_MOTION_WINDOW_MS:
                break

        time.sleep_ms(SAMPLE_INTERVAL_MS)

    if best is None:
        print("No clear movement detected; this direction will be tested again.")
        time.sleep_ms(1500)
        return None

    _, axis, sign, value = axis_result(best)
    print(
        "{}: Δx={:+.3f}, Δy={:+.3f}, Δz={:+.3f}".format(
            label, best[0], best[1], best[2]
        )
    )
    print("{} primary response: {}{} ({:+.3f} g)".format(label, sign, axis, value))
    print("Move the mug back to the center and keep its original orientation.")
    time.sleep_ms(2000)
    return best


def capture_first_motion(label, instruction):
    while True:
        result = _capture_first_motion_once(label, instruction)
        if result is not None:
            return result


def analyze_pair(pair_name, positive_name, negative_name, positive, negative):
    positive_axis = dominant_axis(positive)
    negative_axis = dominant_axis(negative)
    opposite_sign = positive[positive_axis] * negative[negative_axis] < 0
    pair_ok = positive_axis == negative_axis and opposite_sign

    combined = (
        positive[0] - negative[0],
        positive[1] - negative[1],
        positive[2] - negative[2],
    )
    index, axis, sign, _ = axis_result(combined)

    print("")
    print("{} check: {}".format(pair_name, "PASS" if pair_ok else "FAIL"))
    print("Mug {} direction maps to g_sensor {}{}".format(positive_name, sign, axis))
    print(
        "g_sensor +{} points toward the mug's {} direction".format(
            axis, positive_name if sign == "+" else negative_name
        )
    )

    return index, pair_ok


def main():
    try:
        first = wait_until_ready()
        print("G-sensor ready:", first)
        print("")
        print("Coordinate calibration started")
        print("Hold the mug in your right hand and face it; keep the same grip and orientation throughout the test.")
        print("Use straight translations only; do not rotate or tilt the mug.")

        results = {}
        for key, label, instruction in TESTS:
            results[key] = capture_first_motion(label, instruction)

        print("")
        print("========== Coordinate calibration results ==========")
        mappings = (
            analyze_pair("up/down", "up", "down", results["up"], results["down"]),
            analyze_pair(
                "forward/backward",
                "forward (toward you)",
                "backward (away from you)",
                results["front"],
                results["back"],
            ),
            analyze_pair("left/right", "right", "left", results["right"], results["left"]),
        )

        axes = (mappings[0][0], mappings[1][0], mappings[2][0])
        pairs_ok = mappings[0][1] and mappings[1][1] and mappings[2][1]
        axes_unique = (
            axes[0] != axes[1]
            and axes[0] != axes[2]
            and axes[1] != axes[2]
        )

        print("")
        if pairs_ok and axes_unique:
            print("Conclusion: all three opposite-direction pairs agree and map to distinct X, Y, and Z axes; results are reliable.")
        else:
            print("Conclusion: these results are not reliable enough.")
            if not pairs_ok:
                print("At least one opposite-direction pair did not map to opposite signs on the same axis.")
            if not axes_unique:
                print("The up/down, forward/backward, and left/right pairs did not map to three different sensor axes.")
            print("Keep the mug orientation unchanged, minimize rotation and tilt, and run the test again.")
    finally:
        g_sensor.deinit()


main()
