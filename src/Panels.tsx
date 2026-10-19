import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Coins,
  Compass,
  Crown,
  Flower2,
  Hammer,
  Heart,
  HelpCircle,
  House,
  Leaf,
  MapPin,
  Package,
  ScrollText,
  Shield,
  ShoppingBasket,
  Sprout,
  Sword,
  Users,
  Wheat,
  X,
} from "lucide-react";
import type { GameState, ItemId, Panel, Person } from "./types";
import {
  ATTR_NAMES,
  BLESSINGS,
  ITEMS,
  OBJECTS,
  SKILL_NAMES,
} from "./data";
import { store } from "./simulation";
import type { PersistentGameState } from "./simulation";
import { cropProfile, RECIPES } from "./economy";
import { marketQuote } from "./market";
import { civicBudget } from "./civic-budget";
import { findPath, objectApproach } from "./navigation";
import type { NavigationContext } from "./navigation";
import { objectsForZone, regionForZone, resourceNode, RESOURCE_NODES, WILDERNESS_ROADS } from "./regions";
import { ToolsPanel, FrontierJobs, FamilyEducation, FamilyHistory, NpcNeeds, CampaignTransfer } from "./ExpansionPanels";
import { TerritoryPanels } from "./TerritoryPanels";
import { estateBuildings, estateSolid } from "./territory-data";
import { entranceForObject, interiorAllowed, interiorForZone } from "./interiors";
import { HIGHLAND_BUILDINGS, HIGHLAND_RIDGES, HIGHLAND_ROADS } from "./highlands";
import { WeatherPanel } from "./WeatherPanel";
import { weatherFor } from "./weather";
import "./panels.css";

const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
const ITEM_GROUP: Record<ItemId, string> = {
  bread: "Provisões",
  herb: "Provisões",
  sword: "Equipamento",
  wood: "Materiais",
  stone: "Materiais",
  wheat: "Materiais",
  flour: "Materiais",
  seed: "Materiais",
  ore: "Materiais",
};
const PANEL_META = {
  inventory: {
    title: "Seu inventário",
    eyebrow: "Tudo que você carrega",
    icon: Package,
  },
  character: {
    title: "Seu apóstolo",
    eyebrow: "Uma vida em construção",
    icon: Shield,
  },
  journal: {
    title: "Diário de jornada",
    eyebrow: "O que o tempo guarda",
    icon: BookOpen,
  },
  relations: {
    title: "Laços de Valeverde",
    eyebrow: "Pessoas, histórias e encontros",
    icon: Heart,
  },
  family: {
    title: "Sua linhagem",
    eyebrow: "As raízes do seu legado",
    icon: Users,
  },
  property: {
    title: "Propriedades e Auren",
    eyebrow: "Terras, trabalho e reconhecimento",
    icon: House,
  },
  market: {
    title: "Mercado de Valeverde",
    eyebrow: "Comércio & provisões",
    icon: ShoppingBasket,
  },
  crafting: {
    title: "Produção de Valeverde",
    eyebrow: "Do campo à oficina",
    icon: Hammer,
  },
  map: {
    title: "Terras de Valeverde",
    eyebrow: "Explore o reino",
    icon: Compass,
  },
  help: {
    title: "Guia do viajante",
    eyebrow: "Encontre seu caminho",
    icon: HelpCircle,
  },
};

export function ItemIcon({ id, size = 42 }: { id: ItemId; size?: number }) {
  const strokes = {
    stroke: "#655038",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg
      className="item-illustration"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
    >
      <ellipse cx="24" cy="39" rx="15" ry="3" fill="#78664b" opacity=".1" />
      {id === "bread" ? (
        <g {...strokes}>
          <path
            d="M8 29c0-10 8-16 17-16 10 0 16 7 16 16 0 6-7 9-17 9S8 35 8 29Z"
            fill="#cda46a"
          />
          <path
            d="m17 17-3 10m11-12-4 12m12-10-4 11"
            stroke="#f4ddb6"
            strokeWidth="3"
          />
          <path d="M12 31c8 4 18 4 25 0" stroke="#b5844d" />
        </g>
      ) : null}
      {id === "wood" ? (
        <g {...strokes}>
          <path d="m8 27 23-14 10 13-23 14Z" fill="#9d754e" />
          <path d="m8 27 10 13m-4-14 23-9m-18 17 18-10" stroke="#b58d62" />
          <ellipse
            cx="13"
            cy="33"
            rx="6"
            ry="8"
            transform="rotate(-35 13 33)"
            fill="#d4b88a"
          />
          <ellipse
            cx="13"
            cy="33"
            rx="3"
            ry="4"
            transform="rotate(-35 13 33)"
            fill="none"
          />
        </g>
      ) : null}
      {id === "stone" ? (
        <g {...strokes}>
          <path d="m8 29 9-16 17 4 7 17-17 7Z" fill="#999c92" />
          <path
            d="m17 13 7 15 10-11m-26 12 16-1 17 6m-17-6v13"
            stroke="#777e76"
          />
          <path d="m18 17 5 10 7-9" stroke="#c5c6ba" />
        </g>
      ) : null}
      {id === "ore" ? (
        <g {...strokes}>
          <path d="m8 30 6-13 16-6 10 17-9 12-16-2Z" fill="#74817f" />
          <path
            d="m14 17 7 11 9-17m-9 17 10 12 9-12m-25 10 6-10 19 0"
            stroke="#475b5b"
          />
          <path
            d="m22 21 5-3 4 7-6 3Zm-9 10 5-1 3 6-5 1Z"
            fill="#c6b49a"
            stroke="none"
          />
        </g>
      ) : null}
      {id === "sword" ? (
        <g {...strokes}>
          <path d="m31 7 6 1 1 6-18 20-5-5Z" fill="#c9d0c8" />
          <path d="m34 10-17 22" stroke="#f4f5e9" />
          <path d="m11 27 12 11" stroke="#a5874e" strokeWidth="4" />
          <path d="m15 33-7 8" stroke="#765535" strokeWidth="5" />
          <path d="m5 39 5 5" stroke="#a5874e" strokeWidth="3" />
        </g>
      ) : null}
      {id === "wheat" ? (
        <g {...strokes}>
          <path d="m16 42 12-33m-7 24-5-3m8-4-5-4m8-2-4-4" stroke="#9e8149" />
          <path
            d="M28 9c-5 1-6 6-2 7 5-1 7-5 2-7Zm-9 8c-6-2-7 3-2 7l5 1c1-4-1-6-3-8Zm10 3c7-3 8 2 3 7l-7 2c0-5 1-7 4-9ZM14 27c-5-2-7 3-1 7l6 2c1-5-1-7-5-9Zm10 5c6-3 8 2 2 7l-7 2c0-5 1-7 5-9Z"
            fill="#d6b36b"
            strokeWidth="1"
          />
        </g>
      ) : null}
      {id === "seed" ? (
        <g {...strokes}>
          <path d="m17 12-4-4h22l-5 5 7 22c1 7-26 7-25 0Z" fill="#cec0a0" />
          <path d="M17 12h13m-12 4h10" stroke="#896f4d" />
          <path
            d="M24 33V21m0 7c-7 0-8-7-8-7 7 0 8 7 8 7Zm0-3c7 0 8-7 8-7-7 0-8 7-8 7Z"
            fill="#78895e"
            stroke="#68794e"
          />
        </g>
      ) : null}
      {id === "flour" ? (
        <g {...strokes}>
          <path d="m17 12-3-5h20l-4 5 7 23c1 7-27 7-26 0Z" fill="#e8dcc0" />
          <path d="M17 12h13m-12 4h10" stroke="#967951" />
          <path d="M22 34h9m-8-5h7m-5 0V20m0 5-4-3m4 0 4-3" stroke="#b89858" />
          <path d="M15 31c1-5 2-8 3-11" stroke="#f8f1df" strokeWidth="3" />
        </g>
      ) : null}
      {id === "herb" ? (
        <g {...strokes}>
          <path d="m16 41 13-30m-8 20-6-9m10-1 6 2" stroke="#617852" />
          <path
            d="M15 26C6 22 8 14 8 14c9 1 11 8 7 12Zm8 1c0-9 9-13 13-9 0 8-8 11-13 9Zm2-11c-4-8 2-13 8-12 3 7-2 12-8 12Zm-5 20c6-9 15-7 17-3-4 6-11 7-17 3Z"
            fill="#819366"
          />
        </g>
      ) : null}
    </svg>
  );
}

export function Portrait({
  person,
  size = 70,
}: {
  person: Pick<Person, "skin" | "hair" | "eyes" | "outfit" | "sex">;
  size?: number;
}) {
  return (
    <svg
      className="portrait-art"
      width={size}
      height={size}
      viewBox="0 0 80 80"
      aria-hidden="true"
    >
      <rect width="80" height="80" rx="16" fill="#e9e4d5" />
      <path
        d="M10 80V67c2-17 58-17 60 0v13Z"
        fill={person.outfit || "#657358"}
      />
      <path d="M28 54v11l12 7 12-7V54" fill={person.skin || "#d6ab85"} />
      <path
        d="M19 33c0-20 8-25 22-25 15 0 21 9 21 25v28H18Z"
        fill={person.hair || "#68503a"}
      />
      <path
        d="M23 29v15c0 15 9 20 17 20s17-5 17-20V29"
        fill={person.skin || "#d6ab85"}
      />
      <path
        d="M19 32c3-16 12-23 22-23 13 0 22 7 22 25-9-4-17-10-19-15-3 8-13 12-25 13Z"
        fill={person.hair || "#68503a"}
      />
      <path
        d="M29 37h6m10 0h6"
        stroke={person.hair || "#68503a"}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="32" cy="41" r="2" fill={person.eyes || "#4c6250"} />
      <circle cx="48" cy="41" r="2" fill={person.eyes || "#4c6250"} />
      <path
        d="m40 43-2 6h4m-7 5c3 2 7 2 10 0"
        fill="none"
        stroke="#8b6255"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path d="m24 65 16 8 16-8" fill="none" stroke="#e0d7b4" strokeWidth="2" />
    </svg>
  );
}

const npcAppearance = (
  npc: GameState["npcs"][number],
): Pick<Person, "skin" | "hair" | "eyes" | "outfit" | "sex"> => ({
  skin: npc.id === "aldric" ? "#b68c69" : "#d7af88",
  hair:
    npc.id === "matron" ? "#bab6a8" : npc.id === "mira" ? "#aa744c" : "#5e4a35",
  eyes: "#53664e",
  outfit: npc.color,
  sex: ["mira", "matron", "farmer"].includes(npc.id) ? "female" : "male",
});
const nearObject = (state: GameState, id: string, radius = 190) => {
  const object = objectsForZone(state.zone).find((item) => item.id === id);
  return (
    !!object &&
    Math.hypot(state.apostle.x - object.x, state.apostle.y - object.y) <= radius
  );
};
const nearNpc = (state: GameState, npc: GameState["npcs"][number]) =>
  state.zone === npc.zone &&
  Math.hypot(state.apostle.x - npc.x, state.apostle.y - npc.y) <= 180;
const isPlaying = (state: GameState) =>
  state.phase === "playing" && state.apostle.alive;
const atTradingPost = (state: GameState) =>
  isPlaying(state) &&
  (nearObject(state, "market") || nearObject(state, "forge"));
const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value);
const act = (action: string) => store.act(action);
const openCrafting = () =>
  document.dispatchEvent(new CustomEvent("kg-panel", { detail: "crafting" }));

function Notice({
  children,
  good = false,
}: {
  children: React.ReactNode;
  good?: boolean;
}) {
  return (
    <div className={`panel-notice${good ? " panel-notice-good" : ""}`}>
      <MapPin size={15} />
      <span>{children}</span>
    </div>
  );
}

