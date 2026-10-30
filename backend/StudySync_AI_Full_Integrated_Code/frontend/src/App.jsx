import { useState, useEffect } from "react";
import "./App.css";

const API_URL = "http://127.0.0.1:8000";
const REMINDER_OPTIONS = [
  { label: "At deadline", value: 0 },
  { label: "5 minutes before", value: 5 },
  { label: "15 minutes before", value: 15 },
  { label: "30 minutes before", value: 30 },
  { label: "1 hour before", value: 60 },
  { label: "1 day before", value: 1440 },
];

function getReminderMinutes(item) {
  return Number(item.reminder_minutes ?? item.reminderMinutes ?? 15);
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem("studysync-token") || "");
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [tasks, setTasks] = useState([]);
  const [task, setTask] = useState("");
  const [subject, setSubject] = useState("AI/ML");
  const [deadline, setDeadline] = useState("");
  const [reminderMinutes, setReminderMinutes] = useState("15");
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted"
  );
  const [filter, setFilter] = useState("all");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeView, setActiveView] = useState("dashboard");

  // Learning Planner state
  const [playlistLinks, setPlaylistLinks] = useState("");
  const [dailyHours, setDailyHours] = useState("2");
  const [learningTopic, setLearningTopic] = useState("");
  const [planDays, setPlanDays] = useState("7");
  const [learningPlan, setLearningPlan] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("studysync-learning-plan") || "[]");
    } catch {
      return [];
    }
  });
  const [plannerLoading, setPlannerLoading] = useState(false);

  function authHeaders(extra = {}, currentToken = token) {
    return { ...extra, Authorization: `Bearer ${currentToken}` };
  }

  function logout(message = "You have been logged out.") {
    localStorage.removeItem("studysync-token");
    setToken("");
    setUser(null);
    setTasks([]);
    setNotice(message);
    setAuthPassword("");
    setActiveView("dashboard");
  }

  async function readResponse(response, fallback) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || data.message || fallback);
    return data;
  }

  async function loadTasks(currentToken = token) {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/tasks`, {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      const data = await readResponse(response, "Could not load tasks.");
      setTasks(Array.isArray(data) ? data : []);
    } catch (error) {
      setNotice(error.message || "Could not load tasks. Check that the backend is running.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) {
      setUser(null);
      setTasks([]);
      return undefined;
    }

    let cancelled = false;
    async function initialize() {
      setLoading(true);
      try {
        const profileResponse = await fetch(`${API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!profileResponse.ok) {
          if (!cancelled) logout("Your session has expired. Please log in again.");
          return;
        }
        const profile = await profileResponse.json();
        if (cancelled) return;
        setUser(profile);

        const tasksResponse = await fetch(`${API_URL}/tasks`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (tasksResponse.status === 401) {
          if (!cancelled) logout("Your session has expired. Please log in again.");
          return;
        }
        const data = await readResponse(tasksResponse, "Could not load tasks.");
        if (!cancelled) setTasks(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setNotice("Could not connect to the backend. Check that it is running on port 8000.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    initialize();
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (!token || !user || !notificationsEnabled || !("Notification" in window) || Notification.permission !== "granted") return undefined;

    const checkReminders = () => {
      const now = Date.now();
      tasks.forEach((item) => {
        if (!item.deadline || item.completed) return;
        const dueTime = new Date(item.deadline).getTime();
        if (!Number.isFinite(dueTime)) return;
        const minutes = getReminderMinutes(item);
        const reminderTime = dueTime - minutes * 60 * 1000;
        const reminderKey = `studysync-reminded-${user.id}-${item.id}`;
        const overdueKey = `studysync-overdue-${user.id}-${item.id}`;

        if (now >= reminderTime && !localStorage.getItem(reminderKey)) {
          new Notification("StudySync AI — Study Reminder", {
            body: minutes === 0
              ? `"${item.title}" is due now!`
              : now >= dueTime
                ? `"${item.title}" has reached its deadline.`
                : `"${item.title}" is due soon!`,
          });
          localStorage.setItem(reminderKey, "true");
          if (now >= dueTime) localStorage.setItem(overdueKey, "true");
        }

        if (now >= dueTime && !localStorage.getItem(overdueKey)) {
          new Notification("StudySync AI — Deadline passed", {
            body: `"${item.title}" has reached its deadline.`,
          });
          localStorage.setItem(overdueKey, "true");
        }
      });
    };
    checkReminders();
    const timer = window.setInterval(checkReminders, 30000);
    return () => window.clearInterval(timer);
  }, [tasks, notificationsEnabled, token, user]);

  async function handleAuth(e) {
    e.preventDefault();
    if (authLoading) return;
    setAuthLoading(true);
    setNotice("");
    try {
      const isSignup = authMode === "signup";
      const payload = isSignup
        ? { name: authName.trim(), email: authEmail.trim(), password: authPassword }
        : { email: authEmail.trim(), password: authPassword };
      const response = await fetch(`${API_URL}${isSignup ? "/auth/signup" : "/auth/login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readResponse(response, "Authentication failed. Please try again.");
      if (isSignup) {
        setAuthMode("login");
        setAuthPassword("");
        setNotice("Account created! Please log in.");
      } else {
        localStorage.setItem("studysync-token", data.access_token);
        setUser(data.user || null);
        setToken(data.access_token);
        setAuthPassword("");
        setNotice("Welcome to StudySync AI!");
      }
    } catch (error) {
      setNotice(error.message || "Could not connect to the backend.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function enableNotifications() {
    if (!("Notification" in window)) {
      setNotice("This browser does not support notifications.");
      return;
    }
    if (!window.isSecureContext) {
      setNotice("Open this app on localhost to enable notifications.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        setNotificationsEnabled(true);
        new Notification("StudySync AI", { body: "Your study reminders are ready." });
        setNotice("Notifications enabled!");
      } else {
        setNotificationsEnabled(false);
        setNotice("Notifications were not allowed in browser settings.");
      }
    } catch {
      setNotice("Could not enable notifications.");
    }
  }

  async function addTask(e) {
    e.preventDefault();
    if (!task.trim() || saving) return;
    if (deadline && new Date(deadline).getTime() <= Date.now()) {
      setNotice("Please choose a future deadline.");
      return;
    }
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/tasks`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          title: task.trim(),
          subject,
          deadline: deadline || null,
          reminder_minutes: Number(reminderMinutes),
        }),
      });
      if (response.status === 401) {
        logout("Please log in again.");
        return;
      }
      const data = await readResponse(response, "Could not save task.");
      setTasks((current) => [data, ...current]);
      setTask("");
      setDeadline("");
      setReminderMinutes("15");
      setNotice("Task saved to your account!");
    } catch (error) {
      setNotice(error.message || "Could not save the task.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleTask(id) {
    const item = tasks.find((t) => t.id === id);
    if (!item) return;
    try {
      const response = await fetch(`${API_URL}/tasks/${id}`, {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ completed: !item.completed }),
      });
      if (response.status === 401) {
        logout("Please log in again.");
        return;
      }
      const data = await readResponse(response, "Could not update task.");
      setTasks((current) => current.map((t) => t.id === id ? data : t));
      setNotice("");
    } catch (error) {
      setNotice(error.message || "Could not update task.");
    }
  }

  async function deleteTask(id) {
    try {
      const response = await fetch(`${API_URL}/tasks/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (response.status === 401) {
        logout("Please log in again.");
        return;
      }
      await readResponse(response, "Could not delete task.");
      setTasks((current) => current.filter((item) => item.id !== id));
      setNotice("Task deleted from your account.");
    } catch (error) {
      setNotice(error.message || "Could not delete task.");
    }
  }

  function formatDeadline(value) {
    if (!value) return "No deadline set";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("en-IN", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
  }

  function generateLearningPlan(e) {
    e.preventDefault();
    const links = playlistLinks.split(/\n|,/).map((link) => link.trim()).filter(Boolean);
    if (!links.length) {
      setNotice("Add at least one YouTube video link.");
      return;
    }
    const invalid = links.find((link) => {
      try {
        const url = new URL(link);
        return !["youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"].includes(url.hostname);
      } catch {
        return true;
      }
    });
    if (invalid) {
      setNotice(`This doesn't look like a valid YouTube URL: ${invalid}`);
      return;
    }
    const hours = Number(dailyHours);
    const days = Number(planDays);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 16 || !Number.isInteger(days) || days < 1 || days > 90) {
      setNotice("Choose daily hours between 0.5 and 16 and a plan length between 1 and 90 days.");
      return;
    }

    setPlannerLoading(true);
    const topic = learningTopic.trim() || "Your learning topic";
    const minutesPerDay = Math.round(hours * 60);
    const tasksPerVideo = links.map((url, index) => ({
      id: `${Date.now()}-${index}`,
      videoUrl: url,
      title: `Video ${index + 1}`,
      topic,
      type: "video",
      duration: 30,
      completed: false,
    }));

    // Create a practical plan with video sessions, practice and revision.
    const activities = [];
    tasksPerVideo.forEach((video, index) => {
      activities.push({ ...video, title: `Watch video ${index + 1}`, type: "Watch", duration: 30 });
      activities.push({ ...video, id: `${video.id}-p`, title: `Practice: ${topic}`, type: "Practice", duration: 15 });
      activities.push({ ...video, id: `${video.id}-r`, title: `Revise: ${topic}`, type: "Revision", duration: 10 });
    });

    const plan = [];
    let day = 1;
    let remaining = minutesPerDay;
    let slot = 1;
    activities.forEach((activity) => {
      if (day > days) return;
      if (activity.duration > remaining) {
        day += 1;
        remaining = minutesPerDay;
        slot = 1;
      }
      if (day > days) return;
      plan.push({
        ...activity,
        day,
        slot: slot++,
        completed: false,
      });
      remaining -= activity.duration;
    });

    const savedPlan = plan.map((item) => ({ ...item, topic }));
    setLearningPlan(savedPlan);
    localStorage.setItem("studysync-learning-plan", JSON.stringify(savedPlan));
    setNotice(`Study plan created with ${savedPlan.length} sessions. Video duration is estimated at 30 minutes per link.`);
    setPlannerLoading(false);
  }

  function toggleLearningActivity(id) {
    setLearningPlan((current) => {
      const updated = current.map((item) => item.id === id ? { ...item, completed: !item.completed } : item);
      localStorage.setItem("studysync-learning-plan", JSON.stringify(updated));
      return updated;
    });
  }

  function clearLearningPlan() {
    setLearningPlan([]);
    localStorage.removeItem("studysync-learning-plan");
    setNotice("Learning plan cleared.");
  }

  const completed = tasks.filter((item) => item.completed).length;
  const pending = tasks.length - completed;
  const progress = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  const visibleTasks = tasks.filter((item) => {
    if (filter === "pending") return !item.completed;
    if (filter === "completed") return item.completed;
    return true;
  });
  const learningCompleted = learningPlan.filter((item) => item.completed).length;
  const learningProgress = learningPlan.length ? Math.round(learningCompleted / learningPlan.length * 100) : 0;

  if (!token || !user) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">StudySync <span>AI</span></div>
          <div className="auth-emoji">📚</div>
          <h1>{authMode === "login" ? "Welcome back!" : "Create your account"}</h1>
          <p className="auth-subtitle">
            {authMode === "login" ? "Your goals are waiting. Let's get started." : "Your personal study journey starts here."}
          </p>
          {notice && <div className="notice" role="status">{notice}</div>}
          <form onSubmit={handleAuth}>
            {authMode === "signup" && <>
              <label htmlFor="auth-name">Your name</label>
              <input id="auth-name" value={authName} onChange={(e) => setAuthName(e.target.value)} placeholder="Enter your name" autoComplete="name" maxLength={100} required />
            </>}
            <label htmlFor="auth-email">Email address</label>
            <input id="auth-email" type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
            <label htmlFor="auth-password">Password</label>
            <input id="auth-password" type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="At least 8 characters" autoComplete={authMode === "login" ? "current-password" : "new-password"} minLength={authMode === "signup" ? 8 : 1} maxLength={128} required />
            <button type="submit" className="primary-button auth-submit" disabled={authLoading}>
              {authLoading ? "Please wait..." : authMode === "login" ? "Login" : "Create account"}
            </button>
          </form>
          <p className="auth-switch">
            {authMode === "login" ? "New to StudySync AI?" : "Already have an account?"}{" "}
            <button type="button" onClick={() => { setAuthMode(authMode === "login" ? "signup" : "login"); setNotice(""); }}>
              {authMode === "login" ? "Sign up" : "Login"}
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <h2>StudySync<span> AI</span></h2>
        <p className="side-label">YOUR WORKSPACE</p>
        <button type="button" className={`nav ${activeView === "dashboard" ? "active" : ""}`} onClick={() => setActiveView("dashboard")}>▦ &nbsp; Dashboard</button>
        <button type="button" className={`nav ${activeView === "tasks" ? "active" : ""}`} onClick={() => setActiveView("tasks")}>✓ &nbsp; My Tasks</button>
        <button type="button" className={`nav ${activeView === "planner" ? "active" : ""}`} onClick={() => setActiveView("planner")}>◷ &nbsp; Study Planner</button>
        <button type="button" className={`nav ${activeView === "coach" ? "active" : ""}`} onClick={() => setActiveView("coach")}>✦ &nbsp; AI Study Coach</button>
        <button type="button" className="notification-button" onClick={enableNotifications}>
          {notificationsEnabled ? "✓ Notifications On" : "🔔 Enable Notifications"}
        </button>
        <div className="sidebar-bottom">Small steps. Big progress. ✨</div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">YOUR PERSONAL STUDY SPACE</p>
            <h1>{activeView === "planner" ? "Your Personalized Learning Plan" : activeView === "tasks" ? "Your Study Tasks" : activeView === "coach" ? "AI Study Coach" : "Let's make today count."}</h1>
            <p className="muted">One task at a time. You've got this!</p>
          </div>
          <div className="account-actions">
            <span className="user-greeting">Hi, {user.name}!</span>
            <div className="avatar">{user.name?.charAt(0).toUpperCase() || "U"}</div>
            <button type="button" className="logout-button" onClick={() => logout()}>Logout</button>
          </div>
        </header>

        {notice && <div className="notice" role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss message">×</button></div>}

        {activeView === "planner" ? (
          <section className="planner-page">
            <div className="planner-intro">
              <div>
                <p className="welcome-tag">LEARN AT YOUR OWN PACE</p>
                <h2>Turn video links into a study routine 📚</h2>
                <p>Add individual YouTube video links, set your daily study time, and create watch, practice, and revision sessions.</p>
              </div>
              <div className="welcome-icon">🧠</div>
            </div>
            <div className="panel planner-panel">
              <h2>Create your learning plan</h2>
              <form onSubmit={generateLearningPlan}>
                <label htmlFor="learning-topic">What are you learning?</label>
                <input id="learning-topic" value={learningTopic} onChange={(e) => setLearningTopic(e.target.value)} placeholder="e.g. Azure AI, DSA, Neural Networks" />
                <label htmlFor="youtube-links">YouTube video links (one per line)</label>
                <textarea id="youtube-links" rows="5" value={playlistLinks} onChange={(e) => setPlaylistLinks(e.target.value)} placeholder={"https://www.youtube.com/watch?v=...\nhttps://youtu.be/..."} required />
                <div className="planner-fields">
                  <div>
                    <label htmlFor="daily-hours">Daily available hours</label>
                    <input id="daily-hours" type="number" min="0.5" max="16" step="0.5" value={dailyHours} onChange={(e) => setDailyHours(e.target.value)} required />
                  </div>
                  <div>
                    <label htmlFor="plan-days">Plan length (days)</label>
                    <input id="plan-days" type="number" min="1" max="90" step="1" value={planDays} onChange={(e) => setPlanDays(e.target.value)} required />
                  </div>
                </div>
                <button className="primary-button" type="submit" disabled={plannerLoading}>{plannerLoading ? "Creating plan..." : "✨ Generate Study Plan"}</button>
              </form>
            </div>

            {learningPlan.length > 0 && <div className="panel">
              <div className="panel-heading">
                <div><h2>Your study schedule</h2><p className="muted">{learningCompleted} of {learningPlan.length} sessions completed · {learningProgress}% progress</p></div>
                <button type="button" className="delete-button" onClick={clearLearningPlan} aria-label="Clear plan">×</button>
              </div>
              <div className="progress-track learning-progress"><div style={{ width: `${learningProgress}%` }} /></div>
              {Array.from(new Set(learningPlan.map((item) => item.day))).map((day) => (
                <div className="learning-day" key={day}>
                  <h3>Day {day}</h3>
                  {learningPlan.filter((item) => item.day === day).map((item) => (
                    <div className={`learning-activity ${item.completed ? "activity-done" : ""}`} key={item.id}>
                      <input type="checkbox" checked={item.completed} onChange={() => toggleLearningActivity(item.id)} aria-label={`Mark ${item.title} complete`} />
                      <div className="learning-activity-text">
                        <strong>{item.title}</strong>
                        <span>{item.type} · {item.duration} minutes · {item.topic}</span>
                        {item.videoUrl && <a href={item.videoUrl} target="_blank" rel="noreferrer">Open YouTube video ↗</a>}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              <p className="planner-disclaimer">Note: Each video is estimated as 30 minutes in this version. Playlist links are not automatically expanded into individual videos.</p>
            </div>}
          </section>
        ) : activeView === "coach" ? (
          <section className="panel coach-placeholder">
            <div className="panel-icon">✦</div>
            <h2>AI Study Coach</h2>
            <p>This section is ready for the next feature. For now, create your study plan in <strong>Study Planner</strong> and manage deadlines in <strong>My Tasks</strong>.</p>
            <button type="button" className="primary-button" onClick={() => setActiveView("planner")}>Open Study Planner</button>
          </section>
        ) : (
          <>
            {activeView === "dashboard" && <>
              <section className="welcome">
                <div><p className="welcome-tag">YOUR JOURNEY, YOUR PACE</p><h2>Hey, {user.name}! 👋</h2><p>Plan smarter, stay consistent, and celebrate every win.</p></div>
                <div className="welcome-icon">📚</div>
              </section>
              <section className="stats">
                <div className="stat-card"><span>Total tasks</span><strong>{tasks.length}</strong><small>All your study goals</small></div>
                <div className="stat-card"><span>Pending</span><strong>{pending}</strong><small>One step at a time</small></div>
                <div className="stat-card"><span>Daily progress</span><strong>{progress}%</strong><div className="progress-track"><div style={{ width: `${progress}%` }} /></div></div>
              </section>
            </>}

            <section className="content-grid">
              {activeView === "dashboard" && <div className="panel">
                <div className="panel-heading"><div><h2>Add a study task</h2><p className="muted">Turn your plans into action.</p></div><span className="panel-icon">✍️</span></div>
                <form onSubmit={addTask}>
                  <label htmlFor="task-title">Task name</label>
                  <input id="task-title" value={task} onChange={(e) => setTask(e.target.value)} placeholder="e.g. Revise Neural Networks" required />
                  <label htmlFor="task-subject">Subject</label>
                  <select id="task-subject" value={subject} onChange={(e) => setSubject(e.target.value)}>
                    <option>AI/ML</option><option>DSA</option><option>Azure AI</option><option>College assignments</option><option>Other</option>
                  </select>
                  <label htmlFor="task-deadline">Deadline date &amp; time (optional)</label>
                  <input id="task-deadline" type="datetime-local" value={deadline} min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)} onChange={(e) => setDeadline(e.target.value)} />
                  <label htmlFor="task-reminder">Remind me</label>
                  <select id="task-reminder" value={reminderMinutes} onChange={(e) => setReminderMinutes(e.target.value)}>
                    {REMINDER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving..." : "+ Add task"}</button>
                </form>
              </div>}

              <div className="panel task-panel">
                <div className="panel-heading"><div><h2>My study tasks</h2><p className="muted">{completed} completed out of {tasks.length}</p></div><span className="panel-icon">🎯</span></div>
                <div className="filter-row">
                  {["all", "pending", "completed"].map((option) => <button type="button" key={option} className={filter === option ? "filter active-filter" : "filter"} onClick={() => setFilter(option)}>{option[0].toUpperCase() + option.slice(1)}</button>)}
                </div>
                {loading ? <div className="empty-state"><h3>Loading your tasks...</h3></div> : visibleTasks.length === 0 ? <div className="empty-state"><div>🌱</div><h3>{tasks.length === 0 ? "Your journey starts here" : "No tasks in this filter"}</h3><p>{tasks.length === 0 ? "Add your first task and build momentum." : "Choose another filter to see your tasks."}</p></div> : (
                  <div className="task-list">{visibleTasks.map((item) => <div className="task-item" key={item.id}>
                    <input className="task-check" type="checkbox" checked={Boolean(item.completed)} onChange={() => toggleTask(item.id)} aria-label={`Mark ${item.title} as completed`} />
                    <div className="task-details"><strong className={item.completed ? "done" : ""}>{item.title}</strong><span>{item.subject}</span><span>{item.deadline ? `📅 ${formatDeadline(item.deadline)}` : "No deadline set"}</span>
                      {item.deadline && !item.completed && <span>🔔 Reminder: {REMINDER_OPTIONS.find((option) => option.value === getReminderMinutes(item))?.label || "15 minutes before"}</span>}
                    </div>
                    <button type="button" className="delete-button" onClick={() => deleteTask(item.id)} aria-label={`Delete ${item.title}`}>×</button>
                  </div>)}</div>
                )}
              </div>
            </section>
            {activeView === "dashboard" && <section className="coach-banner"><div className="coach-icon">✦</div><div><h3>Consistency beats perfection.</h3><p>Missed a study session? Adjust your plan and start again.</p></div><button type="button" className="secondary-button" onClick={() => setActiveView("planner")}>Open Study Planner</button></section>}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
