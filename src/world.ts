import { resetWorldInput } from "./world-input";

export { worldInput } from "./world-input";

export type RendererMode = "3d";
export type RendererMount = (element: HTMLElement) => () => void;
export type RendererStatus = { mode: RendererMode; loading?: boolean; message?: string };

/** Kept for callers that display the active renderer. Rendering is always 3D. */
export function getRendererMode(): RendererMode { return "3d"; }

export function setRendererMode(mode: RendererMode): void {
  if (mode === "3d" && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<RendererMode>("kg-renderer-change", { detail: mode }));
  }
}

const LOAD_ERROR = "Não foi possível carregar o mundo 3D. Sua campanha continua salva. Tente novamente.";

/** A renderer owns the simulation clock only while it is mounted. */
export function createRendererLifecycle(options: {
  element: HTMLElement;
  load: (mode: RendererMode) => Promise<RendererMount>;
  report: (status: RendererStatus) => void;
  resetInput: () => void;
  error: (retry: () => void) => void;
  clearError: () => void;
}) {
  let generation = 0;
  let disposed = false;
  let activeCleanup: (() => void) | undefined;
  let active = false;

  const release = () => {
    const cleanup = activeCleanup;
    activeCleanup = undefined;
    active = false;
    cleanup?.();
    options.resetInput();
  };

  const fail = (message = LOAD_ERROR): void => {
    if (disposed) return;
    generation++;
    release();
    options.clearError();
    options.report({ mode: "3d", loading: false, message });
    options.error(() => { void select("3d"); });
  };

  const select = async (mode: RendererMode): Promise<void> => {
    if (disposed || active || mode !== "3d") return;
    const current = ++generation;
    release();
    options.clearError();
    options.report({ mode, loading: true });
    try {
      const mount = await options.load(mode);
      if (disposed || current !== generation) return;
      const cleanup = mount(options.element);
      // A runtime failure may be reported synchronously during the first frame.
      if (disposed || current !== generation) {
        cleanup();
        return;
      }
      activeCleanup = cleanup;
      active = true;
      options.report({ mode, loading: false });
    } catch {
      if (disposed || current !== generation) return;
      fail();
    }
  };

  return {
    select,
    fail,
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      release();
      options.clearError();
    },
  };
}

export function mountWorld(element: HTMLElement): () => void {
  let errorPanel: HTMLElement | undefined;
  const clearError = () => {
    errorPanel?.remove();
    errorPanel = undefined;
  };
  const lifecycle = createRendererLifecycle({
    element,
    load: async () => (await import("./three/world3d")).mountWorld3D,
    report: status => window.dispatchEvent(new CustomEvent<RendererStatus>("kg-renderer-status", { detail: status })),
    resetInput: resetWorldInput,
    clearError,
    error: retry => {
      errorPanel = document.createElement("div");
      errorPanel.setAttribute("role", "alert");
      Object.assign(errorPanel.style, {
        position: "absolute", inset: "30% 12% auto", padding: "24px", zIndex: "5",
        background: "#25291f", color: "#f1e6c7", border: "1px solid #b0a27a", borderRadius: "8px",
        textAlign: "center", fontFamily: "sans-serif",
      });
      const text = document.createElement("p");
      text.textContent = "Não foi possível carregar o mundo 3D. Sua campanha continua salva.";
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Tentar novamente";
      button.onclick = retry;
      Object.assign(button.style, { minHeight: "44px", padding: "8px 18px", cursor: "pointer" });
      errorPanel.append(text, button);
      element.append(errorPanel);
    },
  });
  const change = (event: Event) => {
    if ((event as CustomEvent<RendererMode>).detail === "3d") void lifecycle.select("3d");
  };
  const failure = (event: Event) => {
    const message = (event as CustomEvent<{ message?: string }>).detail?.message;
    lifecycle.fail(message || LOAD_ERROR);
  };
  window.addEventListener("kg-renderer-change", change);
  window.addEventListener("kg-renderer-failure", failure);
  void lifecycle.select("3d");
  return () => {
    window.removeEventListener("kg-renderer-change", change);
    window.removeEventListener("kg-renderer-failure", failure);
    lifecycle.dispose();
  };
}
