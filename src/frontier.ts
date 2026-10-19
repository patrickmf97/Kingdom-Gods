import { ITEMS } from "./data";
import { civicBudget, frontierJobFunded } from "./civic-budget";
import { RESOURCE_NODES, objectsForZone, resourceNode } from "./regions";
import type {
  ExpansionHooks,
  FrontierJob,
  FrontierState,
  GameState,
  ResourceNodeDefinition,
  ToolId,
} from "./types";

export const TOOL_DEFS: Record<ToolId, { name: string; cost: number; description: string }> = {
  axe: { name: "Machado de lenhador", cost: 24, description: "Abre o trabalho nos carvalhos das Terras Livres. Cada coleta desgasta 3 pontos." },
  pickaxe: { name: "Picareta de ferro", cost: 28, description: "Extrai pedra e ferro na mina. Cada extração desgasta 3 pontos." },
};

export const DISCOVERY_IDS = ["wild-camp", "wild-ruins", "wild-lake", "wild-mine"] as const;
export const FRONTIER_JOB_DEFS: (Omit<FrontierJob, "deadline" | "status"> & { deadlineOffset: number })[] = [
  {
    id: "survey-trails",
    title: "Conhecer as Terras Livres",
    description: "Visite o acampamento, as ruínas, o lago e a entrada da mina. Volte ao mural ou ao acampamento para registrar o percurso.",
    kind: "survey",
    item: null,
    quantity: 0,
    targets: [...DISCOVERY_IDS],
    reward: 18,
    deadlineOffset: 8,
  },
  {
    id: "mine-supply",
    title: "Ferro para a forja",
    description: "Aldric precisa de quatro minérios de ferro. Leve-os ao mercado ou ao mural; a mina oferece uma alternativa pacífica à cripta.",
    kind: "delivery",
    item: "ore",
    quantity: 4,
    targets: [],
    reward: 52,
    deadlineOffset: 6,
  },
  {
    id: "healing-herbs",
    title: "Ervas para os viajantes",
    description: "Entregue cinco ervas medicinais ao mercado ou ao mural para abastecer a curandeira.",
    kind: "delivery",
    item: "herb",
    quantity: 5,
    targets: [],
    reward: 38,
    deadlineOffset: 6,
  },
];

/** Every tool, node charge and paid promise belongs to the saved campaign. */
export function createFrontierState(day: number): FrontierState {
  const startDay = Math.max(1, Number.isFinite(day) ? Math.floor(day) : 1);
  return {
    tools: { axe: { owned: false, durability: 0 }, pickaxe: { owned: false, durability: 0 } },
    toolStock: { axe: 3, pickaxe: 3 },
    resources: Object.fromEntries(RESOURCE_NODES.map(node => [node.id, { remaining: node.capacity, readyDay: null }])),
    work: null,
    discovered: [],
    jobs: FRONTIER_JOB_DEFS.map(({ deadlineOffset, ...job }) => ({ ...job, targets: [...job.targets], deadline: startDay + deadlineOffset, status: "available" })),
    escrow: 0,
  };
}

export function carriedWeight(state: GameState): number {
  return Object.entries(ITEMS).reduce((weight, [id, item]) => weight + state.inventory[id as keyof typeof ITEMS] * item.weight, 0);
}

export function carryingCapacity(state: GameState): number {
  return 20 + Math.max(0, state.apostle.attributes.strength) * 5;
}

export function resourceYield(state: GameState, node: ResourceNodeDefinition): number {
  return node.yield + Math.min(2, Math.max(0, Math.floor((state.apostle.skills[node.skill] || 0) / 30)));
}

function alive(state: GameState): boolean {
  return state.phase === "playing" && state.apostle.alive && state.apostle.hp > 0;
}

function nearby(state: GameState, node: ResourceNodeDefinition): boolean {
  return state.zone === node.zone && Math.hypot(state.apostle.x - node.x, state.apostle.y - node.y) <= 120;
}

function marketplace(state: GameState, hooks: ExpansionHooks): boolean {
  return hooks.nearObject("market") || hooks.nearObject("forge");
}

function jobDesk(state: GameState, job: FrontierJob, hooks: ExpansionHooks): boolean {
  return hooks.nearObject("market") || hooks.nearObject("sign") ||
    (job.kind === "survey" && hooks.nearObject("wild-camp"));
}

