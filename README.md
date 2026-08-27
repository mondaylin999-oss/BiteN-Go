# 1) BACKEND
cd backend
npm install
cp .env.example .env          # Windows: copy .env.example .env
#   → edit .env: your PostgreSQL password, and a JWT_SECRET
bash cpp/build.sh             # compiles the C++ engine (Windows: cpp\build.bat)
npm run dev                   # http://localhost:8000

# 2) FRONTEND (a second terminal)
cd frontend
npm install
npm run dev                   # http://localhost:5173