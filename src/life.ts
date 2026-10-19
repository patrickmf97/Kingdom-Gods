import { ITEMS, OBJECTS } from "./data";
import { civicBudget } from "./civic-budget";
import { interiorForZone } from "./interiors";
import type {
  Apostle, EducationFocus, EducationProfile, ExpansionHooks, GameState,
  LegacyEvent, LifeState, Memory, Npc, Person, Point, Zone,
} from "./types";

export const educationLabels: Record<EducationFocus, string> = {
  farming: "Agricultura", mining: "Mineração", wisdom: "Conhecimentos",
};
export type NpcDestination = Point & { zone: Zone };
/** Services use their actual station coordinates, so matching numbers in another room never suffice. */
export function npcServiceDestination(id: "market" | "inn"): NpcDestination {
  const definition = interiorForZone("inn-room")!;
  const station = definition.stations.find(object => object.id === id)!;
  return { zone: definition.zone, x: station.x, y: station.y };
}
const bound = (value: number) => Math.max(0, Math.min(100, value));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const active = (state: GameState) => state.started && state.phase === "playing" && state.apostle.alive;
const familyMember = (state: GameState, id: string) => state.family.find(person => person.id === id);

/** Every configured village NPC is an adult; family records carry explicit age and life status. */
export function availableGuardians(state: GameState): { id: string; name: string }[] {
  const choices = new Map<string, { id: string; name: string }>();
  for (const person of state.family) {
    if (person.alive && person.age >= 16 && person.id !== state.apostle.id)
      choices.set(person.id, { id: person.id, name: `${person.name} ${person.surname}` });
  }
  for (const npc of state.npcs) {
    const person = familyMember(state, npc.id);
    if (npc.id !== state.apostle.id && (!person || (person.alive && person.age >= 16)))
      choices.set(npc.id, { id: npc.id, name: person ? `${person.name} ${person.surname}` : npc.name });
  }
  return [...choices.values()];
}

function educationProfile(guardianId: string | null): EducationProfile {
  return { focus: "farming", guardianId, practice: 0, bond: 0, lessons: 0, lastLessonDay: 0 };
}

export function createLifeState(npcs: Npc[], family: Person[], apostle?: Apostle): LifeState {
  const education: LifeState["education"] = {};
  for (const child of family) {
    if (!child.alive || child.age >= 16 || child.id === apostle?.id) continue;
    const guardian = family.find(person => person.alive && person.age >= 16 &&
      person.id !== apostle?.id && child.parents.includes(person.id));
    education[child.id] = educationProfile(guardian?.id ?? null);
  }
  if (apostle && apostle.age < 16 && !education[apostle.id])
    education[apostle.id] = educationProfile(null);
  return {
    needs: Object.fromEntries(npcs.map(npc => [npc.id, { hunger: 20, fatigue: 10, goal: "work" as const }])),
    education, history: [], heirId: null, guardianId: null,
  };
}

export function recordLifeEvent(state: GameState, event: LegacyEvent): void {
  state.life.history.push({ ...event });
  if (state.life.history.length > 80)
    state.life.history.splice(0, state.life.history.length - 80);
}

export function registerChildEducation(state: GameState, child: Person): void {
  if (!child.alive || child.age >= 16 || state.life.education[child.id]) return;
  const eligible = availableGuardians(state);
  const guardian = eligible.find(person => child.parents.includes(person.id));
  state.life.education[child.id] = educationProfile(guardian?.id ?? null);
}

function validHeir(state: GameState, id: string): boolean {
  const person = familyMember(state, id);
  return !!person?.alive && person.id !== state.apostle.id &&
    (person.id === state.apostle.partnerId || person.partnerId === state.apostle.id ||
      person.parents.includes(state.apostle.id));
}

function nearFamily(state: GameState, hooks: ExpansionHooks): boolean {
  const spouseId = state.apostle.partnerId;
  return (state.property.owned && state.property.building && hooks.nearObject("property")) ||
    (!!spouseId && !!familyMember(state, spouseId)?.alive && hooks.nearNpc(spouseId));
}

function rememberNpc(state: GameState, npc: Npc, text: string): void {
  // NPC memories belong to the existing campaign memory store, when supplied by the local simulation.
  const memoryState = state as GameState & { simulation?: { npcMemories: Record<string, Memory[]> } };
  if (!memoryState.simulation) return;
  const memories = memoryState.simulation.npcMemories[npc.id] ??= [];
  memories.push({ id: `care-${npc.id}-${state.day}-${memories.length}`,
    day: state.day, title: "Pão compartilhado", text, emotion: "Gratidão", intensity: 65 });
  if (memories.length > 40) memories.splice(0, memories.length - 40);
}

