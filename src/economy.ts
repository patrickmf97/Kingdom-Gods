import { ITEMS, OBJECTS } from "./data";
import { MARKET_TARGETS } from "./market";
import type {
  EconomyState,
  GameState,
  ItemId,
  Recipe,
  Season,
  VillageOrder,
} from "./types";

export const RECIPES: Recipe[] = [
  {
    id: "flour",
    name: "Moer farinha",
    station: "mill",
    inputs: { wheat: 2 },
    outputs: { flour: 1 },
    stamina: 6,
    skill: "farming",
    description:
      "Transforme dois feixes de trigo em um saco de farinha no moinho.",
  },
  {
    id: "bread",
    name: "Assar pão",
    station: "bakery",
    inputs: { flour: 1, wood: 1 },
    outputs: { bread: 2 },
    stamina: 8,
    skill: "cooking",
    description: "Farinha e lenha alimentam o forno da padaria.",
  },
  {
    id: "sword",
    name: "Forjar espada",
    station: "forge",
    inputs: { ore: 3, wood: 2 },
    outputs: { sword: 1 },
    stamina: 14,
    skill: "smithing",
    description: "Aqueça minério com lenha e trabalhe o ferro na forja.",
  },
];

export function cropProfile(day: number): {
  season: Season;
  duration: number;
  yield: number;
} {
  const yearDay =
    (Math.max(1, Number.isFinite(day) ? Math.floor(day) : 1) - 1) % 360;
  return [
    { season: "Primavera" as const, duration: 2, yield: 8 },
    { season: "Verão" as const, duration: 2, yield: 10 },
    { season: "Outono" as const, duration: 3, yield: 7 },
    { season: "Inverno" as const, duration: 4, yield: 4 },
  ][Math.floor(yearDay / 90)];
}

/** Legacy crops retain the promise made by alpha 0.1: two days, eight wheat. */
export function createEconomyState(
  day: number,
  plantedAt: number | null = null,
): EconomyState {
  return {
    condition: 100,
    crop:
      plantedAt === null
        ? null
        : {
            season: cropProfile(plantedAt).season,
            readyDay: plantedAt + 2,
            yield: 8,
          },
    worker: null,
    npcSavings: {},
    ledger: [],
    orders: [],
    civicFunds: 180,
    prosperity: 55,
    lastOrderDay: 0,
  };
}

export interface EconomicHooks {
  message(text: string, type?: string): void;
  remember(
    title: string,
    text: string,
    emotion: string,
    intensity?: number,
  ): void;
  rememberNpc(id: string, title: string, text: string, emotion: string): void;
  practice(skill: string, amount: number): void;
  nearObject(id: string): boolean;
  nearNpc(id: string): boolean;
}

function record(
  state: GameState,
  type: string,
  text: string,
  goldDelta = 0,
): void {
  state.economy.ledger.push({ day: state.day, type, text, goldDelta });
  if (state.economy.ledger.length > 30)
    state.economy.ledger.splice(0, state.economy.ledger.length - 30);
}

/** Successful transfers only; goldDelta always refers to the apostle's purse. */
export function recordMarketTrade(state: GameState, item: ItemId, buy: boolean, price: number): void {
  record(state, "trade", `${buy ? "Compra" : "Venda"}: 1 ${ITEMS[item].name} · ${price} coroas.`, buy ? -price : price);
}

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
const active = (order: VillageOrder) =>
  order.status === "available" || order.status === "accepted";
const amounts = (items: Partial<Record<ItemId, number>>) =>
  Object.entries(items) as [ItemId, number][];
const reservedFunds = (state: GameState) =>
  state.economy.orders
    .filter(active)
    .reduce((sum, order) => sum + order.reward, 0);

