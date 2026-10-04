#include "PixelMugBLECentral.h"

#include <algorithm>
#include <cstring>
#include <memory>
#include <strings.h>
#include <utility>

#include "NimBLEDevice.h"

// ESP-IDF 5.5 includes incoming ATT notification dispatch under BLE_GATTS.
#if !MYNEWT_VAL(BLE_GATTS)
#error "PixelMugBLECentral needs CONFIG_BT_NIMBLE_ROLE_PERIPHERAL=y and CONFIG_BT_NIMBLE_GATT_SERVER=y to receive notifications on ESP-IDF 5.5"
#endif

#include "cJSON.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/task.h"
#include "mbedtls/base64.h"

namespace {
constexpr uint8_t kProtocolVersion = 1;
constexpr size_t kSimpleHeaderSize = 6;
constexpr size_t kSimpleMaxPackets = 8;
constexpr size_t kSimpleMaxMessage = 4024;
constexpr uint32_t kDefaultTimeoutMs = 5000;
constexpr uint8_t kHelloAttempts = 2;
constexpr uint32_t kSubscriptionSettleMs = 100;

const NimBLEUUID kF150Service("F150");
const NimBLEUUID kF151Notify("F151");
const NimBLEUUID kF152Write("F152");
const NimBLEUUID kF160Service("F160");
const NimBLEUUID kF161Write("F161");
const NimBLEUUID kF162Notify("F162");

struct JsonDeleter {
    void operator()(cJSON* value) const { cJSON_Delete(value); }
};
using Json = std::unique_ptr<cJSON, JsonDeleter>;

Json parseJson(const std::string& text)
{
    return Json(cJSON_ParseWithLength(text.data(), text.size()));
}

std::string printJson(const cJSON* value)
{
    if (!value) return "null";
    char* printed = cJSON_PrintUnformatted(value);
    if (!printed) return {};
    std::string result(printed);
    cJSON_free(printed);
    return result;
}

std::string jsonString(const cJSON* object, const char* name,
                       const std::string& fallback = {})
{
    const cJSON* value = cJSON_GetObjectItemCaseSensitive(object, name);
    return cJSON_IsString(value) && value->valuestring
        ? std::string(value->valuestring)
        : fallback;
}

uint32_t jsonUint(const cJSON* object, const char* name, uint32_t fallback = 0)
{
    const cJSON* value = cJSON_GetObjectItemCaseSensitive(object, name);
    return cJSON_IsNumber(value) ? static_cast<uint32_t>(value->valuedouble) : fallback;
}

bool jsonOk(const cJSON* object)
{
    const cJSON* value = cJSON_GetObjectItemCaseSensitive(object, "ok");
    return cJSON_IsTrue(value) || (cJSON_IsNumber(value) && value->valueint != 0);
}

uint32_t crc32(const uint8_t* data, size_t length)
{
    uint32_t crc = 0xFFFFFFFFu;
    for (size_t i = 0; i < length; ++i) {
        crc ^= data[i];
        for (int bit = 0; bit < 8; ++bit) {
            crc = (crc >> 1) ^ ((crc & 1u) ? 0xEDB88320u : 0u);
        }
    }
    return crc ^ 0xFFFFFFFFu;
}

std::string base64(const uint8_t* data, size_t length)
{
    size_t outputLength = 0;
    std::vector<uint8_t> output(4 * ((length + 2) / 3) + 1);
    if (mbedtls_base64_encode(output.data(), output.size(), &outputLength,
                              data, length) != 0) {
        return {};
    }
    return std::string(reinterpret_cast<const char*>(output.data()), outputLength);
}

void addCommon(cJSON* root, const char* type, const std::string& id,
               const std::string& session)
{
    cJSON_AddNumberToObject(root, "v", kProtocolVersion);
    cJSON_AddStringToObject(root, "t", type);
    cJSON_AddStringToObject(root, "id", id.c_str());
    if (!session.empty()) cJSON_AddStringToObject(root, "session", session.c_str());
}
}  // namespace

