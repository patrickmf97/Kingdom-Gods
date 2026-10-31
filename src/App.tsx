import { useEffect, useRef, useState, useReducer } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  Coins,
  Compass,
  Feather,
  Flag,
  Heart,
  Home,
  Leaf,
  Map,
  Menu,
  Moon,
  Play,
  Save,
  RotateCcw,
  RotateCw,
  Settings2,
  Shield,
  ShoppingBag,
  Sparkles,
  Sun,
  Sword,
  Users,
  UserRound,
  Volume2,
  VolumeX,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { Blessing, Creation, Dialog, GameState, Panel } from "./types";
import { BLESSINGS, ITEMS, OBJECTS, WORLD_H, WORLD_W } from "./data";
import { store } from "./simulation";
import { objectsForZone, regionForZone, resourceNode, WILDERNESS_ROADS } from "./regions";
import { MAX_CAMPAIGN_BYTES, parseCampaign } from "./campaign-files";
import { getRendererMode, mountWorld, worldInput } from "./world";
import { GamePanel, ItemIcon, Portrait, LocalMapTerrain, mapObjectsForState } from "./Panels";
import { interiorForZone } from "./interiors";
import { StormWarning, WeatherChip } from "./WeatherPanel";
import { weatherFor } from "./weather";
import { startSoundscape, type Soundscape } from "./soundscape";
import "./three.css";

function Sigil({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M24 2 43 13v22L24 46 5 35V13Z"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path d="m12 17 5 12h14l5-12-9 5-3-11-3 11Z" fill="currentColor" />
      <path d="M17 33h14M24 4v4M8 13l4 2M40 13l-4 2" stroke="currentColor" />
      <circle cx="24" cy="38" r="1.5" fill="currentColor" />
    </svg>
  );
}
function MiniMap({ onOpen }: { onOpen: () => void }) {
  const state = store.state;
  const region = regionForZone(state.zone);
  const local = !!interiorForZone(state.zone) || state.zone === "dungeon";
  const cave = state.zone === "mine";
  return <button className="minimap" onClick={onOpen} aria-label={`Abrir mapa de ${region.name}`}>
    <svg viewBox={`0 0 ${region.width} ${region.height}`} aria-hidden="true">
      <LocalMapTerrain state={state} compact />
      {mapObjectsForState(state).map(object => object.id === "exit" || object.kind === "portal" ? <g key={object.id} transform={`translate(${object.x} ${object.y})`}>
        <circle r={local ? 24 : cave ? 24 : 40} fill="#f4e9bd" stroke="#4d6555" strokeWidth={local || cave ? 5 : 8} />
        <path d={local || cave ? "M-12 0h24M3-9l9 9-9 9" : "M-20 0h40M5-14l15 14-15 14"} fill="none" stroke="#4d6555" strokeWidth={local || cave ? 4 : 7} />
      </g> : <circle key={object.id} cx={object.x} cy={object.y} r={local ? 12 : cave ? 15 : 28} fill={object.kind === "ore" ? "#a9bbc0" : local ? "#e5d49d" : "#926d50"} stroke={local ? "#53654a" : "none"} strokeWidth="4" />)}
      {state.npcs.filter(npc => npc.zone === state.zone).map(npc => <circle key={npc.id} cx={npc.x} cy={npc.y} r={local ? 11 : 17} fill="#66849b" stroke="#f4ebd8" strokeWidth={local ? 3 : 5} />)}
      {state.zone === "dungeon" ? state.enemies.filter(enemy => enemy.alive).map(enemy => <circle key={enemy.id} cx={enemy.x} cy={enemy.y} r="15" fill="#b56c55" />) : null}
      <circle cx={state.apostle.x} cy={state.apostle.y} r={local ? 20 : cave ? 24 : 50} fill="#f9f3d6" stroke="#2b493b" strokeWidth={local ? 6 : cave ? 8 : 18} />
    </svg>
    <span>{region.name} <ArrowUpRight size={13} /></span>
  </button>;
}

const menuItems: { id: Panel; label: string; key: string; icon: typeof Users; mobile: boolean }[] = [
  { id: "inventory", label: "Inventário", key: "I", icon: ShoppingBag, mobile: true },
  { id: "character", label: "Atributos", key: "C", icon: Shield, mobile: false },
  { id: "journal", label: "Diário", key: "J", icon: BookOpen, mobile: true },
  { id: "relations", label: "Relações", key: "R", icon: Heart, mobile: false },
  { id: "family", label: "Linhagem", key: "F", icon: Users, mobile: false },
  { id: "property", label: "Propriedades", key: "P", icon: Home, mobile: false },
  { id: "map", label: "Mapa", key: "M", icon: Map, mobile: true },
];

