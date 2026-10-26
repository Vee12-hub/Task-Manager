
const API_URL = "/api/tasks";

const taskForm = document.getElementById("taskForm");
const taskList = document.getElementById("taskList");
const formMessage = document.getElementById("formMessage");
const listMessage = document.getElementById("listMessage");

const titleInput = document.getElementById("title");
const descriptionInput = document.getElementById("description");
const dueDateInput = document.getElementById("due_date");
const priorityInput = document.getElementById("priority");

const submitButton = document.getElementById("submitButton");
const cancelEditButton = document.getElementById("cancelEdit");
const formHeading = document.getElementById("formHeading");

const searchInput = document.getElementById("searchInput");
const filterStatus = document.getElementById("filterStatus");
const sortTasks = document.getElementById("sortTasks");

let tasks = [];
let editingTaskId = null;
let loadingTasks = false;

async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...options.headers
        }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.error || "Something went wrong.");
    }

    return data;
}

function showMessage(element, message, type = "") {
    element.textContent = message;
    element.className = "message";

    if (type) {
        element.classList.add(type);
    }
}

function createElement(tag, className = "", text = undefined) {
    const element = document.createElement(tag);

    if (className) {
        element.className = className;
    }

    if (text !== undefined) {
        element.textContent = text;
    }

    return element;
}

