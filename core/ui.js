let activeModal = null;

function createButton(text, className = "secondary-button") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = text;
  return button;
}

function closeActiveModal(result = null) {
  if (!activeModal) return;

  const { mask, resolve } = activeModal;

  mask.remove();
  activeModal = null;

  if (typeof resolve === "function") {
    resolve(result);
  }
}

function createModalBase({ title = "提示", message = "", closeOnMask = false } = {}) {
  if (activeModal) {
    closeActiveModal(null);
  }

  const mask = document.createElement("div");
  mask.className = "modal-mask";
  mask.style.zIndex = "300";

  const panel = document.createElement("div");
  panel.className = "modal-panel";

  const titleRow = document.createElement("div");
  titleRow.style.display = "flex";
  titleRow.style.alignItems = "center";
  titleRow.style.justifyContent = "space-between";
  titleRow.style.gap = "12px";
  titleRow.style.marginBottom = "14px";

  const titleElement = document.createElement("h3");
  titleElement.className = "section-title";
  titleElement.style.margin = "0";
  titleElement.textContent = title;

  const closeButton = createButton("关闭", "secondary-button");

  titleRow.appendChild(titleElement);
  titleRow.appendChild(closeButton);

  const content = document.createElement("div");
  content.style.display = "grid";
  content.style.gap = "12px";

  if (message) {
    const messageElement = document.createElement("div");
    messageElement.style.lineHeight = "1.7";
    messageElement.style.color = "var(--text-primary)";
    messageElement.style.wordBreak = "break-word";
    messageElement.textContent = message;
    content.appendChild(messageElement);
  }

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.gap = "8px";
  actions.style.justifyContent = "flex-end";
  actions.style.flexWrap = "wrap";
  actions.style.marginTop = "4px";

  panel.appendChild(titleRow);
  panel.appendChild(content);
  panel.appendChild(actions);
  mask.appendChild(panel);

  closeButton.addEventListener("click", () => {
    closeActiveModal(null);
  });

  if (closeOnMask) {
    mask.addEventListener("click", (event) => {
      if (event.target === mask) {
        closeActiveModal(null);
      }
    });
  }

  document.body.appendChild(mask);

  return {
    mask,
    panel,
    content,
    actions
  };
}

export function showAlert(message, options = {}) {
  return new Promise((resolve) => {
    const modal = createModalBase({
      title: options.title || "提示",
      message,
      closeOnMask: true
    });

    const okButton = createButton(options.okText || "知道了", "primary-button");
    okButton.addEventListener("click", () => {
      closeActiveModal(true);
    });

    modal.actions.appendChild(okButton);

    activeModal = {
      mask: modal.mask,
      resolve
    };

    okButton.focus();
  });
}

export function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    const modal = createModalBase({
      title: options.title || "确认",
      message,
      closeOnMask: true
    });

    const cancelButton = createButton(options.cancelText || "取消", "secondary-button");
    const okButton = createButton(options.okText || "确定", options.danger ? "danger-button" : "primary-button");

    cancelButton.addEventListener("click", () => {
      closeActiveModal(false);
    });

    okButton.addEventListener("click", () => {
      closeActiveModal(true);
    });

    modal.actions.appendChild(cancelButton);
    modal.actions.appendChild(okButton);

    activeModal = {
      mask: modal.mask,
      resolve
    };

    okButton.focus();
  });
}

export function showPrompt(message, options = {}) {
  return new Promise((resolve) => {
    const modal = createModalBase({
      title: options.title || "输入",
      message,
      closeOnMask: false
    });

    const input = options.multiline
      ? document.createElement("textarea")
      : document.createElement("input");

    input.className = options.multiline ? "textarea-input" : "text-input";
    input.value = options.defaultValue || "";
    input.placeholder = options.placeholder || "";

    if (!options.multiline) {
      input.type = options.type || "text";
    }

    if (options.multiline) {
      input.style.minHeight = "90px";
    }

    const cancelButton = createButton(options.cancelText || "取消", "secondary-button");
    const okButton = createButton(options.okText || "确定", "primary-button");

    cancelButton.addEventListener("click", () => {
      closeActiveModal(null);
    });

    okButton.addEventListener("click", () => {
      closeActiveModal(input.value);
    });

    input.addEventListener("keydown", (event) => {
      if (!options.multiline && event.key === "Enter") {
        event.preventDefault();
        closeActiveModal(input.value);
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeActiveModal(null);
      }
    });

    modal.content.appendChild(input);
    modal.actions.appendChild(cancelButton);
    modal.actions.appendChild(okButton);

    activeModal = {
      mask: modal.mask,
      resolve
    };

    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  });
}

export function showCustomModal({ title = "窗口", content, actions = [], closeOnMask = true } = {}) {
  return new Promise((resolve) => {
    const modal = createModalBase({
      title,
      message: "",
      closeOnMask
    });

    if (typeof content === "string") {
      const text = document.createElement("div");
      text.style.lineHeight = "1.7";
      text.textContent = content;
      modal.content.appendChild(text);
    } else if (content instanceof HTMLElement) {
      modal.content.appendChild(content);
    }

    actions.forEach((action) => {
      const button = createButton(action.text || "按钮", action.className || "secondary-button");

      button.addEventListener("click", () => {
        if (typeof action.onClick === "function") {
          action.onClick();
        }

        closeActiveModal(action.value ?? true);
      });

      modal.actions.appendChild(button);
    });

    if (actions.length === 0) {
      const closeButton = createButton("关闭", "primary-button");
      closeButton.addEventListener("click", () => {
        closeActiveModal(true);
      });

      modal.actions.appendChild(closeButton);
    }

    activeModal = {
      mask: modal.mask,
      resolve
    };
  });
}

export function closeModal() {
  closeActiveModal(null);
}

export function installThemeDialogs() {
  window.aiPhoneAlert = showAlert;
  window.aiPhoneConfirm = showConfirm;
  window.aiPhonePrompt = showPrompt;
}

