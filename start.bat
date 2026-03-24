@echo off
echo =========================================
echo Starting AI Expense Categorization App...
echo =========================================

echo Starting Backend API (FastAPI) on Port 8000...
start "Backend (FastAPI)" cmd /c "cd backend && .\.venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000"

echo Starting Frontend (Next.js) on Port 3000...
start "Frontend (Next.js)" cmd /c "cd frontend && npm run dev"

echo.
echo Both servers are starting! 
echo The frontend will be available at: http://localhost:3000
echo The backend API will be available at: http://localhost:8000
echo.
echo You can close this small launcher window, but keep the two new windows open to keep the app running.
pause
