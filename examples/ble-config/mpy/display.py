# 显示辅助代码：每条文字滚动一遍，再显示下一条。
class ConfigDisplay:
    def __init__(self):
        self.lines = []
        self.index = 0
        self.x = None

    def show(self, lines):
        self.lines = lines
        self.index = 0
        self.x = None

    def update(self, rt):
        if not self.lines:
            return
        if self.x is None:
            self.x = rt.width
        else:
            self.x -= 1
        if self.x < -len(self.lines[self.index]) * 4:
            self.index = (self.index + 1) % len(self.lines)
            self.x = rt.width

    def draw(self, rt):
        rt.cls(0)
        if self.lines:
            rt.text(self.x, (rt.height - 6) // 2, self.lines[self.index], 10)
        else:
            rt.text((rt.width - 16) // 2, (rt.height - 6) // 2, "WAIT", 10)
