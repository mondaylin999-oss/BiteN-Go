cmake_minimum_required(VERSION 3.16)
project(BiteNGoEngine LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if (NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
endif()

# All three executables end up next to the build directory root, which is where
# backend/src/engine.ts looks for  biten_engine(.exe).
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY        ${CMAKE_BINARY_DIR})
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY_DEBUG  ${CMAKE_BINARY_DIR})
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY_RELEASE ${CMAKE_BINARY_DIR})

# ---------------------------------------------------------------------------
# The domain library: every business rule of BiteN Go lives here.
# ---------------------------------------------------------------------------
add_library(biten_core
  src/FerryBusManagementService.cpp
  src/SeatPlanner.cpp
  src/MonthlyPassPlanner.cpp
  src/CanteenService.cpp
  src/CashflowEngine.cpp
  src/KitchenBoard.cpp
)
target_include_directories(biten_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include)

if (MSVC)
  target_compile_options(biten_core PRIVATE /W4)
else()
  target_compile_options(biten_core PRIVATE -Wall -Wextra -Wpedantic)
endif()

# ---------------------------------------------------------------------------
# biten_engine — the JSON command-line filter the Node API calls.
# ---------------------------------------------------------------------------
add_executable(biten_engine src/engine_main.cpp)
target_link_libraries(biten_engine PRIVATE biten_core)

# ---------------------------------------------------------------------------
# biten_demo — a console walk-through of the domain (no database needed).
# ---------------------------------------------------------------------------
add_executable(biten_demo src/demo_main.cpp)
target_link_libraries(biten_demo PRIVATE biten_core)

# ---------------------------------------------------------------------------
# biten_tests — assert-based unit tests, run through CTest.
# ---------------------------------------------------------------------------
enable_testing()
add_executable(biten_tests tests/engine_tests.cpp)
target_link_libraries(biten_tests PRIVATE biten_core)
add_test(NAME biten_engine_tests COMMAND biten_tests)
