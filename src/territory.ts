import { ITEMS, OBJECTS } from "./data";
import { carriedWeight, carryingCapacity } from "./frontier";
import { interiorForZone } from "./interiors";
import {
  ESTATE_BUILDINGS,
  ESTATE_DEFS,
  ESTATE_STORAGE_CAPACITY,
  estateLimit,
  estateStorageWeight,
  territoryDeedValue,
  territoryInfluence,
} from "./territory-data";
import type { EstateBuilding, EstateHolding, EstateId, ExpansionHooks, GameState, ItemId, TerritoryState } from "./types";

const CHARTER_COST = 60;
const CHARTER_INFLUENCE = 12;
const verbs = new Set(["estate-buy", "estate-build", "estate-repair", "estate-deposit", "estate-withdraw", "estate-rest", "realm-charter", "realm-pay-debt"]);
const itemIds = Object.keys(ITEMS) as ItemId[];
const blankStorage = () => Object.fromEntries(itemIds.map(id => [id, 0])) as Record<ItemId, number>;
const blankHolding = (): EstateHolding => ({ owned: false, registeredDay: null, building: "none", condition: 0, storage: blankStorage() });

export function createTerritoryState(day: number): TerritoryState {
  return {
    parcels: { "oak-hollow": blankHolding(), "stone-rise": blankHolding() },
    influence: 0,
    deeds: [],
    charter: false,
    arrears: 0,
    lastTaxDay: Number.isSafeInteger(day) && day > 0 ? day : 1,
  };
}

function nearRegistry(state: GameState): boolean {
  const sign = OBJECTS.find(object => object.id === "sign")!;
  return state.zone === "village" && Math.hypot(state.apostle.x - sign.x, state.apostle.y - sign.y) <= 140;
}

function nearEstate(state: GameState, id: EstateId): boolean {
  const room = interiorForZone(state.zone);
  const station = room?.stations.find(station => station.id === id);
  if (station?.kind === "estate") return Math.hypot(state.apostle.x - station.x, state.apostle.y - station.y) <= 140;
  const point = ESTATE_DEFS.find(estate => estate.id === id)!;
  return state.zone === "wilderness" && Math.hypot(state.apostle.x - point.x, state.apostle.y - point.y) <= 140;
}

function canReceiveCivic(state: GameState, amount: number): boolean {
  return Number.isSafeInteger(state.economy.civicFunds) && Number.isSafeInteger(state.economy.civicFunds + amount);
}

function record(state: GameState, type: string, text: string, goldDelta: number): void {
  state.economy.ledger.push({ day: state.day, type, text, goldDelta });
  if (state.economy.ledger.length > 30) state.economy.ledger.splice(0, state.economy.ledger.length - 30);
}

