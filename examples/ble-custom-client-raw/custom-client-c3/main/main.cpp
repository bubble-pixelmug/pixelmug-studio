#include <strings.h>

#include "NimBLEDevice.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"


// Leave empty to select a device only when exactly one PixelMug is found;
// set the target BLE address when multiple devices are nearby.
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
    // The library initializes NVS, the BLE controller, and the NimBLE host task.
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

    // 1. Scan for three seconds. With a target address, connect only to that
    // device; without one, accept only a single candidate.
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

        // Release the device from the scan results only after connect() returns.
        scan->clearResults();
        if (!connected) vTaskDelay(pdMS_TO_TICKS(1000));
    }

    // 2. Find the service and writable characteristic by UUID without
    // manually managing GATT handles.
    ESP_LOGI(TAG, "Connected. Discovering F160.");
    auto service = client->getService(SERVICE_UUID);
    auto characteristic = service ? service->getCharacteristic(WRITE_UUID) : nullptr;
    if (!characteristic || !characteristic->canWriteNoResponse()) {
        ESP_LOGE(TAG, "F161 unavailable. Press RESET to retry.");
        client->disconnect();
        return;
    }

    // 3. Display CONN for one second, then send one number per second.
    ESP_LOGI(TAG, "F161 ready. Sending 0..9, one number per second.");
    vTaskDelay(pdMS_TO_TICKS(1000));
    for (uint8_t number = 0; number < 10; ++number) {
        // Six-byte Simple header plus one binary number, not an ASCII character.
        const uint8_t packet[] = {1, 0, 0, 0x10, 0, 1, number};
        if (!client->isConnected() ||
            !characteristic->writeValue(packet, sizeof(packet), false)) {
            ESP_LOGE(TAG, "Send failed");
            break;
        }
        ESP_LOGI(TAG, "Write queued: %u", static_cast<unsigned>(number));
        vTaskDelay(pdMS_TO_TICKS(1000));
    }

    // 4. After number 9 has been displayed for one second, disconnect.
    // Reset the C3 to start another cycle.
    if (client->isConnected() && !client->disconnect()) {
        ESP_LOGE(TAG, "Disconnect request failed. Press RESET.");
        return;
    }
    ESP_LOGI(TAG, "Finished. Press RESET to repeat.");
}