PixelMugBLECentral::PixelMugBLECentral(std::string appId, std::string appVersion)
    : appId_(std::move(appId)), appVersion_(std::move(appVersion))
{
    requestMutex_ = xSemaphoreCreateMutex();
    responseSignal_ = xSemaphoreCreateBinary();
    responseMutex_ = xSemaphoreCreateMutex();
}

PixelMugBLECentral::~PixelMugBLECentral()
{
    disconnect();
    if (requestMutex_) vSemaphoreDelete(requestMutex_);
    if (responseSignal_) vSemaphoreDelete(responseSignal_);
    if (responseMutex_) vSemaphoreDelete(responseMutex_);
}

bool PixelMugBLECentral::begin(const std::string& localName)
{
    if (initialized_) return true;
    if (!requestMutex_ || !responseSignal_ || !responseMutex_) {
        setError("cannot create synchronization objects");
        return false;
    }

    localName_ = localName;
    if (!NimBLEDevice::init(localName_)) {
        setError("NimBLE initialization failed");
        return false;
    }

    // F150 hello responses include capability data and need a larger MTU.
    NimBLEDevice::setMTU(512);
    initialized_ = true;
    lastError_.clear();
    return true;
}

bool PixelMugBLECentral::connect(const std::string& targetAddress, uint32_t scanMs)
{
    if (!initialized_ && !begin()) return false;
    disconnect();
    if (!createClient()) return false;

    auto* scan = NimBLEDevice::getScan();
    scan->setActiveScan(true);
    const auto results = scan->getResults(scanMs);

    const NimBLEAdvertisedDevice* candidate = nullptr;
    int candidateCount = 0;
    for (int i = 0; i < results.getCount(); ++i) {
        const auto* device = results.getDevice(i);
        if (!isPixelMug(device)) continue;

        const std::string address = device->getAddress().toString();
        if (targetAddress.empty()) {
            candidate = device;
            ++candidateCount;
        } else if (strcasecmp(address.c_str(), targetAddress.c_str()) == 0) {
            candidate = device;
            break;
        }
    }

    if (targetAddress.empty() && candidateCount > 1) {
        scan->clearResults();
        setError("multiple PixelMugs found; provide targetAddress");
        return false;
    }

    bool linkConnected = false;
    if (candidate) {
        targetAddress_ = candidate->getAddress().toString();
        linkConnected = client_->connect(candidate);
    }
    scan->clearResults();

    if (!linkConnected) {
        const std::string error = targetAddress.empty()
            ? "PixelMug not found or connection failed"
            : "target PixelMug not found or connection failed";
        releaseClient();
        setError(error);
        return false;
    }

    if (!discoverAndHandshake()) {
        const std::string error = lastError_;
        releaseClient();
        setError(error);
        return false;
    }

    ESP_LOGI("PixelMugBLECentral", "Connected to %s", targetAddress_.c_str());
    lastError_.clear();
    return true;
}

bool PixelMugBLECentral::reconnect(uint32_t scanMs)
{
    if (targetAddress_.empty()) {
        setError("no previous PixelMug address");
        return false;
    }
    const std::string address = targetAddress_;
    return connect(address, scanMs);
}

bool PixelMugBLECentral::createClient()
{
    if (client_) return true;
    client_ = NimBLEDevice::createClient();
    if (client_) return true;
    setError("cannot create NimBLE client");
    return false;
}

void PixelMugBLECentral::releaseClient()
{
    resetSession();
    if (!client_) return;
    NimBLEDevice::deleteClient(client_);
    client_ = nullptr;
}

void PixelMugBLECentral::disconnect()
{
    releaseClient();
}

bool PixelMugBLECentral::connected() const
{
    return client_ && client_->isConnected();
}

bool PixelMugBLECentral::ready() const
{
    return connected() && ready_;
}

uint16_t PixelMugBLECentral::mtu() const
{
    return connected() ? client_->getMTU() : 0;
}

size_t PixelMugBLECentral::maxMessage() const { return maxMessage_; }
const std::string& PixelMugBLECentral::address() const { return targetAddress_; }
const std::string& PixelMugBLECentral::lastError() const { return lastError_; }

