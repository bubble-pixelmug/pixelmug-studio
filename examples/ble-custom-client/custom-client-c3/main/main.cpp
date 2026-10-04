#include <strings.h>

#include "NimBLEDevice.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"


// 留空时仅在扫描到唯一一台杯子时自动选择；有多台时必须填写目标 BLE 地址。
static const char* TARGET_ADDRESS = "14:C1:9F:C1:58:E2";
static const char* TAG = "pixelmug";
static const NimBLEUUID SERVICE_UUID("F160");
static const NimBLEUUID WRITE_UUID("F161");

static bool is_pixelmug(const NimBLEAdvertisedDevice* device)
{
    const auto name = device->getName();
    return name.rfind("MPY-", 0) == 0 &&
           device->isAdvertisingService(SERVICE_UUID);
}

extern "C" void app_main()
{
    // 库负责 NVS、BLE 控制器和 NimBLE host 任务的初始化。
    if (!NimBLEDevice::init("PixelMug C3")) {
        ESP_LOGE(TAG, "BLE initialization failed");
        return;
    }
    auto scan = NimBLEDevice::getScan();
    scan->setActiveScan(true);
    auto client = NimBLEDevice::createClient();
    if (!client) {
        ESP_LOGE(TAG, "Cannot create BLE client");
        return;
    }

    // 1. 每次扫描 3 秒。指定地址时只连接目标杯子；未指定地址时只允许唯一候选。
    bool connected = false;
    while (!connected) {
        ESP_LOGI(TAG, "Scanning for PixelMug F160...");
        auto results = scan->getResults(3000);
        const NimBLEAdvertisedDevice* candidate = nullptr;
        int candidate_count = 0;

        for (int i = 0; i < results.getCount(); ++i) {
            auto device = results.getDevice(i);
            if (!is_pixelmug(device)) continue;

            const auto address = device->getAddress().toString();
            ESP_LOGI(TAG, "Found PixelMug %s", address.c_str());

            if (TARGET_ADDRESS[0] == '\0') {
                candidate = device;
                ++candidate_count;
            } else if (strcasecmp(address.c_str(), TARGET_ADDRESS) == 0) {
                candidate = device;
                break;
            }
        }

        if (TARGET_ADDRESS[0] == '\0' && candidate_count > 1) {
            ESP_LOGE(
                TAG,
                "Found %d PixelMugs. Set TARGET_ADDRESS to the MAC printed by the target MPY app.",
                candidate_count);
            scan->clearResults();
            return;
        }

        if (candidate) {
            const auto address = candidate->getAddress().toString();
            ESP_LOGI(TAG, "Connecting to %s", address.c_str());
            connected = client->connect(candidate);
        }

        // 连接调用结束后才能释放扫描结果中的 device。
        scan->clearResults();
        if (!connected) vTaskDelay(pdMS_TO_TICKS(1000));
    }

    // 2. 按 UUID 获取服务和写入特征，无需手动管理 GATT 句柄。
    ESP_LOGI(TAG, "Connected. Discovering F160.");
    auto service = client->getService(SERVICE_UUID);
    auto characteristic = service ? service->getCharacteristic(WRITE_UUID) : nullptr;
    if (!characteristic || !characteristic->canWriteNoResponse()) {
        ESP_LOGE(TAG, "F161 unavailable. Press RESET to retry.");
        client->disconnect();
        return;
    }

    // 3. 先显示 CONN 一秒，再每秒发送一个数字。
    ESP_LOGI(TAG, "F161 ready. Sending 0..9, one number per second.");
    vTaskDelay(pdMS_TO_TICKS(1000));
    for (uint8_t number = 0; number < 10; ++number) {
        // 6 字节 Simple 包头 + 1 字节二进制数字，不是 ASCII 字符。
        const uint8_t packet[] = {1, 0, 0, 0x10, 0, 1, number};
        if (!client->isConnected() ||
            !characteristic->writeValue(packet, sizeof(packet), false)) {
            ESP_LOGE(TAG, "Send failed");
            break;
        }
        ESP_LOGI(TAG, "Write queued: %u", static_cast<unsigned>(number));
        vTaskDelay(pdMS_TO_TICKS(1000));
    }

    // 4. 正常发送时，数字 9 显示一秒后断开；复位才开始下一轮。
    if (client->isConnected() && !client->disconnect()) {
        ESP_LOGE(TAG, "Disconnect request failed. Press RESET.");
        return;
    }
    ESP_LOGI(TAG, "Finished. Press RESET to repeat.");
}