function getTodayString() {
    const today = new Date();

    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function updateStatistics() {
    const completed = tasks.filter(
        task => Number(task.completed) === 1
    ).length;

    document.getElementById("totalTasks").textContent = tasks.length;
    document.getElementById("completedTasks").textContent = completed;
    document.getElementById("pendingTasks").textContent =
        tasks.length - completed;
}

function sortTaskList(taskArray) {
    const priorityRank = {
        High: 3,
        Medium: 2,
        Low: 1
    };

    const selectedSort = sortTasks.value;

    return taskArray.sort((a, b) => {
        if (selectedSort === "dueDate") {
            const dateA = a.due_date || "9999-12-31";
            const dateB = b.due_date || "9999-12-31";

            const dateComparison = dateA.localeCompare(dateB);

            if (dateComparison !== 0) {
                return dateComparison;
            }

            return Number(b.id) - Number(a.id);
        }

        if (selectedSort === "priority") {
            const rankA = priorityRank[a.priority] || 2;
            const rankB = priorityRank[b.priority] || 2;

            if (rankA !== rankB) {
                return rankB - rankA;
            }

            return Number(b.id) - Number(a.id);
        }

        return Number(b.id) - Number(a.id);
    });
}

function renderTasks() {
    taskList.replaceChildren();

    const searchTerm = searchInput.value.trim().toLowerCase();
    const selectedStatus = filterStatus.value;

    const filteredTasks = tasks.filter(task => {
        const isCompleted = Number(task.completed) === 1;

        const title = String(task.title || "").toLowerCase();
        const description = String(
            task.description || ""
        ).toLowerCase();

        const matchesSearch =
            title.includes(searchTerm) ||
            description.includes(searchTerm);

        const matchesStatus =
            selectedStatus === "all" ||
            (selectedStatus === "completed" && isCompleted) ||
            (selectedStatus === "pending" && !isCompleted);

        return matchesSearch && matchesStatus;
    });

    sortTaskList(filteredTasks);

    if (filteredTasks.length === 0) {
        const message = tasks.length === 0
            ? "No tasks yet. Add your first task above!"
            : "No tasks match your search or filter.";

        taskList.appendChild(
            createElement("div", "empty-state", message)
        );

        return;
    }

    filteredTasks.forEach(task => {
        const isCompleted = Number(task.completed) === 1;

        const card = createElement(
            "article",
            `task-card${isCompleted ? " completed" : ""}`
        );

        const content = createElement("div", "task-content");

        content.appendChild(
            createElement("h3", "task-title", task.title)
        );

        if (task.description) {
            content.appendChild(
                createElement(
                    "p",
                    "task-description",
                    task.description
                )
            );
        }

        const meta = createElement("div", "task-meta");

        const priority = ["Low", "Medium", "High"].includes(task.priority)
            ? task.priority
            : "Medium";

        meta.appendChild(
            createElement(
                "span",
                `pill priority-${priority.toLowerCase()}`,
                `${priority} priority`
            )
        );

        meta.appendChild(
            createElement(
                "span",
                "pill",
                isCompleted ? "Completed" : "Pending"
            )
        );

        if (task.due_date) {
            meta.appendChild(
                createElement("span", "", `Due: ${task.due_date}`)
            );

            if (task.due_date < getTodayString() && !isCompleted) {
                meta.appendChild(
                    createElement(
                        "span",
                        "pill priority-high",
                        "Overdue"
                    )
                );
            } else if (
                task.due_date === getTodayString() &&
                !isCompleted
            ) {
                meta.appendChild(
                    createElement(
                        "span",
                        "pill priority-medium",
                        "Due today"
                    )
                );
            }
        }

        content.appendChild(meta);

        const actions = createElement("div", "task-actions");

        const completeButton = createElement(
            "button",
            "secondary-button",
            isCompleted ? "Undo" : "Complete"
        );

        completeButton.type = "button";
        completeButton.addEventListener("click", () => {
            toggleTask(task);
        });

        const editButton = createElement(
            "button",
            "secondary-button",
            "Edit"
        );

        editButton.type = "button";
        editButton.addEventListener("click", () => {
            editTask(task);
        });

        const deleteButton = createElement(
            "button",
            "danger-button",
            "Delete"
        );

        deleteButton.type = "button";
        deleteButton.addEventListener("click", () => {
            deleteTask(task.id);
        });

        actions.append(
            completeButton,
            editButton,
            deleteButton
        );

        card.append(content, actions);
        taskList.appendChild(card);
    });
}

async function loadTasks() {
    if (loadingTasks) {
        return;
    }

    loadingTasks = true;
    showMessage(listMessage, "Loading tasks...");

    try {
        const result = await apiRequest(API_URL);

        if (!Array.isArray(result)) {
            throw new Error("The server returned an unexpected response.");
        }

        tasks = result;

        updateStatistics();
        renderTasks();

        showMessage(listMessage, "");
    } catch (error) {
        showMessage(
            listMessage,
            `Could not load tasks: ${error.message}. Check that the Python server is running.`,
            "error"
        );
    } finally {
        loadingTasks = false;
    }
}

function resetForm() {
    taskForm.reset();

    editingTaskId = null;

    formHeading.textContent = "Create a task";
    submitButton.textContent = "+ Add task";

    cancelEditButton.classList.add("hidden");

    showMessage(formMessage, "");
}

function editTask(task) {
    editingTaskId = task.id;

    titleInput.value = task.title || "";
    descriptionInput.value = task.description || "";
    dueDateInput.value = task.due_date || "";
    priorityInput.value = task.priority || "Medium";

    formHeading.textContent = "Edit task";
    submitButton.textContent = "Save changes";

    cancelEditButton.classList.remove("hidden");

    showMessage(formMessage, "");

    titleInput.focus();

    taskForm.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

taskForm.addEventListener("submit", async event => {
    event.preventDefault();

    const title = titleInput.value.trim();

    if (!title) {
        showMessage(
            formMessage,
            "Please enter a task title.",
            "error"
        );

        titleInput.focus();
        return;
    }

    const taskData = {
        title,
        description: descriptionInput.value.trim(),
        due_date: dueDateInput.value || null,
        priority: priorityInput.value
    };

    if (editingTaskId !== null) {
        const existingTask = tasks.find(
            task => Number(task.id) === Number(editingTaskId)
        );

        taskData.completed = existingTask
            ? Number(existingTask.completed) === 1
            : false;
    }

    submitButton.disabled = true;

    try {
        if (editingTaskId !== null) {
            await apiRequest(`${API_URL}/${editingTaskId}`, {
                method: "PUT",
                body: JSON.stringify(taskData)
            });

            resetForm();

            await loadTasks();

            showMessage(
                formMessage,
                "Task updated successfully!",
                "success"
            );
        } else {
            await apiRequest(API_URL, {
                method: "POST",
                body: JSON.stringify(taskData)
            });

            resetForm();

            await loadTasks();

            showMessage(
                formMessage,
                "Task added successfully!",
                "success"
            );
        }
    } catch (error) {
        showMessage(formMessage, error.message, "error");
    } finally {
        submitButton.disabled = false;
    }
});

async function toggleTask(task) {
    try {
        const updatedTask = {
            title: task.title,
            description: task.description || "",
            due_date: task.due_date || null,
            priority: task.priority || "Medium",
            completed: Number(task.completed) !== 1
        };

        await apiRequest(`${API_URL}/${task.id}`, {
            method: "PUT",
            body: JSON.stringify(updatedTask)
        });

        await loadTasks();

        showMessage(
            listMessage,
            updatedTask.completed
                ? "Task marked as completed."
                : "Task marked as pending.",
            "success"
        );
    } catch (error) {
        showMessage(listMessage, error.message, "error");
    }
}

async function deleteTask(id) {
    const confirmed = window.confirm(
        "Are you sure you want to delete this task?"
    );

    if (!confirmed) {
        return;
    }

    try {
        await apiRequest(`${API_URL}/${id}`, {
            method: "DELETE"
        });

        if (Number(editingTaskId) === Number(id)) {
            resetForm();
        }

        await loadTasks();

        showMessage(
            listMessage,
            "Task deleted successfully.",
            "success"
        );
    } catch (error) {
        showMessage(listMessage, error.message, "error");
    }
}

cancelEditButton.addEventListener("click", resetForm);

searchInput.addEventListener("input", renderTasks);

filterStatus.addEventListener("change", renderTasks);

sortTasks.addEventListener("change", renderTasks);

document
    .getElementById("refreshButton")
    .addEventListener("click", loadTasks);

loadTasks();
