# ===========================================================================
#  BiteN Go API — container image.
#
#  Render's native Node image has no C++ toolchain, so cpp/build.sh could not
#  compile the engine there and the deploy failed. A container carries its own
#  compiler, which is what lets the deployed API run the REAL C++ engine
#  instead of the TypeScript twin.
#
#  Two stages: the first has g++/cmake and builds everything, the second keeps
#  only what is needed to run. The compiler never ships to production.
# ===========================================================================

# --- build stage -----------------------------------------------------------
FROM node:22-bookworm AS build
WORKDIR /app

# build-essential gives g++ and make; cmake drives CMakeLists.txt and ctest.
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential cmake \
 && rm -rf /var/lib/apt/lists/*

# Copy manifests first so this layer is cached until dependencies change.
COPY package.json package-lock.json ./
# --include=dev: typescript and every @types package are devDependencies, and
# without them tsc compiles with no declarations at all.
RUN npm ci --include=dev

COPY . .

# Compiles biten_engine, biten_demo and biten_tests, then runs the unit tests.
# A failing engine test fails the image build, which is the point: a broken
# engine should never reach the deployed site.
RUN bash cpp/build.sh

# TypeScript -> dist/
RUN npm run build

# --- runtime stage ---------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production

# engine.ts derives the engine location from its own path. At runtime the
# entry point is dist/src/index.js, so that derivation lands on dist/cpp —
# not cpp. Naming the binary outright removes the guesswork, and is also the
# first candidate the resolver checks.
ENV BITEN_ENGINE_PATH=/app/cpp/build/biten_engine

# Production dependencies only — no typescript, no @types, no test runner.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/cpp/build/biten_engine ./cpp/build/biten_engine

# Render injects PORT and the app reads it; this is documentation only.
EXPOSE 8000

CMD ["node", "dist/src/index.js"]
