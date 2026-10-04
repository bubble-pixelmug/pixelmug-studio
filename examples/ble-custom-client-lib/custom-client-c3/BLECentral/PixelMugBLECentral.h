#pragma once

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <string>
#include <vector>

#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

class NimBLEAdvertisedDevice;
class NimBLEClient;
class NimBLERemoteCharacteristic;

class PixelMugBLECentral {
public:
    static constexpr uint8_t DATA_TYPE_RAW = 0;
    static constexpr uint8_t DATA_TYPE_TEXT = 1;

    struct Result {
        bool ok = false;
        std::string data = "null";
        std::string error;
    };

    using StateHandler = std::function<void(const std::string& stateJson, uint32_t revision)>;
    using EventHandler = std::function<void(const std::string& name,
                                            const std::string& dataJson,
                                            uint32_t revision)>;
    using SimpleHandler = std::function<void(uint8_t dataType,
                                             const std::vector<uint8_t>& payload)>;

    explicit PixelMugBLECentral(std::string appId,
                                std::string appVersion = "1.0");
    ~PixelMugBLECentral();

    PixelMugBLECentral(const PixelMugBLECentral&) = delete;
    PixelMugBLECentral& operator=(const PixelMugBLECentral&) = delete;

    // Initialize NimBLE. Create only one PixelMugBLECentral instance per application.
    bool begin(const std::string& localName = "PixelMug Central");

    // With an empty address, connect only when exactly one PixelMug is found.
    // connect() performs discovery, notification subscription, and the F150 hello.
    bool connect(const std::string& targetAddress = "", uint32_t scanMs = 3000);
    bool reconnect(uint32_t scanMs = 3000);
    void disconnect();

    bool connected() const;
    bool ready() const;
    uint16_t mtu() const;
    size_t maxMessage() const;
    const std::string& address() const;
    const std::string& lastError() const;

    // paramsJson must be a JSON object. data contains the handler's result value.
    Result command(const std::string& method,
                   const std::string& paramsJson = "{}",
                   uint32_t timeoutMs = 5000);

    // Return the device state object without the outer protocol fields.
    Result requestSnapshot(uint32_t timeoutMs = 5000);

    // A successful commit only queues the config. onEvent reports the final result.
    Result setConfig(const std::string& name,
                     const uint8_t* data,
                     size_t length,
                     const std::string& metaJson = "{}",
                     uint32_t timeoutMs = 5000,
                     size_t preferredChunkSize = 128);
    Result setConfigJson(const std::string& name,
                         const std::string& json,
                         const std::string& metaJson = "{}",
                         uint32_t timeoutMs = 5000,
                         size_t preferredChunkSize = 128);

    bool sendSimpleRaw(const uint8_t* data, size_t length);
    bool sendSimpleRaw(const std::vector<uint8_t>& data);
    bool sendSimpleText(const std::string& text);

    void onState(StateHandler handler);
    void onEvent(EventHandler handler);
    void onSimple(SimpleHandler handler);

private:
    bool createClient();
    void releaseClient();
    bool discoverAndHandshake();
    bool isPixelMug(const NimBLEAdvertisedDevice* device) const;
    bool handshake(uint32_t timeoutMs);

    Result commandWithPriority(const std::string& method,
                               const std::string& paramsJson,
                               uint8_t priority,
                               uint32_t timeoutMs);
    std::string makeId(const char* prefix);
    std::string sendRequest(const std::string& json,
                            const std::string& id,
                            uint32_t timeoutMs);
    Result decodeResponse(const std::string& responseJson) const;
    bool checkMessageSize(const std::string& json);

    void handleF150(const uint8_t* data, size_t length);
    void handleF160(const uint8_t* data, size_t length);
    void resetSession();
    void setError(const std::string& error);

    bool sendSimple(uint8_t dataType, const uint8_t* data, size_t length);

    std::string appId_;
    std::string appVersion_;
    std::string localName_;
    std::string targetAddress_;
    std::string sessionId_;
    std::string lastError_;

    NimBLEClient* client_ = nullptr;
    NimBLERemoteCharacteristic* f150Write_ = nullptr;
    NimBLERemoteCharacteristic* f150Notify_ = nullptr;
    NimBLERemoteCharacteristic* f160Write_ = nullptr;
    NimBLERemoteCharacteristic* f160Notify_ = nullptr;

    bool initialized_ = false;
    bool ready_ = false;
    size_t maxMessage_ = 0;
    size_t configChunk_ = 128;
    uint32_t stateRevision_ = 0;
    std::atomic<uint32_t> requestSequence_{0};

    SemaphoreHandle_t requestMutex_ = nullptr;
    SemaphoreHandle_t responseSignal_ = nullptr;
    SemaphoreHandle_t responseMutex_ = nullptr;
    std::string waitingId_;
    std::string waitingResponse_;

    StateHandler stateHandler_;
    EventHandler eventHandler_;
    SimpleHandler simpleHandler_;

    uint8_t simpleType_ = DATA_TYPE_RAW;
    uint8_t simplePacketCount_ = 0;
    uint8_t simpleNextPacket_ = 0;
    uint16_t simpleTotalLength_ = 0;
    std::vector<uint8_t> simpleBuffer_;
};
