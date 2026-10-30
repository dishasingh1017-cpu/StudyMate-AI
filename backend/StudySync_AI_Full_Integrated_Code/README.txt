StudySync AI — Full Integrated Code

FILES
1. frontend/src/App.jsx — replace your existing App.jsx with this file.
2. frontend/src/App.css — APPEND the CSS in this file to the END of your existing App.css. Do not replace the existing App.css because it contains your current app styles.
3. backend/learning_agent.py — optional FastAPI router. The current frontend planner builds its plan in the browser and does not require this endpoint. Add it only if you want the backend endpoint.

BACKEND ROUTER (optional)
In backend/main.py, after `app = FastAPI(...)`, add:
    from learning_agent import router as learning_router
    app.include_router(learning_router)

Ensure CORS includes the frontend origin, usually:
    http://localhost:5174
    http://127.0.0.1:5174
Keep any origins your project already uses.

RUN
Backend (from the backend folder):
    python -m uvicorn main:app --reload --port 8000

Frontend (from the frontend folder):
    npm run dev

IMPORTANT LIMITATIONS
- The planner accepts individual YouTube video URLs (one per line); it does not expand a YouTube playlist URL into its videos.
- Each video is estimated as 30 minutes; the app does not retrieve actual video duration.
- The generated plan includes Watch, Practice, and Revision sessions, but the practice/revision prompts are generic. It does not call an AI model or create topic-specific quiz questions.
- Learning plan completion is stored in browser localStorage, not in the backend account database.
- This code preserves your existing auth/task API paths: /auth/signup, /auth/login, /auth/me, /tasks and /tasks/{id}.
