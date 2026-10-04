#include <atomic>
#include <cstdio>
#include <string>

#include "PixelMugBLECentral.h"
#include "driver/gpio.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char* TARGET_ADDRESS = "14:C1:9F:C1:58:E2";
static const char* TAG = "pixelmug-button";

static constexpr gpio_num_t BUTTON_GPIO = GPIO_NUM_9;
static constexpr int CIRCLE_COLOR = 10;
static constexpr int RADIUS_STEP = 1;
static constexpr int CIRCLE_STEPS = 6;

static bool configureButton()
{
    gpio_config_t config{};
    config.pin_bit_mask = 1ULL << BUTTON_GPIO;
    config.mode = GPIO_MODE_INPUT;
    config.pull_up_en = GPIO_PULLUP_ENABLE;
    config.pull_down_en = GPIO_PULLDOWN_DISABLE;
    config.intr_type = GPIO_INTR_DISABLE;
    return gpio_config(&config) == ESP_OK;
}

extern "C" void app_main()
{
    esp_log_level_set("NimBLE", ESP_LOG_WARN);
    PixelMugBLECentral mug("BleCustomClientLib");
    std::atomic<int> configState{0};  // 0=waiting, 1=applied, -1=failed

    mug.onEvent([&configState](const std::string& name,
                               const std::string& data,
                               uint32_t) {
        if (name == "configApplied") configState = 1;
        if (name == "configError") {
            ESP_LOGE(TAG, "Config rejected: %s", data.c_str());
            configState = -1;
        }
    });
    if (!configureButton()) {
        ESP_LOGE(TAG, "Cannot configure GPIO9 button");
        return;
    }

    if (!mug.begin("PixelMug Button Controller")) {
        ESP_LOGE(TAG, "BLE init failed: %s", mug.lastError().c_str());
        return;
    }

    constexpr int maxConnectAttempts = 3;
    for (int attempt = 1; attempt <= maxConnectAttempts; ++attempt) {
        if (mug.connect(TARGET_ADDRESS, 3000)) break;
        ESP_LOGW(TAG, "Connection/hello attempt %d/%d failed: %s",
                 attempt, maxConnectAttempts, mug.lastError().c_str());
        if (attempt == maxConnectAttempts) {
            ESP_LOGE(TAG, "Connection failed. Press RESET to retry.");
            // Keep callback owners alive while asynchronous BLE cleanup finishes.
            while (true) vTaskDelay(pdMS_TO_TICKS(1000));
        }
        vTaskDelay(pdMS_TO_TICKS(3000));
    }

    char configJson[96];
    std::snprintf(
        configJson,
        sizeof(configJson),
        R"({"color":%d,"step":%d,"steps":%d})",
        CIRCLE_COLOR,
        RADIUS_STEP,
        CIRCLE_STEPS);

    const auto config = mug.setConfigJson("circle", configJson);
    if (!config.ok) {
        ESP_LOGE(TAG, "Set config failed: %s", config.error.c_str());
        mug.disconnect();
        return;
    }

    for (int elapsedMs = 0;
         mug.connected() && configState == 0 && elapsedMs < 5000;
         elapsedMs += 20) {
        vTaskDelay(pdMS_TO_TICKS(20));
    }

    if (configState != 1) {
        ESP_LOGE(TAG, "%s", configState == -1
            ? "PixelMug rejected the config"
            : "Timed out waiting for configApplied");
        mug.disconnect();
        return;
    }

    ESP_LOGI(TAG, "Config applied. Press the GPIO9 button to draw the next circle.");
    int previousLevel = gpio_get_level(BUTTON_GPIO);

    while (mug.connected()) {
        const int level = gpio_get_level(BUTTON_GPIO);
        if (previousLevel == 1 && level == 0) {
            vTaskDelay(pdMS_TO_TICKS(25));
            if (gpio_get_level(BUTTON_GPIO) == 0) {
                const auto result = mug.command("nextCircle", "{}");
                if (result.ok) {
                    ESP_LOGI(TAG, "nextCircle -> %s", result.data.c_str());
                } else {
                    ESP_LOGE(TAG, "nextCircle failed: %s", result.error.c_str());
                }

                while (mug.connected() && gpio_get_level(BUTTON_GPIO) == 0) {
                    vTaskDelay(pdMS_TO_TICKS(10));
                }
                vTaskDelay(pdMS_TO_TICKS(25));
            }
        }
        previousLevel = gpio_get_level(BUTTON_GPIO);
        vTaskDelay(pdMS_TO_TICKS(10));
    }

    mug.disconnect();
    ESP_LOGW(TAG, "PixelMug disconnected. Press RESET to run again.");
}
