
import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API = "https://studymate-ai-wrgt.onrender.com";

function readToken(data) {
  return data?.access_token || data?.token || data?.accessToken || "";
}

function getError(data, fallback) {
  if (typeof data?.detail === "string") return data.detail;
  if (Array.isArray(data?.detail)) return data.detail.map(x => x.msg).join(", ");
  return data?.message || fallback;
}

export default function App() {
  const [token, setToken] = useState(() => {
    if (new URLSearchParams(window.location.search).has("reset_token")) {
      localStorage.removeItem("studysync_token");
      return "";
    }
    return localStorage.getItem("studysync_token") || "";
  });
  const [user, setUser] = useState(null);
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.search).get("reset_token") || "");
  const [authMode, setAuthMode] = useState(() => new URLSearchParams(window.location.search).has("reset_token") ? "reset" : "login");
  const [page, setPage] = useState("Dashboard");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");

  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [deadline, setDeadline] = useState("");
  const [reminder, setReminder] = useState("15");
  const [filter, setFilter] = useState("all");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [videoLinks, setVideoLinks] = useState("");
  const [studyHours, setStudyHours] = useState("2");
  const [studyDays, setStudyDays] = useState("7");

  const [plan, setPlan] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("studysync_plan") || "[]");
    } catch {
      return [];
    }
  });

  const completed = tasks.filter(t => t.completed).length;
  const pending = tasks.length - completed;

  const visibleTasks = useMemo(
    () =>
      tasks.filter(t =>
        filter === "all"
          ? true
          : filter === "pending"
            ? !t.completed
            : !!t.completed
      ),
    [tasks, filter]
  );

  async function api(path, options = {}) {
    const headers = {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    };

    const response = await fetch(`${API}${path}`, {
      ...options,
      headers
    });

    const raw = await response.text();
    let data = {};

    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { message: raw };
    }

    if (!response.ok) {
      if (response.status === 401 && path !== "/auth/login") {
        localStorage.removeItem("studysync_token");
      }

      throw new Error(getError(data, `Request failed (${response.status})`));
    }

    return data;
  }

  async function loadTasks(currentToken = token) {
    const response = await fetch(`${API}/tasks`, {
      headers: currentToken
        ? { Authorization: `Bearer ${currentToken}` }
        : {}
    });

    const raw = await response.text();
    let data = {};

    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = {};
    }

    if (!response.ok) {
      throw new Error(getError(data, "Could not load tasks."));
    }

    setTasks(Array.isArray(data) ? data : data.tasks || data.items || []);
  }

  async function loadUser(currentToken) {
    const response = await fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${currentToken}` }
    });

    if (!response.ok) {
      throw new Error("Session expired. Please log in again.");
    }

    const data = await response.json();
    setUser(data.user || data);
  }

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    async function initialize() {
      try {
        await loadUser(token);
        await loadTasks(token);
      } catch (e) {
        if (!cancelled) {
          setError(e.message);
          setToken("");
          localStorage.removeItem("studysync_token");
          setUser(null);
        }
      }
    }

    initialize();

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleForgotPassword(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);

    try {
      const response = await fetch(`${API}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() })
      });
      const raw = await response.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw }; }
      if (!response.ok) throw new Error(getError(data, `Request failed (${response.status})`));
      setMessage(data.message || "If an account exists with this email, a reset link will be sent.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`${API}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken, new_password: password })
      });
      const raw = await response.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw }; }
      if (!response.ok) throw new Error(getError(data, `Request failed (${response.status})`));

      setAuthMode("login");
      setPassword("");
      setConfirmPassword("");
      setResetToken("");
      window.history.replaceState({}, document.title, window.location.pathname);
      setMessage(data.message || "Password reset successful. Please log in.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAuth(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);

    try {
      const path = authMode === "login" ? "/auth/login" : "/auth/signup";

      const payload =
        authMode === "login"
          ? { email, password }
          : { name, email, password };

      const data = await api(path, {
        method: "POST",
        body: JSON.stringify(payload)
      });

      const newToken = readToken(data);

      if (!newToken && authMode === "signup") {
        setAuthMode("login");
        setPassword("");
        setShowPassword(false);
        setMessage("Account created if registration succeeded. Please log in.");
        return;
      }

      if (!newToken) {
        throw new Error("Login response did not include an access token.");
      }

      localStorage.setItem("studysync_token", newToken);
      setUser(data.user || null);
      setToken(newToken);
      setMessage("Welcome to StudySync AI!");
      setPassword("");
      setShowPassword(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    localStorage.removeItem("studysync_token");
    setToken("");
    setUser(null);
    setTasks([]);
    setPassword("");
    setShowPassword(false);
    setPage("Dashboard");
    setError("");
    setMessage("");
  }

  async function addTask(e) {
    e.preventDefault();

    if (!title.trim()) {
      setError("Please enter a task title.");
      return;
    }

    setError("");
    setMessage("");

    try {
      const payload = {
        title: title.trim(),
        subject: subject.trim(),
        deadline: deadline ? new Date(deadline).toISOString() : null,
        reminder_minutes: Number(reminder),
        completed: false
      };

      const data = await api("/tasks", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      const task = data.task || data;

      if (task.id != null || task.title) {
        setTasks(prev => [
          task,
          ...prev.filter(t => t.id !== task.id)
        ]);
      } else {
        await loadTasks();
      }

      setTitle("");
      setSubject("");
      setDeadline("");
      setMessage("Task added successfully!");
    } catch (e) {
      setError("Could not add task: " + e.message);
    }
  }

  async function toggleTask(task) {
    setError("");

    try {
      const updated = await api(`/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ completed: !task.completed })
      });

      const item = updated.task || updated;

      setTasks(prev =>
        prev.map(t =>
          t.id === task.id
            ? { ...t, ...item, completed: !task.completed }
            : t
        )
      );
    } catch (e) {
      setError("Could not update task: " + e.message);
    }
  }

  async function deleteTask(task) {
    if (!window.confirm(`Delete "${task.title}"?`)) return;

    setError("");

    try {
      await api(`/tasks/${task.id}`, { method: "DELETE" });
      setTasks(prev => prev.filter(t => t.id !== task.id));
      setMessage("Task deleted.");
    } catch (e) {
      setError("Could not delete task: " + e.message);
    }
  }

  function makePlan(e) {
    e.preventDefault();

    const links = videoLinks
      .split("\n")
      .map(x => x.trim())
      .filter(Boolean);

    if (!links.length) {
      setError("Paste at least one YouTube video URL.");
      return;
    }

    const days = Math.max(1, Number(studyDays) || 1);
    const hours = Math.max(0.5, Number(studyHours) || 2);

    const sessions = links.map((url, index) => ({
      id: `${Date.now()}-${index}`,
      url,
      title: `Video ${index + 1}`,
      day: (index % days) + 1,
      minutes: 30,
      done: false,
      activity:
        index % 3 === 0
          ? "Watch and take notes"
          : index % 3 === 1
            ? "Watch and practise"
            : "Revise key concepts"
    }));

    setPlan(sessions);
    localStorage.setItem("studysync_plan", JSON.stringify(sessions));
    setError("");
    setMessage(
      `Study plan created for ${links.length} videos. Estimated 30 minutes per video.`
    );
  }

  function togglePlan(item) {
    const next = plan.map(p =>
      p.id === item.id ? { ...p, done: !p.done } : p
    );

    setPlan(next);
    localStorage.setItem("studysync_plan", JSON.stringify(next));
  }

  async function enableNotifications() {
    if (!("Notification" in window)) {
      setError("This browser does not support notifications.");
      return;
    }

    const result = await Notification.requestPermission();

    setMessage(
      result === "granted"
        ? "Notifications enabled. Keep StudySync open to receive reminders."
        : "Notification permission was not granted."
    );
  }

  useEffect(() => {
    if (
      !token ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    ) {
      return;
    }

    const check = () => {
      const now = Date.now();

      tasks.forEach(t => {
        if (!t.deadline || t.completed) return;

        const due = new Date(t.deadline).getTime();
        const reminderMinutes = Number(
          t.reminder_minutes ?? t.reminderMinutes ?? 15
        );

        const notifyAt = due - reminderMinutes * 60000;
        const key = `studysync_notified_${t.id}_${due}`;

        if (
          now >= notifyAt &&
          now < due &&
          !localStorage.getItem(key)
        ) {
          new Notification("StudySync AI reminder", {
            body: `${t.title} is due soon.`
          });

          localStorage.setItem(key, "yes");
        }
      });
    };

    check();

    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [tasks, token]);

  if (!token || !user) {
    const authTitle =
      authMode === "forgot" ? "Forgot your password?" :
      authMode === "reset" ? "Create a new password" :
      authMode === "login" ? "Welcome back!" : "Create your account";

    return (
      <div className="auth">
        <div className="brand">✦ StudySync AI</div>

        <div className="card auth-card">
          <h1>{authTitle}</h1>
          <p className="muted">
            {authMode === "forgot"
              ? "Enter your registered email and we will send a password reset link."
              : authMode === "reset"
                ? "Choose a strong password for your account."
                : "Plan smarter. Learn consistently. Reach your goals."}
          </p>

          {error && <div className="error">{error}</div>}
          {message && <div className="success">{message}</div>}

          {authMode === "forgot" && (
            <form onSubmit={handleForgotPassword}>
              <div className="field">
                <label>Email address</label>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
              <button className="primary auth-submit" disabled={busy}>
                {busy ? "Sending..." : "Send reset link"}
              </button>
            </form>
          )}

          {authMode === "reset" && (
            <form onSubmit={handleResetPassword}>
              <div className="field">
                <label>New password</label>
                <input
                  required
                  type="password"
                  minLength={8}
                  maxLength={128}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                />
              </div>
              <div className="field">
                <label>Confirm new password</label>
                <input
                  required
                  type="password"
                  minLength={8}
                  maxLength={128}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Enter password again"
                  autoComplete="new-password"
                />
              </div>
              <button className="primary auth-submit" disabled={busy}>
                {busy ? "Updating..." : "Reset password"}
              </button>
            </form>
          )}

          {(authMode === "login" || authMode === "signup") && (
            <form onSubmit={handleAuth}>
              {authMode === "signup" && (
                <div className="field">
                  <label>Full name</label>
                  <input
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Your name"
                    autoComplete="name"
                  />
                </div>
              )}

              <div className="field">
                <label>Email address</label>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>

              <div className="field">
                <label>Password</label>
                <div className="password-wrapper">
                  <input
                    required
                    type={showPassword ? "text" : "password"}
                    minLength={authMode === "signup" ? 8 : 1}
                    maxLength={128}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter password"
                    autoComplete={authMode === "login" ? "current-password" : "new-password"}
                  />
                  <button
                    type="button"
                    className="toggle-password"
                    onClick={() => setShowPassword(prev => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              {authMode === "login" && (
                <p className="muted auth-switch" style={{ textAlign: "right", marginTop: "-8px" }}>
                  <a href="#forgot" onClick={e => {
                    e.preventDefault();
                    setAuthMode("forgot");
                    setError("");
                    setMessage("");
                    setPassword("");
                  }}>Forgot password?</a>
                </p>
              )}

              <button className="primary auth-submit" disabled={busy}>
                {busy ? "Please wait..." : authMode === "login" ? "Login" : "Create account"}
              </button>
            </form>
          )}

          <p className="muted auth-switch">
            {authMode === "login" ? "New to StudySync? " :
             authMode === "signup" ? "Already have an account? " :
             "Remembered your password? "}
            <a href="#auth" onClick={e => {
              e.preventDefault();
              setAuthMode(authMode === "login" ? "signup" : "login");
              setError("");
              setMessage("");
              setPassword("");
              setConfirmPassword("");
              setShowPassword(false);
            }}>
              {authMode === "login" ? "Sign up" : "Back to Login"}
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">✦ StudySync AI</div>

        <div className="nav">
          {["Dashboard", "My Tasks", "Study Planner"].map(item => (
            <button
              key={item}
              className={page === item ? "active" : ""}
              onClick={() => {
                setPage(item);
                setError("");
                setMessage("");
              }}
            >
              {item === "Dashboard"
                ? "⌂  "
                : item === "My Tasks"
                  ? "✓  "
                  : "▶  "}
              {item}
            </button>
          ))}

          <button onClick={enableNotifications}>
            ♧ Enable reminders
          </button>

          <button onClick={logout}>↪ Logout</button>
        </div>
      </aside>

      <main className="main">
        <div className="top">
          <div>
            <h1>
              {page === "Dashboard"
                ? "Your learning dashboard"
                : page}
            </h1>

            <div className="muted">
              Small steps every day make big progress.
            </div>
          </div>

          <div className="pill">
            {user.name || user.full_name || user.email || "Student"}
          </div>
        </div>

        {error && <div className="error">{error}</div>}
        {message && <div className="success">{message}</div>}

        {page === "Dashboard" && (
          <>
            <div className="grid">
              <div className="card">
                <div className="muted">Total tasks</div>
                <div className="stat">{tasks.length}</div>
              </div>

              <div className="card">
                <div className="muted">Pending tasks</div>
                <div className="stat">{pending}</div>
              </div>

              <div className="card">
                <div className="muted">Completed tasks</div>
                <div className="stat">{completed}</div>
              </div>
            </div>

            <div className="card">
              <h2>Quick add task</h2>

              <TaskForm
                title={title}
                setTitle={setTitle}
                subject={subject}
                setSubject={setSubject}
                deadline={deadline}
                setDeadline={setDeadline}
                reminder={reminder}
                setReminder={setReminder}
                addTask={addTask}
              />
            </div>

            <div className="card">
              <h2>Upcoming work</h2>

              {tasks.length === 0 ? (
                <div className="empty">
                  No tasks yet. Add your first task above!
                </div>
              ) : (
                tasks
                  .filter(t => !t.completed)
                  .slice(0, 5)
                  .map(t => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      toggleTask={toggleTask}
                      deleteTask={deleteTask}
                    />
                  ))
              )}

              <button
                className="secondary"
                onClick={() => setPage("My Tasks")}
              >
                View all tasks
              </button>
            </div>
          </>
        )}

        {page === "My Tasks" && (
          <>
            <div className="card">
              <h2>Add a task</h2>

              <TaskForm
                title={title}
                setTitle={setTitle}
                subject={subject}
                setSubject={setSubject}
                deadline={deadline}
                setDeadline={setDeadline}
                reminder={reminder}
                setReminder={setReminder}
                addTask={addTask}
              />
            </div>

            <div className="card">
              <div className="top">
                <h2>All tasks ({tasks.length})</h2>

                <select
                  className="filter-select"
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                >
                  <option value="all">All tasks</option>
                  <option value="pending">Pending</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              {visibleTasks.length === 0 ? (
                <div className="empty">
                  No tasks in this view.
                </div>
              ) : (
                visibleTasks.map(t => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    toggleTask={toggleTask}
                    deleteTask={deleteTask}
                  />
                ))
              )}
            </div>
          </>
        )}

        {page === "Study Planner" && (
          <>
            <div className="card">
              <h2>Build your YouTube study plan</h2>

              <p className="muted">
                Paste one YouTube video URL per line and organise your study sessions.
              </p>

              <form onSubmit={makePlan}>
                <div className="field">
                  <label>YouTube video URLs</label>

                  <textarea
                    rows={5}
                    required
                    value={videoLinks}
                    onChange={e => setVideoLinks(e.target.value)}
                    placeholder={"https://www.youtube.com/watch?v=...\nhttps://youtu.be/..."}
                  />
                </div>

                <div className="formrow">
                  <div className="field">
                    <label>Available hours per day</label>

                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={studyHours}
                      onChange={e => setStudyHours(e.target.value)}
                    />
                  </div>

                  <div className="field">
                    <label>Plan duration (days)</label>

                    <input
                      type="number"
                      min="1"
                      max="90"
                      value={studyDays}
                      onChange={e => setStudyDays(e.target.value)}
                    />
                  </div>
                </div>

                <button className="primary">
                  Generate study plan
                </button>
              </form>
            </div>

            <div className="card">
              <h2>
                Your plan ({plan.filter(p => p.done).length}/{plan.length} complete)
              </h2>

              {plan.length === 0 ? (
                <div className="empty">
                  Your generated sessions will appear here.
                </div>
              ) : (
                plan.map(item => (
                  <div className="video" key={item.id}>
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={() => togglePlan(item)}
                    />

                    <div className="video-content">
                      <div className={item.done ? "taskname done" : "taskname"}>
                        Day {item.day} · {item.title}
                      </div>

                      <div className="muted">
                        {item.activity} · {item.minutes} minutes
                      </div>

                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="video-link"
                      >
                        {item.url}
                      </a>
                    </div>
                  </div>
                ))
              )}

              {plan.length > 0 && (
                <button
                  className="danger"
                  onClick={() => {
                    setPlan([]);
                    localStorage.removeItem("studysync_plan");
                  }}
                >
                  Clear plan
                </button>
              )}
            </div>

            <p className="small">
              Note: This version organises the URLs you enter. It does not automatically read YouTube playlist contents or actual video durations.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function TaskForm({
  title,
  setTitle,
  subject,
  setSubject,
  deadline,
  setDeadline,
  reminder,
  setReminder,
  addTask
}) {
  return (
    <form onSubmit={addTask}>
      <div className="formrow">
        <div className="field">
          <label>Task title</label>

          <input
            type="text"
            required
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Complete DBMS assignment"
            autoComplete="off"
            autoCapitalize="sentences"
            spellCheck="true"
          />
        </div>

        <div className="field">
          <label>Subject</label>

          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="e.g. DBMS"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="formrow">
        <div className="field">
          <label>Deadline</label>

          <input
            type="datetime-local"
            value={deadline}
            onChange={e => setDeadline(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Reminder before deadline</label>

          <select
            value={reminder}
            onChange={e => setReminder(e.target.value)}
          >
            <option value="0">At deadline</option>
            <option value="5">5 minutes</option>
            <option value="15">15 minutes</option>
            <option value="30">30 minutes</option>
            <option value="60">1 hour</option>
            <option value="1440">1 day</option>
          </select>
        </div>
      </div>

      <button className="primary">+ Add task</button>
    </form>
  );
}

function TaskRow({ task, toggleTask, deleteTask }) {
  const due = task.deadline || task.due_date;

  return (
    <div className="task">
      <input
        type="checkbox"
        checked={!!task.completed}
        onChange={() => toggleTask(task)}
      />

      <div className="taskbody">
        <div className={task.completed ? "taskname done" : "taskname"}>
          {task.title}
        </div>

        <div className="muted">
          {task.subject || "General"}
          {due ? ` · Due ${new Date(due).toLocaleString()}` : ""}
        </div>
      </div>

      <button
        className="danger"
        onClick={() => deleteTask(task)}
      >
        Delete
      </button>
    </div>
  );
}
