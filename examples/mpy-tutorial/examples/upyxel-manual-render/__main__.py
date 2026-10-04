# MicroPyxel 入门示例：手动刷新，让一个白色像素点从左向右移动，重复五次。
# 展示 API：init、cls、pset、render_graphics、destroy。
# 绘图只修改屏幕缓冲；每帧画好后调用 render_graphics，才把画面提交到屏幕。
# render_graphics 不清屏、不休眠、不限制帧率，需要由自己的循环安排。
# 本例每帧等待 50 ms，实际帧间隔还包含绘图和刷新耗时，不是精确的 20 fps。
# 不使用 run 或 update/draw 回调；循环自然结束即可，不需要 quit。

import time
import micropyxel as upyxel


FRAME_DELAY_MS = 50
REPEATS = 5


def main():
    upyxel.init(start_audio=False)
    try:
        y = upyxel.height // 2
        print("手动刷新动画开始，像素点从左向右移动五次")
        for _ in range(REPEATS):
            for x in range(upyxel.width):
                upyxel.cls(0)  # 清掉上一帧。
                upyxel.pset(x, y, 7)  # 默认调色板：0 为黑色，7 为白色。
                upyxel.render_graphics()  # 手动提交这一帧。
                time.sleep_ms(FRAME_DELAY_MS)  # 控制移动速度，并让出执行时间。
        print("手动刷新动画结束")
    finally:
        upyxel.destroy()


main()
