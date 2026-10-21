import { populationRole } from "./population";
import type { GameState, Npc, Person } from "./types";

/** Canonical visual traits, shared by presentation and a newly recorded family member. */
export interface CharacterVisualIdentity extends Pick<Person, "skin" | "hair" | "eyes" | "outfit" | "sex" | "age"> {
  role: string;
  variant: string;
}

const skins = ["#d3a17b", "#b77d59", "#edc7a6", "#8b5b42"] as const;
const hairColours = ["#57402e", "#31271f", "#a17649", "#614c3d"] as const;
const historicalRoles: Readonly<Record<string, string>> = {
  matron: "matron", merchant: "merchant", mira: "farmer", aldric: "smith", guard: "guard", farmer: "farmer",
};
const femaleIdentities = new Set([
  "matron", "mira", "farmer", "alpha12-baker", "alpha12-innkeeper", "alpha12-ranger",
  "alpha12-merchant-trail", "alpha12-pilgrim",
]);

/** Lookup is deterministic and read-only. Existing saved people always retain their own traits. */
export function npcVisualIdentity(state: GameState, npc: Npc): CharacterVisualIdentity {
  const relative = state.family.find(person => person.id === npc.id);
  const seed = [...npc.id].reduce((sum, letter) => (sum * 31 + letter.charCodeAt(0)) >>> 0, 0);
  return {
    skin: relative?.skin ?? skins[seed % skins.length],
    hair: relative?.hair ?? (npc.id === "matron" ? "#938775" : hairColours[seed % hairColours.length]),
    eyes: relative?.eyes ?? "#566d59",
    outfit: relative?.outfit ?? npc.color,
    age: relative?.age ?? (npc.id === "matron" ? 64 : 24 + seed % 25),
    sex: relative?.sex ?? (femaleIdentities.has(npc.id) ? "female" : "male"),
    role: populationRole(state, npc.id) ?? (Object.hasOwn(historicalRoles, npc.id) ? historicalRoles[npc.id] : "traveler"),
    variant: npc.id,
  };
}
