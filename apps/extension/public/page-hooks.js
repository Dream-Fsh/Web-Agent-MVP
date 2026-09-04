(() => {
  const emit = (kind) => window.dispatchEvent(new CustomEvent("__web_agent_spa_navigation__", { detail: { kind, url: location.href } }));
  const wrap = (name) => {
    const original = history[name];
    history[name] = function (...args) {
      const result = original.apply(this, args);
      emit(name);
      return result;
    };
  };
  wrap("pushState");
  wrap("replaceState");
})();