export default function App() {
  const [, redraw] = useReducer((v) => v + 1, 0);
  const s = store.state;
  const [panel, setPanel] = useState<Panel>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [hasSave, setHasSave] = useState(false);
  const [paused, setPaused] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [sound, setSound] = useState(false);
  const [rendererMode, setRendererMode] = useState(getRendererMode);
  const [rendererNotice, setRendererNotice] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [trackerOpen, setTrackerOpen] = useState(() => !matchMedia("(pointer: coarse), (max-width: 720px)").matches);
  const campaignInput = useRef<HTMLInputElement>(null);
  const importDialog = useRef<HTMLDivElement>(null);
  const [transferError, setTransferError] = useState("");
  const [transferBusy, setTransferBusy] = useState(false);
  const [pendingImport, setPendingImport] = useState<{ text: string; name: string; campaign: GameState } | null>(null);
  const worldEl = useRef<HTMLDivElement>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const [creation, setCreation] = useState<Creation>({
    name: "Rowan",
    surname: "Valen",
    sex: "male",
    skin: "#c9936f",
    hair: "#543b2b",
    eyes: "#729480",
    outfit: "#4d7961",
    blessing: "vigor",
  });
  const [confirmNew, setConfirmNew] = useState(false);
  useEffect(() => store.subscribe(redraw), []);
  useEffect(() => {
    const changed = () => {
      setRendererMode(getRendererMode());
      setCameraOpen(false);
      setRendererNotice("");
    };
    const status = (event: Event) => {
      const detail = (event as CustomEvent<{ mode: "3d"; loading?: boolean; message?: string }>).detail;
      if (!detail) return;
      setRendererMode(detail.mode);
      if (detail.message && !detail.loading) setRendererNotice(detail.message);
    };
    window.addEventListener("kg-renderer-change", changed);
    window.addEventListener("kg-renderer-status", status);
    return () => {
      window.removeEventListener("kg-renderer-change", changed);
      window.removeEventListener("kg-renderer-status", status);
    };
  }, []);
  useEffect(() => {
    if (panel || dialog || paused || pendingImport || transferBusy || s.phase !== "playing") setCameraOpen(false);
  }, [panel, dialog, paused, pendingImport, transferBusy, s.phase]);
  useEffect(() => {
    store
      .hasSave()
      .then(setHasSave)
      .catch(() => setHasSave(false));
    const q = matchMedia("(pointer: coarse)");
    const sync = () => setMobile(q.matches);
    sync();
    q.addEventListener("change", sync);
    return () => q.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    if (!worldEl.current) return;
    const cleanup = mountWorld(worldEl.current);
    setReady(true);
    return cleanup;
  }, []);
  useEffect(() => {
    document.body.dataset.overlay = String(
      !!panel ||
        !!dialog ||
        paused || pendingImport || transferBusy ||
        s.phase === "creation" ||
        s.phase === "dead",
    );
    return () => {
      document.body.dataset.overlay = "false";
    };
  }, [panel, dialog, paused, s.phase, pendingImport, transferBusy]);
  useEffect(() => {
    const listener = (e: Event) => {
      setDialog((e as CustomEvent<Dialog>).detail);
    };
    const panelListener = (e: Event) => {
      const requested = (e as CustomEvent<Panel>).detail;
      if ((requested === "crafting" || requested === "travelers") && store.state.phase === "playing") {
        setDialog(null);
        setPanel(requested);
        setPaused(false);
      }
    };
    document.addEventListener("kg-interact", listener);
    document.addEventListener("kg-panel", panelListener);
    return () => {
      document.removeEventListener("kg-interact", listener);
      document.removeEventListener("kg-panel", panelListener);
    };
  }, []);
  useEffect(() => {
    if (!pendingImport) return;
    const previous = document.activeElement as HTMLElement | null;
    importDialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !transferBusy) { event.preventDefault(); setPendingImport(null); }
      if (event.key !== "Tab") return;
      const buttons = [...(importDialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
      if (!buttons.length) { event.preventDefault(); return; }
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); buttons.at(-1)?.focus(); }
      else if (!event.shiftKey && (index < 0 || index === buttons.length - 1)) { event.preventDefault(); buttons[0].focus(); }
    };
    document.addEventListener("keydown", trap);
    return () => { document.removeEventListener("keydown", trap); previous?.focus(); };
  }, [pendingImport, transferBusy]);
  useEffect(() => {
    const exportFile = () => {
      try {
        setTransferError("");
        const text = store.exportCampaign();
        const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
        const link = document.createElement("a");
        const house = store.state.apostle.surname.replace(/[^a-z0-9_-]/gi, "").slice(0, 40) || "linhagem";
        link.href = url;
        link.download = `kingdom-gods-${house}-dia-${store.state.day}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        store.notify("Arquivo da campanha preparado. Guarde-o para continuar em outro navegador.", "success");
      } catch (error) {
        setTransferError(error instanceof Error ? error.message : "Não foi possível exportar a campanha.");
      }
    };
    const selectFile = () => { setTransferError(""); campaignInput.current?.click(); };
    document.addEventListener("kg-export-campaign", exportFile);
    document.addEventListener("kg-import-campaign", selectFile);
    return () => {
      document.removeEventListener("kg-export-campaign", exportFile);
      document.removeEventListener("kg-import-campaign", selectFile);
    };
  }, []);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).matches("input,select,textarea") ||
        s.phase !== "playing" || pendingImport || transferBusy
      )
        return;
      const keys: Record<string, Panel> = {
        i: "inventory",
        c: "character",
        j: "journal",
        r: "relations",
        f: "family",
        p: "property",
        m: "map",
      };
      if (!panel && !dialog && !paused && ["1", "2", "3"].includes(e.key)) {
        e.preventDefault();
        store.act(
          e.key === "1"
            ? "equip:sword"
            : e.key === "2"
              ? "use:bread"
              : "use:herb",
        );
        return;
      }
      if (e.key === "Escape") {
        if (cameraOpen) { setCameraOpen(false); return; }
        setPanel(null);
        setDialog(null);
        setPaused((v) => (panel || dialog ? false : !v));
      } else if (keys[e.key.toLowerCase()]) {
        e.preventDefault();
        setDialog(null);
        setPanel((v) =>
          v === keys[e.key.toLowerCase()] ? null : keys[e.key.toLowerCase()],
        );
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [panel, dialog, paused, s.phase, pendingImport, transferBusy, cameraOpen]);
  const soundscape = useRef<Soundscape | null>(null);
  useEffect(() => {
    if (!sound) return;
    const audio = new AudioContext();
    audioRef.current = audio;
    soundscape.current = startSoundscape(audio);
    return () => {
      soundscape.current?.stop();
      soundscape.current = null;
      audio.close();
      audioRef.current = null;
    };
  }, [sound]);
  useEffect(() => {
    if (!soundscape.current) return;
    const weather = weatherFor(s.day, s.minutes, s.zone);
    soundscape.current.update({
      daylight: Math.max(0, Math.sin((s.minutes - 360) / 1440 * Math.PI * 2)),
      outdoors: weather.outdoors,
      underground: s.zone === "mine" || s.zone === "dungeon",
      rain: weather.kind === "storm" ? 1 : weather.kind === "rain" ? .7 : 0,
    });
  }, [sound, s.zone, Math.floor(s.minutes / 10), s.day]);
  const open = (p: Panel) => {
    setDialog(null);
    setPanel((v) => (v === p ? null : p));
    setPaused(false);
  };
  const doSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      await store.save();
      setHasSave(true);
      return true;
    } catch {
      setSaveError(
        "Não foi possível salvar. Verifique o armazenamento deste navegador.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  };
  const create = () => {
    if (!creation.name.trim() || !creation.surname.trim()) return;
    store.create({
      ...creation,
      name: creation.name.trim(),
      surname: creation.surname.trim(),
    });
    setPanel(null);
    setDialog(store.interact("matron"));
    setConfirmNew(false);
  };
  const continueGame = async () => {
    if (await store.load()) {
      setPanel(null);
      setDialog(null);
      setPaused(false);
    }
  };
  const newGame = () => {
    if (hasSave && !confirmNew) {
      setConfirmNew(true);
      return;
    }
    store.startCreation();
    setConfirmNew(false);
  };
  const choose = (action: string) => {
    const next = store.choose(action);
    setDialog(next);
    if (action === "open-market") {
      setDialog(null);
      setPanel("market");
    } else if (action === "open-property") {
      setDialog(null);
      setPanel("property");
    } else if (action === "open-crafting") {
      setDialog(null);
      setPanel("crafting");
    } else if (action === "open-journal") {
      setDialog(null);
      setPanel("journal");
    } else if (action === "open-travelers") {
      open("travelers");
    }
  };
  const calendar = store.getCalendar();
  const a = s.apostle;
  const supplyOrder = s.economy.orders.find(
    (order) => order.status === "available" || order.status === "accepted",
  );
  const opportunities: { id: string; panel: Panel; icon: typeof Users; title: string; detail: string; tone: string }[] = [
    {
      id: "land",
      panel: "property",
      icon: Leaf,
      title: "Um pedaço de terra",
      detail: s.property.owned ? "Seu cultivo em Valeverde" : `Parcela do Moinho · ${s.property.cost} coroas`,
      tone: "",
    },
    {
      id: "crypt",
      panel: "journal",
      icon: Sword,
      title: "Ruídos sob as raízes",
      detail: s.quest === "accepted" ? `${s.kills}/3 guardiões derrotados` : "Uma cripta ao norte da vila",
      tone: "danger",
    },
    ...(supplyOrder
      ? [{
          id: "order",
          panel: "journal" as Panel,
          icon: ShoppingBag,
          title: supplyOrder.title,
          detail: `Prazo de ${Math.max(0, supplyOrder.deadline - s.day)} dias · ${supplyOrder.reward} coroas`,
          tone: "",
        }]
      : []),
    {
      id: "market",
      panel: "market",
      icon: Coins,
      title: "O mercado está aberto",
      detail: `Prosperidade ${s.economy.prosperity}% · trigo, farinha e pão`,
      tone: "muted",
    },
    ...(s.economy.worker
      ? [{
          id: "worker",
          panel: "relations" as Panel,
          icon: Users,
          title: "Gente que trabalha com você",
          detail: `Lina · ${s.economy.worker.wage} coroas/dia · lealdade ${s.economy.worker.loyalty}%`,
          tone: "muted",
        }]
      : []),
  ];
  const nearest = s.phase === "playing" ? store.getNearest() : null;
  const workRemaining = s.frontier.work
    ? Math.max(0, Math.ceil((s.frontier.work.duration - s.frontier.work.elapsed)
      / weatherFor(s.day, s.minutes, s.zone).gatheringRate))
    : 0;
  const animalEncounter = dialog?.options.some(option => option.action.startsWith("animal-"));
  return (
    <div
      className={`kingdom-app ${s.phase === "playing" ? "is-playing" : "is-landing"} ${mobile ? "is-mobile" : ""}`}
    >
      <main className={`world-area ${cameraOpen ? "camera-open" : ""} ${s.worldLife?.storm.warning?.zone === s.zone ? "has-storm-warning" : ""} ${dialog ? "has-dialog" : ""}`}>
          <div
            className="world-canvas"
            ref={worldEl}
            aria-label="Mundo explorável de Kingdom Gods"
          />
          <div className="world-vignette" aria-hidden="true" />
          {rendererNotice && (s.phase === "title" || s.phase === "playing") && (
            <div className="renderer-notice" role="status">
              <span>{rendererNotice}</span>
              <button onClick={() => setRendererNotice("")} aria-label="Fechar informação visual"><X size={16} /></button>
            </div>
          )}
          {s.phase === "playing" && (
            <>
              <div className="hud">
                <section className="hud-left" aria-label="Seu apóstolo e objetivos">
                  <div className="hud-plate">
                    <button className="plate-portrait" onClick={() => open("character")} aria-label="Abrir atributos do apóstolo">
                      <Portrait person={a} size={58} />
                      <span className="plate-blessing" title={`Bênção ${a.blessing === "vigor" ? "do" : "da"} ${BLESSINGS[a.blessing].name}`}>
                        <Sparkles size={10} />
                      </span>
                    </button>
                    <div className="plate-body">
                      <div className="plate-name">
                        <h2>{a.name} {a.surname}</h2>
                        <span>{a.age} anos · {a.generation}ª geração</span>
                      </div>
                      <div className="meter health" role="meter" aria-label="Vitalidade" aria-valuemin={0} aria-valuemax={a.maxHp} aria-valuenow={Math.ceil(a.hp)}>
                        <Heart size={11} aria-hidden="true" />
                        <span className="meter-track"><i style={{ width: `${Math.max(0, (a.hp / a.maxHp) * 100)}%` }} /></span>
                        <b>{Math.ceil(a.hp)}<em>/{a.maxHp}</em></b>
                      </div>
                      <div className="meter energy" role="meter" aria-label="Energia" aria-valuemin={0} aria-valuemax={a.maxStamina} aria-valuenow={Math.floor(a.stamina)}>
                        <Zap size={11} aria-hidden="true" />
                        <span className="meter-track"><i style={{ width: `${Math.max(0, (a.stamina / a.maxStamina) * 100)}%` }} /></span>
                        <b>{Math.floor(a.stamina)}<em>/{a.maxStamina}</em></b>
                      </div>
                    </div>
                    <button className="plate-purse" onClick={() => open("inventory")} aria-label={`${s.gold} coroas. Abrir inventário`}>
                      <Coins size={13} aria-hidden="true" />
                      <b>{s.gold}</b>
                    </button>
                  </div>
                  <div className={`hud-tracker ${trackerOpen ? "open" : ""}`}>
                    <button className="tracker-toggle" aria-expanded={trackerOpen} aria-controls="hud-tracker-list" onClick={() => setTrackerOpen((v) => !v)}>
                      <Feather size={13} aria-hidden="true" />
                      <span>Objetivos</span>
                      <small>{opportunities.length + 1}</small>
                      <ChevronDown size={14} aria-hidden="true" className="tracker-chevron" />
                    </button>
                    {trackerOpen && (
                      <div className="tracker-list" id="hud-tracker-list">
                        <button className="tracker-main" onClick={() => open("journal")}>
                          <span className="tracker-chapter">Capítulo I · Um novo começo</span>
                          <b>{s.intro ? "Além dos portões" : "O mundo à sua espera"}</b>
                          <small>
                            {s.intro
                              ? "Converse com Madre Elara. Hoje, aos 16 anos, você deixa o orfanato."
                              : "Cultive uma terra, faça amizades ou siga a estrada."}
                          </small>
                        </button>
                        {opportunities.map((item) => (
                          <button key={item.id} className={`tracker-item ${item.tone}`} onClick={() => open(item.panel)}>
                            <item.icon size={14} aria-hidden="true" />
                            <span>
                              <b>{item.title}</b>
                              <small>{item.detail}</small>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
                <section className="hud-center" aria-label="Região atual">
                  <div className="hud-region">
                    <small>
                      {s.zone === "wilderness" ? "Terras de Auren" : s.zone === "mine" ? "Galerias de ferro" : s.zone === "dungeon" ? "Território selvagem" : "Reino de Auren"}
                    </small>
                    <h1>{regionForZone(s.zone).name}</h1>
                    <span className={`region-state ${s.zone === "dungeon" ? "danger" : ""}`}>
                      {s.zone === "dungeon" ? <Sword size={11} aria-hidden="true" /> : <Shield size={11} aria-hidden="true" />}
                      {s.zone === "dungeon" ? "Área perigosa" : s.zone === "mine" ? "Extração pacífica" : s.zone === "wilderness" ? "Exploração livre" : "Terras protegidas"}
                    </span>
                  </div>
                  <StormWarning state={s} />
                  {s.frontier.work && (
                    <div className="work-progress-hud" role="status" aria-live="polite">
                      <div><strong>{resourceNode(s.frontier.work.nodeId)?.label || "Trabalhando"}</strong><span>{workRemaining} s</span></div>
                      <progress aria-label="Progresso do trabalho" value={s.frontier.work.elapsed} max={s.frontier.work.duration} />
                      <button onClick={() => store.act("cancel-work")}>Interromper</button>
                    </div>
                  )}
                </section>
                <section className="hud-right" aria-label="Tempo, mapa e opções">
                  <div className="hud-toolbar">
                    {rendererMode === "3d" && !panel && !dialog && !paused && !pendingImport && !transferBusy && (
                      <button className="tool-button" aria-label="Controles da câmera" title="Câmera" aria-expanded={cameraOpen} aria-controls="world-camera-controls" onClick={() => setCameraOpen((value) => !value)}>
                        <Camera size={17} />
                      </button>
                    )}
                    <button className="tool-button" onClick={doSave} title="Salvar campanha" aria-label="Salvar campanha">
                      {saving ? <span className="spinner" /> : <Save size={17} />}
                    </button>
                    <button className={`tool-button ${sound ? "active" : ""}`} onClick={() => setSound((v) => !v)} title="Ambiente sonoro" aria-label={sound ? "Desativar ambiente sonoro" : "Ativar ambiente sonoro"}>
                      {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
                    </button>
                    <button className="tool-button" onClick={() => open("help")} title="Controles e ajustes" aria-label="Controles e informações">
                      <Settings2 size={17} />
                    </button>
                    <button className="tool-button tool-menu" onClick={() => { setPanel(null); setDialog(null); setPaused((v) => !v); }} title="Menu (Esc)" aria-label={paused ? "Retomar" : "Pausar e abrir menu"}>
                      {paused ? <Play size={17} /> : <Menu size={18} />}
                    </button>
                  </div>
                  {cameraOpen && rendererMode === "3d" && !panel && !dialog && !paused && !pendingImport && !transferBusy && (
                    <div className="camera-controls" id="world-camera-controls" role="group" aria-label="Ajustar câmera 3D">
                      {([
                        { action: "left", label: "Girar câmera à esquerda", Icon: RotateCcw },
                        { action: "right", label: "Girar câmera à direita", Icon: RotateCw },
                        { action: "in", label: "Aproximar câmera", Icon: ZoomIn },
                        { action: "out", label: "Afastar câmera", Icon: ZoomOut },
                        { action: "character", label: "Ver personagem de perto", Icon: UserRound },
                        { action: "reset", label: "Restaurar câmera", Icon: Compass },
                      ] as const).map(({ action, label, Icon }) => (
                        <button key={action} title={label} aria-label={label} onClick={() => document.dispatchEvent(new CustomEvent("kg-camera", { detail: { action } }))}><Icon size={18} /></button>
                      ))}
                    </div>
                  )}
                  <div className="hud-clock">
                    <div className="clock-dial" aria-hidden="true" style={{ ["--day" as string]: `${(s.minutes / 1440) * 360}deg` }}>
                      {s.minutes >= 360 && s.minutes < 1140 ? <Sun size={15} /> : <Moon size={14} />}
                    </div>
                    <div className="clock-text">
                      <strong>{calendar.hour}</strong>
                      <span>Dia {calendar.day} de {calendar.month} · Ano {calendar.year}</span>
                    </div>
                    <WeatherChip state={s} season={calendar.season} onOpen={() => open("journal")} />
                  </div>
                  <MiniMap onOpen={() => open("map")} />
                </section>
                <section className="hud-feed notification-feed" aria-live="polite" style={{ visibility: s.frontier.work ? "hidden" : undefined }}>
                  {s.messages.slice(-3).map((m, i, list) => (
                    <div
                      className={`world-notice notice-${m.type} ${i === list.length - 1 ? "latest" : ""}`}
                      key={m.id}
                    >
                      <span className="notice-mark" />
                      <span>{m.text}</span>
                    </div>
                  ))}
                </section>
                <section className="hud-bottom" aria-label="Ações rápidas">
                  {nearest &&
                    nearest.distance < 120 &&
                    !panel &&
                    !dialog &&
                    !mobile && (
                      <button
                        className="interact-prompt"
                        onClick={() => worldInput.interact()}
                      >
                        <kbd>E</kbd>
                        <span>{nearest.label}</span>
                      </button>
                    )}
                  {!dialog && (
                    <div className="hud-dock">
                      <div className="hotbar" role="group" aria-label="Itens rápidos">
                        <button className={`hotbar-slot ${a.equipment === "sword" ? "equipped" : ""}`} onClick={() => store.act("equip:sword")} title="Equipar espada">
                          <kbd>1</kbd>
                          <ItemIcon id="sword" size={28} />
                          <small>{a.equipment === "sword" ? "Equipada" : "Espada"}</small>
                        </button>
                        <button className="hotbar-slot" onClick={() => store.act("use:bread")} title="Comer pão">
                          <kbd>2</kbd>
                          <ItemIcon id="bread" size={28} />
                          <b>{s.inventory.bread}</b>
                          <small>Pão</small>
                        </button>
                        <button className="hotbar-slot" onClick={() => store.act("use:herb")} title="Usar erva">
                          <kbd>3</kbd>
                          <ItemIcon id="herb" size={28} />
                          <b>{s.inventory.herb}</b>
                          <small>Erva</small>
                        </button>
                      </div>
                      <i className="dock-divider" aria-hidden="true" />
                      <nav className="dock-menu" aria-label="Menus do jogo">
                        {menuItems.map((item) => (
                          <button
                            key={item.id}
                            className={`dock-button ${panel === item.id ? "active" : ""} ${item.mobile ? "keep-mobile" : ""}`}
                            onClick={() => open(item.id)}
                            title={`${item.label} (${item.key})`}
                            aria-label={item.label}
                          >
                            <item.icon size={18} aria-hidden="true" />
                            <kbd>{item.key}</kbd>
                          </button>
                        ))}
                        <button className="dock-button keep-mobile mobile-only" onClick={() => { setPanel(null); setDialog(null); setPaused(true); }} aria-label="Abrir menu">
                          <Menu size={18} aria-hidden="true" />
                        </button>
                      </nav>
                    </div>
                  )}
                </section>
                {!mobile && !panel && !dialog && (
                  <section className="hud-hints control-hints" aria-label="Controles">
                    <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> mover</span>
                    <span><kbd>E</kbd> interagir</span>
                    <span><kbd>Espaço</kbd> atacar</span>
                    <span><kbd>Shift</kbd> esquivar</span>
                  </section>
                )}
              </div>
              {mobile && !panel && !dialog && !paused && (
                <MobileControls
                  onAttack={() => worldInput.attack()}
                  onInteract={() => worldInput.interact()}
                  onDodge={() => worldInput.dodge()}
                />
              )}
              {dialog && (
                <div className="dialog-box" role="dialog" aria-label={`Conversa com ${dialog.name}`}>
                  <div className="dialog-speaker">
                    {!animalEncounter && dialog.speaker ? <span className="dialog-portrait">
                      <Portrait person={dialog.speaker} size={64} />
                    </span> : null}
                    <div>
                      <small>{dialog.role}</small>
                      <h3>{dialog.name}</h3>
                    </div>
                    <button
                      className="icon-button"
                      onClick={() => setDialog(null)}
                      aria-label="Fechar diálogo"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <p>{dialog.text}</p>
                  <div className="dialog-options">
                    {dialog.options.map((o, i) => (
                      <button
                        key={i}
                        disabled={o.disabled}
                        onClick={() => choose(o.action)}
                      >
                        <span className="option-index">{i + 1}</span>
                        <span>{o.label}</span>
                        <ArrowRight size={14} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {paused && !panel && (
                <div className="pause-overlay" role="dialog" aria-modal="true" aria-labelledby="pause-title">
                  <div className="pause-window">
                    <div className="pause-brand">
                      <Sigil size={44} />
                      <span>KINGDOM <b>GODS</b></span>
                    </div>
                    <h2 id="pause-title">Um instante de silêncio</h2>
                    <p>O mundo aguarda seu retorno.</p>
                    <div className="pause-house">
                      <Portrait person={a} size={44} />
                      <span>
                        <b>{a.name} {a.surname}</b>
                        <small>Casa {a.surname} · {a.generation}ª geração · {s.gold} coroas</small>
                      </span>
                    </div>
                    {saveError && (
                      <p className="save-error" role="alert">
                        {saveError}
                      </p>
                    )}
                    <button className="primary-button" onClick={() => setPaused(false)}>
                      <Play size={16} /> Continuar jornada
                    </button>
                    <nav className="pause-grid" aria-label="Menus do jogo">
                      {[...menuItems, { id: "help" as Panel, label: "Ajustes", key: "?", icon: Settings2, mobile: false }].map((item) => (
                        <button key={item.id} onClick={() => open(item.id)}>
                          <item.icon size={17} aria-hidden="true" />
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </nav>
                    <div className="pause-actions">
                      <button className="secondary-button" onClick={doSave}>
                        {saving ? <span className="spinner" /> : <Save size={15} />} Salvar campanha
                      </button>
                      <button
                        className="text-link"
                        onClick={async () => {
                          if (await doSave()) {
                            store.returnTitle();
                            setPaused(false);
                            setHasSave(true);
                          }
                        }}
                      >
                        Voltar à tela inicial
                      </button>
                    </div>
                    <blockquote className="pause-memory">
                      “{a.memories.length
                        ? a.memories[a.memories.length - 1].text
                        : "A estrada será longa. Mas, pela primeira vez, ela é minha."}”
                      <cite>Ecos da memória · {s.savedAt ? "progresso salvo neste navegador" : "salvamento automático ativo"}</cite>
                    </blockquote>
                  </div>
                </div>
              )}
            </>
          )}
          {s.phase === "title" && (
            <div className="title-overlay">
              <div className="title-grain" />
              <header className="title-topbar">
                <div className="title-brand">
                  <Sigil size={34} />
                  <span>
                    KINGDOM <b>GODS</b>
                    <small>Uma vida. Um legado.</small>
                  </span>
                </div>
                <div className="title-topbar-actions">
                  <span className="local-badge">
                    <i /> Modo local <span className="badge-version">α 0.13 · {rendererMode.toUpperCase()}</span>
                  </span>
                  <button className="icon-button" onClick={() => open("help")} aria-label="Controles e informações">
                    <Settings2 size={18} />
                  </button>
                </div>
              </header>
              <div className="title-copy">
                <span className="title-overline">
                  <span /> {rendererMode === "3d" ? "UM MUNDO MEDIEVAL EM 3D" : "UM RPG SANDBOX DE FANTASIA MEDIEVAL"}
                </span>
                <h1>
                  Um deus.
                  <br />
                  Uma vida.
                  <br />
                  <em>Infinitas histórias.</em>
                </h1>
                <p>
                  Guie um apóstolo. Conheça um mundo vivo.
                  <br />
                  Deixe um legado que atravesse gerações.
                </p>
                <div className="title-buttons">
                  <button
                    className="primary-button"
                    onClick={hasSave ? continueGame : newGame}
                  >
                    {hasSave
                      ? "Continuar minha história"
                      : "Criar meu apóstolo"}
                    <ArrowRight size={17} />
                  </button>
                  {hasSave && (
                    <button className="secondary-button" onClick={newGame}>
                      {confirmNew
                        ? "Iniciar uma nova linhagem?"
                        : "Nova linhagem"}
                      <Feather size={16} />
                    </button>
                  )}
                </div>
                <button className="text-link title-import-link" onClick={() => document.dispatchEvent(new CustomEvent("kg-import-campaign"))}>Importar campanha de outro dispositivo</button>
                {confirmNew && (
                  <p className="new-caution">
                    A nova campanha substituirá o salvamento quando você criar o
                    apóstolo.
                  </p>
                )}
                <div className="title-details">
                  <span>
                    <Leaf size={16} /> Viver e cultivar
                  </span>
                  <span>
                    <Sword size={16} /> Explorar e lutar
                  </span>
                  <span>
                    <Users size={16} /> Criar vínculos
                  </span>
                </div>
              </div>
              <div className="title-world-caption">
                <span className="live-dot" />
                <span>VALEVERDE, REINO DE AUREN</span>
                <small>Todo legado começa com uma escolha.</small>
              </div>
              <footer className="title-footer">
                <span>
                  ALPHA 0.13 · CADA ESCOLHA DEIXA MARCAS <i /> MUNDO LOCAL PERSISTENTE
                </span>
                <button onClick={() => open("help")}>
                  Conheça o mundo <ArrowUpRight size={13} />
                </button>
              </footer>
            </div>
          )}
          {s.phase === "creation" && (
            <div className="creation-overlay">
              <div className="creation-window">
                <button
                  className="creation-back text-link"
                  onClick={() => store.returnTitle()}
                >
                  ← Voltar
                </button>
                <div className="creation-heading">
                  <span className="eyebrow">O INÍCIO DE UMA LINHAGEM</span>
                  <h1>Escolha quem viverá sua história.</h1>
                  <p>
                    Uma divindade. Um apóstolo. Uma vida que pertence a ele.
                  </p>
                </div>
                <div className="creation-grid">
                  <div className="creation-preview">
                    <div className="preview-stars">
                      <Sparkles size={24} />
                    </div>
                    <div className="character-platform">
                      <Portrait person={{ ...a, ...creation }} size={188} />
                    </div>
                    <h2>
                      {creation.name || "Seu apóstolo"} {creation.surname}
                    </h2>
                    <span>16 anos · órfão de Valeverde</span>
                    <p>
                      Hoje, os portões de Santa Elara se abrem para um futuro
                      ainda não escrito.
                    </p>
                    <div className="origin-badge">
                      <Home size={15} /> Origem: Orfanato de Santa Elara
                    </div>
                  </div>
                  <div className="creation-form">
                    <div className="form-row">
                      <label>
                        Nome
                        <input
                          maxLength={18}
                          value={creation.name}
                          onChange={(e) =>
                            setCreation({ ...creation, name: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Sobrenome da casa
                        <input
                          maxLength={18}
                          value={creation.surname}
                          onChange={(e) =>
                            setCreation({
                              ...creation,
                              surname: e.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                    <div className="form-row">
                      <label>
                        Sexo
                        <select
                          value={creation.sex}
                          onChange={(e) =>
                            setCreation({ ...creation, sex: e.target.value })
                          }
                        >
                          <option value="male">Masculino</option>
                          <option value="female">Feminino</option>
                        </select>
                      </label>
                      <label>
                        Vestimenta
                        <div className="color-options">
                          {["#4d7961", "#98724f", "#5b6e91", "#8d5464"].map(
                            (c) => (
                              <button
                                key={c}
                                style={{ background: c }}
                                className={
                                  creation.outfit === c ? "selected" : ""
                                }
                                aria-label={`Vestimenta ${c}`}
                                onClick={() =>
                                  setCreation({ ...creation, outfit: c })
                                }
                              >
                                {creation.outfit === c && <Check size={14} />}
                              </button>
                            ),
                          )}
                        </div>
                      </label>
                    </div>
                    <div className="form-row appearance">
                      <label>
                        Tom de pele
                        <div className="color-options">
                          {["#eed0ac", "#c9936f", "#9e6e4a", "#644332"].map(
                            (c) => (
                              <button
                                key={c}
                                style={{ background: c }}
                                className={
                                  creation.skin === c ? "selected" : ""
                                }
                                aria-label={`Pele ${c}`}
                                onClick={() =>
                                  setCreation({ ...creation, skin: c })
                                }
                              >
                                {creation.skin === c && <Check size={13} />}
                              </button>
                            ),
                          )}
                        </div>
                      </label>
                      <label>
                        Cabelos
                        <div className="color-options">
                          {["#543b2b", "#c49b52", "#2f2925", "#9b4f30"].map(
                            (c) => (
                              <button
                                key={c}
                                style={{ background: c }}
                                className={
                                  creation.hair === c ? "selected" : ""
                                }
                                aria-label={`Cabelos ${c}`}
                                onClick={() =>
                                  setCreation({ ...creation, hair: c })
                                }
                              >
                                {creation.hair === c && <Check size={13} />}
                              </button>
                            ),
                          )}
                        </div>
                      </label>
                      <label>
                        Olhos
                        <div className="color-options">
                          {["#729480", "#678da0", "#704f35"].map((c) => (
                            <button
                              key={c}
                              style={{ background: c }}
                              className={creation.eyes === c ? "selected" : ""}
                              aria-label={`Olhos ${c}`}
                              onClick={() =>
                                setCreation({ ...creation, eyes: c })
                              }
                            >
                              {creation.eyes === c && <Check size={13} />}
                            </button>
                          ))}
                        </div>
                      </label>
                    </div>
                    <div className="blessing-heading">
                      <Sparkles size={15} />
                      <h3>Conceda uma bênção divina</h3>
                      <span>ESCOLHA UMA</span>
                    </div>
                    <div className="blessing-options">
                      {(Object.keys(BLESSINGS) as Blessing[]).map((b) => {
                        const blessing = BLESSINGS[b];
                        const Icon =
                          b === "vigor"
                            ? Shield
                            : b === "wisdom"
                              ? BookOpen
                              : Coins;
                        return (
                          <button
                            key={b}
                            className={`blessing-option ${creation.blessing === b ? "selected" : ""}`}
                            onClick={() =>
                              setCreation({ ...creation, blessing: b })
                            }
                          >
                            <span
                              className="blessing-icon"
                              style={{ color: blessing.color }}
                            >
                              <Icon size={22} />
                            </span>
                            <span>
                              <b>{blessing.name}</b>
                              <small>{blessing.subtitle}</small>
                              <p>{blessing.description}</p>
                            </span>
                            <span className="radio-mark">
                              {creation.blessing === b && <i />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <button
                      className="primary-button create-submit"
                      disabled={
                        !creation.name.trim() || !creation.surname.trim()
                      }
                      onClick={create}
                    >
                      Dar início à minha história
                      <ArrowRight size={17} />
                    </button>
                    <span className="creation-note">
                      Seu apóstolo tem vontades próprias. A morte é permanente.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
          {s.phase === "dead" && (
            <div className="death-overlay">
              <div className="death-window">
                <Feather size={38} />
                <span className="eyebrow">O FIM DE UMA VIDA</span>
                <h1>
                  {a.name} {a.surname}
                </h1>
                <p>
                  Seu apóstolo morreu aos {a.age} anos. O que viveu permanece
                  nas memórias da casa.
                </p>
                {s.family.filter(
                  (p) =>
                    p.alive &&
                    (p.id === a.partnerId || p.parents.includes(a.id)),
                ).length ? (
                  <>
                    <h3>Escolha o próximo apóstolo da família</h3>
                    {s.family
                      .filter(
                        (p) =>
                          p.alive &&
                          (p.id === a.partnerId || p.parents.includes(a.id)),
                      )
                      .map((p) => (
                        <button
                          className="successor"
                          key={p.id}
                          onClick={() => {
                            store.act(`succeed:${p.id}`);
                            setDialog(null);
                          }}
                        >
                          <Portrait person={p} size={48} />
                          <span>
                            <b>
                              {p.name} {p.surname}
                            </b>
                            <small>
                              {p.age} anos{" "}
                              {p.age < 16
                                ? "· sob tutela"
                                : "· sucessor elegível"}
                            </small>
                          </span>
                          <ArrowRight size={17} />
                        </button>
                      ))}
                  </>
                ) : (
                  <>
                    <p className="death-final">
                      Não há parceiro ou descendentes vivos. A linhagem chegou
                      ao fim. Bens, recursos e vantagens serão perdidos.
                    </p>
                    <button
                      className="primary-button"
                      onClick={() => {
                        store.reset();
                        store.startCreation();
                        setHasSave(false);
                      }}
                    >
                      Iniciar uma nova linhagem
                      <ArrowRight size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
      </main>
      {panel && (
        <GamePanel panel={panel} state={s} onClose={() => setPanel(null)} />
      )}
      <input ref={campaignInput} type="file" accept=".json,application/json" hidden aria-label="Arquivo de campanha" onChange={async event => {
        const file = event.target.files?.[0]; event.target.value = "";
        if (!file) return;
        setTransferBusy(true); setTransferError("");
        try {
          if (file.size > MAX_CAMPAIGN_BYTES) throw new Error("O arquivo excede o limite de 2 MiB.");
          const text = await file.text();
          const campaign = parseCampaign(text);
          setPendingImport({ text, name: file.name, campaign });
        } catch (error) {
          setTransferError(error instanceof Error ? error.message : "Não foi possível ler esta campanha.");
        } finally { setTransferBusy(false); }
      }} />
      {transferError && <div className="campaign-transfer-error" role="alert"><span>{transferError}</span><button aria-label="Fechar aviso de transferência" onClick={() => setTransferError("")}><X size={18} /></button></div>}
      {pendingImport && <div ref={importDialog} className="campaign-import-overlay" role="dialog" aria-modal="true" aria-labelledby="campaign-import-title">
        <section>
          <span className="eyebrow">CONTINUAR UMA LINHAGEM</span>
          <h2 id="campaign-import-title">Importar campanha</h2>
          <p><strong>{pendingImport.campaign.apostle.name} {pendingImport.campaign.apostle.surname}</strong> · {pendingImport.campaign.apostle.age} anos</p>
          <p>{regionForZone(pendingImport.campaign.zone).name} · dia {pendingImport.campaign.day} · {pendingImport.campaign.gold} coroas</p>
          <small>{pendingImport.name}</small>
          <p>{s.started || hasSave ? "Este arquivo substituirá a campanha atual neste navegador. O salvamento anterior ficará no backup local." : "A campanha será salva neste navegador para você continuar a jornada."}</p>
          {!pendingImport.campaign.apostle.alive && <p>A vida deste apóstolo terminou. A importação preserva as regras de sucessão e morte permanente.</p>}
          <div>
            <button className="primary-button" disabled={transferBusy} onClick={async () => {
              setTransferBusy(true);
              try {
                await store.importCampaign(pendingImport.text);
                setPendingImport(null); setPanel(null); setDialog(null); setPaused(false); setHasSave(true); setTransferError("");
              } catch (error) { setTransferError(error instanceof Error ? error.message : "Não foi possível gravar a campanha. O progresso atual foi mantido."); }
              finally { setTransferBusy(false); }
            }}>{transferBusy ? "Importando…" : "Confirmar importação"}</button>
            <button className="secondary-button" disabled={transferBusy} onClick={() => setPendingImport(null)}>Cancelar</button>
          </div>
        </section>
      </div>}
      {!ready && (
        <div className="loading-cover">
          <Sigil size={45} />
          <p>O mundo desperta…</p>
        </div>
      )}
    </div>
  );
}

function MobileControls({
  onAttack,
  onInteract,
  onDodge,
}: {
  onAttack: () => void;
  onInteract: () => void;
  onDodge: () => void;
}) {
  const stick = useRef<HTMLDivElement>(null);
  const [point, setPoint] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  const update = (e: React.PointerEvent) => {
    const rect = stick.current!.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2),
      dy = e.clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(dx, dy);
    const scale = len > 38 ? 38 / len : 1;
    setPoint({ x: dx * scale, y: dy * scale });
    worldInput.x = dx / Math.max(38, len);
    worldInput.y = dy / Math.max(38, len);
  };
  const stop = () => {
    setActive(false);
    setPoint({ x: 0, y: 0 });
    worldInput.x = 0;
    worldInput.y = 0;
  };
  useEffect(() => stop, []);
  return (
    <div className="mobile-controls">
      <div
        ref={stick}
        className="joystick"
        role="application"
        aria-label="Joystick de movimento"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setActive(true);
          update(e);
        }}
        onPointerMove={(e) => {
          if (active) update(e);
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
      >
        <div
          className="joystick-thumb"
          style={{ transform: `translate(${point.x}px,${point.y}px)` }}
        />
      </div>
      <div className="mobile-action-group">
        <button
          className="mobile-dodge"
          onClick={onDodge}
          aria-label="Esquivar"
        >
          <Zap size={20} />
          <small>Esquivar</small>
        </button>
        <button
          className="mobile-attack"
          onClick={onAttack}
          aria-label="Atacar"
        >
          <Sword size={26} />
        </button>
        <button
          className="mobile-interact"
          onClick={onInteract}
          aria-label="Interagir"
        >
          <Heart size={20} />
          <small>Interagir</small>
        </button>
      </div>
    </div>
  );
}
