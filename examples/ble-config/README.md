# BLE 配置上传

完整的 Bot + WebApp + MPY 示例，使用 config1～config5 演示五种 JSON 数据类型。所有字段均已设置默认值，连接后可以直接发送。

| 配置项 | 类型 | 默认值 | MPY 读取后的类型 |
| --- | --- | --- | --- |
| config1 | 数字 | `42` | int / float |
| config2 | 字符串 | `"hello"` | str |
| config3 | 布尔 | `true` | bool |
| config4 | 数组 | `[1, 2, 3]` | list |
| config5 | 对象 | `{"x": 1, "y": 2}` | dict |

## 运行

1. 在 Studio 打开本目录，选择 `bot/index.js`，填写 token，勾选“启动后自动运行设备代码”并启动。
2. 在冒泡 App 发送 `/bindPixelMug` 关联 PixelMug S1 Pro/Lite，等待杯子显示 `WAIT`。
3. 发送 `/webApp` 打开页面，点击“连接”，再点击“发送到杯子”，无需修改默认值。
4. 杯子逐条滚动显示 config1～config5，显示完后循环。修改字段再发送会替换内容，从 config1 重新开始。

两端应用标识为 `BleConfig`，整份配置的名称为 `settings`。config1～config5 是这份配置内的五个字段，不是五次上传。手机需要能访问 Studio 的页面地址并允许蓝牙权限。

数组和对象使用 JSON 格式，字符串和键名使用双引号。数字可以为整数或小数，布尔选项会转换成真正的 true/false；数组和对象会先解析成对应类型，不会作为字符串发送。

## 核心接口

WebApp 从表单取值后，构造如下对象：

```js
await client.setConfig('settings', {
  config1: 42,
  config2: 'hello',
  config3: true,
  config4: [1, 2, 3],
  config5: { x: 1, y: 2 },
});
```

SDK 自动完成 JSON 序列化和分块传输。MPY 注册同名配置回调：

```python
def apply_config(path, meta):
    with open(path, "r") as source:
        settings = json.load(source)
    # 校验类型后更新显示内容。
    return {"items": 5}

ble.config("settings", apply_config)
```

配置收齐后先进入待应用队列。MPY 主循环调用：

```python
ble.poll()
ble.process_pending_config(max_items=1)
```

`ble.config()` 只注册回调，`process_pending_config()` 才调用它。`max_items=1` 表示本次最多应用一整份配置，不是只处理一个字段。

回调成功后组件自动发送 `configApplied`，抛出异常则发送 `configError`。网页根据 `event.name === 'settings'` 筛选配置，根据 `event.event` 区分结果。`setConfig()` 返回只表示上传提交，页面等待应用结果后才重新启用发送按钮。

格式不正确或类型不匹配时会提示错误。断连后若一直等待，可重新连接再发送；应用结果事件不会离线补发。

## 显示与保存

`mpy/__main__.py` 展示配置 API，`mpy/display.py` 负责轮播文字。屏幕使用 JSON 表示逐条显示，例如：

```text
config1: 42
config2: "hello"
config3: true
config4: [1, 2, 3]
config5: {"x": 1, "y": 2}
```

本例使用内置 ASCII 字库，字符串及对象键名请用英文或拼音。页面文字输入限制为 128 字符，便于轮播观察；这是示例的界面限制，不是 BLE 协议的消息大小上限。

全部字段通过校验才替换显示，失败时保留旧内容。数据只保存在内存，断开后继续显示，应用重启后恢复 WAIT。临时文件由组件在回调结束后删除。

`close()` 仅清理页面监听，不代表物理断开；主动断开见 [ble-minimal](../ble-minimal/README.md)。

## 对应文档

- [WebApp BLE 接口](../../../../docs/ble/app/webapp.md)
- [MPY 配置传输](../../../../docs/ble/app/mpy/config.md)