function warning(hooks: ExpansionHooks, text: string): true {
  hooks.message(text, "warning");
  return true;
}

function fitsYield(state: GameState, node: ResourceNodeDefinition): boolean {
  return carriedWeight(state) + resourceYield(state, node) * ITEMS[node.resource].weight <= carryingCapacity(state) + 1e-7;
}

function canToolWork(state: GameState, node: ResourceNodeDefinition): boolean {
  return !node.tool || (state.frontier.tools[node.tool].owned && state.frontier.tools[node.tool].durability > 0);
}

export function cancelWork(state: GameState, hooks?: ExpansionHooks, reason?: string): void {
  if (!state.frontier.work) return;
  state.frontier.work = null;
  if (hooks && reason) hooks.message(reason);
}

/** Returns whether the action belongs to this module, including rejected actions. */
export function executeFrontierAction(state: GameState, action: string, hooks: ExpansionHooks): boolean {
  const [verb, id] = action.split(":");
  if (!["buy-tool", "repair-tool", "start-work", "frontier-accept", "frontier-claim", "cancel-work"].includes(verb)) return false;
  if (!alive(state)) return true;
  if (verb === "cancel-work") {
    cancelWork(state, hooks, "Trabalho interrompido. A energia já empregada não é recuperada.");
    return true;
  }
  if (verb === "buy-tool" || verb === "repair-tool") {
    if (id !== "axe" && id !== "pickaxe") return warning(hooks, "Esta ferramenta não existe.");
    const tool = state.frontier.tools[id];
    const definition = TOOL_DEFS[id];
    if (verb === "buy-tool") {
      if (!marketplace(state, hooks)) return warning(hooks, "Vá ao mercado ou à forja para comprar ferramentas.");
      if (tool.owned) return warning(hooks, "Esta ferramenta já pertence à sua casa. Repare-a na forja quando necessário.");
      if (state.frontier.toolStock[id] < 1) return warning(hooks, "O estoque desta ferramenta acabou.");
      if (state.gold < definition.cost) return warning(hooks, "Ouro insuficiente para esta ferramenta.");
      if (!Number.isSafeInteger(state.merchantGold + definition.cost)) return warning(hooks, "O mercador não pode receber mais moedas.");
      state.gold -= definition.cost;
      state.merchantGold += definition.cost;
      state.frontier.toolStock[id]--;
      tool.owned = true;
      tool.durability = 100;
      hooks.practice("trading", 0.4);
      hooks.message(`${definition.name} comprado por ${definition.cost} coroas.`, "success");
    } else {
      if (!hooks.nearObject("forge")) return warning(hooks, "Leve a ferramenta à forja de Aldric.");
      if (!tool.owned) return warning(hooks, "Você ainda não possui esta ferramenta.");
      if (tool.durability >= 100) return warning(hooks, "A ferramenta já está em perfeito estado.");
      if (state.inventory.ore < 1 || state.inventory.wood < 1 || state.gold < 3) return warning(hooks, "O reparo exige 1 minério, 1 madeira e 3 coroas.");
      if (!Number.isSafeInteger(state.merchantGold + 3)) return warning(hooks, "A forja não pode receber mais moedas.");
      state.inventory.ore--;
      state.inventory.wood--;
      state.gold -= 3;
      state.merchantGold += 3;
      tool.durability = Math.min(100, tool.durability + 50);
      hooks.practice("smithing", 0.5);
      hooks.message(`${definition.name} reparado · condição ${tool.durability}%.`, "success");
    }
    return true;
  }
  if (verb === "start-work") {
    const node = resourceNode(id);
    if (!node) return warning(hooks, "Este recurso não existe.");
    if (state.frontier.work) return warning(hooks, "Conclua ou interrompa o trabalho atual primeiro.");
    if (!nearby(state, node)) return warning(hooks, "Aproxime-se do recurso para trabalhar.");
    if (state.zone === "mine" && state.apostle.age < 12) return warning(hooks, "A tutela impede o trabalho na mina antes dos 12 anos.");
    if (!canToolWork(state, node)) return warning(hooks, `Você precisa de ${node.tool ? TOOL_DEFS[node.tool].name.toLowerCase() : "uma ferramenta"} em condições de uso.`);
    const resource = state.frontier.resources[node.id];
    if (!resource || resource.remaining < 1) return warning(hooks, `Este recurso se renova no dia ${resource?.readyDay || "seguinte"}. Explore outros veios e plantas.`);
    if (state.apostle.stamina < node.stamina) return warning(hooks, "Recupere energia antes de trabalhar.");
    if (!fitsYield(state, node)) return warning(hooks, "Sua carga está pesada demais. Venda ou use itens antes de coletar.");
    state.apostle.stamina -= node.stamina;
    state.frontier.work = { nodeId: node.id, zone: node.zone, elapsed: 0, duration: node.duration };
    hooks.message(`${node.label} · trabalhando por ${node.duration}s. Caminhar interrompe a ação.`);
    return true;
  }
  const job = state.frontier.jobs.find(candidate => candidate.id === id);
  if (!job) return warning(hooks, "Esta oportunidade não existe.");
  if (!jobDesk(state, job, hooks)) return warning(hooks, job.kind === "survey" ? "Volte ao mural, ao mercado ou ao acampamento para registrar o percurso." : "Vá ao mercado ou ao mural de Valeverde para tratar da entrega.");
  if (state.day >= job.deadline) return warning(hooks, "O prazo desta oportunidade terminou.");
  if (verb === "frontier-accept") {
    if (job.status !== "available") return warning(hooks, "Esta oportunidade já foi assumida ou encerrada.");
    if (!frontierJobFunded(state, job.id)) return warning(hooks, `Esta oportunidade aguarda verba: ${job.reward} coroas necessárias; ${civicBudget(state).available} livres após as reservas do conselho e das outras oportunidades.`);
    state.economy.civicFunds -= job.reward;
    state.frontier.escrow += job.reward;
    job.status = job.kind === "survey" && job.targets.every(target => state.frontier.discovered.includes(target)) ? "complete" : "accepted";
    hooks.message(`Oportunidade aceita: ${job.title}. ${job.reward} coroas ficam reservadas até o dia ${job.deadline}.`, "success");
    return true;
  }
  if (job.status !== "accepted" && job.status !== "complete") return warning(hooks, "Aceite esta oportunidade antes de solicitar a recompensa.");
  if (job.kind === "survey" && !job.targets.every(target => state.frontier.discovered.includes(target))) return warning(hooks, "Ainda faltam locais para conhecer nas Terras Livres.");
  if (job.kind === "delivery" && (!job.item || state.inventory[job.item] < job.quantity)) return warning(hooks, `A entrega exige ${job.quantity} ${job.item ? ITEMS[job.item].name : "itens"}.`);
  if (state.frontier.escrow < job.reward || !Number.isSafeInteger(state.gold + job.reward)) return warning(hooks, "A recompensa não pode ser transferida neste momento.");
  if (job.item) {
    if (!Number.isSafeInteger(state.market[job.item] + job.quantity)) return warning(hooks, "O estoque do mercado não pode receber esta entrega.");
    state.inventory[job.item] -= job.quantity;
    state.market[job.item] += job.quantity;
  }
  state.frontier.escrow -= job.reward;
  state.gold += job.reward;
  job.status = "claimed";
  state.economy.prosperity = Math.min(100, state.economy.prosperity + 3);
  hooks.practice(job.kind === "survey" ? "perception" : "trading", 1);
  hooks.remember("Uma oportunidade cumprida", `Cumpri ${job.title} e recebi ${job.reward} coroas. Minha escolha ajudou o abastecimento e as rotas da vila.`, "Orgulho", 55);
  hooks.message(`${job.title} concluído · +${job.reward} coroas.`, "success");
  return true;
}

