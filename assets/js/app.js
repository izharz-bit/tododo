(function () {
  "use strict";

  const STORAGE_KEY = "taskflow.tasks.v1";
  const THEME_KEY = "taskflow.theme.v1";

  const state = {
    tasks: loadTasks(),
    filter: "all"
  };

  const elements = {
    root: document.documentElement,
    year: document.querySelector("[data-current-year]"),
    themeToggle: document.querySelector("[data-theme-toggle]"),
    form: document.querySelector("[data-task-form]"),
    input: document.querySelector("[data-task-input]"),
    error: document.querySelector("[data-task-error]"),
    taskList: document.querySelector("[data-task-list]"),
    taskTemplate: document.querySelector("#task-template"),
    filterButtons: document.querySelectorAll("[data-filter]"),
    clearCompletedButton: document.querySelector("[data-clear-completed]"),
    totalCount: document.querySelector("[data-total-count]"),
    activeCount: document.querySelector("[data-active-count]"),
    completedCount: document.querySelector("[data-completed-count]"),
    listStatus: document.querySelector("[data-list-status]")
  };

  init();

  function init() {
    setCurrentYear();
    initTheme();
    render();

    elements.form.addEventListener("submit", handleAddTask);
    elements.taskList.addEventListener("click", handleTaskClick);
    elements.taskList.addEventListener("submit", handleEditSubmit);
    elements.filterButtons.forEach((button) => {
      button.addEventListener("click", () => setFilter(button.dataset.filter));
    });
    elements.clearCompletedButton.addEventListener("click", clearCompletedTasks);
  }

  function setCurrentYear() {
    if (elements.year) {
      elements.year.textContent = String(new Date().getFullYear());
    }
  }

  function initTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initialTheme = savedTheme || (systemPrefersDark ? "dark" : "light");

    setTheme(initialTheme);

    elements.themeToggle.addEventListener("click", () => {
      const currentTheme = elements.root.getAttribute("data-theme") || "light";
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      setTheme(nextTheme);
      localStorage.setItem(THEME_KEY, nextTheme);
    });
  }

  function setTheme(theme) {
    const isDark = theme === "dark";

    elements.root.setAttribute("data-theme", theme);
    elements.themeToggle.textContent = isDark ? "☀️" : "🌙";
    elements.themeToggle.setAttribute("aria-pressed", String(isDark));
    elements.themeToggle.setAttribute("aria-label", isDark ? "Switch to light theme" : "Switch to dark theme");
  }

  function handleAddTask(event) {
    event.preventDefault();

    const title = normalizeText(elements.input.value);

    if (!title) {
      showInputError("Task cannot be empty.");
      return;
    }

    if (isDuplicateTitle(title)) {
      showInputError("This task already exists.");
      return;
    }

    const task = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      title,
      completed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    state.tasks.unshift(task);
    elements.input.value = "";
    clearInputError();
    saveAndRender();
  }

  function handleTaskClick(event) {
    const actionElement = event.target.closest("[data-action]");
    if (!actionElement) return;

    const taskItem = event.target.closest("[data-task-id]");
    if (!taskItem) return;

    const taskId = taskItem.dataset.taskId;
    const action = actionElement.dataset.action;

    if (action === "toggle") {
      toggleTask(taskId);
    }

    if (action === "edit") {
      startEditing(taskId);
    }

    if (action === "cancel-edit") {
      cancelEditing(taskId);
    }

    if (action === "delete") {
      deleteTask(taskId);
    }
  }

  function handleEditSubmit(event) {
    const editForm = event.target.closest("[data-edit-form]");
    if (!editForm) return;

    event.preventDefault();

    const taskItem = editForm.closest("[data-task-id]");
    const input = editForm.querySelector("[data-edit-input]");
    const taskId = taskItem.dataset.taskId;
    const nextTitle = normalizeText(input.value);

    if (!nextTitle) {
      input.setAttribute("aria-invalid", "true");
      input.focus();
      return;
    }

    const duplicate = state.tasks.some((task) => {
      return task.id !== taskId && task.title.toLowerCase() === nextTitle.toLowerCase();
    });

    if (duplicate) {
      input.setAttribute("aria-invalid", "true");
      input.focus();
      return;
    }

    state.tasks = state.tasks.map((task) => {
      if (task.id !== taskId) return task;

      return {
        ...task,
        title: nextTitle,
        updatedAt: new Date().toISOString()
      };
    });

    saveAndRender();
  }

  function toggleTask(taskId) {
    state.tasks = state.tasks.map((task) => {
      if (task.id !== taskId) return task;

      return {
        ...task,
        completed: !task.completed,
        updatedAt: new Date().toISOString()
      };
    });

    saveAndRender();
  }

  function startEditing(taskId) {
    const taskItem = elements.taskList.querySelector(`[data-task-id="${taskId}"]`);
    const task = state.tasks.find((item) => item.id === taskId);
    if (!taskItem || !task) return;

    taskItem.classList.add("is-editing");

    const content = taskItem.querySelector(".task-content");
    const actions = taskItem.querySelector(".task-actions");
    const editForm = taskItem.querySelector("[data-edit-form]");
    const editInput = taskItem.querySelector("[data-edit-input]");

    content.hidden = true;
    actions.hidden = true;
    editForm.hidden = false;
    editInput.value = task.title;
    editInput.removeAttribute("aria-invalid");
    editInput.focus();
    editInput.select();
  }

  function cancelEditing(taskId) {
    const taskItem = elements.taskList.querySelector(`[data-task-id="${taskId}"]`);
    if (!taskItem) return;

    taskItem.classList.remove("is-editing");

    const content = taskItem.querySelector(".task-content");
    const actions = taskItem.querySelector(".task-actions");
    const editForm = taskItem.querySelector("[data-edit-form]");

    content.hidden = false;
    actions.hidden = false;
    editForm.hidden = true;
  }

  function deleteTask(taskId) {
    state.tasks = state.tasks.filter((task) => task.id !== taskId);
    saveAndRender();
  }

  function clearCompletedTasks() {
    state.tasks = state.tasks.filter((task) => !task.completed);
    saveAndRender();
  }

  function setFilter(filter) {
    state.filter = filter;

    elements.filterButtons.forEach((button) => {
      const isActive = button.dataset.filter === filter;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });

    render();
  }

  function render() {
    elements.taskList.replaceChildren();

    const visibleTasks = getVisibleTasks();

    visibleTasks.forEach((task) => {
      elements.taskList.appendChild(createTaskNode(task));
    });

    updateCounts();
    updateStatus(visibleTasks.length);
    updateClearCompletedButton();
  }

  function createTaskNode(task) {
    const fragment = elements.taskTemplate.content.cloneNode(true);
    const item = fragment.querySelector(".task-item");
    const row = fragment.querySelector(".task-row");
    const checkbox = fragment.querySelector(".task-checkbox");
    const title = fragment.querySelector("[data-task-title]");
    const date = fragment.querySelector("[data-task-date]");
    const editButton = fragment.querySelector('[data-action="edit"]');
    const deleteButton = fragment.querySelector('[data-action="delete"]');

    item.dataset.taskId = task.id;
    row.classList.toggle("is-completed", task.completed);

    checkbox.checked = task.completed;
    checkbox.setAttribute("aria-label", task.completed ? "Mark task active" : "Mark task completed");

    title.textContent = task.title;
    date.textContent = `Created ${formatDate(task.createdAt)}`;

    editButton.setAttribute("aria-label", `Edit task: ${task.title}`);
    deleteButton.setAttribute("aria-label", `Delete task: ${task.title}`);

    return item;
  }

  function getVisibleTasks() {
    if (state.filter === "active") {
      return state.tasks.filter((task) => !task.completed);
    }

    if (state.filter === "completed") {
      return state.tasks.filter((task) => task.completed);
    }

    return state.tasks;
  }

  function updateCounts() {
    const total = state.tasks.length;
    const completed = state.tasks.filter((task) => task.completed).length;
    const active = total - completed;

    elements.totalCount.textContent = String(total);
    elements.activeCount.textContent = String(active);
    elements.completedCount.textContent = String(completed);
  }

  function updateStatus(visibleCount) {
    if (state.tasks.length === 0) {
      elements.listStatus.textContent = "No tasks yet. Add your first task.";
      return;
    }

    if (visibleCount === 0 && state.filter === "active") {
      elements.listStatus.textContent = "No active tasks. Great work.";
      return;
    }

    if (visibleCount === 0 && state.filter === "completed") {
      elements.listStatus.textContent = "No completed tasks yet.";
      return;
    }

    elements.listStatus.textContent = `Showing ${visibleCount} ${visibleCount === 1 ? "task" : "tasks"}.`;
  }

  function updateClearCompletedButton() {
    const hasCompleted = state.tasks.some((task) => task.completed);
    elements.clearCompletedButton.disabled = !hasCompleted;
    elements.clearCompletedButton.setAttribute("aria-disabled", String(!hasCompleted));
  }

  function saveAndRender() {
    saveTasks();
    render();
  }

  function loadTasks() {
    try {
      const rawTasks = localStorage.getItem(STORAGE_KEY);
      if (!rawTasks) return [];
      const parsedTasks = JSON.parse(rawTasks);
      return Array.isArray(parsedTasks) ? parsedTasks : [];
    } catch (error) {
      console.error("Failed to load tasks from localStorage:", error);
      return [];
    }
  }

  function saveTasks() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
  }

  function normalizeText(value) {
    return value.trim().replace(/\s+/g, " ");
  }

  function isDuplicateTitle(title) {
    return state.tasks.some((task) => task.title.toLowerCase() === title.toLowerCase());
  }

  function showInputError(message) {
    elements.input.setAttribute("aria-invalid", "true");
    elements.error.textContent = message;
    elements.input.focus();
  }

  function clearInputError() {
    elements.input.removeAttribute("aria-invalid");
    elements.error.textContent = "";
  }

  function formatDate(isoDate) {
    const date = new Date(isoDate);

    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  }
})();
