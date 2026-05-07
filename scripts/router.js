// Forge Cockpit · hash-based deep linking, no page reloads
(function () {
  const Forge = (window.Forge = window.Forge || {});
  const listeners = [];

  function parse() {
    const h = location.hash.replace(/^#\/?/, "");
    if (!h) return { type: "home" };
    const parts = h.split("/");
    if (parts[0] === "node" && parts[1]) return { type: "node", id: parts[1] };
    if (parts[0] === "roadmap") return { type: "roadmap" };
    if (parts[0] === "activity") return { type: "activity" };
    return { type: "home" };
  }

  function notify() {
    const state = parse();
    listeners.forEach((fn) => {
      try { fn(state); } catch (e) { console.error(e); }
    });
  }

  function set(state) {
    let hash = "";
    if (state.type === "node" && state.id) hash = "#/node/" + state.id;
    else if (state.type === "roadmap") hash = "#/roadmap";
    else if (state.type === "activity") hash = "#/activity";
    if (location.hash !== hash) {
      history.replaceState(null, "", hash || location.pathname);
      notify();
    }
  }

  function on(fn) {
    listeners.push(fn);
    return () => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  window.addEventListener("hashchange", notify);

  Forge.router = { parse, set, on };
})();
