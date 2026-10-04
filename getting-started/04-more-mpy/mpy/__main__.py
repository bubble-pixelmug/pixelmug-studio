import asyncio
import json
import micropyxel as pyxel
from mps_websocket import ws_connect

URL = "wss://ws.kraken.com/v2"


def show(text, color):
    pyxel.cls(0)
    pyxel.text(2, 1, "BTC/USD", 7)
    pyxel.text(max(0, (32 - len(text) * 4) // 2), 9, text, color)
    pyxel.render_graphics()


def price_text(price):
    # 每个字符占 4 像素，32 像素宽的屏幕最多显示 8 个字符。
    text = "%.2f" % price
    if len(text) > 8:
        text = "%.0f" % price
    return text if len(text) <= 8 else "OVERFLOW"


async def main(proxy=None):
    pyxel.init(start_audio=False)
    try:
        show("CONNECT", 10)
        async with ws_connect(URL, timeout=15, receive_timeout=30,
                              max_msg_size=16384, proxy=proxy) as connection:
            await connection.send_json({
                "method": "subscribe",
                "params": {
                    "channel": "ticker",
                    "symbol": ["BTC/USD"],
                    "snapshot": True,
                },
            })
            show("WAIT", 10)
            async for message in connection:
                if message.type != 1:
                    continue
                data = json.loads(message.data)
                if data.get("method") == "subscribe" and not data.get("success"):
                    raise RuntimeError("BTC subscription rejected: " + str(data))
                if data.get("channel") != "ticker":
                    continue
                for item in data.get("data", []):
                    if item.get("symbol") == "BTC/USD" and "last" in item:
                        price = item["last"]
                        if isinstance(price, (int, float)) and price > 0:
                            show(price_text(price), 11)
            print("BTC connection closed; send /installMPY to run again.")
    except Exception as error:
        print("BTC error:", error)
        raise
    finally:
        pyxel.cls(0)
        pyxel.render_graphics()
        pyxel.destroy()


# 需要代理时：asyncio.run(main(proxy="http://172.16.30.5:7897"))
asyncio.run(main(proxy="http://172.16.30.5:7897"))