bool PixelMugBLECentral::isPixelMug(const NimBLEAdvertisedDevice* device) const
{
    if (!device) return false;
    const std::string name = device->getName();
    return name.rfind("MPY-", 0) == 0 &&
           device->isAdvertisingService(kF150Service) &&
           device->isAdvertisingService(kF160Service);
}

bool PixelMugBLECentral::discoverAndHandshake()
{
    auto* messageService = client_->getService(kF150Service);
    auto* simpleService = client_->getService(kF160Service);
    if (!messageService || !simpleService) {
        setError("F150 or F160 service unavailable");
        return false;
    }

    f150Write_ = messageService->getCharacteristic(kF152Write);
    f150Notify_ = messageService->getCharacteristic(kF151Notify);
    f160Write_ = simpleService->getCharacteristic(kF161Write);
    f160Notify_ = simpleService->getCharacteristic(kF162Notify);
    if (!f150Write_ || !f150Notify_ || !f160Write_ || !f160Notify_ ||
        !f150Write_->canWrite() || !f150Notify_->canNotify() ||
        !f160Write_->canWriteNoResponse() || !f160Notify_->canNotify()) {
        setError("required PixelMug characteristics unavailable");
        return false;
    }

    if (!f150Notify_->subscribe(
            true,
            [this](NimBLERemoteCharacteristic*, uint8_t* data, size_t length, bool) {
                handleF150(data, length);
            },
            true)) {
        setError("cannot subscribe F151");
        return false;
    }

    if (!f160Notify_->subscribe(
            true,
            [this](NimBLERemoteCharacteristic*, uint8_t* data, size_t length, bool) {
                handleF160(data, length);
            },
            true)) {
        setError("cannot subscribe F162");
        return false;
    }

    // subscribe() may succeed even when no CCCD was found. Verify the peer state.
    const auto verifySubscription = [this](NimBLERemoteCharacteristic* characteristic) {
        auto* cccd = characteristic->getDescriptor(NimBLEUUID(uint16_t{0x2902}));
        if (!cccd) {
            setError("notification CCCD is missing");
            return false;
        }
        const auto value = cccd->readValue();
        if (value.size() != 2) {
            setError("cannot read notification CCCD");
            return false;
        }
        const unsigned flags = value[0] | (static_cast<unsigned>(value[1]) << 8);
        if ((flags & 1u) == 0) {
            setError("peer notification subscription is not enabled");
            return false;
        }
        return true;
    };
    if (!verifySubscription(f150Notify_) || !verifySubscription(f160Notify_)) return false;

    // Give the peripheral event loop time to observe both CCCD writes.
    vTaskDelay(pdMS_TO_TICKS(kSubscriptionSettleMs));
    return handshake(kDefaultTimeoutMs);
}

bool PixelMugBLECentral::handshake(uint32_t timeoutMs)
{
    const std::string id = makeId("h");
    Json root(cJSON_CreateObject());
    addCommon(root.get(), "hello", id, {});
    cJSON_AddStringToObject(root.get(), "app", appId_.c_str());
    cJSON_AddStringToObject(root.get(), "app_version", appVersion_.c_str());
    cJSON_AddNumberToObject(root.get(), "last_rev", stateRevision_);

    const std::string request = printJson(root.get());
    std::string response;
    for (uint8_t attempt = 0; attempt < kHelloAttempts; ++attempt) {
        response = sendRequest(request, id, timeoutMs);
        if (!response.empty()) break;
        if (!connected() || attempt + 1 >= kHelloAttempts) return false;

        ESP_LOGW("PixelMugBLECentral",
                 "Hello response timed out; retrying the same id (%u/%u)",
                 static_cast<unsigned>(attempt + 2),
                 static_cast<unsigned>(kHelloAttempts));
        vTaskDelay(pdMS_TO_TICKS(100));
    }

    Json message = parseJson(response);
    if (!message || !jsonOk(message.get()) || jsonString(message.get(), "t") != "hello") {
        setError(message ? jsonString(message.get(), "error", "hello failed")
                         : "invalid hello response");
        return false;
    }

    if (jsonUint(message.get(), "v") != kProtocolVersion) {
        setError("protocol version mismatch");
        return false;
    }
    if (jsonString(message.get(), "app") != appId_) {
        setError("application id mismatch");
        return false;
    }

    sessionId_ = jsonString(message.get(), "session");
    if (sessionId_.empty()) {
        setError("hello response has no session");
        return false;
    }

    maxMessage_ = jsonUint(message.get(), "max_message", 0);
    configChunk_ = jsonUint(message.get(), "config_chunk", 128);
    stateRevision_ = jsonUint(message.get(), "rev", 0);
    ready_ = true;
    return true;
}

