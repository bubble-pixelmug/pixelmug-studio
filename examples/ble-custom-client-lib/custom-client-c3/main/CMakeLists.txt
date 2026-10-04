idf_component_register(
    SRCS "main.cpp" "../BLECentral/PixelMugBLECentral.cpp"
    INCLUDE_DIRS "." "../BLECentral"
    REQUIRES h2zero__esp-nimble-cpp json mbedtls esp_timer esp_system esp_driver_gpio freertos
)