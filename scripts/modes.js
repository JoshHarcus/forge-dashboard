// Forge Cockpit · day / night / focus mode toggle
(function () {
  const Forge = (window.Forge = window.Forge || {});
  const html = document.documentElement;
  const STORAGE_KEY = "forge-mode";

  function set(mode) {
    if (!["day", "night", "focus"].includes(mode)) mode = "night";
    html.setAttribute("data-mode", mode);
    localStorage.setItem(STORAGE_KEY, mode);
    document.dispatchEvent(new CustomEvent("forge:mode", { detail: mode }));
  }

  function current() {
    return html.getAttribute("data-mode") || "night";
  }

  function toggle() {
    set(current() === "night" ? "day" : "night");
  }

  function toggleFocus() {
    if (current() === "focus") {
      const prev = localStorage.getItem("forge-mode-prev") || "night";
      set(prev);
    } else {
      localStorage.setItem("forge-mode-prev", current());
      set("focus");
    }
  }

  // Restore from storage
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) set(saved);

  // Wire buttons
  const toggleBtn = document.getElementById("mode-toggle");
  if (toggleBtn) toggleBtn.addEventListener("click", toggle);

  const focusBtn = document.getElementById("focus-toggle");
  if (focusBtn) focusBtn.addEventListener("click", toggleFocus);

  // Keyboard
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (e.key === "d" || e.key === "D") toggle();
    if (e.key === "f" || e.key === "F") toggleFocus();
  });

  Forge.modes = { set, current, toggle, toggleFocus };
})();
