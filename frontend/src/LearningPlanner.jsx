
import { useEffect, useState } from "react";
import "./LearningPlanner.css";

const API = "http://127.0.0.1:8000";
const STORAGE_KEY = "studysync-learning-plan";

const today = new Date();
const dateString = (date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

function newVideo() {
  return { title: "", url: "", duration_minutes: 30 };
}

export default function LearningPlanner() {
  const [subject, setSubject] = useState("");
  const [goal, setGoal] = useState("");
  const [hours, setHours] = useState(2);
  const [startDate, setStartDate] = useState(dateString(today));
  const [deadline, setDeadline] = useState(
    dateString(new Date(today.getTime() + 7 * 86400000))
  );
  const [videos, setVideos] = useState([newVideo()]);
  const [plan, setPlan] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
    } catch {
      return null;
    }
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (plan) localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
  }, [plan]);

  function updateVideo(index, field, value) {
    setVideos((old) =>
      old.map((video, i) =>
        i === index ? { ...video, [field]: value } : video
      )
    );
  }

  async function generatePlan(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch(`${API}/learning/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          goal,
          daily_hours: Number(hours),
          start_date: startDate,
          deadline,
          videos: videos.map((video) => ({
            ...video,
            duration_minutes: Number(video.duration_minutes),
          })),
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.detail || "Could not create the plan.");
      }

      setPlan(result);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err.message || "Backend se connect nahi ho paaya.");
    } finally {
      setLoading(false);
    }
  }

  function toggleTask(dayIndex, taskIndex) {
    setPlan((old) => ({
      ...old,
      days: old.days.map((day, di) =>
        di !== dayIndex
          ? day
          : {
              ...day,
              tasks: day.tasks.map((task, ti) =>
                ti !== taskIndex
                  ? task
                  : { ...task, completed: !task.completed },
              ),
            },
      ),
    }));
  }

  const allTasks = plan?.days.flatMap((day) => day.tasks) || [];
  const completed = allTasks.filter((task) => task.completed).length;

  return (
    <section className="learning-page">
      <header className="learning-header">
        <div>
          <span className="learning-kicker">PERSONALIZED LEARNING</span>
          <h1>Your Learning Journey ✨</h1>
          <p>Turn your favourite lectures into a practical study plan.</p>
        </div>
        <div className="learning-symbol">📚</div>
      </header>

      {plan && (
        <div className="learning-progress">
          <div className="learning-progress-top">
            <span>Learning progress</span>
            <strong>{completed}/{allTasks.length} activities</strong>
          </div>
          <div className="learning-progress-track">
            <div
              className="learning-progress-fill"
              style={{
                width: `${allTasks.length ? (completed / allTasks.length) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      <form className="learning-form" onSubmit={generatePlan}>
        <h2>Build your plan</h2>
        <p className="learning-muted">
          Add YouTube video links and tell StudySync how much time you have.
        </p>

        <div className="learning-fields">
          <label>
            Subject
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Python OOP"
              required
            />
          </label>
          <label>
            Learning goal
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. Complete the course and practise"
              required
            />
          </label>
          <label>
            Available hours per day
            <input
              type="number"
              min="0.5"
              max="16"
              step="0.5"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              required
            />
          </label>
          <label>
            Start date
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </label>
          <label>
            Target completion date
            <input
              type="date"
              min={startDate}
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              required
            />
          </label>
        </div>

        <div className="learning-video-heading">
          <div>
            <h3>Your YouTube lectures</h3>
            <p className="learning-muted">
              For now, enter each video's duration in minutes.
            </p>
          </div>
          <button
            type="button"
            className="learning-secondary-button"
            onClick={() => setVideos((old) => [...old, newVideo()])}
          >
            + Add video
          </button>
        </div>

        {videos.map((video, index) => (
          <div className="learning-video-row" key={index}>
            <label>
              Video title
              <input
                value={video.title}
                onChange={(e) =>
                  updateVideo(index, "title", e.target.value)
                }
                placeholder={`Lecture ${index + 1}`}
                required
              />
            </label>
            <label>
              YouTube URL
              <input
                type="url"
                value={video.url}
                onChange={(e) => updateVideo(index, "url", e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                required
              />
            </label>
            <label>
              Duration (minutes)
              <input
                type="number"
                min="1"
                max="600"
                value={video.duration_minutes}
                onChange={(e) =>
                  updateVideo(index, "duration_minutes", e.target.value)
                }
                required
              />
            </label>
            {videos.length > 1 && (
              <button
                type="button"
                className="learning-remove-button"
                onClick={() =>
                  setVideos((old) => old.filter((_, i) => i !== index))
                }
                aria-label={`Remove lecture ${index + 1}`}
              >
                Remove
              </button>
            )}
          </div>
        ))}

        {error && <div className="learning-error">{error}</div>}

        <button
          type="submit"
          className="learning-generate-button"
          disabled={loading}
        >
          {loading ? "Creating your plan..." : "Generate my learning plan →"}
        </button>
      </form>

      {plan && (
        <div className="learning-results">
          <div className="learning-results-heading">
            <div>
              <span className="learning-kicker">YOUR PERSONAL PLAN</span>
              <h2>{plan.subject}</h2>
              <p className="learning-muted">{plan.goal}</p>
            </div>
            <button
              className="learning-secondary-button"
              onClick={() => {
                setPlan(null);
                localStorage.removeItem(STORAGE_KEY);
              }}
            >
              Clear plan
            </button>
          </div>

          <div className="learning-summary">
            <div>
              <strong>{plan.total_videos}</strong>
              <span>Videos</span>
            </div>
            <div>
              <strong>{Math.ceil(plan.estimated_minutes / 60)}h</strong>
              <span>Planned work</span>
            </div>
            <div>
              <strong>{plan.days.length}</strong>
              <span>Study days</span>
            </div>
          </div>

          {plan.days.map((day, dayIndex) => (
            <article className="learning-day" key={day.date}>
              <div className="learning-day-heading">
                <div>
                  <span>DAY {dayIndex + 1}</span>
                  <h3>{day.date}</h3>
                </div>
                <span>{day.total_minutes} min</span>
              </div>

              {day.tasks.map((task, taskIndex) => (
                <label
                  className={`learning-task ${task.completed ? "is-complete" : ""}`}
                  key={`${task.id}-${taskIndex}`}
                >
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={() => toggleTask(dayIndex, taskIndex)}
                  />
                  <span className="learning-task-content">
                    <strong>{task.title}</strong>
                    <small>
                      {task.kind} · {task.minutes} minutes
                    </small>
                  </span>
                  {task.url && (
                    <a
                      href={task.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Watch ↗
                    </a>
                  )}
                </label>
              ))}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
