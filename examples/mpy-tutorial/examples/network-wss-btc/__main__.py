# Network WSS 示例：连接 Kraken 公共行情 WebSocket，在屏幕显示 BTC/USD 最新价格。
# 展示 API：mps_websocket.ws_connect、send_json、异步消息迭代和连接关闭。
# 连接使用 wss://，默认验证服务端证书；设备必须已联网且系统 UTC 正确。
# 连接中断后使用 1、2、4……30 秒的退避时间重连，并在重连后重新订阅。
# MicroPyxel 仅用于显示价格，不启动声音系统。
import asyncio
import errno
import json
import micropyxel as pyxel
from mps_websocket import ws_connect

URL = "wss://ws.kraken.com/v2"


def _price_text(price):
    # 32 pixels / 4 pixels per character = 8 characters.
    text = "%.2f" % price
    if len(text) > 8:
        text = "%.0f" % price
    return text if len(text) <= 8 else "OVERFLOW"


def _retryable(exc):
    if isinstance(exc, (EOFError, asyncio.TimeoutError)):
        return True
    if not isinstance(exc, OSError):
        return False
    text = str(exc).lower()
    if any(s in text for s in ("certificate", "x509", "mbedtls")):
        return False
    # MicroPython TLS callbacks pass socket failures through as negative errno.
    # Allow only known transport failures, not arbitrary negative TLS codes.
    if exc.args and isinstance(exc.args[0], int) and exc.args[0] < 0:
        return -exc.args[0] in (
            errno.ECONNRESET, errno.ECONNABORTED, errno.ENOTCONN,
            errno.ETIMEDOUT, errno.ECONNREFUSED, errno.EHOSTUNREACH,
        )
    return True


async def _display(state):
    previous = None
    while True:
        frame = (state[0], state[1])
        if frame != previous:
            pyxel.cls(0)
            pyxel.text(2, 1, "BTC/USD", 7)
            pyxel.text(max(0, (32 - len(frame[0]) * 4) // 2),
                       9, frame[0], frame[1])
            pyxel.render_graphics()
            previous = frame
        await asyncio.sleep_ms(500)


async def _receive(state, proxy=None):
    delay = 1
    while True:
        state[:] = ["CONNECT", 10]
        try:
            print("[btc] connecting:", URL)
            async with ws_connect(URL, timeout=15, receive_timeout=30,
                                  max_msg_size=16384, proxy=proxy) as connection:
                print("[btc] connected")
                state[:] = ["WAIT", 10]
                await connection.send_json({
                    "method": "subscribe",
                    "params": {"channel": "ticker", "symbol": ["BTC/USD"],
                               "snapshot": True},
                })
                async for message in connection:
                    if message.type != 1:
                        continue
                    data = json.loads(message.data)
                    if not isinstance(data, dict):
                        continue
                    if data.get("method") == "subscribe":
                        if data.get("success") is not True:
                            raise ValueError("Subscription rejected: " + str(data))
                        print("[btc] subscribed")
                    if data.get("channel") != "ticker":
                        continue
                    for item in data.get("data", []):
                        if item.get("symbol") == "BTC/USD" and "last" in item:
                            price = item["last"]
                            if isinstance(price, (int, float)) and price > 0:
                                state[:] = [_price_text(price), 11]
                                delay = 1
                print("[btc] peer closed")
        except (OSError, EOFError, asyncio.TimeoutError) as exc:
            if not _retryable(exc):
                raise
            print("[btc] network/session lost:", repr(exc))
        state[:] = ["RETRY", 8]
        print("[btc] retry in", delay, "seconds")
        await asyncio.sleep(delay)
        delay = min(delay * 2, 30)


async def run(proxy=None):
    state = ["CONNECT", 10]
    pyxel.init(start_audio=False)
    display = asyncio.create_task(_display(state))
    try:
        await _receive(state, proxy)
    finally:
        display.cancel()
        try:
            await display
        except asyncio.CancelledError:
            pass
        pyxel.cls(0)
        pyxel.render_graphics()
        pyxel.destroy()


def main(proxy=None):
    try:
        asyncio.run(run(proxy))
    except KeyboardInterrupt:
        print("[btc] stopped")


main(proxy="http://172.16.30.186:7897")  # 可选代理，或 None
