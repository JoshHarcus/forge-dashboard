// Forge Cockpit · mobile gesture handlers (long-press, swipe-down on drawer)
// Pinch-zoom and pan are handled by D3 zoom in graph.js. This file adds the gestures
// that aren't covered by D3 out of the box.
(function () {
  const Forge = (window.Forge = window.Forge || {});

  const LONG_PRESS_MS = 480;

  // Long-press on a node → pin it
  function attachLongPress(selection, onLongPress) {
    let timer = null;
    let startX = 0, startY = 0;
    let target = null;

    selection.on("touchstart.longpress", function (event, d) {
      if (event.touches.length !== 1) return;
      target = d;
      const t = event.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (target && onLongPress) {
          if (navigator.vibrate) navigator.vibrate(12);
          onLongPress(target);
        }
      }, LONG_PRESS_MS);
    });
    selection.on("touchmove.longpress", function (event) {
      if (!event.touches.length) return;
      const t = event.touches[0];
      if (Math.hypot(t.clientX - startX, t.clientY - startY) > 8) {
        clearTimeout(timer);
        target = null;
      }
    });
    selection.on("touchend.longpress touchcancel.longpress", function () {
      clearTimeout(timer);
      target = null;
    });
  }

  // Swipe down on a drawer to dismiss
  function attachDrawerSwipeDismiss() {
    document.querySelectorAll(".drawer-bottom").forEach((drawer) => {
      let startY = 0;
      let currentY = 0;
      let dragging = false;

      drawer.addEventListener("touchstart", (e) => {
        if (drawer.getAttribute("aria-hidden") === "true") return;
        // Only start the swipe if user started near the handle area
        const rect = drawer.getBoundingClientRect();
        const t = e.touches[0];
        if (t.clientY - rect.top > 90) return;
        startY = t.clientY;
        dragging = true;
      });
      drawer.addEventListener("touchmove", (e) => {
        if (!dragging) return;
        currentY = e.touches[0].clientY;
        const dy = Math.max(0, currentY - startY);
        drawer.style.transform = `translateY(${dy}px)`;
      });
      drawer.addEventListener("touchend", () => {
        if (!dragging) return;
        const dy = currentY - startY;
        drawer.style.transform = "";
        dragging = false;
        if (dy > 80) {
          drawer.setAttribute("aria-hidden", "true");
          document.body.classList.remove("drawer-open");
        }
      });
    });
  }

  // Swipe up on a node = open drawer (alt to tap)
  function attachSwipeUp(selection, onSwipeUp) {
    let startY = 0;
    let target = null;
    selection.on("touchstart.swipeup", function (event, d) {
      if (event.touches.length !== 1) return;
      target = d;
      startY = event.touches[0].clientY;
    });
    selection.on("touchend.swipeup", function (event) {
      if (!target) return;
      const endY = (event.changedTouches[0] || {}).clientY ?? startY;
      if (startY - endY > 60) {
        if (onSwipeUp) onSwipeUp(target);
      }
      target = null;
    });
  }

  Forge.gestures = { attachLongPress, attachDrawerSwipeDismiss, attachSwipeUp };

  // Initialize once DOM is ready
  if (document.readyState !== "loading") {
    attachDrawerSwipeDismiss();
  } else {
    document.addEventListener("DOMContentLoaded", attachDrawerSwipeDismiss);
  }
})();