/** Shared by intent handling and UI: no eligibility check mutates the campaign. */
export function estateActionReason(state: GameState, action: string): string | null {
  const [verb, id, detail, quantity, ...extra] = action.split(":");
  if (!verbs.has(verb)) return "Esta ação territorial não existe.";
  if (state.phase !== "playing" || !state.apostle.alive || state.apostle.hp <= 0) return "Apenas um apóstolo vivo pode agir.";
  if (verb === "realm-charter" || verb === "realm-pay-debt") {
    if (id !== undefined) return "Pedido de registro inválido.";
    if (!nearRegistry(state)) return "Compareça ao mural de Valeverde para tratar do registro de Auren.";
    if (verb === "realm-pay-debt") {
      if (state.territory.arrears <= 0) return "Sua casa não possui tributos pendentes.";
      if (state.gold < 1) return "Você precisa de ao menos uma coroa para quitar os tributos.";
      if (state.economy.civicFunds >= Number.MAX_SAFE_INTEGER) return "O tesouro não pode receber mais moedas.";
      return null;
    }
    if (state.apostle.age < 16) return "A tutela reserva novas cartas de Auren para a maioridade, aos 16 anos.";
    if (state.territory.charter) return "Sua casa já recebeu a Carta de Alvor.";
    if (state.territory.arrears > 0) return "Quite os tributos pendentes antes de pedir a Carta de Alvor.";
    if (!state.property.owned && !Object.values(state.territory.parcels).some(parcel => parcel.owned)) return "A Carta de Alvor exige uma propriedade registrada em sua casa.";
    if (state.territory.influence < CHARTER_INFLUENCE) return `A Carta de Alvor exige ${CHARTER_INFLUENCE} de influência por serviços prestados.`;
    if (state.gold < CHARTER_COST) return `O registro da Carta de Alvor custa ${CHARTER_COST} coroas.`;
    if (!canReceiveCivic(state, CHARTER_COST)) return "O tesouro não pode receber mais moedas.";
    return null;
  }

  const definition = ESTATE_DEFS.find(estate => estate.id === id);
  if (!definition) return "Este terreno não consta no registro de Auren.";
  const parcel = state.territory.parcels[definition.id];
  const storageAction = verb === "estate-deposit" || verb === "estate-withdraw";
  if (extra.length || (storageAction ? detail === undefined || quantity === undefined : verb === "estate-build" ? detail === undefined || quantity !== undefined : detail !== undefined)) return "Ação territorial inválida.";
  if (!nearEstate(state, definition.id)) return "Aproxime-se da placa do terreno nas Terras Livres.";
  if (verb === "estate-buy") {
    if (state.apostle.age < 16) return "A tutela impede a aquisição de terras antes dos 16 anos.";
    if (parcel.owned) return "Este terreno já pertence à sua casa.";
    if (state.territory.arrears > 0) return "Quite os tributos pendentes antes de adquirir outra terra.";
    if (Object.values(state.territory.parcels).filter(holding => holding.owned).length >= estateLimit(state)) return "Seu registro permite um terreno nas Terras Livres. A Carta de Alvor amplia o limite para dois.";
    if (state.gold < definition.cost) return `O registro deste terreno custa ${definition.cost} coroas.`;
    if (!canReceiveCivic(state, definition.cost)) return "O tesouro não pode receber mais moedas.";
    return null;
  }
  if (!parcel.owned) return "Este terreno ainda não pertence à sua casa.";
  if (verb === "estate-build") {
    if (detail !== "warehouse" && detail !== "shelter") return "Escolha um armazém ou um abrigo de viagem.";
    if (state.apostle.age < 16) return "Novas construções exigem a maioridade aos 16 anos.";
    if (state.territory.arrears > 0) return "Quite os tributos pendentes antes de construir.";
    if (parcel.building !== "none") return "Este terreno já possui sua construção permanente.";
    const building = ESTATE_BUILDINGS[detail];
    if (state.inventory.wood < building.wood || state.inventory.stone < building.stone) return `A construção exige ${building.wood} madeiras e ${building.stone} pedras.`;
    if (state.apostle.stamina < building.stamina) return `Recupere ${building.stamina} de energia para construir.`;
    return null;
  }
  if (verb === "estate-repair") {
    if (parcel.building === "none") return "Construa antes de realizar manutenção.";
    if (parcel.condition >= 100) return "A construção já está em perfeito estado.";
    if (state.inventory.wood < 3 || state.inventory.stone < 2) return "A manutenção exige 3 madeiras e 2 pedras.";
    if (state.apostle.stamina < 8) return "A manutenção exige 8 de energia.";
    return null;
  }
  if (verb === "estate-rest") {
    if (parcel.building !== "shelter") return "Construa um abrigo para descansar neste terreno.";
    if (state.territory.arrears > 0) return "Quite os tributos antes de utilizar o abrigo.";
    if (parcel.condition < 25) return "Repare o abrigo até alcançar 25% de condição.";
    if (state.inventory.wood < 1) return "A fogueira do abrigo exige uma madeira.";
    return null;
  }
  if (!storageAction) return "Esta ação territorial não existe.";
  if (!Object.hasOwn(ITEMS, detail) || (quantity !== "1" && quantity !== "5")) return "Transfira uma ou cinco unidades de um item conhecido.";
  if (parcel.building !== "warehouse") return "Construa um armazém para guardar bens neste terreno.";
  const item = detail as ItemId;
  const amount = Number(quantity);
  if (verb === "estate-deposit") {
    if (state.territory.arrears > 0) return "Quite os tributos antes de guardar novos bens. As retiradas continuam disponíveis.";
    if (parcel.condition < 25) return "Repare o armazém até 25% de condição para guardar novos bens. As retiradas continuam disponíveis.";
    if (!Number.isSafeInteger(state.inventory[item]) || state.inventory[item] < amount) return "Você não carrega essa quantidade do item.";
    if (!Number.isSafeInteger(parcel.storage[item] + amount)) return "O estoque não pode receber mais itens.";
    if (estateStorageWeight(parcel) + ITEMS[item].weight * amount > ESTATE_STORAGE_CAPACITY + 1e-7) return "O armazém suporta até 120 de peso.";
  } else {
    if (!Number.isSafeInteger(parcel.storage[item]) || parcel.storage[item] < amount) return "Não há essa quantidade guardada neste armazém.";
    if (!Number.isSafeInteger(state.inventory[item] + amount)) return "Seu inventário não pode receber mais itens.";
    if (carriedWeight(state) + ITEMS[item].weight * amount > carryingCapacity(state) + 1e-7) return "Sua carga não comporta esta retirada. Guarde ou use outros itens.";
  }
  return null;
}