export function plantCrop(
  state: GameState,
  hooks: EconomicHooks,
  worker = false,
): boolean {
  const property = state.property;
  if (
    !property.owned ||
    property.plantedAt !== null ||
    state.inventory.seed < 1
  ) {
    if (!worker)
      hooks.message(
        !property.owned
          ? "Adquira a parcela primeiro."
          : property.plantedAt !== null
            ? "Já há uma plantação crescendo."
            : "Você precisa de sementes.",
        "warning",
      );
    return false;
  }
  const profile = cropProfile(state.day);
  state.inventory.seed--;
  property.plantedAt = state.day;
  state.economy.crop = {
    season: profile.season,
    readyDay: state.day + profile.duration,
    yield:
      profile.yield +
      (worker ? 0 : Math.floor(state.apostle.skills.farming / 20)),
  };
  if (!worker) hooks.practice("farming", 1);
  record(
    state,
    "plant",
    `${worker ? "Lina plantou" : "Plantio"}: 1 semente · ${profile.season} · colheita no dia ${state.economy.crop.readyDay}.`,
  );
  if (!worker)
    hooks.message(
      `Sementes plantadas · ${profile.season}, ${profile.duration} dias até a colheita.`,
      "success",
    );
  return true;
}

export function harvestCrop(
  state: GameState,
  hooks: EconomicHooks,
  worker = false,
): boolean {
  const crop = state.economy.crop;
  if (
    !state.property.owned ||
    state.property.plantedAt === null ||
    !crop ||
    state.day < crop.readyDay
  ) {
    if (!worker) hooks.message("O trigo ainda não está pronto.", "warning");
    return false;
  }
  state.inventory.wheat += crop.yield;
  state.inventory.seed++;
  state.property.plantedAt = null;
  state.property.harvests++;
  state.economy.crop = null;
  if (!worker) hooks.practice("farming", 3);
  record(
    state,
    "harvest",
    `${worker ? "Lina colheu" : "Colheita"}: ${crop.yield} trigo e 1 semente.`,
  );
  hooks.message(
    `${worker ? "Lina colheu" : "Colheita"}: ${crop.yield} trigo e 1 semente.`,
    "success",
  );
  return true;
}