PixelMugBLECentral::Result PixelMugBLECentral::command(
    const std::string& method, const std::string& paramsJson, uint32_t timeoutMs)
{
    return commandWithPriority(method, paramsJson, 1, timeoutMs);
}

PixelMugBLECentral::Result PixelMugBLECentral::commandWithPriority(
    const std::string& method, const std::string& paramsJson,
    uint8_t priority, uint32_t timeoutMs)
{
    if (!ready()) return {false, "null", "BLE application session is not ready"};

    Json params = parseJson(paramsJson);
    if (!params || !cJSON_IsObject(params.get())) {
        return {false, "null", "command params must be a JSON object"};
    }

    const std::string id = makeId("r");
    Json root(cJSON_CreateObject());
    addCommon(root.get(), "req", id, sessionId_);
    cJSON_AddStringToObject(root.get(), "method", method.c_str());
    cJSON_AddItemToObject(root.get(), "params", cJSON_Duplicate(params.get(), true));
    cJSON_AddNumberToObject(root.get(), "p", priority);

    const std::string response = sendRequest(printJson(root.get()), id, timeoutMs);
    if (response.empty()) return {false, "null", lastError_};

    Json message = parseJson(response);
    if (message) stateRevision_ = std::max(stateRevision_, jsonUint(message.get(), "rev", 0));
    return decodeResponse(response);
}

PixelMugBLECentral::Result PixelMugBLECentral::requestSnapshot(uint32_t timeoutMs)
{
    Result response = commandWithPriority("__snapshot", "{}", 0, timeoutMs);
    if (!response.ok) return response;

    Json result = parseJson(response.data);
    if (!result) return {false, "null", "invalid snapshot response"};
    const cJSON* state = cJSON_GetObjectItemCaseSensitive(result.get(), "state");
    stateRevision_ = std::max(stateRevision_, jsonUint(result.get(), "rev", stateRevision_));
    return {true, cJSON_IsObject(state) ? printJson(state) : "{}", {}};
}

PixelMugBLECentral::Result PixelMugBLECentral::setConfigJson(
    const std::string& name, const std::string& json, const std::string& metaJson,
    uint32_t timeoutMs, size_t preferredChunkSize)
{
    Json value = parseJson(json);
    if (!value) return {false, "null", "config value is not valid JSON"};
    return setConfig(name, reinterpret_cast<const uint8_t*>(json.data()), json.size(),
                     metaJson, timeoutMs, preferredChunkSize);
}