/** All rejected recognized actions are handled, preventing fallthrough to other systems. */
export function executeTerritoryAction(state: GameState, action: string, hooks: ExpansionHooks): boolean {
  const [verb, rawId, detail, quantity] = action.split(":");
  if (!verbs.has(verb)) return false;
  let reason = estateActionReason(state, action);
  // Settle the old ownership before adding a holding or a charter obligation.
  // Recheck afterwards: settlement may consume the proposed purchase budget.
  if (!reason && (verb === "estate-buy" || verb === "estate-build" || verb === "realm-charter")) {
    processTerritoryDay(state, hooks);
    reason = estateActionReason(state, action);
  }
  if (reason) {
    hooks.message(reason, "warning");
    return true;
  }
  if (verb === "realm-pay-debt") {
    const paid = Math.min(state.gold, state.territory.arrears, Number.MAX_SAFE_INTEGER - state.economy.civicFunds);
    state.gold -= paid;
    state.economy.civicFunds += paid;
    state.territory.arrears -= paid;
    record(state, "territory-debt", `Tributos de Auren quitados: ${paid} coroas.`, -paid);
    hooks.message(`${paid} coroas pagas ao registro. Tributos pendentes: ${state.territory.arrears}.`, "success");
    return true;
  }
  if (verb === "realm-charter") {
    state.gold -= CHARTER_COST;
    state.economy.civicFunds += CHARTER_COST;
    state.territory.charter = true;
    state.apostle.title = "Guardião de Alvor";
    record(state, "charter", "Registro da Carta de Alvor: limite de dois terrenos e uma coroa diária de obrigação.", -CHARTER_COST);
    hooks.remember("A Carta de Alvor", "Auren reconheceu os serviços da minha casa. Posso registrar dois terrenos nas Terras Livres; aceitei uma coroa diária de obrigação e continuo sujeito ao reino.", "Orgulho", 65);
    hooks.message("Carta de Alvor registrada. Sua casa pode possuir dois terrenos nas Terras Livres e deve mais uma coroa por dia.", "success");
    return true;
  }
  const id = rawId as EstateId;
  const definition = ESTATE_DEFS.find(estate => estate.id === id)!;
  const parcel = state.territory.parcels[id];
  if (verb === "estate-buy") {
    state.gold -= definition.cost;
    state.economy.civicFunds += definition.cost;
    parcel.owned = true;
    parcel.registeredDay = state.day;
    record(state, "land", `${definition.name} registrado em Auren por ${definition.cost} coroas.`, -definition.cost);
    hooks.remember("Uma terra além da vila", `Registrei ${definition.name} para minha casa. O terreno pertence a Auren e exige uma coroa diária de tributo.`, "Esperança", 55);
    hooks.message(`${definition.name} pertence à sua casa. Tributo: uma coroa por dia.`, "success");
  } else if (verb === "estate-build") {
    const kind = detail as Exclude<EstateBuilding, "none">;
    const building = ESTATE_BUILDINGS[kind];
    state.inventory.wood -= building.wood;
    state.inventory.stone -= building.stone;
    state.apostle.stamina -= building.stamina;
    parcel.building = kind;
    parcel.condition = 100;
    hooks.practice("building", 1.5);
    hooks.remember("Uma obra da minha casa", `Construí ${building.name.toLowerCase()} em ${definition.name}, usando madeira, pedra e meu próprio esforço.`, "Orgulho", 45);
    hooks.message(`${building.name} construído em ${definition.name}. A condição diminui dois pontos por dia.`, "success");
  } else if (verb === "estate-repair") {
    state.inventory.wood -= 3;
    state.inventory.stone -= 2;
    state.apostle.stamina -= 8;
    parcel.condition = Math.min(100, parcel.condition + 40);
    hooks.practice("building", 0.6);
    hooks.message(`Construção reparada · condição ${parcel.condition}%.`, "success");
  } else if (verb === "estate-rest") {
    if (!hooks.rest) {
      hooks.message("O descanso não está disponível neste momento.", "warning");
      return true;
    }
    state.inventory.wood--;
    hooks.rest(4, 20);
    hooks.message("A fogueira aqueceu o abrigo durante quatro horas de descanso.", "success");
  } else {
    const item = detail as ItemId;
    const amount = Number(quantity);
    const deposit = verb === "estate-deposit";
    state.inventory[item] += deposit ? -amount : amount;
    parcel.storage[item] += deposit ? amount : -amount;
    if (deposit && state.inventory[item] === 0 && state.apostle.equipment === item) state.apostle.equipment = null;
    hooks.message(`${amount} ${ITEMS[item].name} ${deposit ? "guardado(s)" : "retirado(s)"} em ${definition.name}.`, "success");
  }
  return true;
}

