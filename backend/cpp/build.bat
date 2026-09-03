@echo off
REM ==========================================================================
REM  Builds the BiteN Go C++ engine on Windows.
REM
REM      backend\cpp\build.bat
REM
REM  Needs ONE of:
REM    * CMake + Visual Studio Build Tools ("Desktop development with C++")
REM    * CMake + MinGW-w64 / MSYS2  (g++ and mingw32-make on the PATH)
REM    * MinGW-w64 on its own       (g++ on the PATH)
REM
REM  Produces backend\cpp\build\biten_engine.exe — what the Node API calls.
REM  The app still runs without it (TypeScript fallback), but build it if you
REM  want the C++ engine to be the one deciding the rules.
REM ==========================================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

REM All three executables need every .cpp in the domain library. Keep this in
REM step with add_library(biten_core ...) in CMakeLists.txt — leaving one out
REM links fine for some targets and fails with "undefined reference" for others.
set SOURCES=src\FerryBusManagementService.cpp src\SeatPlanner.cpp src\MonthlyPassPlanner.cpp src\CanteenService.cpp src\CashflowEngine.cpp src\KitchenBoard.cpp

where cmake >nul 2>nul
if errorlevel 1 goto gpp_build

REM Pick a generator that matches what is installed rather than letting CMake
REM guess. Its default here is Visual Studio or NMake, and neither exists on a
REM machine that only has MinGW/MSYS2 — which fails before it ever compiles.
set GEN=
where ninja >nul 2>nul
if not errorlevel 1 set GEN=-G "Ninja"
if not defined GEN (
  where nmake >nul 2>nul
  if errorlevel 1 (
    where mingw32-make >nul 2>nul
    if not errorlevel 1 set GEN=-G "MinGW Makefiles" -DCMAKE_MAKE_PROGRAM=mingw32-make
  )
)

cmake -S . -B build !GEN! -DCMAKE_BUILD_TYPE=Release
if errorlevel 1 goto cmake_failed
cmake --build build --config Release
if errorlevel 1 goto cmake_failed
ctest --test-dir build --output-on-failure -C Release
echo.
echo Built: %cd%\build\biten_engine.exe
exit /b 0

:cmake_failed
echo.
echo CMake could not build here - falling back to a direct g++ build.

:gpp_build
where g++ >nul 2>nul
if errorlevel 1 (
  echo.
  echo Neither CMake nor g++ works on this machine.
  echo Install CMake + Visual Studio Build Tools, or MinGW-w64, then run this again.
  echo The app still runs without the engine - it falls back to the TypeScript rules.
  exit /b 1
)
if not exist build mkdir build
g++ -std=c++20 -O2 -Iinclude %SOURCES% src\engine_main.cpp -o build\biten_engine.exe || exit /b 1
g++ -std=c++20 -O2 -Iinclude %SOURCES% src\demo_main.cpp   -o build\biten_demo.exe   || exit /b 1
g++ -std=c++20 -O2 -Iinclude %SOURCES% tests\engine_tests.cpp -o build\biten_tests.exe || exit /b 1
build\biten_tests.exe || exit /b 1
echo.
echo Built: %cd%\build\biten_engine.exe
exit /b 0