PixelMugBLECentral::Result PixelMugBLECentral::setConfig(
    const std::string& name, const uint8_t* data, size_t length,
    const std::string& metaJson, uint32_t timeoutMs, size_t preferredChunkSize)
{
    if (!ready()) return {false, "null", "BLE application session is not ready"};
    if (!data && length != 0) return {false, "null", "config data is null"};

    Json meta = parseJson(metaJson);
    if (!meta || !cJSON_IsObject(meta.get())) {
        return {false, "null", "config meta must be a JSON object"};
    }

    const std::string beginId = makeId("c");
    Json begin(cJSON_CreateObject());
    addCommon(begin.get(), "cfg", beginId, sessionId_);
    cJSON_AddStringToObject(begin.get(), "name", name.c_str());
    cJSON_AddStringToObject(begin.get(), "op", "begin");
    cJSON_AddNumberToObject(begin.get(), "size", static_cast<double>(length));
    cJSON_AddNumberToObject(begin.get(), "crc32", static_cast<double>(crc32(data, length)));
    cJSON_AddItemToObject(begin.get(), "meta", cJSON_Duplicate(meta.get(), true));
    cJSON_AddNumberToObject(begin.get(), "p", 2);

    Result beginResult = decodeResponse(sendRequest(printJson(begin.get()), beginId, timeoutMs));
    if (!beginResult.ok) return beginResult;

    Json beginData = parseJson(beginResult.data);
    if (!beginData) return {false, "null", "invalid config begin response"};
    size_t offset = jsonUint(beginData.get(), "next", 0);
    const size_t negotiated = jsonUint(beginData.get(), "chunk", configChunk_);
    size_t chunkSize = std::max<size_t>(1, std::min(preferredChunkSize, negotiated));

    while (offset < length) {
        size_t current = std::min(chunkSize, length - offset);
        const std::string id = makeId("c");
        std::string packetJson;

        // Keep Base64 data and protocol fields within max_message.
        while (current > 0) {
            const std::string encoded = base64(data + offset, current);
            Json chunk(cJSON_CreateObject());
            addCommon(chunk.get(), "cfg", id, sessionId_);
            cJSON_AddStringToObject(chunk.get(), "name", name.c_str());
            cJSON_AddStringToObject(chunk.get(), "op", "chunk");
            cJSON_AddNumberToObject(chunk.get(), "offset", static_cast<double>(offset));
            cJSON_AddStringToObject(chunk.get(), "data", encoded.c_str());
            cJSON_AddNumberToObject(chunk.get(), "p", 2);
            packetJson = printJson(chunk.get());
            if (maxMessage_ == 0 || packetJson.size() <= maxMessage_) break;
            current = current > 8 ? current - 8 : 0;
        }
        if (current == 0) return {false, "null", "MTU is too small for config chunk"};

        Result chunkResult = decodeResponse(sendRequest(packetJson, id, timeoutMs));
        if (!chunkResult.ok) return chunkResult;
        Json chunkData = parseJson(chunkResult.data);
        const size_t next = chunkData ? jsonUint(chunkData.get(), "next", offset) : offset;
        if (next <= offset || next > length) {
            return {false, "null", "invalid config chunk acknowledgement"};
        }
        offset = next;
    }

    const std::string commitId = makeId("c");
    Json commit(cJSON_CreateObject());
    addCommon(commit.get(), "cfg", commitId, sessionId_);
    cJSON_AddStringToObject(commit.get(), "name", name.c_str());
    cJSON_AddStringToObject(commit.get(), "op", "commit");
    cJSON_AddNumberToObject(commit.get(), "p", 2);
    return decodeResponse(sendRequest(printJson(commit.get()), commitId, timeoutMs));
}

bool PixelMugBLECentral::sendSimpleRaw(const uint8_t* data, size_t length)
{
    return sendSimple(DATA_TYPE_RAW, data, length);
}

bool PixelMugBLECentral::sendSimpleRaw(const std::vector<uint8_t>& data)
{
    return sendSimpleRaw(data.data(), data.size());
}

bool PixelMugBLECentral::sendSimpleText(const std::string& text)
{
    return sendSimple(DATA_TYPE_TEXT,
                      reinterpret_cast<const uint8_t*>(text.data()), text.size());
}

bool PixelMugBLECentral::sendSimple(uint8_t dataType,
                                    const uint8_t* data, size_t length)
{
    if (!connected() || !f160Write_) {
        setError("Simple channel is not connected");
        return false;
    }
    if (!data || length == 0 || length > kSimpleMaxMessage ||
        (dataType != DATA_TYPE_RAW && dataType != DATA_TYPE_TEXT)) {
        setError("invalid Simple payload");
        return false;
    }

    const size_t payloadPerPacket = mtu() > 9 ? mtu() - 9 : 14;
    const size_t packetCount = (length + payloadPerPacket - 1) / payloadPerPacket;
    if (packetCount == 0 || packetCount > kSimpleMaxPackets) {
        setError("Simple payload needs too many packets for negotiated MTU");
        return false;
    }

    size_t offset = 0;
    for (size_t index = 0; index < packetCount; ++index) {
        const size_t current = std::min(payloadPerPacket, length - offset);
        std::vector<uint8_t> packet(kSimpleHeaderSize + current);
        packet[0] = kProtocolVersion;
        packet[1] = 0;
        packet[2] = dataType;
        packet[3] = static_cast<uint8_t>((packetCount << 4) | index);
        packet[4] = static_cast<uint8_t>((length >> 8) & 0xFF);
        packet[5] = static_cast<uint8_t>(length & 0xFF);
        std::memcpy(packet.data() + kSimpleHeaderSize, data + offset, current);

        if (!f160Write_->writeValue(packet.data(), packet.size(), false)) {
            setError("F161 write failed");
            return false;
        }
        offset += current;
        if (index + 1 < packetCount) vTaskDelay(pdMS_TO_TICKS(2));
    }
    return true;
}

