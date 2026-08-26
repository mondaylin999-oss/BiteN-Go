@echo off
REM ==========================================================================
REM  Builds the BiteN Go C++ engine on Windows.
REM
REM      backend\cpp\build.bat
REM
REM  Needs ONE of:
REM    * CMake + Visual Studio Build Tools ("Desktop development with C++")
REM    * MinGW-w64 (g++ on the PATH)
REM
REM  Produces backend\cpp\build\biten_engine.exe — what the Node API calls.
REM  The app still runs without it (TypeScript fallback), but build it if you
REM  want the C++ engine to be the one deciding the rules.
REM ==========================================================================
setlocal
cd /d "%~dp0"

where cmake >nul 2>nul
if %errorlevel%==0 goto cmake_build

where g++ >nul 2>nul
if %errorlevel%==0 goto gpp_build

echo Neither cmake nor g++ was found on your PATH.
echo Install CMake + Visual Studio Build Tools, or MinGW-w64, then run this again.
exit /b 1

:cmake_build
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release || exit /b 1
cmake --build build --config Release || exit /b 1
ctest --test-dir build --output-on-failure -C Release
echo.
echo Built: %cd%\build\biten_engine.exe
exit /b 0

:gpp_build
if not exist build mkdir build
set SOURCES=src\FerryBusManagementService.cpp src\SeatPlanner.cpp src\CanteenService.cpp src\CashflowEngine.cpp src\KitchenBoard.cpp
g++ -std=c++20 -O2 -Iinclude %SOURCES% src\engine_main.cpp -o build\biten_engine.exe || exit /b 1
g++ -std=c++20 -O2 -Iinclude %SOURCES% src\demo_main.cpp   -o build\biten_demo.exe   || exit /b 1
g++ -std=c++20 -O2 -Iinclude %SOURCES% tests\engine_tests.cpp -o build\biten_tests.exe || exit /b 1
build\biten_tests.exe || exit /b 1
echo.
echo Built: %cd%\build\biten_engine.exe
exit /b 0