/** Charge each simulated date once, including large skips, without per-day loops. */
export function processTerritoryDay(state: GameState, hooks: ExpansionHooks): void {
  const territory = state.territory;
  if (!Number.isSafeInteger(state.day) || !Number.isSafeInteger(territory.lastTaxDay) || state.day <= territory.lastTaxDay) return;
  const previousTaxDay = territory.lastTaxDay;
  const elapsedDays = state.day - previousTaxDay;
  territory.lastTaxDay = state.day;
  let due = territory.charter ? elapsedDays : 0;
  for (const parcel of Object.values(territory.parcels)) {
    if (!parcel.owned) continue;
    const ownedDays = Math.max(0, state.day - Math.max(previousTaxDay, parcel.registeredDay ?? previousTaxDay));
    due = Math.min(Number.MAX_SAFE_INTEGER, due + ownedDays);
    if (parcel.building !== "none") parcel.condition = Math.max(0, parcel.condition - Math.min(100, ownedDays * 2));
  }
  if (due === 0) return;
  const paid = Math.max(0, Math.min(state.gold, due, Number.MAX_SAFE_INTEGER - state.economy.civicFunds));
  state.gold -= paid;
  state.economy.civicFunds += paid;
  territory.arrears = Math.min(Number.MAX_SAFE_INTEGER, territory.arrears + (due - paid));
  record(state, "territory-tax", `Tributos das Terras Livres: ${paid} de ${due} coroas pagas.`, -paid);
  if (paid < due) hooks.message(`Tributos de Auren pendentes: ${territory.arrears} coroas. Quite-os no mural para voltar a expandir e usar suas instalações.`, "warning");
}

/** Recognize unique, bounded services; old deed IDs survive rotating noticeboards. */
export function syncTerritoryDeeds(state: GameState, hooks?: ExpansionHooks): void {
  const deeds = state.territory.deeds;
  const before = state.territory.influence;
  const add = (id: string) => {
    if (deeds.includes(id) || territoryDeedValue(id) === null) return;
    if (id.startsWith("civic:") && deeds.filter(deed => deed.startsWith("civic:")).length >= 6) return;
    deeds.push(id);
  };
  for (const job of state.frontier.jobs) if (job.status === "claimed") add(`frontier:${job.id}`);
  for (const order of state.economy.orders) if (order.status === "fulfilled") add(`civic:${order.id}`);
  if (state.property.owned && state.property.harvests > 0) add("harvest:first");
  if (state.property.owned && state.property.building) add("house:first");
  for (const definition of ESTATE_DEFS) {
    const holding = state.territory.parcels[definition.id];
    if (holding.owned && holding.building !== "none") add(`building:${definition.id}`);
  }
  state.territory.influence = territoryInfluence(deeds);
  if (hooks && state.territory.influence > before) hooks.message(`Auren reconheceu os serviços da sua casa · influência ${state.territory.influence}.`, "success");
}