/** Return true for an action owned by this module, even if its physical or resource gate rejects it. */
export function executeLifeAction(state: GameState, action: string, hooks: ExpansionHooks): boolean {
  const [verb, id, value] = action.split(":");
  if (!["feed-npc", "education", "guardian", "teach", "heir", "regent"].includes(verb)) return false;
  if (!active(state)) return true;
  if (verb === "feed-npc") {
    const npc = state.npcs.find(person => person.id === id);
    const relative = familyMember(state, id);
    if (!npc || id === state.apostle.id || (relative && !relative.alive) || !hooks.nearNpc(id)) {
      hooks.message("Aproxime-se de uma pessoa viva para compartilhar pão.", "warning");
      return true;
    }
    const needs = state.life.needs[id];
    if (!needs || needs.hunger < 1 || state.inventory.bread < 1) {
      hooks.message(state.inventory.bread < 1 ? "Você precisa de um pão." : `${npc.name} já está alimentado.`, "warning");
      return true;
    }
    state.inventory.bread--;
    needs.hunger = bound(needs.hunger - 35);
    npc.trust = bound(npc.trust + 5);
    npc.relation = bound(npc.relation + 3);
    npc.mood = "Grato pelo pão compartilhado";
    const text = `${state.apostle.name} compartilhou seu pão com ${npc.name}.`;
    rememberNpc(state, npc, text);
    hooks.remember("Um pão compartilhado", text, "Gratidão", 65);
    hooks.message(`${npc.name} agradeceu. Fome reduzida e confiança fortalecida.`, "success");
    return true;
  }
  if (!nearFamily(state, hooks)) {
    hooks.message("Vá ao lar construído da família ou encontre seu companheiro para cuidar do legado.", "warning");
    return true;
  }
  if (verb === "heir") {
    if (!validHeir(state, id)) hooks.message("Somente um companheiro vivo ou filho direto pode ser indicado.", "warning");
    else {
      state.life.heirId = id;
      hooks.message(`${familyMember(state, id)!.name} foi indicado. A escolha final respeitará os familiares elegíveis.`, "success");
    }
    return true;
  }
  if (verb === "regent") {
    const guardian = availableGuardians(state).find(person => person.id === id);
    if (!guardian) hooks.message("Escolha um adulto vivo para a regência.", "warning");
    else {
      state.life.guardianId = id;
      hooks.message(`${guardian.name} assumirá a proteção da linhagem durante a menoridade.`, "success");
    }
    return true;
  }
  const child = familyMember(state, id);
  const profile = state.life.education[id];
  if (!child?.alive || child.age >= 16 || !profile) {
    hooks.message("A educação familiar exige uma criança viva da linhagem.", "warning");
    return true;
  }
  if (verb === "education") {
    if (!Object.hasOwn(educationLabels, value)) {
      hooks.message("Esse caminho de aprendizagem não está disponível.", "warning");
      return true;
    }
    profile.focus = value as EducationFocus;
    hooks.message(`${child.name} estudará ${educationLabels[profile.focus].toLowerCase()}.`, "success");
  } else if (verb === "guardian") {
    const guardian = availableGuardians(state).find(person => person.id === value);
    if (!guardian || guardian.id === child.id) hooks.message("Um tutor precisa ser um adulto vivo.", "warning");
    else {
      profile.guardianId = guardian.id;
      hooks.message(`${guardian.name} acompanhará a educação de ${child.name}.`, "success");
    }
  } else {
    if (state.apostle.age < 16 || state.inventory.bread < 1 || state.apostle.stamina < 8) {
      hooks.message("Ensinar exige um adulto, um pão e oito pontos de energia.", "warning");
      return true;
    }
    if (profile.lastLessonDay === state.day) {
      hooks.message(`${child.name} já teve uma aula hoje. Dê tempo para praticar.`);
      return true;
    }
    state.inventory.bread--;
    state.apostle.stamina -= 8;
    profile.practice = bound(profile.practice + 1.5 * (state.apostle.blessing === "wisdom" ? 1.4 : 1));
    profile.bond = bound(profile.bond + 5);
    profile.lessons++;
    profile.lastLessonDay = state.day;
    const text = `${state.apostle.name} ensinou ${educationLabels[profile.focus].toLowerCase()} a ${child.name}.`;
    recordLifeEvent(state, { day: state.day, kind: "education", personId: child.id,
      relatedId: state.apostle.id, text, gold: state.gold, property: state.property.owned });
    hooks.remember("O que deixo para amanhã", text, "Afeto", 60);
    hooks.message(`Aula concluída · ${child.name} ganhou prática e proximidade familiar.`, "success");
  }
  return true;
}

export function npcGoalDestination(state: GameState, npc: Npc): NpcDestination | null {
  if (npc.id === "matron") return null;
  const needs = state.life.needs[npc.id];
  if (!needs) return null;
  if (needs.hunger >= 70) { needs.goal = "eat"; return npcServiceDestination("market"); }
  if (needs.fatigue >= 75) { needs.goal = "rest"; return npcServiceDestination("inn"); }
  needs.goal = "work";
  return null;
}