/** Elapsed work is saved, but passage of calendar time alone never finishes it. */
export function updateFrontierWork(state: GameState, deltaSeconds: number, hooks: ExpansionHooks): void {
  const work = state.frontier.work;
  if (!work || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
  const node = resourceNode(work.nodeId);
  if (!alive(state) || !node || !nearby(state, node) || work.zone !== node.zone || !canToolWork(state, node)) {
    cancelWork(state, hooks, "O trabalho foi interrompido antes da coleta.");
    return;
  }
  work.elapsed = Math.min(node.duration, work.elapsed + deltaSeconds);
  if (work.elapsed < node.duration - 1e-7) return;
  const resource = state.frontier.resources[node.id];
  if (!resource || resource.remaining < 1 || !fitsYield(state, node)) {
    cancelWork(state, hooks, "A coleta foi interrompida: falta espaço na carga ou o recurso se esgotou.");
    return;
  }
  const quantity = resourceYield(state, node);
  // Retire the in-progress action first: repeated ticks cannot pay it twice.
  state.frontier.work = null;
  resource.remaining--;
  if (resource.remaining === 0) resource.readyDay = state.day + node.respawnDays;
  if (node.tool) state.frontier.tools[node.tool].durability = Math.max(0, state.frontier.tools[node.tool].durability - 3);
  state.inventory[node.resource] += quantity;
  hooks.practice(node.skill, 0.8);
  hooks.message(`+${quantity} ${ITEMS[node.resource].name} · ${resource.remaining} coleta(s) restantes neste ponto.`, "success");
}

export function discoverLocation(state: GameState, id: string, hooks: ExpansionHooks): void {
  if (!alive(state) || state.zone !== "wilderness" || !DISCOVERY_IDS.includes(id as typeof DISCOVERY_IDS[number]) || state.frontier.discovered.includes(id)) return;
  const landmark = objectsForZone(state.zone).find(object => object.id === id);
  if (!landmark || Math.hypot(state.apostle.x - landmark.x, state.apostle.y - landmark.y) > 120) return;
  state.frontier.discovered.push(id);
  hooks.remember("Um novo caminho", `Conheci ${landmark.label} nas Terras Livres. Agora consigo reconhecer esse lugar durante minhas viagens.`, "Curiosidade", 40);
  hooks.message(`Local descoberto: ${landmark.label}.`, "success");
  for (const job of state.frontier.jobs) {
    if (job.kind === "survey" && job.status === "accepted" && state.day < job.deadline && job.targets.every(target => state.frontier.discovered.includes(target))) {
      job.status = "complete";
      hooks.message(`Percurso completo: ${job.title}. Registre-o no acampamento ou em Valeverde.`, "success");
    }
  }
}

/** The distant world resolves offers without inventing stock or currency. */
export function processFrontierDay(state: GameState, hooks: ExpansionHooks): void {
  for (const node of RESOURCE_NODES) {
    const resource = state.frontier.resources[node.id];
    if (resource.remaining === 0 && resource.readyDay !== null && state.day >= resource.readyDay) {
      resource.remaining = node.capacity;
      resource.readyDay = null;
    }
  }
  for (const job of state.frontier.jobs) {
    if (!["available", "accepted", "complete"].includes(job.status) || state.day < job.deadline) continue;
    const undertaken = job.status === "accepted" || job.status === "complete";
    if (undertaken) {
      state.frontier.escrow -= job.reward;
      state.economy.civicFunds += job.reward;
      job.status = "failed";
      state.economy.prosperity = Math.max(0, state.economy.prosperity - 3);
      hooks.remember("Uma promessa interrompida", `Deixei passar o prazo de ${job.title}. A recompensa reservada voltou ao tesouro da vila.`, "Arrependimento", 55);
      hooks.message(`Prazo encerrado: ${job.title}. A recompensa voltou ao tesouro.`, "warning");
    } else if (job.kind === "delivery" && job.item && state.market[job.item] >= job.quantity && civicBudget(state).available >= job.reward && Number.isSafeInteger(state.merchantGold + job.reward)) {
      state.market[job.item] -= job.quantity;
      state.economy.civicFunds -= job.reward;
      state.merchantGold += job.reward;
      job.status = "resolved";
      state.economy.prosperity = Math.min(100, state.economy.prosperity + 2);
      hooks.message(`Moradores resolveram a oportunidade ${job.title} usando o estoque do mercado.`);
    } else {
      job.status = "failed";
      if (job.kind === "delivery") state.economy.prosperity = Math.max(0, state.economy.prosperity - 3);
      hooks.message(`A oportunidade ${job.title} encerrou seu prazo.`);
    }
  }
}
