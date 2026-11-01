import { isLandZone, landBuilding, landForZone, landIndex, landLandmark, landLocal, MAX_LANDS, newLandsState, seedFromText, setLandSeed, type LandsState } from "./lands";
import type { Dialog, ExpansionHooks, GameState } from "./types";

/** Coins paid at a foreign inn go to the travelling merchants: no currency is created or lost. */
export const LAND_INN_PRICE = 6;
export const LAND_PRAYER_STAMINA = 15;

/** Every campaign has a road beyond Brumavale; older saves derive a stable seed from the apostle. */
export function ensureLands(state: GameState): LandsState {
  state.lands ??= newLandsState(seedFromText(`${state.apostle.id}:${state.apostle.name}`));
  setLandSeed(state.lands.seed);
  return state.lands;
}

/** Arrival in a generated land: the furthest step and its story go to the diary once. */
export function arriveInLand(state: GameState, hooks: ExpansionHooks): void {
  if (!isLandZone(state.zone)) return;
  const lands = ensureLands(state);
  const land = landForZone(state.zone), index = landIndex(state.zone);
  if (index <= lands.furthest) return;
  const newKingdom = index === 1 || landForZone(`terra-${index - 1}`).kingdom.index !== land.kingdom.index;
  lands.furthest = index;
  hooks.remember(newKingdom && land.kingdom.index > 0 ? `A entrada em ${land.kingdom.name}` : "Uma terra além da bruma",
    `Cheguei a ${land.name}. ${land.lore[0]} ${newKingdom ? land.kingdom.legend : ""}`.trim(), "Curiosidade", newKingdom ? 70 : 50);
  hooks.practice("perception", 1);
  hooks.message(newKingdom && land.kingdom.index > 0
    ? `Nova terra: ${land.name} · ${land.kingdom.name}, sob ${land.kingdom.ruler}.`
    : `Nova terra: ${land.name}.`, "success");
}

const close = { label: "Continuar explorando", action: "close" };

export function landDialog(state: GameState, id: string, hooks: ExpansionHooks): Dialog | null {
  if (!isLandZone(state.zone) || !id.startsWith(`${state.zone}/`) || !hooks.nearObject(id)) return null;
  const land = landForZone(state.zone);
  const local = landLocal(id);
  if (local) return {
    name: local.name, role: `${local.roleLabel} · ${land.settlement || land.name}`,
    text: local.lines.join(" "),
    options: [{ label: `Perguntar sobre ${land.kingdom.name}`, action: `land-lore:${id}` }, { label: "Despedir-se", action: "close" }],
  };
  const building = landBuilding(id);
  if (building) {
    const where = `${land.settlement} · ${land.kingdom.name}`;
    if (building.model === "orphanage") {
      const prayed = state.lands?.prayedDay === state.day;
      return { name: building.label, role: where,
        text: `Velas acesas diante da imagem de ${land.kingdom.saint}. ${land.kingdom.saint === "Santa Elara" ? "É a mesma santa do orfanato de Valeverde." : "Os fiéis dizem que ela é irmã de fé de Santa Elara."} Orar uma vez por dia devolve ${LAND_PRAYER_STAMINA} de energia.`,
        options: [{ label: prayed ? "Você já orou hoje" : "Orar em silêncio", action: `land-pray:${id}`, disabled: prayed }, close] };
    }
    if (building.model === "inn") return { name: building.label, role: where,
      text: `O estalajadeiro oferece um quarto, sopa quente e notícias da estrada por ${LAND_INN_PRICE} coroas. Pernoitar descansa oito horas.`,
      options: [{ label: `Pernoitar · ${LAND_INN_PRICE} coroas`, action: `land-rest:${id}`, disabled: state.gold < LAND_INN_PRICE }, close] };
    if (building.model === "keep") return { name: building.label, role: where,
      text: `Guardas de ${land.kingdom.banner.name} vigiam a porta. ${land.lore[2]} ${land.kingdom.legend}`,
      options: [close] };
    const text = building.model === "forge" ? "O martelo soa sobre a bigorna. O ferreiro troca dois dedos de conversa, mas o trabalho não para."
      : building.model === "bakery" ? "Cheiro de centeio e lenha. O forno trabalha para toda a vizinhança."
      : building.model === "farm-shed" ? "Ferramentas de lavoura, sacas de semente e um arado à espera da próxima estação."
      : "Uma casa de família. A porta fica entreaberta enquanto alguém cozinha lá dentro.";
    return { name: building.label, role: where, text, options: [close] };
  }
  const mark = landLandmark(id);
  if (mark) {
    discoverLandmark(state, id, hooks);
    if (mark.landmark === "acampamento") return { name: mark.label, role: land.name,
      text: mark.text, options: [{ label: "Acampar · 2 madeiras", action: `land-camp:${id}`, disabled: state.inventory.wood < 2 }, close] };
    return { name: mark.label, role: mark.landmark === "poco" ? land.settlement : `Um marco em ${land.name}`, text: mark.text, options: [close] };
  }
  return null;
}

