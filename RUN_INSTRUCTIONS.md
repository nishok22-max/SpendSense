# How to Run SpendSense in the Terminal

To run the full-stack SpendSense application, you need to open **two separate terminal windows** (like Command Prompt or PowerShell): one for the backend API and one for the frontend web application.

Here are the exact commands you need to run.

---

### Terminal 1: Run the Backend (FastAPI)

1. Open your first terminal and navigate to your project folder:
   ```bash
   cd e:\SpendSense
   ```

2. Start the FastAPI backend server:
   ```bash
   cd backend
   .\.venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000
   ```

*The backend will be available at `http://localhost:8000`.*

---

### Terminal 2: Run the Frontend (Next.js)

1. Open a second terminal window and navigate to your project folder:
   ```bash
   cd e:\SpendSense
   ```

2. Start the Next.js frontend server:
   ```bash
   cd frontend
   npm run dev
   ```

*The frontend will be available at `http://localhost:3000`.*