function Inventory({ state }: { state: GameState }) {
  const [group, setGroup] = useState("Tudo");
  const [selectedId, setSelected] = useState<ItemId>("bread");
  const owned = ITEM_IDS.filter((id) => state.inventory[id] > 0);
  const visible = owned.filter(
    (id) => group === "Tudo" || ITEM_GROUP[id] === group,
  );
  const selected = visible.includes(selectedId)
    ? selectedId
    : visible[0] || selectedId;
  const weight = owned.reduce(
    (total, id) => total + state.inventory[id] * ITEMS[id].weight,
    0,
  );
  const item = ITEMS[selected];
  const hasItem = state.inventory[selected] > 0;
  const consumable = selected === "bread" || selected === "herb";
  const sellPrice = store.price(selected, false);
  const canSell =
    atTradingPost(state) && hasItem && state.merchantGold >= sellPrice;
  return (
    <>
      <div className="panel-summary">
        <span>
          <Package size={15} /> {owned.length} tipos de item
        </span>
        <span>{money(weight)} kg carregados</span>
      </div>
      <div
        className="panel-tabs"
        role="group"
        aria-label="Categorias do inventário"
      >
        {["Tudo", "Provisões", "Materiais", "Equipamento"].map((name) => (
          <button
            key={name}
            aria-pressed={group === name}
            className={group === name ? "panel-tab-active" : ""}
            onClick={() => setGroup(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="item-grid">
        {visible.map((id) => (
          <button
            key={id}
            className={`item-slot ${selected === id ? "item-slot-selected" : ""}`}
            aria-label={`${ITEMS[id].name}, ${state.inventory[id]} unidades`}
            onClick={() => setSelected(id)}
          >
            <ItemIcon id={id} size={54} />
            <span className="item-quantity">{state.inventory[id]}</span>
            {state.apostle.equipment === id ? (
              <span className="item-equipped">
                <Check size={10} />
              </span>
            ) : null}
            <span className="item-slot-name">{ITEMS[id].name}</span>
          </button>
        ))}
        {Array.from({ length: Math.max(0, 12 - visible.length) }, (_, i) => (
          <div
            key={`empty-${i}`}
            className="item-slot item-slot-empty"
            aria-hidden="true"
          />
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="panel-muted">
          Nenhum item nesta categoria. Explore Valeverde para reunir provisões e
          materiais.
        </p>
      ) : null}
      <section className="item-detail">
        <div className="item-detail-heading">
          <div className="item-large-icon">
            <ItemIcon id={selected} size={62} />
          </div>
          <div>
            <span className="panel-overline">{ITEM_GROUP[selected]}</span>
            <h3>{item.name}</h3>
            <p>
              {state.inventory[selected]} na mochila · {money(item.weight)} kg
              por unidade
            </p>
          </div>
        </div>
        <p>{item.description}</p>
        <div className="panel-actions">
          {consumable ? (
            <button
              className="panel-button"
              disabled={
                !isPlaying(state) ||
                !hasItem ||
                (selected === "herb" &&
                  state.apostle.hp >= state.apostle.maxHp) ||
                (selected === "bread" &&
                  state.apostle.hp >= state.apostle.maxHp &&
                  state.apostle.stamina >= state.apostle.maxStamina)
              }
              onClick={() => act(`use:${selected}`)}
            >
              <Leaf size={15} /> Usar uma unidade
            </button>
          ) : null}
          {selected === "sword" ? (
            <button
              className="panel-button"
              disabled={
                !isPlaying(state) ||
                !hasItem ||
                state.apostle.equipment === selected
              }
              onClick={() => act(`equip:${selected}`)}
            >
              <Sword size={15} />
              {state.apostle.equipment === selected
                ? "Espada equipada"
                : "Equipar espada"}
            </button>
          ) : null}
          <button
            className="panel-button panel-button-outline"
            disabled={!canSell}
            onClick={() => act(`sell:${selected}`)}
          >
            <Coins size={15} /> Vender por {money(sellPrice)}
          </button>
        </div>
        {!atTradingPost(state) ? (
          <p className="panel-hint">
            As vendas são feitas pessoalmente no mercado ou na forja.
          </p>
        ) : state.merchantGold < sellPrice ? (
          <p className="panel-hint">
            O comerciante não tem ouro suficiente para esta compra.
          </p>
        ) : null}
      </section>
      <ToolsPanel state={state} mode="inventory" />
      <div className="panel-footnote">
        <Sword size={15} />
        <span>
          Arma equipada:{" "}
          {state.apostle.equipment
            ? ITEMS[state.apostle.equipment].name
            : "nenhuma"}
        </span>
      </div>
    </>
  );
}

function Character({ state }: { state: GameState }) {
  const person = state.apostle;
  const blessing = BLESSINGS[person.blessing];
  return (
    <>
      <div className="panel-person-intro">
        <Portrait person={person} size={86} />
        <div>
          <span className="panel-overline">{person.title}</span>
          <h3>
            {person.name} {person.surname}
          </h3>
          <p>
            {person.age} anos · {state.property.kingdom}
          </p>
        </div>
      </div>
      <div className="panel-blessing">
        <Flower2 size={25} />
        <div>
          <span className="panel-overline">Bênção de {blessing.name}</span>
          <p>{blessing.description}</p>
        </div>
      </div>
      <div className="panel-vital-bars">
        <div>
          <span>
            Vitalidade{" "}
            <b>
              {Math.round(person.hp)} / {person.maxHp}
            </b>
          </span>
          <div className="panel-progress">
            <i
              style={{
                width: `${Math.max(0, (person.hp / person.maxHp) * 100)}%`,
              }}
            />
          </div>
        </div>
        <div>
          <span>
            Energia{" "}
            <b>
              {Math.round(person.stamina)} / {person.maxStamina}
            </b>
          </span>
          <div className="panel-progress panel-progress-gold">
            <i
              style={{
                width: `${Math.max(0, (person.stamina / person.maxStamina) * 100)}%`,
              }}
            />
          </div>
        </div>
      </div>
      <div className="panel-section-heading">
        <h3>Atributos</h3>
        <span>Seu potencial natural</span>
      </div>
      <div className="panel-attribute-list">
        {Object.entries(person.attributes).map(([id, value]) => (
          <div key={id}>
            <span>{ATTR_NAMES[id] || id}</span>
            <b>{money(value)}</b>
          </div>
        ))}
      </div>
      <div className="panel-section-heading">
        <h3>Habilidades</h3>
        <span>Melhoram com a prática</span>
      </div>
      <div className="panel-skill-list">
        {Object.entries(person.skills).map(([id, value]) => (
          <div key={id}>
            <span>{SKILL_NAMES[id] || id}</span>
            <div className="panel-skill-line">
              <i style={{ width: `${Math.min(100, value)}%` }} />
            </div>
            <b>{money(value)}</b>
          </div>
        ))}
      </div>
      <p className="panel-hint">
        Não há níveis nem pontos para distribuir. Suas ações desenvolvem as
        habilidades que você usa.
      </p>
      <div className="panel-section-heading">
        <h3>Personalidade</h3>
        <span>O que suas escolhas revelam</span>
      </div>
      <div className="panel-personality">
        {Object.entries(person.personality).map(([id, value]) => (
          <div key={id}>
            <span>
              {
                (
                  {
                    compassion: "Compaixão",
                    courage: "Coragem",
                    loyalty: "Lealdade",
                    anger: "Ira",
                  } as Record<string, string>
                )[id]
              }
            </span>
            <b>{money(value)}</b>
          </div>
        ))}
      </div>
    </>
  );
}

function VillageOrders({ state }: { state: GameState }) {
  const canAccept =
    isPlaying(state) &&
    (nearObject(state, "sign") || nearObject(state, "market"));
  const canDeliver = isPlaying(state) && nearObject(state, "market");
  const budget = civicBudget(state);
  const statuses = {
    available: "Disponível",
    accepted: "Aceito por você",
    fulfilled: "Entregue por você",
    resolved: "Atendido pela vila",
    failed: "Prazo encerrado",
  };
  return (
    <>
      <div className="panel-section-heading">
        <h3>Abastecimento da vila</h3>
        <ShoppingBasket size={18} />
      </div>
      <p className="panel-prose">
        Pedidos do conselho usam mercadorias reais e o fundo da vila. A
        recompensa é paga uma vez, na entrega ao mercado. Moradores podem
        atender pedidos disponíveis; aceitar um pedido reserva essa tarefa para
        você. As recompensas publicadas ficam reservadas no tesouro; os
        gastos diários usam apenas a verba livre.
      </p>
      <div className="panel-summary panel-economy-summary">
        <span>
          Fundo cívico <b>{money(state.economy.civicFunds)} ouro</b>
        </span>
        <span>
          Verba livre <b>{money(budget.available)} ouro</b>
        </span>
        <span>
          Reservado no tesouro <b>{money(budget.reservedOrders + budget.reservedFrontier)} ouro</b>
        </span>
        <span>
          Fundo de tarefas aceitas <b>{money(budget.escrow)} ouro</b>
        </span>
        <span>
          Prosperidade <b>{state.economy.prosperity}/100</b>
        </span>
      </div>
      {state.economy.orders.length ? (
        <div className="panel-order-list">
          {[...state.economy.orders].reverse().map((order) => {
            const active =
              order.status === "available" || order.status === "accepted";
            const inTime = state.day < order.deadline;
            const enough = state.inventory[order.item] >= order.quantity;
            const funded = budget.financedOrderIds.includes(order.id);
            return (
              <article key={order.id} className="panel-order-card">
                <span
                  className={`panel-status ${["fulfilled", "resolved"].includes(order.status) ? "panel-status-good" : ""}`}
                >
                  {active && !inTime ? "Prazo encerrado" : order.status === "available" && !funded ? "Aguardando verba" : statuses[order.status]}
                </span>
                <h3>{order.title}</h3>
                <div className="panel-order-goods">
                  <ItemIcon id={order.item} size={40} />
                  <div>
                    <strong>
                      {order.quantity} × {ITEMS[order.item].name}
                    </strong>
                    <p>
                      {state.inventory[order.item]} na mochila · entregar antes
                      do dia {order.deadline}
                    </p>
                  </div>
                </div>
                <div className="panel-order-reward">
                  <Coins size={15} /> {money(order.reward)} ouro
                </div>
                {order.status === "available" ? (
                  <button
                    className="panel-button panel-button-full"
                    disabled={
                      !canAccept ||
                      !inTime ||
                      !funded
                    }
                    onClick={() => act(`order-accept:${order.id}`)}
                  >
                    {!inTime ? "Prazo encerrado" : funded ? "Aceitar pedido" : "Aguardando verba"} <ArrowRight size={15} />
                  </button>
                ) : order.status === "accepted" ? (
                  <button
                    className="panel-button panel-button-full"
                    disabled={
                      !canDeliver ||
                      !inTime ||
                      !enough ||
                      !funded
                    }
                    onClick={() => act(`order-deliver:${order.id}`)}
                  >
                    Entregar ao mercado <ArrowRight size={15} />
                  </button>
                ) : null}
                {active && !inTime ? (
                  <p className="panel-hint">O prazo deste pedido terminou.</p>
                ) : null}
                {order.status === "accepted" && !enough ? (
                  <p className="panel-hint">
                    Faltam {order.quantity - state.inventory[order.item]}{" "}
                    unidades para a entrega.
                  </p>
                ) : null}
                {active && inTime && funded ? (
                  <p className="panel-hint">
                    {money(order.reward)} ouro reservados para este pedido.
                  </p>
                ) : null}
                {active && inTime && !funded ? (
                  <p className="panel-hint">
                    Este pedido aguarda verba. O tesouro ainda não cobre a
                    recompensa de {money(order.reward)} ouro.
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="panel-hint">
          O conselho ainda não publicou pedidos. Novas necessidades surgem com
          os dias.
        </p>
      )}
      <Notice good={canDeliver}>
        {canDeliver
          ? "Você está no mercado e pode aceitar pedidos ou entregar suas mercadorias."
          : canAccept
            ? "Você pode aceitar pedidos aqui. Entregue as mercadorias no mercado."
            : "Consulte o mural ou o mercado para aceitar. Faça as entregas no mercado."}
      </Notice>
    </>
  );
}

function EconomicRecords({ state }: { state: GameState }) {
  return (
    <>
      <p className="panel-prose">
        Plantios, produção, manutenção, salários e abastecimento deixam um
        registro do que entrou e saiu da economia.
      </p>
      {state.economy.ledger.length ? (
        <div className="panel-ledger">
          {[...state.economy.ledger].reverse().map((entry, index) => (
            <article key={`${entry.day}-${entry.type}-${index}`}>
              <div>
                <span>Dia {entry.day}</span>
                {entry.goldDelta !== 0 ? (
                  <b
                    className={
                      entry.goldDelta > 0
                        ? "panel-ledger-credit"
                        : "panel-ledger-debit"
                    }
                  >
                    {entry.goldDelta > 0 ? "+" : "−"}
                    {money(Math.abs(entry.goldDelta))} ouro
                  </b>
                ) : null}
              </div>
              <p>{entry.text}</p>
            </article>
          ))}
        </div>
      ) : (
        <div className="panel-empty">
          <ScrollText size={32} />
          <h3>O trabalho começa aqui</h3>
          <p>Seus próximos plantios e atividades aparecerão neste registro.</p>
        </div>
      )}
    </>
  );
}

function Journal({ state }: { state: GameState }) {
  const [tab, setTab] = useState("Missões");
  const questReady = state.quest === "complete";
  const guard = state.npcs.find((npc) => npc.id === "guard");
  const atBoard =
    isPlaying(state) &&
    (nearObject(state, "sign") || (!!guard && nearNpc(state, guard)));
  return (
    <>
      <WeatherPanel state={state} />
      <div className="panel-tabs" role="group" aria-label="Seções do diário">
        {["Missões", "Memórias", "Registros"].map((name) => (
          <button
            key={name}
            aria-pressed={tab === name}
            className={tab === name ? "panel-tab-active" : ""}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>
      {tab === "Missões" ? (
        <>
          <span
            className={`panel-status ${questReady || state.quest === "claimed" ? "panel-status-good" : ""}`}
          >
            {
              {
                available: "Disponível",
                accepted: "Em andamento",
                complete: "Objetivo cumprido",
                claimed: "Concluída",
                expired: "Expirada",
              }[state.quest]
            }
          </span>
          <h3 className="panel-story-title">As raízes que despertam</h3>
          <p className="panel-prose">
            Criaturas tomaram a antiga cripta ao norte de Valeverde. O reino
            oferece uma recompensa a quem tornar o caminho seguro novamente.
          </p>
          <div className="panel-objective">
            <Sword size={20} />
            <div>
              <strong>Derrote as criaturas da cripta</strong>
              <p>{Math.min(state.kills, 3)} de 3 derrotadas</p>
            </div>
            {state.kills >= 3 ? <Check size={19} /> : null}
          </div>
          <div className="panel-objective">
            <ScrollText size={20} />
            <div>
              <strong>Retorne ao mural ou encontre Cedric</strong>
              <p>Receba a recompensa pessoalmente.</p>
            </div>
            {state.quest === "claimed" ? <Check size={19} /> : null}
          </div>
          <div className="panel-quest-reward">
            <Coins size={18} />
            <span>45 moedas de ouro · 2 pães · confiança de Valeverde</span>
          </div>
          {state.quest === "available" ? (
            <button
              className="panel-button panel-button-full"
              disabled={!atBoard}
              onClick={() => act("quest-accept")}
            >
              Aceitar a missão <ArrowRight size={16} />
            </button>
          ) : state.quest === "complete" ? (
            <button
              className="panel-button panel-button-full"
              disabled={!atBoard}
              onClick={() => act("quest-claim")}
            >
              Receber recompensa <ArrowRight size={16} />
            </button>
          ) : null}
          {!atBoard && (state.quest === "available" || questReady) ? (
            <Notice>
              Procure o mural de oportunidades ou Cedric para{" "}
              {questReady ? "receber a recompensa" : "aceitar a missão"}.
            </Notice>
          ) : null}
          <p className="panel-hint">
            A missão da cripta é opcional. Você também pode servir Valeverde com
            sua produção.
          </p>
          <FrontierJobs state={state} />
          <VillageOrders state={state} />
        </>
      ) : tab === "Memórias" ? (
        <>
          <p className="panel-prose">
            Encontros, conquistas e despedidas deixam marcas. Estas são as
            lembranças do seu apóstolo.
          </p>
          <div className="panel-memory-list">
            {state.apostle.memories.length ? (
              [...state.apostle.memories].reverse().map((memory) => (
                <article key={memory.id} className="panel-memory">
                  <span className="panel-memory-dot" />
                  <div className="panel-memory-date">
                    Dia {memory.day} <span>{memory.emotion}</span>
                  </div>
                  <h3>{memory.title}</h3>
                  <p>{memory.text}</p>
                  <div className="panel-memory-intensity">
                    Intensidade <span>{memory.intensity}</span>
                  </div>
                </article>
              ))
            ) : (
              <div className="panel-empty">
                <BookOpen size={34} />
                <h3>As primeiras páginas</h3>
                <p>
                  Viva sua jornada. Suas ações e relações formarão memórias
                  aqui.
                </p>
              </div>
            )}
          </div>
        </>
      ) : (
        <EconomicRecords state={state} />
      )}
    </>
  );
}

function Relations({ state }: { state: GameState }) {
  const [selectedId, setSelectedId] = useState("mira");
  const npc =
    state.npcs.find((person) => person.id === selectedId) || state.npcs[0];
  if (!npc)
    return (
      <div className="panel-empty">
        <Users size={32} />
        <p>Você ainda não encontrou moradores.</p>
      </div>
    );
  const nearby = isPlaying(state) && nearNpc(state, npc);
  const spouse = state.apostle.partnerId;
  const partner = npc.id !== "matron" && npc.id !== state.apostle.id;
  const simulation = (state as PersistentGameState).simulation;
  const now = (state.day - 1) * 1440 + state.minutes;
  const cooldown = Math.max(
    0,
    (simulation?.gathering?.[`social-${npc.id}`] || 0) - now,
  );
  const availableToMarry = !state.family.some((person) => person.id === npc.id);
  return (
    <>
      <p className="panel-prose">
        A confiança cresce em encontros reais. Procure os moradores na vila e
        reserve tempo para conhecê-los.
      </p>
      <div className="panel-npc-list">
        {state.npcs.map((person) => (
          <button
            key={person.id}
            className={`panel-npc-row ${person.id === npc.id ? "panel-npc-selected" : ""}`}
            onClick={() => setSelectedId(person.id)}
          >
            <Portrait person={npcAppearance(person)} size={43} />
            <span>
              <strong>{person.name}</strong>
              <small>{person.role}</small>
            </span>
            <span className="panel-npc-affection">
              <Heart size={13} /> {Math.round(person.relation)}
            </span>
            <ChevronRight size={15} />
          </button>
        ))}
      </div>
      <section className="panel-person-detail">
        <div className="panel-person-intro">
          <Portrait person={npcAppearance(npc)} size={70} />
          <div>
            <span className="panel-overline">{npc.role}</span>
            <h3>{npc.name}</h3>
            <p>
              {npc.mood}
              {spouse === npc.id ? " · seu cônjuge" : ""}
            </p>
          </div>
        </div>
        <div className="panel-relation-bars">
          <div>
            <span>
              <Heart size={14} /> Afeto <b>{Math.round(npc.relation)}</b>
            </span>
            <div className="panel-progress">
              <i style={{ width: `${Math.min(100, npc.relation)}%` }} />
            </div>
          </div>
          <div>
            <span>
              <Shield size={14} /> Confiança <b>{Math.round(npc.trust)}</b>
            </span>
            <div className="panel-progress panel-progress-gold">
              <i style={{ width: `${Math.min(100, npc.trust)}%` }} />
            </div>
          </div>
        </div>
        <NpcNeeds state={state} npc={npc} nearby={nearby} />
        <div className="panel-actions">
          {partner ? (
            <button
              className="panel-button"
              disabled={!nearby || cooldown > 0}
              onClick={() => act(`socialize:${npc.id}`)}
            >
              <Users size={15} /> Conversar
            </button>
          ) : null}
          {partner ? (
            <>
              <button
                className="panel-button panel-button-outline"
                disabled={
                  !nearby ||
                  npc.relation < 25 ||
                  state.inventory.bread < 1 ||
                  state.apostle.age < 16 ||
                  !!spouse ||
                  cooldown > 0
                }
                onClick={() => act(`court:${npc.id}`)}
              >
                <Heart size={15} /> Cortejar
              </button>
              <button
                className="panel-button panel-button-outline"
                disabled={
                  !nearby ||
                  npc.relation < 80 ||
                  npc.trust < 55 ||
                  state.apostle.age < 16 ||
                  !!spouse ||
                  !availableToMarry
                }
                onClick={() => act(`marry:${npc.id}`)}
              >
                <Flower2 size={15} /> Casar
              </button>
            </>
          ) : null}
        </div>
        {!nearby ? (
          <Notice>Encontre {npc.name} na vila para interagir.</Notice>
        ) : (
          <p className="panel-hint">
            {partner
              ? cooldown > 0
                ? "Este encontro está recente. Feche o painel e viva alguns instantes antes de conversar novamente."
                : "Cortejo: 25 de afeto e 1 pão. Casamento: 80 de afeto, 55 de confiança e idade adulta."
              : "A matrona orienta seus primeiros passos. Use E perto dela para ouvir sua história."}
          </p>
        )}
      </section>
    </>
  );
}

function Family({ state }: { state: GameState }) {
  const [selectedId, setSelectedId] = useState(state.apostle.id);
  const all = [
    ...state.family.filter((person) => person.id !== state.apostle.id),
    state.apostle,
  ];
  const person =
    all.find((member) => member.id === selectedId) || state.apostle;
  const parents = person.parents
    .map((id) => all.find((member) => member.id === id))
    .filter((member): member is Person => !!member);
  const children = all.filter((member) => member.parents.includes(person.id));
  const partner = all.find((member) => member.id === person.partnerId);
  const spouse = state.npcs.find(
    (member) => member.id === state.apostle.partnerId,
  );
  const simulation = (state as PersistentGameState).simulation;
  const marriageDay = state.apostle.partnerId
    ? simulation?.marriedAt?.[state.apostle.partnerId]
    : undefined;
  const elapsed = marriageDay == null ? 0 : state.day - marriageDay;
  const spousePerson = state.family.find(
    (member) => member.id === state.apostle.partnerId && member.alive,
  );
  const sinceLastChild = state.day - (simulation?.lastChildDay ?? -100);
  const atFamilyLocation =
    (!!spouse && nearNpc(state, spouse)) || nearObject(state, "property");
  const canChild =
    isPlaying(state) &&
    !!spousePerson &&
    elapsed >= 16 &&
    sinceLastChild >= 16 &&
    atFamilyLocation;
  const eligible =
    person.alive &&
    (person.id === state.apostle.partnerId ||
      person.partnerId === state.apostle.id ||
      person.parents.includes(state.apostle.id));
  const select = (member: Person) => setSelectedId(member.id);
  const node = (member: Person, small = false) => (
    <button
      key={member.id}
      className={`family-node ${member.id === person.id ? "family-node-current" : ""} ${small ? "family-node-small" : ""}`}
      onClick={() => select(member)}
    >
      <Portrait person={member} size={small ? 40 : 56} />
      <strong>{member.name}</strong>
      <span>
        {member.title || (member.alive ? `${member.age} anos` : "Em memória")}
      </span>
    </button>
  );
  return (
    <>
      <div className="panel-summary">
        <span>
          <Crown size={15} /> Casa {state.apostle.surname}
        </span>
        <span>Geração {state.apostle.generation}</span>
      </div>
      <div className="family-tree">
        <span className="panel-overline">
          {parents.length ? "Ascendência" : "Uma linhagem começa com você"}
        </span>
        {parents.length ? (
          <div className="family-branch family-parents">
            {parents.map((member) => node(member, true))}
          </div>
        ) : (
          <p className="family-origin">
            {person.id === state.apostle.id && state.apostle.generation === 1
              ? "Criado no orfanato, seu apóstolo não tem ascendentes conhecidos."
              : "Não há ascendentes registrados para esta pessoa."}
          </p>
        )}
        <div className="family-branch family-couple">
          {node(person)}
          {partner ? (
            <>
              <Heart size={15} className="family-link-heart" />
              {node(partner)}
            </>
          ) : null}
        </div>
        {children.length ? (
          <div className="family-branch family-children">
            {children.map((member) => node(member, true))}
          </div>
        ) : (
          <p className="family-origin">
            Ainda não há descendentes nesta ramificação.
          </p>
        )}
      </div>
      <div className="panel-person-intro family-person-detail">
        <Portrait person={person} size={64} />
        <div>
          <span className="panel-overline">
            Geração {person.generation} · {person.alive ? "Vivo" : "Em memória"}
          </span>
          <h3>
            {person.name} {person.surname}
          </h3>
          <p>
            {person.age} anos · {person.title}
          </p>
        </div>
      </div>
      <FamilyHistory state={state} person={person} />
      <FamilyEducation state={state} person={person} eligible={eligible} />
      {person.id !== state.apostle.id ? (
        <button
          className="panel-button panel-button-outline panel-button-full"
          onClick={() => setSelectedId(state.apostle.id)}
        >
          <ArrowLeft size={15} /> Voltar ao seu apóstolo
        </button>
      ) : null}
      {state.phase === "dead" && eligible && person.id !== state.apostle.id ? (
        <button
          className="panel-button panel-button-full"
          onClick={() => act(`succeed:${person.id}`)}
        >
          Continuar {person.age < 16 ? "sob regência" : "como"} {person.name}
          <ArrowRight size={15} />
        </button>
      ) : null}
      <div className="panel-section-heading">
        <h3>Formar uma família</h3>
        <Heart size={17} />
      </div>
      <p className="panel-prose">
        {state.apostle.partnerId
          ? `Seu casamento tem ${elapsed} dias. Um filho pode chegar após 16 dias de união.`
          : "Construa afeto e confiança com alguém da vila, case-se e crie o começo de uma nova geração."}
      </p>
      <button
        className="panel-button panel-button-full"
        disabled={!canChild}
        onClick={() => act("child")}
      >
        <Users size={16} /> Ter um filho
      </button>
      {state.apostle.partnerId ? (
        <p className="panel-hint">
          {elapsed < 16
            ? `Faltam ${16 - elapsed} dias de casamento.`
            : sinceLastChild < 16
              ? `Faltam ${16 - sinceLastChild} dias desde o nascimento anterior.`
              : !atFamilyLocation
                ? "Encontre seu cônjuge ou vá à parcela da família."
                : "Um novo descendente fará parte da sua árvore."}
        </p>
      ) : null}
      <p className="panel-hint">
        A árvore registra sua família durante a partida. Um cônjuge ou
        descendente vivo poderá continuar seu legado. Crianças herdam sob
        regência até os 16 anos.
      </p>
    </>
  );
}

function Crafting({ state }: { state: GameState }) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  return (
    <>
      <div className="panel-summary">
        <span>
          <Hammer size={16} /> Produção artesanal
        </span>
        <span>
          Energia{" "}
          <b>
            {Math.floor(state.apostle.stamina)} / {state.apostle.maxStamina}
          </b>
        </span>
      </div>
      <p className="panel-prose">
        Transforme sua colheita em provisões e seus materiais em equipamento.
        Cada receita exige a oficina indicada, ingredientes e energia.
      </p>
      <div className="panel-recipe-list">
        {RECIPES.map((recipe) => {
          const quantity = quantities[recipe.id] ?? 1;
          const energy = recipe.stamina * quantity;
          const inputs = Object.entries(recipe.inputs) as [ItemId, number][];
          const outputs = Object.entries(recipe.outputs) as [ItemId, number][];
          const station = OBJECTS.find(
            (object) => object.id === recipe.station,
          );
          const nearby = isPlaying(state) && nearObject(state, recipe.station);
          const enoughItems = inputs.every(
            ([id, amount]) => state.inventory[id] >= amount * quantity,
          );
          const enoughEnergy = state.apostle.stamina >= energy;
          const maximum = Math.max(0, Math.min(10,
            Math.floor(state.apostle.stamina / recipe.stamina),
            ...inputs.map(([id, amount]) => Math.floor(state.inventory[id] / amount)),
          ));
          const reason = !isPlaying(state)
            ? "A produção fica disponível durante a jornada de um apóstolo vivo."
            : !nearby
              ? `Aproxime-se de ${station?.label || recipe.station} para produzir.`
              : !enoughItems
                ? `Reúna os ingredientes indicados para ${quantity} ${quantity === 1 ? "receita" : "receitas"}.`
                : !enoughEnergy
                  ? `Você precisa de ${energy} de energia para este lote.`
                  : "Você está na oficina e tem os recursos necessários.";
          return (
            <article className="panel-recipe-card" key={recipe.id}>
              <div className="panel-recipe-heading">
                <div className="item-market-icon">
                  <ItemIcon id={outputs[0][0]} size={42} />
                </div>
                <div>
                  <span className="panel-overline">
                    {station?.label || recipe.station}
                  </span>
                  <h3>{recipe.name}</h3>
                </div>
              </div>
              <p>{recipe.description}</p>
              <div className="panel-recipe-quantity">
                <label htmlFor={`quantity-${recipe.id}`}>Receitas no lote</label>
                <select id={`quantity-${recipe.id}`} value={quantity}
                  onChange={event => setQuantities(previous => ({ ...previous, [recipe.id]: Number(event.target.value) }))}>
                  {Array.from({ length: 10 }, (_, index) => index + 1).map(count => <option key={count} value={count}>{count}</option>)}
                </select>
                <span>Recursos para até {maximum}</span>
              </div>
              <div className="panel-resource-cost">
                {inputs.map(([id, amount]) => (
                  <span
                    key={id}
                    className={
                      state.inventory[id] >= amount * quantity ? "panel-cost-ready" : ""
                    }
                  >
                    <ItemIcon id={id} size={27} /> {state.inventory[id]} /{" "}
                    {amount * quantity} {ITEMS[id].name.toLowerCase()}
                  </span>
                ))}
              </div>
              <div className="panel-recipe-output">
                <ArrowRight size={15} />
                <span>
                  {outputs
                    .map(([id, amount]) => `${amount * quantity} × ${ITEMS[id].name}`)
                    .join(" · ")}
                </span>
              </div>
              <div className="panel-recipe-details">
                <span>{energy} energia · {quantity} {quantity === 1 ? "receita" : "receitas"}</span>
                <span>
                  Prática de{" "}
                  {SKILL_NAMES[recipe.skill]?.toLowerCase() || recipe.skill}
                </span>
              </div>
              <button
                className="panel-button panel-button-full"
                disabled={!nearby || !enoughItems || !enoughEnergy}
                aria-describedby={`craft-reason-${recipe.id}`}
                onClick={() => act(`craft:${recipe.id}:${quantity}`)}
              >
                <Hammer size={15} /> {recipe.name}
              </button>
              <p className="panel-hint" id={`craft-reason-${recipe.id}`}>{reason}</p>
            </article>
          );
        })}
      </div>
      <ToolsPanel state={state} mode="repair" />
      <div className="panel-footnote">
        <Wheat size={16} />
        <span>
          Trigo → farinha no moinho → pão na padaria. A madeira alimenta a
          produção.
        </span>
      </div>
    </>
  );
}

function PropertyPanel({ state }: { state: GameState }) {
  const property = state.property;
  const economy = state.economy;
  const nearby = isPlaying(state) && nearObject(state, "property");
  const season = cropProfile(state.day);
  const ready = economy.crop != null && state.day >= economy.crop.readyDay;
  const farmer = state.npcs.find((npc) => npc.id === "farmer");
  const farmerPerson = state.family.find((person) => person.id === "farmer");
  const farmerAvailable =
    !!farmer && farmerPerson?.alive !== false && state.apostle.id !== "farmer";
  const nearWorker =
    isPlaying(state) &&
    (nearObject(state, "property") || (!!farmer && nearNpc(state, farmer)));
  const worker = economy.worker;
  const canHire =
    farmerAvailable &&
    nearWorker &&
    property.owned &&
    property.building &&
    economy.condition >= 25;
  return (
    <>
      <div className="panel-property-art">
        <svg viewBox="0 0 450 170" aria-hidden="true">
          <path
            d="M0 106c89-45 144-45 227 0 105-66 167-19 223-4v68H0Z"
            fill="#dde2cc"
          />
          <path d="m55 138 168-56 166 57-166 43Z" fill="#b7b989" />
          <path
            d="m75 138 148-47 146 47m-123-39-147 49m179-38-145 49m177-36-146 49"
            stroke="#94936a"
            strokeWidth="4"
          />
          <path d="m265 76 42-27 44 26v53h-86Z" fill="#e4d1a8" />
          <path d="m255 77 52-37 54 37-13 4-41-28-41 29Z" fill="#92775c" />
          <path d="M302 101h16v30h-16Z" fill="#796650" />
          <path
            d="M111 105V77m-13 15 13 7 10-13m-11-1-11-12m11 3 9-14"
            stroke="#6f845b"
            strokeWidth="4"
          />
          <circle cx="99" cy="71" r="9" fill="#9eae77" />
          <circle cx="120" cy="64" r="10" fill="#9eae77" />
          <circle cx="111" cy="55" r="10" fill="#829760" />
        </svg>
        <span>
          {property.owned ? "Sua propriedade" : "À venda em Valeverde"}
        </span>
      </div>
      <span className="panel-overline">{property.kingdom}</span>
      <h3 className="panel-story-title">{property.name}</h3>
      <p className="panel-prose">
        Uma pequena parcela fértil perto do moinho. Cultive trigo, venda a
        colheita e transforme sua terra em um lar para as próximas gerações.
      </p>
      {!property.owned ? (
        <>
          <div className="panel-price-line">
            <span>Escritura da propriedade</span>
            <strong>
              <Coins size={19} /> {property.cost} ouro
            </strong>
          </div>
          <button
            className="panel-button panel-button-full"
            disabled={!nearby || state.gold < property.cost}
            onClick={() => act("acquire-property")}
          >
            <House size={16} /> Comprar a parcela
          </button>
          {state.gold < property.cost ? (
            <p className="panel-hint">
              Você precisa de mais {property.cost - state.gold} moedas de ouro.
            </p>
          ) : null}
        </>
      ) : (
        <>
          <div className="panel-property-stats">
            <div>
              <span>Colheitas realizadas</span>
              <b>{property.harvests}</b>
            </div>
            {property.building ? (
              <div>
                <span>Condição da moradia</span>
                <b>{economy.condition}/100</b>
              </div>
            ) : null}
            <div>
              <span>Estação do plantio</span>
              <b>{season.season}</b>
            </div>
            <div>
              <span>Moradia</span>
              <b>{property.building ? "Construída" : "Terreno"}</b>
            </div>
          </div>
          {property.building ? <Notice good={economy.condition >= 25}>
            {economy.condition >= 25
              ? "Cama disponível: entre na casa e aproxime-se da cama para descansar 8 horas sem taxa. As provisões diárias continuam necessárias."
              : "A cama precisa de uma moradia com pelo menos 25 de condição. Repare a casa para voltar a descansar nela."}
          </Notice> : null}
          <div className="panel-section-heading">
            <h3>Seu cultivo</h3>
            <Sprout size={18} />
          </div>
          <div className="panel-crop-row">
            <ItemIcon
              id={property.plantedAt == null ? "seed" : "wheat"}
              size={54}
            />
            <div>
              <strong>
                {property.plantedAt == null
                  ? "Solo pronto para plantar"
                  : ready
                    ? "Trigo pronto para colher"
                    : "O trigo está crescendo"}
              </strong>
              <p>
                {property.plantedAt == null
                  ? `1 semente · ${season.duration} dias · ${season.yield + Math.floor(state.apostle.skills.farming / 20)} trigo previsto`
                  : ready
                    ? `${economy.crop?.yield || 0} trigo pronto · estação: ${economy.crop?.season}`
                    : `${Math.max(0, (economy.crop?.readyDay || state.day) - state.day)} dias · ${economy.crop?.yield || 0} trigo · ${economy.crop?.season}`}
              </p>
            </div>
          </div>
          <p className="panel-hint">
            O plantio guarda o prazo e o rendimento da estação. A mudança de
            estação preserva a colheita já plantada.
          </p>
          <button
            className="panel-button panel-button-outline panel-button-full"
            onClick={openCrafting}
          >
            <Hammer size={15} /> Abrir produção <ArrowRight size={15} />
          </button>
          <div className="panel-actions">
            <button
              className="panel-button"
              disabled={
                !nearby ||
                property.plantedAt != null ||
                state.inventory.seed < 1
              }
              onClick={() => act("plant")}
            >
              <Sprout size={15} /> Plantar
            </button>
            <button
              className="panel-button panel-button-outline"
              disabled={!nearby || !ready}
              onClick={() => act("harvest")}
            >
              <Wheat size={15} /> Colher trigo
            </button>
          </div>
          {!property.building ? (
            <>
              <div className="panel-section-heading">
                <h3>Construir uma casa</h3>
                <Hammer size={18} />
              </div>
              <p className="panel-prose">
                Uma moradia permanente na sua própria terra.
              </p>
              <div className="panel-resource-cost">
                <span
                  className={
                    state.inventory.wood >= 12 ? "panel-cost-ready" : ""
                  }
                >
                  <ItemIcon id="wood" size={27} /> {state.inventory.wood} / 12
                  madeira
                </span>
                <span
                  className={
                    state.inventory.stone >= 8 ? "panel-cost-ready" : ""
                  }
                >
                  <ItemIcon id="stone" size={27} /> {state.inventory.stone} / 8
                  pedra
                </span>
                <span className={state.gold >= 60 ? "panel-cost-ready" : ""}>
                  <Coins size={16} /> 60 ouro
                </span>
              </div>
              <button
                className="panel-button panel-button-full"
                disabled={
                  !nearby ||
                  property.building ||
                  state.inventory.wood < 12 ||
                  state.inventory.stone < 8 ||
                  state.gold < 60
                }
                onClick={() => act("build")}
              >
                <Hammer size={15} />
                Construir moradia
              </button>
            </>
          ) : null}
          {property.building ? (
            <>
              <div className="panel-section-heading">
                <h3>Manutenção da moradia</h3>
                <House size={18} />
              </div>
              <div
                className="panel-condition-track"
                role="progressbar"
                aria-label="Condição da moradia"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={economy.condition}
              >
                <span style={{ width: `${economy.condition}%` }} />
              </div>
              <p className="panel-prose">
                A casa perde 3 pontos de condição por dia. Reparar recupera 25
                pontos, até 100, usando 2 madeira e 1 pedra.
              </p>
              <div className="panel-resource-cost">
                <span
                  className={
                    state.inventory.wood >= 2 ? "panel-cost-ready" : ""
                  }
                >
                  <ItemIcon id="wood" size={27} /> {state.inventory.wood} / 2
                  madeira
                </span>
                <span
                  className={
                    state.inventory.stone >= 1 ? "panel-cost-ready" : ""
                  }
                >
                  <ItemIcon id="stone" size={27} /> {state.inventory.stone} / 1
                  pedra
                </span>
              </div>
              <button
                className="panel-button panel-button-full"
                disabled={
                  !nearby ||
                  economy.condition >= 100 ||
                  state.inventory.wood < 2 ||
                  state.inventory.stone < 1
                }
                onClick={() => act("repair")}
              >
                <Hammer size={15} /> Reparar a moradia
              </button>
            </>
          ) : null}
          <div className="panel-section-heading">
            <h3>Trabalho na parcela</h3>
            <Users size={18} />
          </div>
          {worker ? (
            <>
              <div className="panel-worker-card">
                {farmer ? (
                  <Portrait person={npcAppearance(farmer)} size={52} />
                ) : (
                  <Users size={30} />
                )}
                <div>
                  <strong>{farmer?.name || "Lina"}</strong>
                  <p>
                    {worker.wage} ouro por dia · contratada no dia{" "}
                    {worker.hiredDay}
                  </p>
                </div>
              </div>
              <div className="panel-property-stats">
                <div>
                  <span>Lealdade</span>
                  <b>{worker.loyalty}/100</b>
                </div>
                <div>
                  <span>Dias sem salário</span>
                  <b>{worker.unpaidDays}/3</b>
                </div>
                <div>
                  <span>Poupança da trabalhadora</span>
                  <b>{money(economy.npcSavings[worker.npcId] || 0)} ouro</b>
                </div>
              </div>
              {worker.unpaidDays > 0 ? (
                <Notice>
                  Há salários não pagos. Lina encerra o contrato após três dias
                  sem receber.
                </Notice>
              ) : null}
              {economy.condition < 25 ? (
                <Notice>
                  O cultivo de Lina está suspenso até reparar a casa. O salário
                  diário continua previsto.
                </Notice>
              ) : null}
              <button
                className="panel-button panel-button-outline panel-button-full"
                disabled={!nearWorker}
                onClick={() => act("dismiss-worker")}
              >
                Encerrar contrato
              </button>
            </>
          ) : (
            <>
              <p className="panel-prose">
                Lina pode plantar e colher por 5 ouro por dia, usando as
                sementes da sua mochila. A parcela precisa de uma casa com pelo
                menos 25 pontos de condição.
              </p>
              <button
                className="panel-button panel-button-full"
                disabled={!canHire}
                onClick={() => act("hire:farmer")}
              >
                <Users size={15} /> Contratar Lina · 5 ouro / dia
              </button>
              {!property.building || economy.condition < 25 ? (
                <p className="panel-hint">
                  Prepare uma moradia com condição mínima de 25 para contratar.
                </p>
              ) : null}
              {!farmerAvailable ? (
                <p className="panel-hint">
                  Lina não está disponível para este contrato.
                </p>
              ) : null}
            </>
          )}
          <p className="panel-hint">
            O salário é pago a partir do dia seguinte e entra na poupança de
            Lina. Cada pagamento aumenta a lealdade em 2; cada dia sem salário
            reduz em 15. Três dias sem pagamento encerram o contrato. Encontre
            Lina ou vá à parcela para tratar do contrato.
          </p>
        </>
      )}
      {!nearby ? (
        <Notice>Vá à Parcela do Moinho para cuidar da propriedade.</Notice>
      ) : (
        <Notice good>
          Você está próximo à parcela. As ações estão disponíveis conforme seus
          recursos.
        </Notice>
      )}
    </>
  );
}

function Market({ state }: { state: GameState }) {
  const [buying, setBuying] = useState(true);
  const [inspectedItem, setInspectedItem] = useState<ItemId>("bread");
  const nearby = atTradingPost(state);
  const weather = weatherFor(state.day, state.minutes, "village");
  const inspected = marketQuote(state, inspectedItem, buying);
  const percent = (factor: number) => `${factor >= 1 ? "+" : "−"}${Math.abs(Math.round((factor - 1) * 100))}%`;
  const supplyText = { scarce: "Oferta baixa", balanced: "Oferta estável", abundant: "Oferta alta" };
  const ids = buying
    ? ITEM_IDS
    : ITEM_IDS.filter((id) => state.inventory[id] > 0);
  return (
    <>
      <div className="panel-summary">
        <span>
          <Coins size={16} /> Seu ouro <b>{money(state.gold)}</b>
        </span>
        <span>
          Caixa da loja <b>{money(state.merchantGold)}</b>
        </span>
      </div>
      {!nearby ? (
        <Notice>
          Aproxime-se da banca do mercado ou da forja para negociar.
        </Notice>
      ) : (
        <Notice good>
          Você pode negociar aqui. Os preços refletem a oferta e sua negociação.
        </Notice>
      )}
      <div
        className="panel-production-chain"
        role="group"
        aria-label="Estoque da cadeia de abastecimento"
      >
        <div>
          <ItemIcon id="wheat" size={32} />
          <span>
            Trigo<b>{state.market.wheat}</b>
          </span>
        </div>
        <ArrowRight size={14} />
        <div>
          <ItemIcon id="flour" size={32} />
          <span>
            Farinha<b>{state.market.flour}</b>
          </span>
        </div>
        <ArrowRight size={14} />
        <div>
          <ItemIcon id="bread" size={32} />
          <span>
            Pão<b>{state.market.bread}</b>
          </span>
        </div>
      </div>
      <p className="panel-hint">
        A produção usa insumos e paga os trabalhadores com o caixa do mercado.
        Estações, oferta e pedidos da vila influenciam os preços.
        Prosperidade: {state.economy.prosperity}/100.
      </p>
      <p className="panel-hint">
        {weather.supplyPenalty > 0
          ? "Chuva hoje: a reposição externa perde até 1 unidade de capacidade por produto. Oficinas internas mantêm a capacidade."
          : "O clima de hoje mantém a capacidade normal de reposição externa."}
        {" "}Consulte os próximos dias no diário; os preços acompanham o estoque real.
      </p>
      <button
        className="panel-button panel-button-outline panel-button-full"
        onClick={openCrafting}
      >
        <Hammer size={15} /> Abrir produção <ArrowRight size={15} />
      </button>
      <div className="panel-tabs" role="group" aria-label="Tipo de negociação">
        <button
          aria-pressed={buying}
          className={buying ? "panel-tab-active" : ""}
          onClick={() => setBuying(true)}
        >
          Comprar
        </button>
        <button
          aria-pressed={!buying}
          className={!buying ? "panel-tab-active" : ""}
          onClick={() => setBuying(false)}
        >
          Vender
        </button>
      </div>
      <div className="panel-market-column-labels">
        <span>{buying ? "Mercadorias" : "Na sua mochila"}</span>
        <span>Ouro / un.</span>
      </div>
      <div className="panel-market-list">
        {ids.map((id) => {
          const price = store.price(id, buying);
          const quote = marketQuote(state, id, buying);
          const stock = buying ? state.market[id] : state.inventory[id];
          const disabled =
            !nearby ||
            stock < 1 ||
            (buying ? state.gold < price : state.merchantGold < price);
          return (
            <div className="panel-market-row" key={id}>
              <div className="item-market-icon">
                <ItemIcon id={id} size={41} />
              </div>
              <div className="panel-market-item">
                <strong>{ITEMS[id].name}</strong>
                <small>
                  {stock > 0
                    ? `${stock} ${buying ? "em estoque" : "na mochila"}`
                    : "Sem estoque"}
                  {` · ${supplyText[quote.status]}`}
                </small>
              </div>
              <span className="panel-market-price">
                <Coins size={12} />
                {money(price)}
              </span>
              <button
                className="panel-button panel-button-small"
                disabled={disabled}
                onClick={() => act(`${buying ? "buy" : "sell"}:${id}`)}
                aria-label={`${buying ? "Comprar" : "Vender"} uma unidade de ${ITEMS[id].name} por ${price} ouro`}
              >
                {buying ? "Comprar" : "Vender"}
              </button>
            </div>
          );
        })}
      </div>
      {ids.length === 0 ? (
        <div className="panel-empty">
          <ShoppingBasket size={32} />
          <h3>Mochila vazia</h3>
          <p>Reúna materiais ou colheitas para negociar.</p>
        </div>
      ) : null}
      {buying ? <ToolsPanel state={state} mode="market" /> : null}
      <details className="panel-market-analysis">
        <summary>Como este mercado forma os preços</summary>
        <label htmlFor="market-quote-item">Examinar mercadoria</label>
        <select id="market-quote-item" value={inspectedItem} onChange={event => setInspectedItem(event.target.value as ItemId)}>
          {ITEM_IDS.map(id => <option key={id} value={id}>{ITEMS[id].name}</option>)}
        </select>
        <p>{supplyText[inspected.status]} · {inspected.stock} em estoque, referência de {inspected.target}. Cotação de {buying ? "compra" : "venda"}: <strong>{money(inspected.price)}</strong>.</p>
        <dl className="panel-quote-factors">
          <div><dt>Disponibilidade</dt><dd>{percent(inspected.scarcityFactor)}</dd></div>
          <div><dt>Estação</dt><dd>{percent(inspected.seasonFactor)}</dd></div>
          <div><dt>Pedidos da vila</dt><dd>{percent(inspected.demandFactor)}</dd></div>
          <div><dt>Seu benefício de negociação</dt><dd>{Math.round((1 - inspected.discountFactor) * 100)}%</dd></div>
        </dl>
        <p>Esses fatores se combinam com a prosperidade e a margem do comerciante. A negociação reduz o preço de compra e melhora o valor recebido na venda.</p>
      </details>
      {state.economy.ledger.length ? <div className="panel-market-recent">
        <div className="panel-section-heading"><h3>Últimos movimentos</h3><ScrollText size={16} /></div>
        <div className="panel-ledger">{state.economy.ledger.slice(-4).reverse().map((entry, index) => <article key={`${entry.day}-${index}`}>
          <div><span>Dia {entry.day}</span><b className={entry.goldDelta > 0 ? "panel-ledger-credit" : entry.goldDelta < 0 ? "panel-ledger-debit" : undefined}>{entry.goldDelta ? `${entry.goldDelta > 0 ? "+" : ""}${entry.goldDelta} ouro` : "Vila"}</b></div>
          <p>{entry.text}</p>
        </article>)}</div>
      </div> : null}
      <div className="panel-footnote">
        <ArrowDownUp size={16} />
        <span>
          Cada troca movimenta uma unidade. O estoque e o ouro do comerciante
          são limitados.
        </span>
      </div>
      <p className="panel-hint">
        A bênção de Fortuna reduz os preços de compra. Vender e comprar
        desenvolve sua habilidade de negociação.
      </p>
    </>
  );
}

const MAP_SYMBOLS: Record<string, string> = {
  estate: "M-42 30h84M-34 30v-58h68v58M-34-10h68M-12-28v58M12-28v58M-42-36h84",
  resource: "M0-45-30-12h14l-28 30h32v28h24V18h32L16-12h14Z",
  herb: "M0 42V-22M0 6c-42 0-40-35-40-35C-5-29 0 6 0 6Zm0-16c35 0 40-35 40-35C5-45 0-10 0-10Z",
  stone: "M-40 27-26-22 10-35 40 12 20 36Z",
  well: "M-40-5 0-38 40-5M-30-12V30h60v-42M-38 30h76M-14 12h28v18h-28Z",
  sign: "M-34-35h68v50h-68Zm34 50v28M-18-20h36M-18-5h26",
  dungeon: "M-35 35V-15a35 35 0 0 1 70 0v50Zm15 0V-6a15 15 0 0 1 30 0v41",
  cave: "M-42 36-8-38 20-24 44 36ZM-15 36V8a15 15 0 0 1 30 0v28",
  portal: "M-38 0h76M14-24 38 0 14 24",
  ore: "M-40 27-26-22 10-35 40 12 20 36ZM-22 2 0-12 18 8 2 24Z",
  camp: "M-44 34 0-34 44 34ZM0-34v68M-10 34V12h20v22",
  ruins: "M-35 38V-30h22v16h24v-16h22v68M-35 2h70M-9 38V15h18v23",
  lake: "M-42-18c14-14 28 14 42 0s28 14 42 0M-42 3c14-14 28 14 42 0s28 14 42 0M-42 24c14-14 28 14 42 0s28 14 42 0",
};
const MAP_ROADS = [
  "M1260 476 1258 630 1256 842",
  "M1230 1456 1306 1396 1456 1290",
  "M408 912 580 876 776 834 1020 828 1256 842 1478 872 1882 896",
  "M710 620 730 696 776 834",
  "M1000 1080 1016 952 1020 828",
  "M1564 660 1510 764 1478 872",
  "M1640 1100 1606 984 1478 872",
  "M1282 826 1284 940 1392 1090 1456 1290 1698 1446",
  "M1882 896 1990 752 2116 548 2110 340",
  "M776 834 692 1004 616 1236 630 1518 816 1906",
];
/** Keep unopened private doors off both maps; estate markers still identify the land. */
export function mapObjectsForState(state: GameState) {
  return objectsForZone(state.zone).filter(object => {
    const room = entranceForObject(state.zone, object.id);
    return object.kind !== "door" || !room || interiorAllowed(state, room);
  });
}

const MAP_FURNITURE_NAMES: Record<string, string> = {
  bed: "Cama", table: "Mesa", chair: "Cadeira", shelf: "Prateleira", counter: "Balcão",
  oven: "Forno", anvil: "Bigorna", barrel: "Barril", crate: "Caixote", sack: "Saco",
  rug: "Tapete", desk: "Escrivaninha", stove: "Fogão", altar: "Altar", bench: "Banco",
  wardrobe: "Armário", plant: "Planta", basin: "Bacia", lantern: "Lanterna",
  books: "Livros", wheel: "Roda do moinho", grain: "Grãos",
};

/** Shared top view of the authored world: furniture uses its rendered, rotated footprint. */
export function LocalMapTerrain({ state, compact = false }: { state: GameState; compact?: boolean }) {
  const region = regionForZone(state.zone);
  const room = interiorForZone(state.zone);
  if (room) return <>
    <rect width="900" height="900" fill="#566052" />
    <rect x="40" y="70" width="820" height="780" fill="#d3c2a0" />
    <g fill="#8a7658" stroke="#655a45" strokeWidth={compact ? 3 : 2}>
      <rect x="40" y="104" width="820" height="26" />
      <rect x="41" y="120" width="24" height="690" />
      <rect x="835" y="120" width="24" height="690" />
      <rect x="70" y="813" width="350" height="22" />
      <rect x="480" y="813" width="350" height="22" />
    </g>
    {[...room.furniture].sort((a, b) => Number(a.blocking !== false) - Number(b.blocking !== false)).map((furniture, index) => <g
      key={`furniture-${index}`} transform={`translate(${furniture.x} ${furniture.y}) rotate(${(furniture.rotation ?? 0) * 180 / Math.PI})`}>
      <rect x={-furniture.w / 2} y={-furniture.d / 2} width={furniture.w} height={furniture.d}
        rx={furniture.kind === "barrel" || furniture.kind === "plant" ? Math.min(furniture.w, furniture.d) / 2 : 4}
        fill={furniture.color === undefined ? furniture.blocking === false ? "#b5a383" : "#967750" : `#${furniture.color.toString(16).padStart(6, "0")}`}
        fillOpacity={furniture.blocking === false ? .65 : 1} stroke={furniture.blocking === false ? "none" : "#66563d"} strokeWidth={compact ? 3 : 2} />
      {furniture.kind === "bed" ? <rect x={-furniture.w / 2 + 8} y={-furniture.d / 2 + 8} width={furniture.w - 16} height={Math.min(28, furniture.d / 4)} rx="4" fill="#eee4c9" /> : null}
      <title>{MAP_FURNITURE_NAMES[furniture.kind] || furniture.kind}</title>
    </g>)}
    <path d="M420 790h60v45h-60" fill="#c4b68d" stroke="#776e50" strokeWidth="3" />
  </>;
  if (state.zone === "dungeon") return <>
    <rect width="900" height="900" fill="#596455" />
    <rect x="56" y="64" width="788" height="772" fill="#d0cdbb" stroke="#8b917b" strokeWidth="28" />
    <path d="M100 126h54v80h-54Zm648 0h54v80h-54ZM100 680h54v80h-54Zm648 0h54v80h-54Z" fill="#939980" />
    <rect x="342" y="98" width="216" height="50" fill="#8d937b" stroke="#666f5d" strokeWidth="5" />
    <rect x="400" y="790" width="100" height="46" fill="#52694e" />
  </>;
  return <>
    <rect width={region.width} height={region.height} fill={state.zone === "mine" ? "#5b5b53" : state.zone === "highlands" ? "#d5ddca" : "#e8e8d3"} />
    {state.zone === "mine" ? <g fill="#c7bea8" stroke="#a89b7e" strokeWidth="14">
      {region.walkableAreas?.map((area, index) => <rect key={index} x={area.left} y={area.top} width={area.right - area.left} height={area.bottom - area.top} />)}
    </g> : <>
      {region.decor.filter((_, index) => !compact || index % 3 === 0).map((tree, index) => <circle key={`tree-${index}`} cx={tree.x} cy={tree.y - 36} r={46 * (tree.scale ?? 1)} fill="#a2b18c" opacity=".68" />)}
      {state.zone === "village" ? <>
        <path d="M-120 436 102 524 244 702 388 908 320 1130 274 1304 406 1554 300 1774 136 1980" fill="none" stroke="#b6c5c1" strokeWidth="130" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M285 893H485" fill="none" stroke="#a79674" strokeWidth="70" />
        <path d="M285 893H485" fill="none" stroke="#dfcfac" strokeWidth="45" />
        {MAP_ROADS.map((road, index) => <path key={road} d={road} fill="none" stroke="#d5c39a" strokeWidth={index === 2 ? 58 : 42} strokeLinecap="round" strokeLinejoin="round" />)}
      </> : state.zone === "highlands" ? <>
        {HIGHLAND_RIDGES.map((ridge, index) => <rect key={`ridge-${index}`} x={ridge.left} y={ridge.top} width={ridge.right - ridge.left} height={ridge.bottom - ridge.top} rx="24" fill="#879387" stroke="#b2ba9f" strokeWidth="18" />)}
        {HIGHLAND_ROADS.map((road, index) => <polyline key={`road-${index}`} points={road.map(point => `${point.x},${point.y}`).join(" ")} fill="none" stroke="#d5c39a" strokeWidth="42" strokeLinecap="round" strokeLinejoin="round" />)}
        {HIGHLAND_BUILDINGS.map(building => <rect key={building.id} x={building.footprint.left} y={building.footprint.top} width={building.footprint.right - building.footprint.left} height={building.footprint.bottom - building.footprint.top} fill="#8d8064" stroke="#f0e4ca" strokeWidth="8" />)}
      </> : <>
        <rect x="2280" y="1430" width="360" height="200" rx="75" fill="#a8c3c1" stroke="#c6d3c1" strokeWidth="28" />
        {WILDERNESS_ROADS.map((road, index) => <polyline key={`road-${index}`} points={road.map(point => `${point.x},${point.y}`).join(" ")} fill="none" stroke="#d5c39a" strokeWidth="42" strokeLinecap="round" strokeLinejoin="round" />)}
        {estateBuildings(state).map(id => { const solid = estateSolid(id); return <rect key={id} x={solid.left} y={solid.top} width={solid.right - solid.left} height={solid.bottom - solid.top} fill="#9b8059" stroke="#efe3c5" strokeWidth="8" />; })}
      </>}
    </>}
  </>;
}

function MapRegionOverview({ state }: { state: GameState }) {
  const room = interiorForZone(state.zone);
  const parent = room?.entrance.zone ?? (state.zone === "dungeon" ? "village" : state.zone);
  return <div className="panel-region-connections" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }} aria-label="Regiões conectadas">
    {(["village", "wilderness", "highlands", "mine"] as const).map((zone, index) => <div key={zone} className={parent === zone ? "panel-region-current" : ""}>
      <span>{index + 1}</span><strong>{regionForZone(zone).name}</strong>
      <small>{parent === zone ? (room || state.zone === "dungeon" ? `Você está aqui · ${regionForZone(state.zone).name}` : "Você está aqui") : {
        village: "Vila e oficinas", wilderness: "Floresta, ruínas e lago", highlands: "Serra, alojamento e capela", mine: "Galerias e recursos",
      }[zone]}</small>
    </div>)}
  </div>;
}

function WorldMap({ state, onClose }: { state: GameState; onClose: () => void }) {
  const [selectedId, setSelectedId] = useState("");
  const [mapFilter, setMapFilter] = useState("all");
  const region = regionForZone(state.zone);
  const room = interiorForZone(state.zone);
  const local = !!room || state.zone === "dungeon";
  const regionalResources = RESOURCE_NODES.filter(node => node.zone === state.zone);
  const locations = mapObjectsForState(state).filter(object => {
    const node = resourceNode(object.id);
    return mapFilter === "all" || (mapFilter === "places" ? !node : node?.resource === mapFilter);
  });
  const selected = locations.find(object => object.id === selectedId) || locations[0];
  const selectedResource = selected ? resourceNode(selected.id) : undefined;
  const currentNpcs = state.npcs.filter(npc => npc.zone === state.zone);
  const { x: positionX, y: positionY } = state.apostle;
  const estates = estateBuildings(state);
  const estateSignature = estates.join(",");
  useEffect(() => { setMapFilter("all"); setSelectedId(""); }, [state.zone]);
  const route = useMemo(() => {
    if (!selected) return null;
    const context: NavigationContext = { zone: state.zone, building: state.property.building, estates };
    const origin = { x: positionX, y: positionY };
    const destination = objectApproach(selected.id, context);
    const arrived = Math.hypot(positionX - destination.x, positionY - destination.y) <= 12;
    const waypoints = arrived ? [] : findPath(origin, destination, context);
    if (!waypoints.length && !arrived) return null;
    const points = [origin, ...waypoints];
    let distance = 0;
    for (let index = 1; index < points.length; index++) distance += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
    return { points, distance: Math.round(distance), arrived };
  }, [positionX, positionY, selected?.id, state.zone, state.property.building, estateSignature]);
  const walkingSeconds = route ? Math.ceil(route.distance / (state.apostle.age < 16 ? 130 : 170)) : null;
  const direction = selected ? `${selected.y < positionY - 100 ? "norte" : selected.y > positionY + 100 ? "sul" : ""}${Math.abs(selected.y - positionY) > 100 && Math.abs(selected.x - positionX) > 100 ? " / " : ""}${selected.x < positionX - 100 ? "oeste" : selected.x > positionX + 100 ? "leste" : ""}` || "perto de você" : "";
  const markerScale = local ? .38 : state.zone === "mine" ? .6 : 1;
  return <>
    <div className="panel-section-heading"><h3>{region.name}</h3><Compass size={18} /></div>
    {room ? <p className="panel-prose">Interior · {regionForZone(room.entrance.zone).name}. A saída ao sul retorna à porta deste edifício.</p> : null}
    {regionalResources.length ? <div className="panel-map-filter">
      <label htmlFor="map-resource-filter">Mostrar no mapa</label>
      <select id="map-resource-filter" value={mapFilter} onChange={event => { setMapFilter(event.target.value); setSelectedId(""); }}>
        <option value="all">Tudo</option><option value="places">Locais e passagens</option>
        {(["wood", "stone", "herb", "ore"] as const).filter(item => regionalResources.some(node => node.resource === item)).map(item => <option key={item} value={item}>{ITEMS[item].name}</option>)}
      </select>
      <small>{regionalResources.length} pontos de coleta nesta região</small>
    </div> : null}
    <div className="panel-map-art" style={{ aspectRatio: `${region.width} / ${region.height}` }}>
      <svg viewBox={`0 0 ${region.width} ${region.height}`} role="group" aria-label={`Mapa de ${region.name}. Selecione um local para ver a rota de caminhada.`}>
        <LocalMapTerrain state={state} />
        {route && !route.arrived ? <polyline className="panel-map-route" points={route.points.map(point => `${Math.round(point.x)},${Math.round(point.y)}`).join(" ")} fill="none" stroke="#9b7445" strokeWidth={local ? 7 : 18} strokeDasharray={local ? "13 9" : "34 24"} strokeLinecap="round" strokeLinejoin="round" /> : null}
        {locations.map(object => <g key={object.id} role="button" tabIndex={0} aria-label={object.label} aria-pressed={selected?.id === object.id} className="panel-map-marker"
          onClick={() => setSelectedId(object.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(object.id); } }}
          transform={`translate(${object.x} ${object.y}) scale(${markerScale})`}>
          <circle r={resourceNode(object.id) ? 56 : 85} fill={selected?.id === object.id ? "#253d32" : "#faf7ee"} stroke={selected?.id === object.id ? "#b8985d" : "#b7ac8f"} strokeWidth="8" />
          <path d={MAP_SYMBOLS[object.kind] || "M-42-7 0-40 42-7M-32-13V35h64v-48M-10 35V10h20v25"} fill="none" transform={resourceNode(object.id) ? "scale(.7)" : undefined}
            opacity={resourceNode(object.id) && state.frontier.resources[object.id]?.remaining === 0 ? .35 : 1}
            stroke={selected?.id === object.id ? "#f3ebd7" : "#56664d"} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
          <title>{object.label}</title>
        </g>)}
        {currentNpcs.map(npc => <g key={npc.id}><circle cx={npc.x} cy={npc.y} r={local ? 14 : 24} fill="#66849b" stroke="#faf7ee" strokeWidth={local ? 4 : 7} /><title>{npc.name} · {npc.mood}</title></g>)}
        {state.zone === "dungeon" ? state.enemies.filter(enemy => enemy.alive).map(enemy => <g key={enemy.id} transform={`translate(${enemy.x} ${enemy.y})`}><circle r="22" fill="#a47256" /><path d="m-9-9 18 18m0-18-18 18" stroke="#f5ebd5" strokeWidth="4" /><title>Criatura viva</title></g>) : null}
        <circle cx={positionX} cy={positionY} r={local ? 19 : state.zone === "mine" ? 28 : 45} fill="#b8985d" stroke="#faf7ee" strokeWidth={local ? 6 : 12} />
        <circle cx={positionX} cy={positionY} r={local ? 6 : 13} fill="#faf7ee" />
      </svg>
      <span className="panel-map-north">N <span>↑</span></span><span className="panel-map-scale">{region.name} · Reino de Auren</span>
    </div>
    <div className="panel-map-legend">
      <span><i /> Você</span><span><i /> Local selecionado</span>
      {currentNpcs.length ? <span><i style={{ background: "#66849b" }} /> Morador presente</span> : null}
      {state.zone === "dungeon" ? <span><i className="panel-enemy-dot" /> Criatura viva</span> : null}
      {route && !route.arrived ? <span><i className="panel-route-legend" /> Caminho</span> : null}
    </div>
    {room && currentNpcs.length ? <p className="panel-prose">Presentes: {currentNpcs.map(npc => npc.name).join(", ")}.</p> : null}
    {state.zone === "dungeon" ? <p className="panel-prose">{state.enemies.filter(enemy => enemy.alive).length} criaturas vivas. Sua posição: X {Math.round(positionX)}, Y {Math.round(positionY)}.</p> : null}
    {selected ? <>
      <div className="panel-section-heading"><h3>{selected.label}</h3><MapPin size={18} /></div>
      <div className="panel-map-coordinates"><span>X {selected.x} · Y {selected.y}</span><span>{direction}</span></div>
      <div className="panel-map-journey">
        <div><Compass size={21} aria-hidden="true" /><span>
          <strong>{route?.arrived ? "Você está junto a este local" : route ? `Cerca de ${walkingSeconds} s a pé` : "Nenhum caminho disponível até este local"}</strong>
          {route && !route.arrived ? <small>Distância pela rota marcada: {route.distance.toLocaleString("pt-BR")} passos</small> : null}
        </span></div>
        <button className="panel-button panel-button-full" disabled={!route || route.arrived || state.phase !== "playing"} onClick={() => {
          document.dispatchEvent(new CustomEvent("kg-navigate", { detail: { id: selected.id } })); onClose();
        }}><Compass size={15} aria-hidden="true" />{route?.arrived ? "Você já está aqui" : "Caminhar até aqui"}</button>
      </div>
      {selectedResource ? <p className="panel-prose">{ITEMS[selectedResource.resource].name}: {state.frontier.resources[selected.id]?.remaining ?? selectedResource.capacity} trabalhos disponíveis. Cada trabalho dura {selectedResource.duration} s, usa {selectedResource.stamina} energia e rende {selectedResource.yield} unidades{selectedResource.tool ? ` com ${selectedResource.tool === "axe" ? "machado" : "picareta"}` : " sem ferramenta"}. O recurso se renova em {selectedResource.respawnDays} dias após esgotar.</p> : null}
      {room ? <p className="panel-prose">{selected.id === "exit" ? `Esta saída leva à porta de ${room.name}, em ${regionForZone(room.entrance.zone).name}.` : "Caminhe até esta estação para usar os serviços do edifício."}</p> : null}
      {!room ? <p className="panel-prose">
        {(
          {
            exit: "A saída ao sul retorna à entrada da Cripta das Raízes, em Valeverde.",
            "wild-highlands": "O desfiladeiro liga os Ermos às Terras Altas de Brumavale. Siga pela passagem para alcançar as trilhas da serra.",
            "highlands-wilderness": "Esta trilha desce aos Ermos de Alvor. A passagem retorna à entrada do desfiladeiro.",
            "highland-ranger-lodge": "O alojamento dos guardas abriga camas, provisões e a mesa de patrulha. Entre pela porta dianteira.",
            "highland-chapel": "A capela das Nuvens recebe viajantes da serra. Entre para conhecer o altar e os bancos dos peregrinos.",
            "wild-gate": "A trilha ao sudeste leva aos Ermos de Alvor. Atravesse a passagem para explorar a floresta e encontrar a mina.",
            "wild-village": "Retorne a Valeverde para negociar, cuidar da família e visitar as oficinas.",
            "wild-mine": "A Mina do Ferro Antigo tem galerias conectadas e veios de minério. Leve uma picareta e pão; não há combate obrigatório aqui.",
            "mine-exit": "Esta passagem leva de volta ao ar livre, nos Ermos de Alvor.",
            "wild-camp": "Um abrigo dos viajantes. Aqui você pode conhecer oportunidades de exploração e descansar com suas próprias provisões.",
            "wild-ruins": "A Torre de Alvor guarda a memória de caminhos antigos. Chegar até ela registra uma descoberta para sua jornada.",
            "wild-lake": "A margem do Lago do Espelho é um destino de exploração. A água é profunda; caminhe pelas trilhas ao redor.",
            "oak-hollow": "Uma parcela registrável dos Ermos. Compre a escritura no marco e construa um armazém ou abrigo. A posse tem tributo diário e permanece vinculada a Auren.",
            "stone-rise": "Uma segunda parcela disponível nos Ermos. Sua família precisa da Carta de Guardião de Alvor para manter duas terras nesta região.",
            orphanage:
              "O ponto de partida da sua história. Aqui, um descanso e uma conversa podem renovar sua jornada.",
            market:
              "Compre provisões e sementes. Venda materiais e trigo para reunir ouro.",
            mill:
              "Transforme seu trigo em farinha. Caminhe até o moinho para usar suas ferramentas.",
            bakery:
              "Use farinha e lenha para assar pão. A produção acontece junto à padaria.",
            forge:
              "Transforme minério e madeira em uma espada. Procure Aldric por perto para conversar.",
            inn: "Uma cama, uma pausa e a hospitalidade da vila. Descanse para recuperar vitalidade e energia.",
            house1:
              "Mira vive neste canto tranquilo de Valeverde. Procure-a por perto durante o dia.",
            property:
              "Uma parcela à venda. Ao adquiri-la, você pode cultivar trigo e construir uma casa.",
            dungeon:
              "Uma antiga cripta ocupada por criaturas. Leve uma espada e provisões antes de entrar.",
            tree1:
              "Reúna madeira para sua moradia e para a padaria. Trabalhar consome energia; o recurso precisa de tempo para se renovar.",
            herb1:
              "Colha ervas para recuperar vitalidade. Guarde-as no inventário para usar durante a jornada.",
            stone1:
              "Reúna pedra para construir. A prática da extração desenvolve a competência de mineração.",
            well:
              "Beba água fresca para recuperar energia antes de voltar ao trabalho.",
            sign:
              "Leia oportunidades e pedidos da vila. Aqui também funciona o registro de Auren, onde você pode quitar tributos dos Ermos e solicitar a Carta de Guardião de Alvor.",
          } as Record<string, string>
        )[selected?.id ?? ""] || "Um local para descobrir durante a jornada."}
      </p> : null}
    </> : <p className="panel-prose">Não há destinos para este filtro.</p>}
    <div className="panel-location-list">
      {locations.map(object => <button key={object.id} className={selected?.id === object.id ? "panel-location-selected" : ""} onClick={() => setSelectedId(object.id)}>
        <MapPin size={14} /><span>{object.label}</span>
        {resourceNode(object.id) ? <small>{state.frontier.resources[object.id]?.remaining === 0 ? `Retorna no dia ${state.frontier.resources[object.id].readyDay}` : `${state.frontier.resources[object.id]?.remaining ?? resourceNode(object.id)!.capacity} coletas`}</small> : null}
        <ChevronRight size={14} />
      </button>)}
    </div>
    <MapRegionOverview state={state} />
    <p className="panel-hint">{state.zone === "orphanage" && state.intro ? "Converse com a matrona e receba seus pertences antes de usar a saída ao sul." : "Selecione um destino e caminhe pela rota marcada. Use o teclado ou o joystick para interromper a caminhada. Você também pode tocar no chão do mundo para indicar outro destino."}</p>
  </>;
}

function Help({ state }: { state: GameState }) {
  const calendar = store.getCalendar();
  const [rendererStatus, setRendererStatus] = useState("");
  const [rendererLoading, setRendererLoading] = useState(false);
  useEffect(() => {
    const changed = () => {
      setRendererStatus("");
    };
    const status = (event: Event) => {
      const detail = (event as CustomEvent<{ mode: "3d"; loading?: boolean; message?: string }>).detail;
      if (!detail) return;
      setRendererLoading(!!detail.loading);
      setRendererStatus(detail.message || "");
    };
    window.addEventListener("kg-renderer-change", changed);
    window.addEventListener("kg-renderer-status", status);
    return () => {
      window.removeEventListener("kg-renderer-change", changed);
      window.removeEventListener("kg-renderer-status", status);
    };
  }, []);
  return (
    <>
      <div className="panel-help-intro">
        <Compass size={32} />
        <h3>Uma vida. Muitas possibilidades.</h3>
        <p>
          Conheça Valeverde, cuide de si e construa um legado com suas escolhas.
        </p>
      </div>
      <div className="panel-section-heading">
        <h3>Um novo olhar sobre o reino</h3>
        <Compass size={17} />
      </div>
      <p className="panel-prose" role="status" aria-busy={rendererLoading}>Visual 3D ativo.</p>
      <p className="panel-prose">
        O visual 3D usa cenários e personagens medievais estilizados, câmera elevada
        e iluminação suave. O mundo usa exclusivamente o visual 3D. Se o navegador
        interromper a renderização, sua campanha fica preservada e você pode
        tentar carregar o mundo novamente.
      </p>
      {rendererStatus && <p className="renderer-help-status" role="status">{rendererStatus}</p>}
      <p className="panel-hint">
        No mundo 3D, abra Câmera para girar, aproximar ou restaurar a vista.
        No computador, use Z e X para girar e a roda do mouse para ajustar a distância.
        Esta primeira versão mantém terreno plano e animações simples.
      </p>
      <div className="panel-section-heading">
        <h3>Controles</h3>
        <span>Teclado</span>
      </div>
      <div className="panel-controls">
        <div>
          <span>Mover</span>
          <span>
            <kbd>W A S D</kbd> / <kbd>↑ ← ↓ →</kbd>
          </span>
        </div>
        <div>
          <span>Interagir com algo próximo</span>
          <kbd>E</kbd>
        </div>
        <div>
          <span>Atacar uma criatura próxima</span>
          <kbd>Espaço</kbd>
        </div>
        <div>
          <span>Esquivar e gastar energia</span>
          <kbd>Shift</kbd>
        </div>
        <div>
          <span>Fechar menus</span>
          <kbd>Esc</kbd>
        </div>
      </div>
      <p className="panel-hint">
        O botão de ação na tela também interage com o local ou a pessoa mais
        próximos. Em telas de toque, use os controles de movimento.
      </p>
      <div className="panel-section-heading">
        <h3>Os primeiros passos</h3>
        <Leaf size={17} />
      </div>
      <ol className="panel-help-steps">
        <li>
          <strong>Saia do orfanato.</strong> Explore a vila e converse com seus
          moradores.
        </li>
        <li>
          <strong>Prepare sua mochila.</strong> Compre provisões no mercado,
          reúna materiais e conheça o moinho, a padaria e a forja.
        </li>
        <li>
          <strong>Encontre um propósito.</strong> Consulte o mural para aceitar
          pedidos de abastecimento ou a missão da Cripta das Raízes. Entregue os
          pedidos no mercado.
        </li>
        <li>
          <strong>Crie raízes.</strong> Negocie, cultive sua terra e fortaleça
          seus laços.
        </li>
      </ol>
      <div className="panel-section-heading">
        <h3>O tempo do mundo</h3>
        <Sprout size={17} />
      </div>
      <p className="panel-prose">
        Agora é {calendar.season}, dia {calendar.day}, mês {calendar.month} de{" "}
        {calendar.year}. O tempo avança enquanto você explora o mundo e pausa
        nos painéis. O plantio guarda o prazo e a colheita da estação; sua
        família e seus laços amadurecem com a convivência.
      </p>
      <p className="panel-hint">Consulte a previsão de hoje e dos próximos dois dias no diário ou toque no clima no cenário. A chuva reduz a coleta externa a 80% e a capacidade de reposição externa em até 1 unidade por produto; o trabalho em minas e oficinas internas segue normal.</p>
      <div
        className="panel-season-table"
        role="table"
        aria-label="Prazo e rendimento do trigo por estação"
      >
        <div role="row">
          <span role="columnheader">Estação</span>
          <span role="columnheader">Prazo</span>
          <span role="columnheader">Trigo</span>
        </div>
        {[1, 91, 181, 271].map((day) => {
          const crop = cropProfile(day);
          return (
            <div role="row" key={crop.season}>
              <span role="cell">{crop.season}</span>
              <span role="cell">{crop.duration} dias</span>
              <span role="cell">{crop.yield}</span>
            </div>
          );
        })}
      </div>
      <p className="panel-hint">
        Rendimentos base; a prática de agricultura acrescenta trigo à colheita.
      </p>
      <div className="panel-section-heading">
        <h3>Produção e cuidado</h3>
        <Hammer size={17} />
      </div>
      <p className="panel-prose">
        No moinho, 2 trigo viram 1 farinha por 6 energia. Na padaria, 1 farinha
        e 1 madeira viram 2 pães por 8 energia. Na forja, 3 minério e 2 madeira
        viram 1 espada por 14 energia. Abra Produção no mercado ou na
        propriedade e vá à oficina correspondente para trabalhar.
      </p>
      <p className="panel-hint">Escolha de 1 a 10 receitas por lote. Ingredientes, energia e resultados são mostrados para o lote inteiro; a produção exige todos os recursos na oficina.</p>
      <p className="panel-prose">
        Casas perdem 3 pontos de condição por dia. Reparos usam 2 madeira e 1
        pedra para restaurar 25 pontos. Lina trabalha na parcela construída por
        5 ouro por dia, plantando e colhendo com sementes reais. Mantenha
        materiais, sementes e ouro para sustentar sua produção.
      </p>
      <div className="panel-section-heading">
        <h3>Portas e caminhos de Brumavale</h3>
        <Compass size={17} />
      </div>
      <p className="panel-prose">
        Aproxime-se da porta de um edifício e escolha Entrar. Dentro, caminhe
        até o balcão, a oficina ou a saída; o mapa mostra móveis e destinos
        locais. A saída devolve você à mesma porta. O celeiro e a casa da
        parcela, assim como os prédios dos terrenos, exigem a aquisição e a
        construção correspondentes. O mercado da praça continua sendo uma
        barraca aberta; a estalagem também abriga um balcão de comércio.
      </p>
      <p className="panel-prose">
        Nos Ermos, siga para o Desfiladeiro das Terras Altas, a leste. Brumavale
        tem trilhas, reservas de madeira, pedra, ervas e ferro, além do
        alojamento dos guardas e da capela, ambos exploráveis por dentro.
        Moradores se deslocam entre trabalho, convivência e abrigo; à noite,
        procure-os nos interiores. Ofertas aguardando verba ficam identificadas
        no diário; as aceitas mantêm a recompensa reservada até o prazo.
      </p>
      <div className="panel-section-heading">
        <h3>Animais da paisagem</h3>
        <Compass size={17} />
      </div>
      <p className="panel-prose">
        Bento, o cão, passeia perto do centro de Valeverde. Procure galinhas
        perto das plantações, ovelhas na campina ao sul e vacas a sudeste.
        Nos Ermos vivem cervos, coelhos e raposas. Aproxime-se devagar e use
        E, Interagir ou clique no animal. Observar registra o encontro nas
        memórias; oferecer pão ao cão ou trigo aos outros animais compatíveis
        consome uma unidade e aumenta a confiança, uma vez por animal a cada dia.
        Animais assustados fogem e descansam conforme o horário.
      </p>
      <p className="panel-prose">
        Encontros registrados: {state.wildlife.observed.length} de 22.
        Posição, confiança e alimentação ficam salvas. Criação de rebanhos,
        reprodução e caça ainda não estão disponíveis.
      </p>
      <div className="panel-section-heading">
        <h3>Sobre esta versão</h3>
        <ScrollText size={17} />
      </div>
      <p className="panel-prose">
        Kingdom Gods alpha 0.10 oferece interiores acessíveis, Terras Altas de Brumavale e reservas garantidas de trabalho. O mundo inclui árvores com copas variadas, grama,
        flores, arbustos e vento suave, além de 22 animais com rotinas próprias.
        Coleta, caminhada e combate têm partículas; o mercado considera oferta,
        estações e pedidos, e a produção paga seus trabalhadores. Há 15 pontos
        de madeira, pedra e ervas em Valeverde, 36 nos Ermos e quatro recursos
        na mina e 12 nas Terras Altas. Cada reserva se esgota e se renova com o calendário. Use o
        filtro do mapa para encontrar o material desejado. Inclui Valeverde,
        os Ermos de Alvor e a Mina do
        Ferro Antigo, além da cripta. Há ferramentas com desgaste, extração,
        oportunidades de exploração, educação dos filhos, tutela e herança.
        Nos Ermos, registre terras, construa armazéns ou abrigos e mantenha
        seus tributos em dia. Feitos reconhecidos pela vila dão acesso à
        Carta de Guardião de Alvor e à segunda parcela.
        A campanha é individual; multiplayer será desenvolvido depois das
        próximas etapas do mundo local.
      </p>
      <p className="panel-prose">
        O mapa traça caminhadas por rotas seguras; apóstolo e moradores
        contornam paredes, cercas e troncos.
      </p>
      <CampaignTransfer />
      <div className="panel-save-row">
        <div>
          <strong>Seu progresso fica neste navegador</strong>
          <p>
            {state.savedAt
              ? `Último registro: ${new Date(state.savedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
              : "Nenhum registro salvo ainda"}
          </p>
        </div>
        <button
          className="panel-button panel-button-small"
          onClick={() => {
            void store.save().catch(() => {});
          }}
        >
          Salvar agora
        </button>
      </div>
    </>
  );
}

export function GamePanel({
  panel,
  state,
  onClose,
}: {
  panel: Panel;
  state: GameState;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const shellRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!panel) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
      }
      if (event.key !== "Tab") return;
      const controls = shellRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]',
      );
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !shellRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !shellRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("keydown", keyboard);
      if (previous?.isConnected) previous.focus();
    };
  }, [panel]);
  if (!panel) return null;
  const meta = PANEL_META[panel];
  const Icon = meta.icon;
  const lastMessage = state.messages.at(-1);
  return (
    <div
      className="panel-overlay"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        className="panel-scrim"
        tabIndex={-1}
        aria-label="Fechar painel"
        onClick={onClose}
      />
      <aside
        ref={shellRef}
        className={`panel-shell panel-shell-${panel}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-panel-title"
      >
        <header className="panel-header">
          <div className="panel-header-icon">
            <Icon size={21} strokeWidth={1.5} />
          </div>
          <div>
            <span className="panel-overline">{meta.eyebrow}</span>
            <h2 id="game-panel-title">{meta.title}</h2>
          </div>
          <button
            className="panel-close"
            ref={closeRef}
            onClick={onClose}
            aria-label="Fechar painel"
          >
            <X size={19} />
          </button>
        </header>
        <div className="panel-scroll">
          {panel === "inventory" ? (
            <Inventory state={state} />
          ) : panel === "character" ? (
            <Character state={state} />
          ) : panel === "journal" ? (
            <Journal state={state} />
          ) : panel === "relations" ? (
            <Relations state={state} />
          ) : panel === "family" ? (
            <Family state={state} />
          ) : panel === "property" ? (
            <><TerritoryPanels state={state} onClose={onClose} /><PropertyPanel state={state} /></>
          ) : panel === "market" ? (
            <Market state={state} />
          ) : panel === "crafting" ? (
            <Crafting state={state} />
          ) : panel === "map" ? (
            <WorldMap state={state} onClose={onClose} />
          ) : (
            <Help state={state} />
          )}
        </div>
        <footer className="panel-footer">
          <div className="panel-footer-gold">
            <Coins size={14} />
            <b>{money(state.gold)}</b>
            <span>ouro</span>
          </div>
          <p
            aria-live="polite"
            className={
              lastMessage?.type === "error" || lastMessage?.type === "warning"
                ? "panel-footer-error"
                : ""
            }
          >
            {lastMessage?.text ||
              "Cada escolha escreve uma parte da sua história."}
          </p>
        </footer>
      </aside>
    </div>
  );
}
