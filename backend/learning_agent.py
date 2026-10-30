
from datetime import date, timedelta
from math import ceil
from urllib.parse import urlparse, parse_qs
from pydantic import BaseModel, Field, HttpUrl
from fastapi import APIRouter, HTTPException
from typing import List

router = APIRouter(prefix="/learning", tags=["Personalized Learning"])


class VideoInput(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    url: HttpUrl
    duration_minutes: int = Field(gt=0, le=600)


class LearningRequest(BaseModel):
    subject: str = Field(min_length=1, max_length=100)
    goal: str = Field(min_length=1, max_length=500)
    daily_hours: float = Field(gt=0, le=16)
    start_date: date
    deadline: date
    videos: List[VideoInput] = Field(min_length=1, max_length=100)


def validate_video_url(url: str) -> bool:
    """Accept common YouTube watch, short and embed URLs."""
    parsed = urlparse(str(url))
    host = parsed.netloc.lower().removeprefix("www.")
    if host == "youtu.be":
        return bool(parsed.path.strip("/"))
    if host in {"youtube.com", "m.youtube.com"}:
        return (
            parsed.path == "/watch" and bool(parse_qs(parsed.query).get("v"))
        ) or parsed.path.startswith(("/embed/", "/shorts/"))
    return False


def build_learning_plan(data: LearningRequest) -> dict:
    if data.deadline < data.start_date:
        raise HTTPException(
            status_code=400,
            detail="Deadline must be on or after the start date."
        )

    for video in data.videos:
        if not validate_video_url(str(video.url)):
            raise HTTPException(
                status_code=400,
                detail=f"Not a supported YouTube video URL: {video.url}"
            )

    total_days = (data.deadline - data.start_date).days + 1
    daily_minutes = int(data.daily_hours * 60)

    # Reserve part of each day for practice and revision.
    if daily_minutes < 30:
        raise HTTPException(
            status_code=400,
            detail="Please allow at least 30 minutes per day."
        )

    activities = []
    for index, video in enumerate(data.videos):
        activities.append({
            "title": f"Watch: {video.title}",
            "kind": "lecture",
            "url": str(video.url),
            "minutes": video.duration_minutes,
            "video_index": index,
        })
        activities.append({
            "title": f"Practice: {video.title}",
            "kind": "practice",
            "url": str(video.url),
            "minutes": 15,
            "video_index": index,
        })

    # Space revision after the related lecture.
    for index, video in enumerate(data.videos):
        activities.append({
            "title": f"Quick revision: {video.title}",
            "kind": "revision",
            "url": str(video.url),
            "minutes": 10,
            "video_index": index,
        })

    total_minutes = sum(item["minutes"] for item in activities)
    capacity = total_days * daily_minutes

    if total_minutes > capacity:
        needed_days = ceil(total_minutes / daily_minutes)
        raise HTTPException(
            status_code=400,
            detail=(
                f"This plan needs about {total_minutes // 60}h "
                f"{total_minutes % 60}m. At {data.daily_hours:g} "
                f"hours/day, allow at least {needed_days} days or "
                "reduce video durations / daily activities."
            )
        )

    days = []
    current_day = data.start_date
    day_tasks = []
    used_minutes = 0

    for activity in activities:
        # Start a new day when the next activity will not fit.
        if used_minutes + activity["minutes"] > daily_minutes:
            days.append({
                "date": current_day.isoformat(),
                "tasks": day_tasks,
                "total_minutes": used_minutes,
            })
            current_day += timedelta(days=1)
            day_tasks = []
            used_minutes = 0

        day_tasks.append({
            **activity,
            "id": f"{activity['kind']}-{activity['video_index']}",
            "completed": False,
        })
        used_minutes += activity["minutes"]

    if day_tasks:
        days.append({
            "date": current_day.isoformat(),
            "tasks": day_tasks,
            "total_minutes": used_minutes,
        })

    return {
        "subject": data.subject,
        "goal": data.goal,
        "daily_hours": data.daily_hours,
        "deadline": data.deadline.isoformat(),
        "total_videos": len(data.videos),
        "estimated_minutes": total_minutes,
        "days": days,
        "message": "Your learning plan is ready!",
    }


@router.post("/generate")
def generate_learning_plan(data: LearningRequest):
    return build_learning_plan(data)


@router.get("/health")
def learning_health():
    return {"status": "ok", "feature": "personalized-learning-agent"}