/** Only the authority calls this; UI proximity checks merely communicate the rule. */
export function executeEconomicAction(
  state: GameState,
  action: string,
  hooks: EconomicHooks,
): boolean {
  const [verb, id] = action.split(":");
  if (verb === "craft") {
    const recipe = RECIPES.find((candidate) => candidate.id === id);
    if (!recipe) {
      hooks.message("Esta receita não existe.", "warning");
      return true;
    }
    if (!hooks.nearObject(recipe.station)) {
      hooks.message(
        `Vá até ${OBJECTS.find((object) => object.id === recipe.station)?.label || "a oficina"} para produzir.`,
        "warning",
      );
      return true;
    }
    if (state.apostle.stamina < recipe.stamina) {
      hooks.message("Recupere energia antes de trabalhar.", "warning");
      return true;
    }
    if (
      amounts(recipe.inputs).some(
        ([item, quantity]) => state.inventory[item] < quantity,
      )
    ) {
      hooks.message("Faltam ingredientes para esta receita.", "warning");
      return true;
    }
    for (const [item, quantity] of amounts(recipe.inputs))
      state.inventory[item] -= quantity;
    for (const [item, quantity] of amounts(recipe.outputs))
      state.inventory[item] += quantity;
    state.apostle.stamina -= recipe.stamina;
    hooks.practice(recipe.skill, 1);
    record(
      state,
      "craft",
      `${recipe.name}: ${amounts(recipe.outputs)
        .map(([item, quantity]) => `${quantity} ${ITEMS[item].name}`)
        .join(", ")}.`,
    );
    hooks.message(`${recipe.name}: produção concluída.`, "success");
    return true;
  }
  if (action === "repair") {
    if (!hooks.nearObject("property")) {
      hooks.message("Aproxime-se da parcela para reparar a casa.", "warning");
      return true;
    }
    if (!state.property.owned || !state.property.building) {
      hooks.message("É preciso construir sua casa primeiro.", "warning");
      return true;
    }
    if (state.economy.condition >= 100) {
      hooks.message("A casa já está em boas condições.");
      return true;
    }
    if (state.inventory.wood < 2 || state.inventory.stone < 1) {
      hooks.message("Reparar exige 2 madeira e 1 pedra.", "warning");
      return true;
    }
    state.inventory.wood -= 2;
    state.inventory.stone--;
    state.economy.condition = Math.min(100, state.economy.condition + 25);
    hooks.practice("building", 1);
    record(
      state,
      "repair",
      `Reparo: 2 madeira e 1 pedra · condição ${state.economy.condition}%.`,
    );
    hooks.message(
      `Casa reparada · condição ${state.economy.condition}%.`,
      "success",
    );
    return true;
  }
  if (verb === "hire" || action === "dismiss-worker") {
    if (!hooks.nearObject("property") && !hooks.nearNpc("farmer")) {
      hooks.message(
        "Converse com Lina ou vá à sua parcela para tratar do contrato.",
        "warning",
      );
      return true;
    }
    if (action === "dismiss-worker") {
      if (state.economy.worker) {
        const worker = state.economy.worker;
        state.economy.worker = null;
        record(state, "contract", "Contrato de trabalho encerrado.");
        hooks.rememberNpc(
          worker.npcId,
          "Fim de um trabalho",
          "Meu contrato na Parcela do Moinho chegou ao fim.",
          "Reflexão",
        );
        hooks.message(
          "Contrato encerrado. Novos salários deixam de ser cobrados.",
        );
      }
      return true;
    }
    const npc = state.npcs.find((candidate) => candidate.id === id);
    if (
      id !== "farmer" ||
      !npc ||
      state.family.some((person) => person.id === id && !person.alive) ||
      state.apostle.id === id
    ) {
      hooks.message("Lina não está disponível para este trabalho.", "warning");
      return true;
    }
    if (state.economy.worker) {
      hooks.message("Sua parcela já tem uma trabalhadora contratada.");
      return true;
    }
    if (
      !state.property.owned ||
      !state.property.building ||
      state.economy.condition < 25
    ) {
      hooks.message(
        "O trabalho exige uma parcela com casa construída e condição mínima de 25%.",
        "warning",
      );
      return true;
    }
    state.economy.worker = {
      npcId: id,
      wage: 5,
      hiredDay: state.day,
      loyalty: clamp(50 + Math.floor((npc.relation + npc.trust) / 10), 0, 90),
      unpaidDays: 0,
    };
    npc.mood = "Esperançosa com o novo trabalho";
    hooks.rememberNpc(
      id,
      "Um novo ofício",
      "Aceitei cuidar desta terra por cinco coroas diárias.",
      "Esperança",
    );
    hooks.remember(
      "Gente que constrói comigo",
      "Contratei Lina por 5 coroas por dia. O trabalho exige salário e respeito.",
      "Responsabilidade",
      70,
    );
    record(state, "contract", "Lina contratada por 5 coroas ao dia.");
    hooks.message(
      "Lina contratada · primeiro salário no próximo dia.",
      "success",
    );
    return true;
  }
  if (verb === "order-accept" || verb === "order-deliver") {
    const order = state.economy.orders.find((candidate) => candidate.id === id);
    if (!order) {
      hooks.message("Este pedido não existe.", "warning");
      return true;
    }
    if (verb === "order-accept") {
      if (!hooks.nearObject("sign") && !hooks.nearObject("market")) {
        hooks.message(
          "Procure o mural ou o mercado para aceitar o pedido.",
          "warning",
        );
        return true;
      }
      if (order.status !== "available" || state.day >= order.deadline) {
        hooks.message("Este pedido já não está disponível.", "warning");
        return true;
      }
      if (state.economy.civicFunds < order.reward) {
        hooks.message("A vila não tem orçamento para este pedido.", "warning");
        return true;
      }
      order.status = "accepted";
      record(
        state,
        "order",
        `Pedido aceito: ${order.title} · prazo dia ${order.deadline}.`,
      );
      hooks.message(
        `Pedido aceito · entregue ${order.quantity} ${ITEMS[order.item].name} no mercado antes do dia ${order.deadline}.`,
        "success",
      );
    } else {
      if (!hooks.nearObject("market")) {
        hooks.message(
          "Entregue as mercadorias pessoalmente no mercado.",
          "warning",
        );
        return true;
      }
      if (order.status !== "accepted" || state.day >= order.deadline) {
        hooks.message("Este pedido não pode mais ser entregue.", "warning");
        return true;
      }
      if (
        state.inventory[order.item] < order.quantity ||
        state.economy.civicFunds < order.reward
      ) {
        hooks.message(
          state.inventory[order.item] < order.quantity
            ? "Você ainda não reuniu todas as mercadorias."
            : "A vila não tem orçamento suficiente.",
          "warning",
        );
        return true;
      }
      state.inventory[order.item] -= order.quantity;
      state.economy.civicFunds -= order.reward;
      state.gold += order.reward;
      order.status = "fulfilled";
      state.economy.prosperity = clamp(state.economy.prosperity + 5, 0, 100);
      hooks.practice("trading", 2);
      record(
        state,
        "order",
        `Abastecimento concluído: ${order.title}.`,
        order.reward,
      );
      hooks.remember(
        "Pão e confiança",
        `Cumpri um pedido de abastecimento de Valeverde: ${order.title}. A vila guardou minha ajuda.`,
        "Gratidão",
        75,
      );
      hooks.message(
        `Entrega concluída · ${order.reward} coroas recebidas.`,
        "success",
      );
    }
    return true;
  }
  return false;
}

