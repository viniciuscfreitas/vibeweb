/**
 * Subtasks Module
 * Handles loading, rendering and managing subtasks within the task modal.
 */

const SubtaskManager = {
  async loadSubtasks(taskId) {
    if (!taskId) return;

    try {
      const result = await api.getSubtasks(taskId);
      if (result) {
        this.renderSubtasks(result);
      }
    } catch (error) {
      console.error("Error loading subtasks:", error);
      NotificationManager.error("Erro ao carregar subtarefas");
    }
  },

  renderSubtasks(subtasks) {
    if (!DOM.subtaskList || !DOM.subtasksSection || !DOM.subtasksProgress)
      return;

    if (!subtasks || subtasks.length === 0) {
      DOM.subtaskList.innerHTML =
        '<p class="text-muted" style="font-size: 0.875rem; text-align: center; padding: 1rem;">Nenhuma subtarefa adicionada.</p>';
      DOM.subtasksProgress.textContent = "0/0";
      return;
    }

    const completedCount = subtasks.filter((s) => s.completed).length;
    DOM.subtasksProgress.textContent = `${completedCount}/${subtasks.length}`;

    DOM.subtaskList.innerHTML = subtasks
      .map(
        (subtask) => `
      <div class="subtask-item ${
        subtask.completed ? "completed" : ""
      }" data-id="${subtask.id}">
        <input type="checkbox" class="subtask-checkbox" ${
          subtask.completed ? "checked" : ""
        } aria-label="Marcar como concluída" />
        <input type="text" class="subtask-title" value="${escapeHtml(
          subtask.title
        )}" placeholder="Título da subtarefa" />
        <div class="subtask-actions">
          <button type="button" class="btn-subtask-action btn-subtask-delete" title="Excluir subtarefa" aria-label="Excluir subtarefa">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>
    `
      )
      .join("");

    this.setupListeners();
  },

  setupListeners() {
    if (DOM.subtaskList._listenersAttached) return;

    DOM.subtaskList.addEventListener("change", async (e) => {
      const checkbox = e.target.closest(".subtask-checkbox");
      if (!checkbox) return;

      const item = checkbox.closest(".subtask-item");
      const id = item.dataset.id;
      const completed = checkbox.checked;

      try {
        const result = await api.updateSubtask(id, { completed });
        if (result) {
          item.classList.toggle("completed", completed);
          this.updateProgress();
          const task = AppState.getTaskById(AppState.currentTaskId);
          if (task) {
            task.completed_subtask_count = completed
              ? (task.completed_subtask_count || 0) + 1
              : Math.max(0, (task.completed_subtask_count || 0) - 1);
            this.syncWithBoard(task);
          }
        }
      } catch (error) {
        checkbox.checked = !checkbox.checked;
        NotificationManager.error("Erro ao atualizar subtarefa");
      }
    });

    let inputTimeout = null;
    DOM.subtaskList.addEventListener("input", (e) => {
      const titleInput = e.target.closest(".subtask-title");
      if (!titleInput) return;

      const id = titleInput.closest(".subtask-item").dataset.id;
      clearTimeout(inputTimeout);
      inputTimeout = setTimeout(async () => {
        try {
          await api.updateSubtask(id, { title: titleInput.value });
        } catch (error) {
          NotificationManager.error("Erro ao salvar título");
        }
      }, 500);
    });

    DOM.subtaskList.addEventListener("click", async (e) => {
      const deleteBtn = e.target.closest(".btn-subtask-delete");
      if (!deleteBtn) return;

      const item = deleteBtn.closest(".subtask-item");
      const id = item.dataset.id;

      if (!confirm("Excluir esta subtarefa?")) return;
      try {
        await api.deleteSubtask(id);
        const task = AppState.getTaskById(AppState.currentTaskId);
        if (task) {
          if (item.querySelector(".subtask-checkbox").checked) {
            task.completed_subtask_count = Math.max(0, (task.completed_subtask_count || 0) - 1);
          }
          task.subtask_count = Math.max(0, (task.subtask_count || 0) - 1);
          this.syncWithBoard(task);
        }
        item.remove();
        this.updateProgress();
        if (DOM.subtaskList.children.length === 0) {
          DOM.subtaskList.innerHTML = '<p class="text-muted" style="font-size: 0.875rem; text-align: center; padding: 1rem;">Nenhuma subtarefa adicionada.</p>';
        }
      } catch (error) {
        NotificationManager.error("Erro ao excluir subtarefa");
      }
    });

    DOM.subtaskList._listenersAttached = true;
  },

  updateProgress() {
    const items = DOM.subtaskList.querySelectorAll(".subtask-item");
    const total = items.length;
    const completed = Array.from(items).filter((item) => {
      const cb = item.querySelector(".subtask-checkbox");
      return cb && cb.checked;
    }).length;
    if (DOM.subtasksProgress) {
      DOM.subtasksProgress.textContent = `${completed}/${total}`;
    }
  },

  syncWithBoard(task) {
    if (!task) return;
    const cardEl = document.querySelector(`.card[data-id="${task.id}"]`);
    if (cardEl && typeof updateCardInPlace === "function") {
      updateCardInPlace(cardEl, task);
    } else if (typeof renderBoard === "function") {
      renderBoard();
    }
  },

  async handleAddSubtask() {
    const title = DOM.subtaskNewTitle.value.trim();
    if (!title) return;

    const taskId = AppState.currentTaskId;
    if (!taskId) {
      NotificationManager.warning(
        "Salve o projeto antes de adicionar subtarefas"
      );
      return;
    }

    try {
      const result = await api.createSubtask(taskId, title);
      if (result) {
        DOM.subtaskNewTitle.value = "";
        const task = AppState.getTaskById(taskId);
        if (task) {
          task.subtask_count = (task.subtask_count || 0) + 1;
          this.syncWithBoard(task);
        }
        // Reload all to ensure correct order and state
        this.loadSubtasks(taskId);
      }
    } catch (error) {
      NotificationManager.error("Erro ao adicionar subtarefa");
    }
  },

  init() {
    if (DOM.btnAddTaskSubtask) {
      DOM.btnAddTaskSubtask.onclick = () => this.handleAddSubtask();
    }
    if (DOM.subtaskNewTitle) {
      DOM.subtaskNewTitle.onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.handleAddSubtask();
        }
      };
    }
  },
};
