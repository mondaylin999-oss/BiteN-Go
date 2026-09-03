#!/usr/bin/env bash
# ===========================================================================
#  Builds the BiteN Go C++ engine (macOS / Linux / Git Bash / WSL).
#
#      bash backend/cpp/build.sh
#
#  Produces  backend/cpp/build/biten_engine  — the binary the Node API calls.
#  Also builds biten_demo and biten_tests, and runs the tests.
#
#  CMake is used when it is installed and can find something to build with.
#  If it is missing, or cannot (a Windows CMake with no Visual Studio defaults
#  to NMake, which is usually not there), this falls back to a direct g++
#  call — a plain compiler is enough.
# ===========================================================================
set -e
cd "$(dirname "$0")"

# All three executables need every .cpp in the domain library. Keep this list
# in step with add_library(biten_core ...) in CMakeLists.txt — leaving one out
# links fine for some targets and fails with "undefined reference" for others.
SOURCES="src/FerryBusManagementService.cpp src/SeatPlanner.cpp src/MonthlyPassPlanner.cpp src/CanteenService.cpp src/CashflowEngine.cpp src/KitchenBoard.cpp"

build_with_cmake() {
  # Pick a generator that matches what is actually installed, rather than
  # letting CMake guess: its default on Windows is Visual Studio or NMake,
  # and neither is present on a machine that only has MinGW/MSYS2.
  local generator=()
  if command -v ninja >/dev/null 2>&1; then
    generator=(-G "Ninja")
  elif ! command -v nmake >/dev/null 2>&1 && command -v mingw32-make >/dev/null 2>&1; then
    generator=(-G "MinGW Makefiles" -DCMAKE_MAKE_PROGRAM=mingw32-make)
  fi

  cmake -S . -B build "${generator[@]}" -DCMAKE_BUILD_TYPE=Release
  cmake --build build --config Release
  ctest --test-dir build --output-on-failure -C Release
}

if command -v cmake >/dev/null 2>&1; then
  # A CMake failure is not fatal — the g++ path below builds the same thing.
  if build_with_cmake; then
    echo
    echo "Built: $(pwd)/build/biten_engine"
    exit 0
  fi
  echo
  echo "CMake could not build here — falling back to a direct g++ build."
else
  echo "CMake was not found — falling back to a direct g++ build."
fi

COMPILER="${CXX:-g++}"
if ! command -v "$COMPILER" >/dev/null 2>&1; then
  echo "Neither CMake nor $COMPILER works on this machine."
  echo "Install CMake, or a C++20 compiler (g++ 10+, clang 12+), then run this again."
  echo "The app still runs without the engine — it falls back to the TypeScript rules."
  exit 1
fi

mkdir -p build
$COMPILER -std=c++20 -O2 -Iinclude $SOURCES src/engine_main.cpp -o build/biten_engine
$COMPILER -std=c++20 -O2 -Iinclude $SOURCES src/demo_main.cpp   -o build/biten_demo
$COMPILER -std=c++20 -O2 -Iinclude $SOURCES tests/engine_tests.cpp -o build/biten_tests
./build/biten_tests
echo
echo "Built: $(pwd)/build/biten_engine"