export function reconcileWorker(state: GameState, hooks: EconomicHooks): void {
  const worker = state.economy.worker;
  if (!worker) return;
  if (
    worker.npcId === state.apostle.id ||
    !state.npcs.some((npc) => npc.id === worker.npcId) ||
    state.family.some((person) => person.id === worker.npcId && !person.alive)
  ) {
    state.economy.worker = null;
    record(
      state,
      "contract",
      worker.npcId === state.apostle.id
        ? "A sucessora assumiu a casa; seu antigo contrato foi encerrado."
        : "Contrato encerrado: a trabalhadora já não está disponível.",
    );
    hooks.message("O antigo contrato de trabalho foi encerrado.");
  }
}

function workDay(state: GameState, hooks: EconomicHooks): void {
  reconcileWorker(state, hooks);
  const worker = state.economy.worker;
  if (!worker) return;
  const npc = state.npcs.find((person) => person.id === worker.npcId)!;
  if (state.gold < worker.wage) {
    worker.unpaidDays++;
    worker.loyalty = Math.max(0, worker.loyalty - 15);
    npc.trust = Math.max(0, npc.trust - 3);
    npc.relation = Math.max(0, npc.relation - 2);
    npc.mood = "Insatisfeita · salário atrasado";
    hooks.rememberNpc(
      npc.id,
      "Trabalho sem pagamento",
      `Meu salário não veio no dia ${state.day}. Não posso sustentar minha família assim.`,
      "Ressentimento",
    );
    record(
      state,
      "wage",
      `Salário de Lina atrasado · ${worker.unpaidDays} dia(s).`,
    );
    if (worker.unpaidDays >= 3) {
      state.economy.worker = null;
      hooks.remember(
        "Um vínculo rompido",
        "Lina pediu demissão depois de três dias sem salário. Minha falta de pagamento rompeu a confiança.",
        "Arrependimento",
        80,
      );
      hooks.message("Lina pediu demissão: três dias sem salário.", "warning");
    } else
      hooks.message(
        `Lina não trabalhou: salário atrasado há ${worker.unpaidDays} dia(s).`,
        "warning",
      );
    return;
  }
  state.gold -= worker.wage;
  state.economy.npcSavings[npc.id] =
    (state.economy.npcSavings[npc.id] || 0) + worker.wage;
  worker.loyalty = Math.min(100, worker.loyalty + 2);
  worker.unpaidDays = 0;
  npc.mood = "Valorizada no trabalho";
  record(
    state,
    "wage",
    `Salário de Lina pago · lealdade ${worker.loyalty}%.`,
    -worker.wage,
  );
  if (state.economy.condition < 25) {
    hooks.message(
      "A casa precisa de reparos. Lina recebeu o salário, mas o cultivo foi suspenso.",
      "warning",
    );
    return;
  }
  harvestCrop(state, hooks, true);
  plantCrop(state, hooks, true);
}

