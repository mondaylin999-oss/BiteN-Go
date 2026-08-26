#!/usr/bin/env bash
# ===========================================================================
#  Builds the BiteN Go C++ engine (macOS / Linux / Git Bash / WSL).
#
#      bash backend/cpp/build.sh
#
#  Produces  backend/cpp/build/biten_engine  — the binary the Node API calls.
#  Also builds biten_demo and biten_tests, and runs the tests.
#
#  If CMake is not installed, this script falls back to a direct g++ call,
#  so a plain compiler is enough.
# ===========================================================================
set -e
cd "$(dirname "$0")"

if command -v cmake >/dev/null 2>&1; then
  cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
  cmake --build build --config Release
  ctest --test-dir build --output-on-failure
  echo
  echo "Built: $(pwd)/build/biten_engine"
  exit 0
fi

echo "CMake was not found — falling back to a direct g++ build."
COMPILER="${CXX:-g++}"
mkdir -p build
SOURCES="src/FerryBusManagementService.cpp src/SeatPlanner.cpp src/CanteenService.cpp src/CashflowEngine.cpp src/KitchenBoard.cpp"
$COMPILER -std=c++20 -O2 -Iinclude $SOURCES src/engine_main.cpp -o build/biten_engine
$COMPILER -std=c++20 -O2 -Iinclude $SOURCES src/demo_main.cpp   -o build/biten_demo
$COMPILER -std=c++20 -O2 -Iinclude $SOURCES tests/engine_tests.cpp -o build/biten_tests
./build/biten_tests
echo
echo "Built: $(pwd)/build/biten_engine"