/** Resolve needs only after an NPC physically arrives, independently of the apostle's current map. */
export function updateLifeNeeds(state: GameState, _hooks: ExpansionHooks): void {
  if (!active(state)) return;
  for (const npc of state.npcs) {
    const needs = state.life.needs[npc.id];
    if (!needs || npc.id === "matron" || familyMember(state, npc.id)?.alive === false) continue;
    const market = npcServiceDestination("market"), inn = npcServiceDestination("inn");
    if (needs.hunger >= 70 && npc.zone === market.zone && distance(npc, market) <= 150) {
      const price = Math.max(1, Math.round(ITEMS.bread.price * (1 + Math.max(0, 8 - state.market.bread) * 0.03)));
      const savings = state.economy.npcSavings[npc.id] ?? 0;
      const personal = savings >= price;
      if (state.market.bread > 0 && (personal || civicBudget(state).available >= price)) {
        if (personal) state.economy.npcSavings[npc.id] = savings - price;
        else state.economy.civicFunds -= price;
        state.merchantGold += price;
        state.market.bread--;
        needs.hunger = bound(needs.hunger - 40);
        npc.mood = personal ? "Alimentado com o fruto do trabalho" : "Amparado pela despensa da vila";
        state.economy.ledger.push({ day: state.day, type: "meal",
          text: `${npc.name} comprou pão ${personal ? "com suas economias" : "com apoio da vila"}.`, goldDelta: 0 });
        if (state.economy.ledger.length > 30) state.economy.ledger.splice(0, state.economy.ledger.length - 30);
      } else npc.mood = "Com fome · procurando alimento";
    }
    if (needs.hunger < 70 && needs.fatigue >= 75 && npc.zone === inn.zone && distance(npc, inn) <= 160) {
      needs.fatigue = bound(needs.fatigue - 30);
      npc.mood = "Descansado na estalagem";
    }
    npcGoalDestination(state, npc);
  }
}

function guardianAtHome(state: GameState, id: string): boolean {
  const npc = state.npcs.find(person => person.id === id);
  if (!npc) return !!familyMember(state, id)?.alive;
  const property = OBJECTS.find(object => object.id === "property");
  return npc.zone === "farmhouse-room" || (npc.zone === "village" && !!property &&
    (distance(npc, property) <= 260 || distance(npc, { x: 2090, y: 815 }) <= 190));
}

export function processLifeDay(state: GameState, hooks: ExpansionHooks): void {
  if (!active(state)) return;
  const guardians = new Set(availableGuardians(state).map(person => person.id));
  if (state.life.heirId && !validHeir(state, state.life.heirId)) state.life.heirId = null;
  if (state.life.guardianId && !guardians.has(state.life.guardianId)) state.life.guardianId = null;
  if (state.apostle.age >= 16) state.life.guardianId = null;
  for (const npc of state.npcs) {
    if (familyMember(state, npc.id)?.alive === false) continue;
    const needs = state.life.needs[npc.id] ??= { hunger: 20, fatigue: 10, goal: "work" };
    needs.hunger = bound(needs.hunger + 6);
    needs.fatigue = bound(needs.fatigue + 8);
    if (needs.hunger >= 80) npc.mood = "Com fome · procurando alimento";
    else if (needs.fatigue >= 75) npc.mood = "Cansado · procurando descanso";
  }
  for (const [id, profile] of Object.entries(state.life.education)) {
    const child = familyMember(state, id) ?? (state.apostle.id === id ? state.apostle : null);
    if (profile.guardianId && !guardians.has(profile.guardianId)) profile.guardianId = null;
    if (!child?.alive || child.age >= 16 || !profile.guardianId || !state.property.owned || !state.property.building) continue;
    if (guardianAtHome(state, profile.guardianId)) profile.practice = bound(profile.practice + 0.15);
  }
  updateLifeNeeds(state, hooks);
}

export function applyEducationToSuccessor(state: GameState, successor: Apostle): void {
  const profile = state.life.education[successor.id];
  if (profile) {
    const skill = profile.focus === "wisdom" ? "leadership" : profile.focus;
    successor.skills[skill] = bound((successor.skills[skill] ?? 0) + profile.practice);
    const bonus = Math.min(4, Math.floor(profile.practice / 10));
    successor.attributes.intelligence += bonus;
    successor.attributes.wisdom += profile.focus === "wisdom" ? bonus : Math.min(2, Math.floor(bonus / 2));
  }
  if (state.life.heirId === successor.id || (state.life.heirId && !validHeir(state, state.life.heirId)))
    state.life.heirId = null;
  if (successor.age >= 16) { state.life.guardianId = null; return; }
  const choices = availableGuardians(state).filter(person => person.id !== successor.id);
  const assigned = choices.find(person => person.id === profile?.guardianId || person.id === state.life.guardianId);
  const trusted = [...choices].sort((a, b) =>
    (state.npcs.find(npc => npc.id === b.id)?.trust ?? 50) - (state.npcs.find(npc => npc.id === a.id)?.trust ?? 50))[0];
  state.life.guardianId = assigned?.id ?? trusted?.id ?? null;
}