function orderDay(state: GameState, hooks: EconomicHooks): void {
  const economy = state.economy;
  for (const order of economy.orders) {
    if (!active(order) || state.day < order.deadline) continue;
    if (
      order.status === "available" &&
      state.market[order.item] >= order.quantity &&
      economy.civicFunds >= order.reward
    ) {
      state.market[order.item] -= order.quantity;
      economy.civicFunds -= order.reward;
      state.merchantGold += order.reward;
      order.status = "resolved";
      record(
        state,
        "order",
        `Moradores resolveram ${order.title} com o estoque do mercado.`,
      );
      hooks.message(`Os moradores resolveram o pedido: ${order.title}.`);
    } else {
      const accepted = order.status === "accepted";
      order.status = "failed";
      economy.prosperity = Math.max(0, economy.prosperity - 8);
      record(
        state,
        "order",
        `Prazo vencido: ${order.title} · abastecimento em falta.`,
      );
      if (accepted)
        hooks.remember(
          "O prazo que deixei passar",
          `Não cumpri o prazo do pedido ${order.title}. A falta de abastecimento prejudicou a vila.`,
          "Arrependimento",
          65,
        );
      hooks.message(
        `O pedido ${order.title} expirou. A vila sofre com a falta de abastecimento.`,
        "warning",
      );
    }
  }
  if (
    state.day < 2 ||
    economy.orders.some(active) ||
    (state.day - economy.lastOrderDay < 4 && economy.lastOrderDay > 0)
  )
    return;
  const index = Math.floor((state.day - 2) / 4) % 3;
  const requests: { item: ItemId; quantity: number; title: string }[] = [
    { item: "bread", quantity: 6, title: "Pão para os moradores" },
    { item: "wood", quantity: 6, title: "Lenha para os lares" },
    { item: "herb", quantity: 4, title: "Ervas para a curandeira" },
  ];
  const request = requests[index];
  const reward = Math.round(ITEMS[request.item].price * request.quantity * 1.4);
  if (economy.civicFunds < reward) return;
  economy.orders.push({
    id: `order-${state.day}-${request.item}`,
    ...request,
    reward,
    createdDay: state.day,
    deadline: state.day + 3,
    status: "available",
  });
  if (economy.orders.length > 12)
    economy.orders.splice(0, economy.orders.length - 12);
  economy.lastOrderDay = state.day;
  record(
    state,
    "order",
    `Novo pedido: ${request.title} · ${reward} coroas reservadas.`,
  );
  hooks.message(
    `Novo pedido no mural: ${request.title}. Participar é opcional.`,
  );
}

