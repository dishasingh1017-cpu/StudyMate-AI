from fastapi import APIRouter
from pydantic import BaseModel, Field, HttpUrl
from typing import List

router = APIRouter(prefix="/learning", tags=["Learning Planner"])

class LearningPlanRequest(BaseModel):
    topic: str = Field(default="General study", max_length=200)
    video_urls: List[HttpUrl]
    daily_hours: float = Field(gt=0, le=16)
    plan_days: int = Field(ge=1, le=90)

@router.get("/health")
def learning_health():
    return {"status": "ok", "feature": "learning-planner"}

@router.post("/generate")
def generate_learning_plan(payload: LearningPlanRequest):
    # This starter endpoint validates the input and returns a simple plan.
    # It does not fetch playlist metadata or call an AI model.
    minutes_per_day = int(payload.daily_hours * 60)
    activities = []
    for index, url in enumerate(payload.video_urls, start=1):
        activities.extend([
            {"title": f"Watch video {index}", "type": "Watch", "duration_minutes": 30, "video_url": str(url)},
            {"title": f"Practice: {payload.topic}", "type": "Practice", "duration_minutes": 15, "video_url": str(url)},
            {"title": f"Revise: {payload.topic}", "type": "Revision", "duration_minutes": 10, "video_url": str(url)},
        ])
    plan = []
    day = 1
    remaining = minutes_per_day
    for activity in activities:
        if day > payload.plan_days:
            break
        if activity["duration_minutes"] > remaining:
            day += 1
            remaining = minutes_per_day
        if day > payload.plan_days:
            break
        plan.append({**activity, "day": day, "topic": payload.topic, "completed": False})
        remaining -= activity["duration_minutes"]
    return {"topic": payload.topic, "daily_hours": payload.daily_hours, "plan_days": payload.plan_days, "plan": plan}