void PixelMugBLECentral::onState(StateHandler handler)
{
    stateHandler_ = std::move(handler);
}

void PixelMugBLECentral::onEvent(EventHandler handler)
{
    eventHandler_ = std::move(handler);
}

void PixelMugBLECentral::onSimple(SimpleHandler handler)
{
    simpleHandler_ = std::move(handler);
}

std::string PixelMugBLECentral::makeId(const char* prefix)
{
    const uint32_t sequence = ++requestSequence_;
    return std::string(prefix) + std::to_string(sequence) + "_" +
           std::to_string(static_cast<unsigned long long>(esp_timer_get_time()));
}

std::string PixelMugBLECentral::sendRequest(
    const std::string& json, const std::string& id, uint32_t timeoutMs)
{
    if (!connected() || !f150Write_) {
        setError("standard message channel is not connected");
        return {};
    }
    if (!checkMessageSize(json)) return {};

    // Allow only one pending F150 request so response IDs cannot overlap.
    xSemaphoreTake(requestMutex_, portMAX_DELAY);
    while (xSemaphoreTake(responseSignal_, 0) == pdTRUE) {}
    xSemaphoreTake(responseMutex_, portMAX_DELAY);
    waitingId_ = id;
    waitingResponse_.clear();
    xSemaphoreGive(responseMutex_);

    if (!f150Write_->writeValue(
            reinterpret_cast<const uint8_t*>(json.data()), json.size(), true)) {
        xSemaphoreTake(responseMutex_, portMAX_DELAY);
        waitingId_.clear();
        xSemaphoreGive(responseMutex_);
        xSemaphoreGive(requestMutex_);
        setError("F152 write failed");
        return {};
    }

    if (xSemaphoreTake(responseSignal_, pdMS_TO_TICKS(timeoutMs)) != pdTRUE) {
        xSemaphoreTake(responseMutex_, portMAX_DELAY);
        waitingId_.clear();
        xSemaphoreGive(responseMutex_);
        xSemaphoreGive(requestMutex_);
        setError("PixelMug response timed out at MTU " + std::to_string(mtu()));
        return {};
    }

    xSemaphoreTake(responseMutex_, portMAX_DELAY);
    std::string response = waitingResponse_;
    waitingId_.clear();
    waitingResponse_.clear();
    xSemaphoreGive(responseMutex_);
    xSemaphoreGive(requestMutex_);
    return response;
}

PixelMugBLECentral::Result PixelMugBLECentral::decodeResponse(
    const std::string& responseJson) const
{
    if (responseJson.empty()) return {false, "null", lastError_};
    Json message = parseJson(responseJson);
    if (!message) return {false, "null", "invalid JSON response"};
    if (!jsonOk(message.get())) {
        return {false, "null", jsonString(message.get(), "error", "request failed")};
    }
    return {true, printJson(cJSON_GetObjectItemCaseSensitive(message.get(), "result")), {}};
}

bool PixelMugBLECentral::checkMessageSize(const std::string& json)
{
    if (ready_ && maxMessage_ > 0 && json.size() > maxMessage_) {
        setError("standard message exceeds negotiated max_message");
        return false;
    }
    return true;
}

