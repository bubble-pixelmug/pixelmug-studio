# See mps/mpy-examples/tutorial/simple.py and tutorial/hello.py.
import micropyxel as pyxel

FPS = 20
BLOCK_SIZE = 4


class App:
    def __init__(self):
        with open("/message.txt", "r") as message:
            print("Studio resource:", message.read().strip())

        self.frame = 0
        print("Initializing real PixelMug display")
        pyxel.init(start_audio=False)
        pyxel.run(self.update, self.draw, fps=FPS, on_exit=self.on_exit)

    def update(self, rt):
        self.frame += 1
        if self.frame % FPS == 0:
            print("Studio MPY heartbeat", self.frame // FPS)

    def draw(self, rt):
        pyxel.cls(0)
        pyxel.text(1, 0, "JEEJIO", 10)
        pyxel.text(1, 6, str(self.frame // FPS), 10)
        x = (self.frame // 2) % (pyxel.width - BLOCK_SIZE + 1)
        pyxel.rect(x, pyxel.height - BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE, 11)

    def on_exit(self, rt, reason, exc):
        print("Studio MPY exit:", reason)
        pyxel.destroy()


App()