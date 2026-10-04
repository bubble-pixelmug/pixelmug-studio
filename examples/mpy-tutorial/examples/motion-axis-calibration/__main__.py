# G-sensor 坐标系标定示例。
# 按日志提示依次向上、下、前（靠近自己）、后（远离自己）、左、右平移水杯。
# 程序从静止基线中减去重力分量，捕获每次平移开始后的首次明显加速度，
# 再用相反方向互相校验，输出杯体方向与 g_sensor X/Y/Z 轴的对应关系。
# 测试时始终面对水杯并保持杯体朝向不变；不要倾斜、转动或甩动水杯。

import time
import g_sensor


SAMPLE_INTERVAL_MS = 20
BASELINE_SAMPLES = 30
MOVE_TIMEOUT_MS = 1800
FIRST_MOTION_WINDOW_MS = 160
MOTION_THRESHOLD_G = 0.16

TESTS = (
    ("up", "上", "向上平移水杯约 10 至 20 厘米"),
    ("down", "下", "向下平移水杯约 10 至 20 厘米"),
    ("front", "前（靠近你）", "向前平移，也就是让水杯靠近你"),
    ("back", "后（远离你）", "向后平移，也就是让水杯远离你"),
    ("left", "左", "向你的左手方向平移水杯"),
    ("right", "右", "向你的右手方向平移水杯"),
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
    print("准备测试：{}".format(label))
    print(instruction)
    print("保持杯体朝向不变；看到‘现在移动’后立即平移一次。")

    print("倒计时 3")
    time.sleep_ms(1000)
    print("倒计时 2")
    time.sleep_ms(1000)
    print("倒计时 1：保持不动，正在记录静止基线")
    baseline = average_accel()

    print(
        "静止基线：x={:.3f}, y={:.3f}, z={:.3f}".format(
            baseline[0], baseline[1], baseline[2]
        )
    )
    print("现在移动：{}".format(label))

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
            # 只追踪首次运动方向上的峰值，避免把停车时的反向减速度
            # 错认成用户指定的移动方向。
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
        print("没有检测到足够明显的移动，本方向重新测试。")
        time.sleep_ms(1500)
        return None

    _, axis, sign, value = axis_result(best)
    print(
        "{}：Δx={:+.3f}, Δy={:+.3f}, Δz={:+.3f}".format(
            label, best[0], best[1], best[2]
        )
    )
    print("{} 的主要响应：{}{} ({:+.3f} g)".format(label, sign, axis, value))
    print("请把水杯移回中央并保持原来的朝向。")
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
    print("{}校验：{}".format(pair_name, "通过" if pair_ok else "未通过"))
    print("水杯{}方向对应 g_sensor {}{}".format(positive_name, sign, axis))
    print(
        "g_sensor +{} 指向水杯的{}方向".format(
            axis, positive_name if sign == "+" else negative_name
        )
    )

    return index, pair_ok


def main():
    try:
        first = wait_until_ready()
        print("G-sensor 已就绪：", first)
        print("")
        print("坐标系标定开始")
        print("右手拿杯并面对杯子，整个测试过程保持相同握姿和杯体朝向。")
        print("每次只做直线平移，不要旋转或倾斜水杯。")

        results = {}
        for key, label, instruction in TESTS:
            results[key] = capture_first_motion(label, instruction)

        print("")
        print("========== 坐标标定结果 ==========")
        mappings = (
            analyze_pair("上下", "上", "下", results["up"], results["down"]),
            analyze_pair(
                "前后",
                "前（靠近你）",
                "后（远离你）",
                results["front"],
                results["back"],
            ),
            analyze_pair("左右", "右", "左", results["right"], results["left"]),
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
            print("结论：三组相反方向一致，并分别对应 X、Y、Z，结果可信。")
        else:
            print("结论：本次结果不够可靠。")
            if not pairs_ok:
                print("至少一组相反方向没有落在同一轴的相反符号上。")
            if not axes_unique:
                print("上下、前后、左右没有分别落在三个不同的传感器轴上。")
            print("请保持杯体朝向不变，减少旋转和倾斜后重新运行测试。")
    finally:
        g_sensor.deinit()


main()