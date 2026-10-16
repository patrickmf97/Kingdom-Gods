import { resetWorldInput } from "./world-input";

export { worldInput } from "./world-input";

export type RendererMode = "3d" | "2d";
export type RendererMount = (element: HTMLElement) => () => void;
export type RendererStatus = { mode: RendererMode; loading?: boolean; message?: string };

const PREFERENCE_KEY = "kingdom-gods:renderer";
let memoryPreference: RendererMode = "3d";

export function getRendererMode(): RendererMode {
  try {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(PREFERENCE_KEY);
      return stored === "2d" ? "2d" : "3d";
    }
  } catch { /* Browsers may disable localStorage; keep the current session usable. */ }
  return memoryPreference;
}

function rememberRenderer(mode: RendererMode): void {
  memoryPreference = mode;
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(PREFERENCE_KEY, mode);
  } catch { /* Renderer preference is optional and separate from the campaign. */ }
}

export function setRendererMode(mode: RendererMode): void {
  if (mode !== "3d" && mode !== "2d") return;
  rememberRenderer(mode);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<RendererMode>("kg-renderer-change", { detail: mode }));
  }
}

/** A renderer owns the simulation clock only while it is mounted. */
export function createRendererLifecycle(options: {
  element: HTMLElement;
  load: (mode: RendererMode) => Promise<RendererMount>;
  report: (status: RendererStatus) => void;
  fallback: (mode: RendererMode) => void;
  resetInput: () => void;
  error: (retry: () => void) => void;
  clearError: () => void;
}) {
  let generation = 0;
  let disposed = false;
  let activeCleanup: (() => void) | undefined;
  let activeMode: RendererMode | undefined;
  let requestedMode: RendererMode | undefined;

  const select = async (mode: RendererMode, message?: string): Promise<void> => {
    if (disposed || (requestedMode === mode && activeMode === mode)) return;
    const current = ++generation;
    requestedMode = mode;
    activeMode = undefined;
    const disposePrevious = activeCleanup;
    activeCleanup = undefined;
    disposePrevious?.();
    options.resetInput();
    options.clearError();
    options.report({ mode, loading: true, ...(message ? { message } : {}) });
    try {
      const mount = await options.load(mode);
      if (disposed || current !== generation) return;
      const cleanup = mount(options.element);
      // A renderer can synchronously trigger a preference change while mounting.
      if (disposed || current !== generation) {
        cleanup();
        return;
      }
      activeCleanup = cleanup;
      activeMode = mode;
      options.report({ mode, loading: false, ...(message ? { message } : {}) });
    } catch {
      if (disposed || current !== generation) return;
      options.resetInput();
      if (mode === "3d") {
        options.fallback("2d");
        await select("2d", "O visual 3D não pôde iniciar neste navegador. O mundo continua em 2D; sua campanha foi preservada.");
      } else {
        options.report({ mode, loading: false, message: "Não foi possível carregar o mundo. Sua campanha continua salva. Tente novamente." });
        options.error(() => { void select(mode); });
      }
    }
  };

  return {
    select,
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      const cleanup = activeCleanup;
      activeCleanup = undefined;
      activeMode = undefined;
      cleanup?.();
      options.resetInput();
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
    load: async (mode) => mode === "3d"
      ? (await import("./three/world3d")).mountWorld3D
      : (await import("./world2d")).mountWorld,
    report: (status) => window.dispatchEvent(new CustomEvent<RendererStatus>("kg-renderer-status", { detail: status })),
    fallback: rememberRenderer,
    resetInput: resetWorldInput,
    clearError,
    error: (retry) => {
      errorPanel = document.createElement("div");
      errorPanel.setAttribute("role", "alert");
      Object.assign(errorPanel.style, {
        position: "absolute", inset: "30% 12% auto", padding: "24px", zIndex: "5",
        background: "#25291f", color: "#f1e6c7", border: "1px solid #b0a27a", borderRadius: "8px",
        textAlign: "center", fontFamily: "sans-serif",
      });
      const text = document.createElement("p");
      text.textContent = "Não foi possível carregar o mundo. Sua campanha continua salva.";
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
    const mode = (event as CustomEvent<RendererMode>).detail;
    if (mode === "3d" || mode === "2d") void lifecycle.select(mode);
  };
  const failure = (event: Event) => {
    const message = (event as CustomEvent<{ message?: string }>).detail?.message;
    rememberRenderer("2d");
    void lifecycle.select("2d", message || "O visual 3D foi interrompido. A campanha continua em 2D.");
  };
  window.addEventListener("kg-renderer-change", change);
  window.addEventListener("kg-renderer-failure", failure);
  void lifecycle.select(getRendererMode());
  return () => {
    window.removeEventListener("kg-renderer-change", change);
    window.removeEventListener("kg-renderer-failure", failure);
    lifecycle.dispose();
  };
}