void PixelMugBLECentral::handleF150(const uint8_t* data, size_t length)
{
    const std::string raw(reinterpret_cast<const char*>(data), length);
    Json message = parseJson(raw);
    if (!message) {
        ESP_LOGW("PixelMugBLECentral", "Invalid JSON response");
        return;
    }

    const std::string id = jsonString(message.get(), "id");
    const std::string type = jsonString(message.get(), "t");
    if (!id.empty() && (type == "hello" || type == "res" || type == "pong")) {
        bool matched = false;
        xSemaphoreTake(responseMutex_, portMAX_DELAY);
        if (id == waitingId_) {
            waitingResponse_ = raw;
            matched = true;
        }
        xSemaphoreGive(responseMutex_);
        if (matched) {
            xSemaphoreGive(responseSignal_);
            return;
        }
    }

    const std::string messageSession = jsonString(message.get(), "session");
    if (!sessionId_.empty() && !messageSession.empty() && messageSession != sessionId_) return;

    if (type == "state") {
        stateRevision_ = std::max(stateRevision_, jsonUint(message.get(), "rev", 0));
        const cJSON* state = cJSON_GetObjectItemCaseSensitive(message.get(), "state");
        if (stateHandler_) stateHandler_(printJson(state), stateRevision_);
    } else if (type == "event") {
        stateRevision_ = std::max(stateRevision_, jsonUint(message.get(), "rev", 0));
        const cJSON* eventData = cJSON_GetObjectItemCaseSensitive(message.get(), "data");
        if (eventHandler_) {
            eventHandler_(jsonString(message.get(), "event"),
                          printJson(eventData), stateRevision_);
        }
    }
}

void PixelMugBLECentral::handleF160(const uint8_t* data, size_t length)
{
    if (!data || length <= kSimpleHeaderSize || data[0] != kProtocolVersion || data[1] != 0) return;
    const uint8_t dataType = data[2];
    const uint8_t packetCount = data[3] >> 4;
    const uint8_t packetIndex = data[3] & 0x0F;
    const uint16_t totalLength = (static_cast<uint16_t>(data[4]) << 8) | data[5];
    if ((dataType != DATA_TYPE_RAW && dataType != DATA_TYPE_TEXT) ||
        packetCount == 0 || packetCount > kSimpleMaxPackets ||
        packetIndex >= packetCount || totalLength == 0 || totalLength > kSimpleMaxMessage) {
        return;
    }

    const uint8_t* payload = data + kSimpleHeaderSize;
    const size_t payloadLength = length - kSimpleHeaderSize;
    if (packetIndex == 0) {
        simpleType_ = dataType;
        simplePacketCount_ = packetCount;
        simpleNextPacket_ = 0;
        simpleTotalLength_ = totalLength;
        simpleBuffer_.clear();
        simpleBuffer_.reserve(totalLength);
    }

    if (dataType != simpleType_ || packetCount != simplePacketCount_ ||
        totalLength != simpleTotalLength_ || packetIndex != simpleNextPacket_ ||
        simpleBuffer_.size() + payloadLength > totalLength) {
        simpleBuffer_.clear();
        simplePacketCount_ = 0;
        return;
    }

    simpleBuffer_.insert(simpleBuffer_.end(), payload, payload + payloadLength);
    ++simpleNextPacket_;
    if (simpleNextPacket_ == simplePacketCount_ && simpleBuffer_.size() == simpleTotalLength_) {
        if (simpleHandler_) simpleHandler_(simpleType_, simpleBuffer_);
        simpleBuffer_.clear();
        simplePacketCount_ = 0;
    }
}

void PixelMugBLECentral::resetSession()
{
    ready_ = false;
    sessionId_.clear();
    maxMessage_ = 0;
    configChunk_ = 128;
    f150Write_ = nullptr;
    f150Notify_ = nullptr;
    f160Write_ = nullptr;
    f160Notify_ = nullptr;
    simpleBuffer_.clear();
    simplePacketCount_ = 0;

    if (responseMutex_) {
        xSemaphoreTake(responseMutex_, portMAX_DELAY);
        waitingId_.clear();
        waitingResponse_.clear();
        xSemaphoreGive(responseMutex_);
    }
}

void PixelMugBLECentral::setError(const std::string& error)
{
    lastError_ = error;
}