function discoverLandmark(state: GameState, id: string, hooks: ExpansionHooks): void {
  const lands = ensureLands(state);
  const mark = landLandmark(id);
  if (!mark || mark.landmark === "poco" || lands.discovered.includes(id)) return;
  lands.discovered.push(id);
  hooks.remember("Um marco das terras novas", `Encontrei ${mark.label}. ${mark.text}`, "Curiosidade", 45);
  hooks.practice("perception", .6);
  hooks.message(`Marco registrado: ${mark.label}.`, "success");
}

/** Actions of the generated lands. Returns a follow-up dialog, or null to close. */
export function landAction(state: GameState, action: string, hooks: ExpansionHooks): Dialog | null {
  const split = action.indexOf(":");
  const verb = action.slice(0, split), id = action.slice(split + 1);
  if (!isLandZone(state.zone) || !id.startsWith(`${state.zone}/`) || !hooks.nearObject(id)) {
    hooks.message("Aproxime-se para fazer isso.", "warning");
    return null;
  }
  const land = landForZone(state.zone);
  const lands = ensureLands(state);
  if (verb === "land-lore") {
    const local = landLocal(id);
    return { name: land.kingdom.name, role: local ? `Contado por ${local.name}` : land.name,
      text: `${land.kingdom.legend} ${land.lore[2]} ${land.kingdom.index === 0 ? "A Marca ainda paga tributo a Auren." : `Dizem que o reino é ${land.kingdom.relation}.`}${landIndex(land.zone) === MAX_LANDS ? " Daqui em diante, nenhum mapa." : ""}`,
      options: [{ label: "Agradecer", action: "close" }] };
  }
  if (verb === "land-pray" && landBuilding(id)?.model === "orphanage") {
    if (lands.prayedDay === state.day) { hooks.message("Você já orou hoje nesta estrada.", "warning"); return null; }
    lands.prayedDay = state.day;
    state.apostle.stamina = Math.min(state.apostle.maxStamina, state.apostle.stamina + LAND_PRAYER_STAMINA);
    hooks.remember("Uma prece além da bruma", `Orei na ${landBuilding(id)!.label}. Senti que os Antigos também olham por estas terras.`, "Serenidade", 40);
    hooks.message(`A prece devolveu o fôlego · +${LAND_PRAYER_STAMINA} energia.`, "success");
    return null;
  }
  if (verb === "land-rest" && landBuilding(id)?.model === "inn") {
    if (state.gold < LAND_INN_PRICE || !Number.isSafeInteger(state.merchantGold + LAND_INN_PRICE)) { hooks.message(`O pernoite custa ${LAND_INN_PRICE} coroas.`, "warning"); return null; }
    state.gold -= LAND_INN_PRICE;
    state.merchantGold += LAND_INN_PRICE;
    hooks.rest?.(8, 30);
    hooks.message(`Uma noite na ${landBuilding(id)!.label}: oito horas de descanso.`, "success");
    return null;
  }
  if (verb === "land-camp" && landLandmark(id)?.landmark === "acampamento") {
    if (state.inventory.wood < 2) { hooks.message("Acampar exige duas madeiras.", "warning"); return null; }
    state.inventory.wood -= 2;
    hooks.rest?.(4, 20);
    hooks.message("A fogueira e a lona permitiram quatro horas de descanso.", "success");
    return null;
  }
  return null;
}