function regionalProduction(state: GameState): void {
  const stock = state.market;
  const season = cropProfile(state.day).season;
  const seasonIndex = ["Primavera", "Verão", "Outono", "Inverno"].indexOf(season);
  const supplies: { item: ItemId; npcId: string; capacity: number[]; unitCost: number }[] = [
    { item: "wheat", npcId: "farmer", capacity: [3, 4, 5, 1], unitCost: 2 },
    { item: "wood", npcId: "guard", capacity: [3, 3, 3, 2], unitCost: 1 },
    { item: "stone", npcId: "guard", capacity: [2, 2, 2, 1], unitCost: 2 },
    { item: "seed", npcId: "farmer", capacity: [2, 2, 1, 1], unitCost: 1 },
    { item: "herb", npcId: "mira", capacity: [1, 2, 1, 0], unitCost: 2 },
  ];
  const availableWorker = (id: string) => state.npcs.find((npc) =>
    npc.id === id && id !== state.apostle.id && state.economy.worker?.npcId !== id &&
    !state.family.some((person) => person.id === id && !person.alive));
  const pay = (id: string, coins: number) => {
    state.merchantGold -= coins;
    state.economy.npcSavings[id] = (state.economy.npcSavings[id] || 0) + coins;
  };
  const purchases: string[] = [];
  const production: string[] = [];
  const stalls = new Set<string>();
  for (const supply of supplies) {
    const gap = Math.max(0, MARKET_TARGETS[supply.item] - stock[supply.item]);
    if (!gap) continue;
    const capacity = supply.capacity[seasonIndex];
    if (!capacity) {
      stalls.add(`${ITEMS[supply.item].name}: sem coleta nesta estação`);
      continue;
    }
    const worker = availableWorker(supply.npcId);
    if (!worker) {
      stalls.add(`${ITEMS[supply.item].name}: trabalhador indisponível`);
      continue;
    }
    const planned = Math.min(capacity, gap);
    const quantity = Math.min(planned, Math.floor(state.merchantGold / supply.unitCost));
    if (quantity < planned) stalls.add("caixa do mercador sem moedas para toda a reposição");
    if (!quantity) continue;
    const paid = quantity * supply.unitCost;
    stock[supply.item] += quantity;
    pay(worker.id, paid);
    purchases.push(`${worker.name}: ${quantity} ${ITEMS[supply.item].name} por ${paid} coroas`);
  }
  if (purchases.length)
    record(state, "procurement", `Reposição paga · ${season}: ${purchases.join("; ")}.`);

  // The same physical recipes as the apostle's workshops, with one crown of
  // merchant-paid labor per batch. A private estate contract occupies Lina.
  for (const workshop of [
    { recipe: RECIPES[0], npcId: "farmer", capacity: 3 },
    { recipe: RECIPES[1], npcId: "matron", capacity: 4 },
  ]) {
    const { recipe } = workshop;
    const headroom = Math.min(...amounts(recipe.outputs).map(([item, quantity]) =>
      Math.floor(Math.max(0, MARKET_TARGETS[item] - stock[item]) / quantity)));
    if (!headroom) continue;
    const worker = availableWorker(workshop.npcId);
    if (!worker) {
      stalls.add(`${recipe.name}: trabalhador indisponível`);
      continue;
    }
    const inputs = Math.min(...amounts(recipe.inputs).map(([item, quantity]) =>
      Math.floor(stock[item] / quantity)));
    const planned = Math.min(workshop.capacity, headroom);
    const batches = Math.min(planned, inputs, state.merchantGold);
    if (inputs < planned) stalls.add(`${recipe.name}: insumos insuficientes`);
    if (state.merchantGold < Math.min(planned, inputs)) stalls.add(`${recipe.name}: caixa sem moedas para salários`);
    if (!batches) continue;
    for (const [item, quantity] of amounts(recipe.inputs)) stock[item] -= quantity * batches;
    for (const [item, quantity] of amounts(recipe.outputs)) stock[item] += quantity * batches;
    pay(worker.id, batches);
    production.push(`${recipe.name}: ${amounts(recipe.outputs)
      .map(([item, quantity]) => `${quantity * batches} ${ITEMS[item].name}`).join(", ")} · ${batches} coroas para ${worker.name}`);
  }
  const availableFunds = Math.max(
    0,
    state.economy.civicFunds - reservedFunds(state),
  );
  const bought = Math.min(
    3,
    stock.bread,
    Math.floor(availableFunds / ITEMS.bread.price),
  );
  stock.bread -= bought;
  state.economy.civicFunds -= bought * ITEMS.bread.price;
  state.merchantGold += bought * ITEMS.bread.price;
  record(
    state,
    "production",
    `Vila: ${production.length ? production.join("; ") : "sem produção nas oficinas"}; ${bought} pães consumidos por ${bought * ITEMS.bread.price} coroas da verba livre.${stalls.size ? ` Limites: ${[...stalls].join("; ")}.` : ""}`,
  );
}

/** One deterministic rollover; inn rest and long ticks call the same path. */
export function processEconomicDay(
  state: GameState,
  hooks: EconomicHooks,
): void {
  if (state.property.owned && state.property.building) {
    state.economy.condition = Math.max(0, state.economy.condition - 3);
    const tax = Math.min(2, state.gold);
    state.gold -= tax;
    state.economy.civicFunds += tax;
    if (tax)
      record(
        state,
        "tax",
        "Tributo da propriedade destinado ao orçamento de Valeverde.",
        -tax,
      );
  }
  workDay(state, hooks);
  orderDay(state, hooks);
  regionalProduction(state);
  if (state.economy.crop && state.day === state.economy.crop.readyDay)
    hooks.message(
      "O trigo amadureceu. Volte à sua parcela para colher.",
      "success",
    );
}
