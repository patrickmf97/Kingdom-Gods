import type { Portal, Rectangle, RegionDefinition } from "./regions";
import type { VillageDecoration } from "./village-decor";
import type { Point, ResourceNodeDefinition, WorldObject } from "./types";

/**
 * Motor de terras procedurais: além do desfiladeiro de Brumavale a estrada segue por
 * terras geradas a partir da semente da campanha. Tudo aqui é puro e determinístico:
 * a mesma semente e o mesmo índice produzem sempre a mesma terra, então o salvamento
 * guarda apenas a semente, o quanto o apóstolo avançou e o estado das reservas.
 *
 * Regras herdadas da história de Auren:
 * - As duas primeiras terras ainda respondem à Coroa de Auren (a Marca de Brumavale e a
 *   terra de ninguém além da bruma). Depois vêm reinos vizinhos, um a cada três terras:
 *   sede do reino (cidade), aldeia e ermo de fronteira, nunca dois ermos seguidos.
 * - Todo reino tem soberano, padroeiro, estandarte, relação com Auren e uma lenda ligada
 *   à queda da Torre de Alvor, a Santa Elara ou às bênçãos dos Antigos (Vigor, Sabedoria
 *   e Fortuna), as mesmas do apóstolo.
 * - Recursos seguem o mesmo equilíbrio finito dos Ermos: capacidade, ferramenta, energia
 *   e dias de renovação idênticos; minério só aflora nas serras e nos ermos.
 * - Estrada sempre contínua entre a entrada oeste e a saída leste; prédios, árvores e
 *   reservas nunca bloqueiam a passagem.
 */
export type LandZone = `terra-${number}`;
export type LandKind = "cidade" | "aldeia" | "ermo";
export type LandBiome = "campina" | "floresta" | "serra" | "charneca";

export const LAND_WIDTH = 2560;
export const LAND_HEIGHT = 1920;
export const MAX_LANDS = 30;
const PATTERN = /^terra-([1-9]\d?)$/;

export function isLandZone(value: unknown): value is LandZone {
  if (typeof value !== "string") return false;
  const match = PATTERN.exec(value);
  return !!match && Number(match[1]) <= MAX_LANDS;
}
export function landIndex(zone: LandZone): number { return Number(zone.slice(6)); }
export function landZone(index: number): LandZone { return `terra-${index}`; }

export interface LandReserve { remaining: number; readyDay: number | null }
export interface LandsState {
  /** Semente da campanha; define todas as terras além de Brumavale. */
  seed: number;
  /** Terra mais distante já alcançada (0 = nenhuma). */
  furthest: number;
  /** Marcos visitados (ids de marcos das terras geradas). */
  discovered: string[];
  /** Só as reservas tocadas: ausência significa reserva cheia. */
  reserves: Record<string, LandReserve>;
  /** Último dia em que o apóstolo orou numa capela das terras novas. */
  prayedDay?: number;
}

/** Semente estável para campanhas antigas, derivada de quem é o apóstolo. */
export function seedFromText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) || 1;
}
export function newLandsState(seed: number): LandsState {
  return { seed: seed >>> 0, furthest: 0, discovered: [], reserves: {} };
}

let activeSeed = 1;
const cache = new Map<string, LandDefinition>();
const headerCache = new Map<string, LandHeader>();
/** A campanha ativa escolhe a semente; as terras são recriadas sob demanda. */
export function setLandSeed(seed: number): void {
  if (!Number.isSafeInteger(seed) || seed < 0) return;
  if ((seed >>> 0) === activeSeed) return;
  activeSeed = seed >>> 0;
  if (cache.size > 12) cache.clear();
  if (headerCache.size > 400) headerCache.clear();
}
export function landSeed(): number { return activeSeed; }

// ───────────────────────── aleatoriedade determinística ─────────────────────────
function hash(...values: number[]): number {
  let h = 0x9e3779b9;
  for (const value of values) {
    h = Math.imul(h ^ (value >>> 0), 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  }
  return h >>> 0;
}
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(rng: () => number, list: readonly T[]): T => list[Math.floor(rng() * list.length) % list.length];
function weighted<T extends string>(rng: () => number, weights: Record<T, number>): T {
  const entries = Object.entries(weights) as [T, number][];
  let roll = rng() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [key, w] of entries) { roll -= w; if (roll <= 0) return key; }
  return entries[entries.length - 1][0];
}

// ───────────────────────────── vocabulário de Auren ─────────────────────────────
const KINGDOMS = ["Valdória", "Ostrânia", "Morvena", "Celânia", "Ismera", "Tarvália", "Ardena", "Lusmira",
  "Bervânia", "Coralis", "Galveia", "Quelmar", "Duranha", "Elvária", "Fenmora", "Sarvelo"];
const PLACE_START = ["Freix", "Carv", "Pedr", "Ribeir", "Mont", "Azinh", "Sobr", "Castel", "Torr", "Pinh", "Olm", "Font",
  "Alv", "Lum", "Brev", "Orv", "Sar", "Vel", "Zim", "Garç", "Lour", "Merc", "Tav", "Esc"];
const PLACE_END = ["eira", "edo", "inha", "ela", "ais", "ada", "elo", "ão", "ena", "osa", "ilha", "ar", "ugal", "ide"];
const MALE = ["Afonso", "Sancho", "Dinis", "Fernão", "Godinho", "Mendo", "Vasco", "Gonçalo", "Nuno", "Rodrigo", "Egas",
  "Paio", "Lourenço", "Tomé", "Bartolomeu", "Estêvão", "Martim", "Gil", "Rui", "Álvaro"];
const FEMALE = ["Urraca", "Teresa", "Beatriz", "Isaura", "Mafalda", "Leonor", "Aldonça", "Sancha", "Branca", "Guiomar",
  "Inês", "Constança", "Violante", "Mécia", "Berengária", "Catarina", "Joana", "Filipa", "Margarida", "Brites"];
const ORDINALS = ["I", "II", "III", "IV", "V"];
const BANNERS: [string, number, number][] = [
  ["rubro e ouro", 0x8e2f2a, 0xd9b45a], ["azul e prata", 0x2f4f7a, 0xd8dcd6], ["verde e ouro", 0x2f6a45, 0xd9b45a],
  ["negro e prata", 0x2a2a2e, 0xd8dcd6], ["púrpura e ouro", 0x5a3270, 0xd9b45a], ["ocre e negro", 0xa8762c, 0x2a2a2e],
];
const RELATIONS = [
  "aliado antigo de Auren, unido pelo casamento de duas casas",
  "antigo rival de Auren, hoje em trégua vigiada",
  "neutro, comercia com todos os reinos da estrada",
  "devoto aos mesmos santos de Auren e às bênçãos dos Antigos",
];
const LEGENDS = [
  "{kingdom} nasceu quando {founder} guiou os sobreviventes da queda da Torre de Alvor para além da bruma.",
  "Contam que {saint} acendeu a primeira fogueira destas terras e que os Antigos responderam com a bênção do {blessing}.",
  "Os anciãos juram que {founder} recebeu a bênção da {blessing} e com ela ergueu a primeira muralha de {kingdom}.",
  "Dizem que {saint} foi irmã de fé de Santa Elara e trouxe de Valeverde as primeiras sementes do vale.",
  "{founder} cruzou o desfiladeiro de Brumavale com doze famílias; cada uma fundou uma aldeia de {kingdom}.",
];
const BLESSING_WORDS = ["Vigor", "Sabedoria", "Fortuna"];
const LAND_TITLES: Record<LandBiome, string[]> = {
  campina: ["Campos de", "Prados de", "Veiga de"],
  floresta: ["Mata de", "Bosque de", "Souto de"],
  serra: ["Serra de", "Penhas de", "Cumes de"],
  charneca: ["Charneca de", "Urzais de", "Gândara de"],
};
const BIOME_COLOR: Record<LandBiome, number> = { campina: 0x7d9a64, floresta: 0x6a8a58, serra: 0x87957a, charneca: 0x93906a };

export interface Kingdom {
  index: number;
  name: string;
  ruler: string;
  founder: string;
  saint: string;
  banner: { name: string; cloth: number; mark: number };
  relation: string;
  legend: string;
}

const AUREN: Kingdom = {
  index: 0, name: "Reino de Auren", ruler: "a Coroa de Auren", founder: "os primeiros colonos de Valeverde",
  saint: "Santa Elara", banner: { name: "verde e ouro", cloth: 0x2f6a45, mark: 0xd9b45a },
  relation: "a própria Coroa a que você deve tributo",
  legend: "Auren estende sua Marca até a bruma; além dela, cada passo é terra de outros reis.",
};

export function kingdomFor(index: number): Kingdom {
  if (index <= 0) return AUREN;
  const rng = random(hash(activeSeed, 7001, index));
  const order = [...KINGDOMS];
  const shuffle = random(hash(activeSeed, 7000));
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(shuffle() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const queen = rng() < .5;
  // Names come from per-campaign shuffled rolls, so neighbouring kingdoms never share a ruler or saint.
  const roll = (list: readonly string[], salt: number) => {
    const copy = [...list], mix = random(hash(activeSeed, salt));
    for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(mix() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
    return copy[(index - 1) % copy.length];
  };
  const rulerName = roll(queen ? FEMALE : MALE, queen ? 7101 : 7102);
  const title = queen ? pick(rng, ["Rainha", "Duquesa regente", "Rainha"]) : pick(rng, ["Rei", "Príncipe-eleitor", "Rei", "Conde soberano"]);
  const founderFemale = rng() < .5;
  const founder = `${pick(rng, founderFemale ? FEMALE : MALE)} ${pick(rng, founderFemale
    ? ["a Peregrina", "a Fundadora", "a Velha", "de Alvor", "a Brava", "a Tecelã"]
    : ["o Peregrino", "o Fundador", "o Velho", "de Alvor", "o Bravo", "o Ferreiro"])}`;
  const saintFemale = rng() < .55;
  const saint = `${saintFemale ? "Santa" : "São"} ${roll(saintFemale ? FEMALE : MALE, saintFemale ? 7103 : 7104)}`;
  const [bannerName, cloth, mark] = pick(rng, BANNERS);
  const name = `Reino de ${order[(index - 1) % order.length]}`;
  const legend = pick(rng, LEGENDS).replaceAll("{kingdom}", name).replaceAll("{founder}", founder)
    .replaceAll("{saint}", saint).replaceAll("{blessing}", pick(rng, BLESSING_WORDS));
  return { index, name, ruler: `${title} ${rulerName} ${pick(rng, ORDINALS)}`, founder, saint,
    banner: { name: bannerName, cloth, mark }, relation: pick(rng, RELATIONS), legend };
}

/** Regra da estrada: 1 Marca (aldeia), 2 terra de ninguém (ermo), depois cidade · aldeia · ermo por reino. */
export function landKind(index: number): LandKind {
  if (index === 1) return "aldeia";
  if (index === 2) return "ermo";
  return (["cidade", "aldeia", "ermo"] as const)[(index - 3) % 3];
}
export function kingdomIndexFor(index: number): number { return index <= 2 ? 0 : 1 + Math.floor((index - 3) / 3); }

export interface LandHeader {
  index: number;
  zone: LandZone;
  kind: LandKind;
  biome: LandBiome;
  kingdom: Kingdom;
  /** Nome do povoado (vazio para ermos) e nome da terra. */
  settlement: string;
  name: string;
  /** Altura (y) da estrada nas bordas oeste e leste. */
  westY: number;
  eastY: number;
}

function placeName(rng: () => number): string { return `${pick(rng, PLACE_START)}${pick(rng, PLACE_END)}`; }

export function landHeader(index: number): LandHeader {
  const key = `${activeSeed}:${index}`;
  const known = headerCache.get(key);
  if (known) return known;
  const rng = random(hash(activeSeed, 31, index));
  const kind = landKind(index);
  const biome = weighted(rng, kind === "ermo" ? { campina: 1, floresta: 3, serra: 3, charneca: 2 }
    : kind === "cidade" ? { campina: 4, floresta: 1, serra: 1, charneca: 1 } : { campina: 3, floresta: 2, serra: 1, charneca: 1 });
  const kingdom = kingdomFor(kingdomIndexFor(index));
  const place = placeName(rng);
  const settlement = kind === "ermo" ? "" : index === 1 ? `Posto de ${place}` : kind === "cidade" ? place : `Aldeia de ${place}`;
  const name = index === 1 ? `Marca de ${place}` : index === 2 ? "Terras Além da Bruma"
    : kind === "ermo" ? `${pick(rng, LAND_TITLES[biome])} ${placeName(rng)}` : kind === "cidade" ? `${place}, sede de ${kingdom.name.replace("Reino de ", "")}` : `${pick(rng, LAND_TITLES[biome])} ${place}`;
  const edge = (side: number) => 760 + Math.floor(random(hash(activeSeed, 41, index, side))() * 400);
  const header = { index, zone: landZone(index), kind, biome, kingdom, settlement, name, westY: edge(0), eastY: edge(1) };
  headerCache.set(key, header);
  return header;
}

// ─────────────────────────────── definição completa ───────────────────────────────
export interface LandBuilding extends WorldObject {
  /** Tipo do modelo de Blender: house, inn, forge, bakery, orphanage (capela), farm-shed, keep. */
  model: string;
  footprint: Rectangle;
}
export interface LandLocal extends WorldObject {
  name: string;
  role: string;
  roleLabel: string;
  sex: "male" | "female";
  age: number;
  skin: string;
  hair: string;
  eyes: string;
  outfit: string;
  /** Direção para onde a pessoa olha, em radianos (0 = sul). */
  facing: number;
  lines: string[];
}
export interface LandLandmark extends WorldObject {
  landmark: "ruinas" | "santuario" | "acampamento" | "marco" | "poco" | "torre" | "fim";
  text: string;
  solids: Rectangle[];
}
export interface LandField { area: Rectangle; fence: Rectangle[] }
export interface LandDefinition extends LandHeader {
  color: number;
  roads: Point[][];
  plaza: { x: number; y: number; radius: number } | null;
  buildings: LandBuilding[];
  locals: LandLocal[];
  landmarks: LandLandmark[];
  fields: LandField[];
  ridges: Rectangle[];
  resources: ResourceNodeDefinition[];
  portals: Portal[];
  region: RegionDefinition;
  /** Frases de lore para o diálogo e o diário. */
  lore: string[];
}

const SPEC: Record<string, [number, number]> = {
  // Larguras e profundidades em pixels do mapa (art/export-specs.ts × 24).
  house: [154, 66], inn: [182, 86], forge: [150, 70], bakery: [120, 74], orphanage: [194, 86], "farm-shed": [68, 42], keep: [112, 112],
};
const rect = (left: number, top: number, right: number, bottom: number): Rectangle => ({ left, top, right, bottom });
const inside = (p: Point, r: Rectangle, m = 0) => p.x > r.left - m && p.x < r.right + m && p.y > r.top - m && p.y < r.bottom + m;
function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}
export function distanceToRoads(p: Point, roads: Point[][]): number {
  let best = Infinity;
  for (const road of roads) for (let i = 1; i < road.length; i++) best = Math.min(best, segmentDistance(p, road[i - 1], road[i]));
  return best;
}

const ROLE_LABEL: Record<string, string> = {
  farmer: "Lavrador", smith: "Ferreiro", baker: "Padeiro", innkeeper: "Estalajadeiro", merchant: "Mercador",
  guard: "Guarda", pilgrim: "Peregrino", ranger: "Batedor", miller: "Moleiro", traveler: "Viajante", courier: "Mensageiro", porter: "Carregador",
};
const FEMALE_ROLE: Record<string, string> = {
  Lavrador: "Lavradora", Ferreiro: "Ferreira", Padeiro: "Padeira", Estalajadeiro: "Estalajadeira", Mercador: "Mercadora",
  Guarda: "Guarda", Peregrino: "Peregrina", Batedor: "Batedora", Moleiro: "Moleira", Viajante: "Viajante", Mensageiro: "Mensageira", Carregador: "Carregadora",
};
const SKINS = ["#f1d2b6", "#e6bd98", "#d2a07a", "#b9825e", "#986446", "#74482f", "#5b3826"];
const HAIRS = ["#2a1d16", "#3d2a1d", "#5a3b26", "#7a5232", "#a87b4c", "#c9a36a", "#8d8a86", "#6a2f20"];
const EYES = ["#5b4632", "#3f6b5a", "#4c6a8a", "#6b5a3a", "#2f2a26"];
const OUTFITS = ["#6d3b32", "#3f5b4a", "#4a5671", "#7a6340", "#5d4a63", "#80553a", "#3c4f5c", "#6f6a4c"];

function sentenceFor(role: string, land: LandHeader, next: LandHeader | null, rng: () => number): string[] {
  const k = land.kingdom;
  const greeting: Record<string, string[]> = {
    guard: [`Em nome de ${k.ruler}, seja bem-vindo. Mantenha a espada na bainha dentro de ${land.settlement || "estas terras"}.`],
    innkeeper: [`Cama quente e sopa de nabo. Viajantes de Auren sempre trazem notícias boas — ou dívidas.`],
    smith: [`O ferro destas serras é teimoso, mas dá boas lâminas. Se tiver picareta, as rochas a leste guardam veios.`],
    baker: [`O forno acende antes do galo. Pão de centeio é o que sustenta ${land.settlement || "a estrada"}.`],
    farmer: [`A terra aqui é ${land.biome === "charneca" ? "magra, mas paciente" : "boa quando chove na hora certa"}. Colhemos o que os Antigos permitem.`],
    merchant: [`Coroas de Auren valem aqui, mas o câmbio é meu. Brincadeira… ou não.`],
    pilgrim: [`Caminho até o santuário de ${k.saint}. Dizem que quem ora lá recupera o fôlego da jornada.`],
    ranger: [`Leio as trilhas desde menino. Fique na estrada à noite; a bruma engana até os cães.`],
    miller: [`O vento destas terras move a mó sem descanso. Farinha não falta, falta quem a carregue.`],
    traveler: [`Também sou de passagem. Cada terra além da bruma tem rei novo e costume velho.`],
    courier: [`Levo cartas seladas de ${k.ruler}. Não pergunte o que dizem — nem eu sei.`],
    porter: [`Carrego fardos entre as aldeias. As costas doem, mas a estrada ensina.`],
  };
  const rumors = [
    k.index === 0 ? `Esta ainda é terra de Auren; o tributo segue para a Coroa, mesmo tão longe de Valeverde.` : `${k.name} é ${k.relation}.`,
    k.legend,
    `Nosso estandarte é ${k.banner.name}, e ${k.ruler} ${k.index === 0 ? "envia guardas à Marca a cada lua" : "governa desde a sede do reino"}.`,
    `Rezamos a ${k.saint}${k.saint === "Santa Elara" ? ", como em Valeverde" : ""}. Os Antigos ainda abençoam quem trabalha com as próprias mãos.`,
    `Antes da queda da Torre de Alvor esta estrada ligava todos os reinos. Hoje cada um guarda o seu trecho.`,
  ];
  const road = next ? `Seguindo para o leste chega-se a ${next.name}${next.kingdom.index !== land.kingdom.index ? `, já em ${next.kingdom.name}` : ""}.`
    : "Para o leste a estrada some na bruma. Ninguém que voltou soube dizer o que há além.";
  return [pick(rng, greeting[role] ?? greeting.traveler), pick(rng, rumors), road];
}

export function landForZone(zone: LandZone): LandDefinition {
  const index = landIndex(zone);
  const key = `${activeSeed}:${index}`;
  const known = cache.get(key);
  if (known) return known;
  const definition = generate(index);
  cache.set(key, definition);
  return definition;
}

function generate(index: number): LandDefinition {
  const header = landHeader(index);
  const previous = index > 1 ? landHeader(index - 1) : null;
  const next = index < MAX_LANDS ? landHeader(index + 1) : null;
  const rng = random(hash(activeSeed, 97, index));
  const W = LAND_WIDTH, H = LAND_HEIGHT;
  const zone = header.zone;
  const settled = header.kind !== "ermo";

  // ── Estrada: oeste → (praça) → leste, com curvas suaves sorteadas.
  const west: Point = { x: 250, y: header.westY }, east: Point = { x: W - 250, y: header.eastY };
  const centre: Point = settled ? { x: 1180 + Math.round(rng() * 200), y: 820 + Math.round(rng() * 280) } : { x: W / 2, y: (west.y + east.y) / 2 };
  const main: Point[] = [west, { x: 420, y: west.y }];
  const bend = (from: Point, to: Point, steps: number) => {
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      main.push({ x: Math.round(from.x + (to.x - from.x) * t), y: Math.round(from.y + (to.y - from.y) * t + (rng() - .5) * 170) });
    }
  };
  if (settled) {
    const townWest = { x: centre.x - 470, y: centre.y }, townEast = { x: centre.x + 470, y: centre.y };
    bend({ x: 420, y: west.y }, townWest, 3); main.push(townWest, townEast);
    bend(townEast, { x: W - 420, y: east.y }, 3);
  } else bend({ x: 420, y: west.y }, { x: W - 420, y: east.y }, 6);
  main.push({ x: W - 420, y: east.y }, east);
  const roads: Point[][] = [main];

  const buildings: LandBuilding[] = [];
  const locals: LandLocal[] = [];
  const landmarks: LandLandmark[] = [];
  const fields: LandField[] = [];
  const ridges: Rectangle[] = [];
  const reserved: Rectangle[] = [];
  const kingdom = header.kingdom;

  // ── Povoado: duas fileiras de casas viradas para a rua principal, praça ao centro.
  let plaza: LandDefinition["plaza"] = null;
  if (settled) {
    plaza = { x: centre.x, y: centre.y, radius: header.kind === "cidade" ? 150 : 110 };
    const civic = header.kind === "cidade"
      ? ["orphanage", "inn", "forge", "bakery", "house", "house", "house", "house", "keep"]
      : ["inn", "house", "house", "house", "bakery", "forge"].slice(0, 4 + Math.floor(rng() * 3));
    if (index === 1) civic.splice(0, civic.length, "inn", "house", "forge", "house");
    // Lotes ao longo da rua: norte (fachada voltada para a rua) e sul (fundo para a rua).
    const slots: { x: number; north: boolean }[] = [];
    for (const north of [true, false]) for (let i = 0; i < 6; i++) {
      const x = centre.x - 420 + i * 170;
      if (Math.abs(x - centre.x) < plaza.radius + 60) continue;
      slots.push({ x, north });
    }
    // Capela e torre ficam no lado norte da praça, de frente para ela.
    const usedNames = new Set<string>();
    const familyName = () => { let n = ""; for (let t = 0; t < 8 && (!n || usedNames.has(n)); t++) n = placeName(rng); usedNames.add(n); return n; };
    const labelFor = (model: string): string => model === "orphanage" ? `Capela de ${kingdom.saint}`
      : model === "inn" ? `Estalagem ${pick(rng, ["do Javali", "da Bruma", "do Viajante", "da Lua Cheia", "do Carvalho", "das Três Coroas"])}`
      : model === "forge" ? `Forja de ${pick(rng, MALE)}` : model === "bakery" ? `Forno de ${pick(rng, FEMALE)}`
      : model === "keep" ? `Torre de menagem de ${kingdom.ruler}` : `Casa dos ${familyName()}`;
    let slot = 0;
    for (const model of civic) {
      const [w, d] = SPEC[model];
      let x: number, top: number;
      if (model === "orphanage" || model === "keep") {
        x = model === "orphanage" ? centre.x - 20 : centre.x + 190;
        if (model === "keep") { top = centre.y - plaza.radius - 150; }
        else top = centre.y - plaza.radius - d - 30;
      } else {
        const s = slots[slot++ % slots.length];
        x = s.x;
        top = s.north ? centre.y - 62 - d : centre.y + 78;
      }
      const footprint = rect(x - w / 2, top, x + w / 2, top + d);
      const id = `${zone}/${model}-${buildings.length}`;
      buildings.push({ id, kind: model === "orphanage" ? "chapel" : model, model, x, y: footprint.bottom + 18, label: labelFor(model), w, h: d, footprint });
      reserved.push(rect(footprint.left - 40, footprint.top - 40, footprint.right + 40, footprint.bottom + 70));
    }
    // Poço no meio da praça (sólido pequeno) e campos cercados fora do povoado.
    landmarks.push({ id: `${zone}/poco`, kind: "well", landmark: "poco", x: centre.x - 60, y: centre.y + 28, label: `Poço de ${header.settlement.replace(/^(Aldeia|Posto) de /, "")}`,
      text: "A água é fria e limpa. Os moradores dizem que o poço nunca secou, nem no inverno longo.", solids: [rect(centre.x - 82, centre.y - 2, centre.x - 38, centre.y + 26)] });
    const fieldCount = header.kind === "cidade" ? 2 : 3;
    for (let f = 0; f < fieldCount; f++) {
      const north = f % 2 === 0;
      const fx = centre.x + (f - (fieldCount - 1) / 2) * 380 + (rng() - .5) * 80;
      const fy = north ? centre.y - 470 - rng() * 120 : centre.y + 300 + rng() * 140;
      const area = rect(fx - 140, fy - 70, fx + 140, fy + 70);
      if (area.top < 140 || area.bottom > H - 140) continue;
      fields.push({ area, fence: [rect(area.left, area.top - 3, area.right, area.top + 3), rect(area.left, area.bottom - 3, area.right, area.bottom + 3),
        rect(area.left - 3, area.top, area.left + 3, area.bottom - 40), rect(area.right - 3, area.top, area.right + 3, area.bottom)] });
      reserved.push(rect(area.left - 30, area.top - 30, area.right + 30, area.bottom + 30));
      buildings.push({ id: `${zone}/farm-shed-${buildings.length}`, kind: "farm-shed", model: "farm-shed", x: area.right + 50, y: area.top + 60,
        label: "Galpão da lavoura", w: 68, h: 42, footprint: rect(area.right + 16, area.top, area.right + 84, area.top + 42) });
    }
    // Moradores: um por prédio de ofício e alguns na praça.
    const roleFor: Record<string, string> = { inn: "innkeeper", forge: "smith", bakery: "baker", orphanage: "pilgrim", keep: "guard", house: "farmer", "farm-shed": "farmer" };
    const people = buildings.filter(b => b.model !== "farm-shed").slice(0, header.kind === "cidade" ? 7 : 5);
    const extras = header.kind === "cidade" ? ["merchant", "guard", "courier"] : index === 1 ? ["guard", "traveler"] : ["merchant", "miller"];
    const spots: { role: string; x: number; y: number; facing: number }[] = people.map(b => {
      const front = b.footprint.bottom + 34;
      return { role: roleFor[b.model] ?? "farmer", x: b.x + (b.model === "orphanage" ? 0 : (b.footprint.right - b.footprint.left) * .12 + 36), y: front, facing: 0 };
    });
    extras.forEach((role, i) => {
      // The well sits south-west of the centre; people gather on the other sides of the square.
      const angle = [-.55, .55, -2.45][i] + (rng() - .5) * .3;
      spots.push({ role, x: centre.x + Math.cos(angle) * (plaza!.radius - 40), y: centre.y + Math.sin(angle) * (plaza!.radius - 50), facing: angle + Math.PI });
    });
    spots.forEach((spot, i) => locals.push(person(rng, zone, i, spot, header, next)));
  }

  // ── Marcos: ruínas, santuário dos Antigos, acampamento; fim da estrada na última terra.
  const marks: LandLandmark["landmark"][] = header.kind === "ermo" ? ["acampamento", "ruinas", "santuario"]
    : header.kind === "cidade" ? ["santuario"] : [rng() < .5 ? "ruinas" : "santuario"];
  if (index === MAX_LANDS) marks.push("fim");
  const markSpots: Point[] = [];
  for (const mark of marks) {
    let spot: Point | null = null;
    for (let attempt = 0; attempt < 80 && !spot; attempt++) {
      const p = mark === "fim" ? { x: W - 360, y: east.y - 140 } : { x: 360 + rng() * (W - 720), y: 260 + rng() * (H - 520) };
      const roadGap = distanceToRoads(p, roads);
      if (mark !== "fim" && (roadGap < 170 || roadGap > 520)) continue;
      if (reserved.some(r => inside(p, r, 140)) || markSpots.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 420)) continue;
      if (Math.hypot(p.x - west.x, p.y - west.y) < 360 || (mark !== "fim" && Math.hypot(p.x - east.x, p.y - east.y) < 360)) continue;
      spot = { x: Math.round(p.x), y: Math.round(p.y) };
    }
    if (!spot) continue;
    markSpots.push(spot);
    // Trilha curta da estrada até o marco.
    let nearest = main[0], nd = Infinity;
    for (const p of main) { const d = Math.hypot(p.x - spot.x, p.y - spot.y); if (d < nd) { nd = d; nearest = p; } }
    if (mark !== "fim") roads.push([nearest, { x: Math.round((nearest.x + spot.x) / 2 + (rng() - .5) * 60), y: Math.round((nearest.y + spot.y) / 2) }, { x: spot.x, y: spot.y + 70 }]);
    const id = `${zone}/${mark}`;
    const place = placeName(rng);
    const { x, y } = spot;
    if (mark === "ruinas") landmarks.push({ id, kind: "ruins", landmark: mark, x, y: y + 60, label: `Ruínas de ${place}`,
      text: `Pedras de uma fortaleza anterior à queda da Torre de Alvor. Entre o musgo, um brasão gasto lembra ${kingdom.banner.name}.`,
      solids: [rect(x - 90, y - 70, x - 72, y + 10), rect(x + 72, y - 70, x + 90, y + 10), rect(x - 90, y - 70, x + 90, y - 52)] });
    if (mark === "santuario") landmarks.push({ id, kind: "shrine", landmark: mark, x, y: y + 60, label: `Marco dos Antigos de ${place}`,
      text: `Um círculo de pedras erguidas. Quem carrega uma bênção sente o ar mudar: os Antigos ainda olham por estas terras.`,
      solids: Array.from({ length: 7 }, (_, s) => { const a = s / 7 * Math.PI * 2 + .4; const px = x + Math.cos(a) * 70, py = y - 10 + Math.sin(a) * 46; return a > 1.2 && a < 1.95 ? null : rect(px - 9, py - 9, px + 9, py + 5); }).filter((r): r is Rectangle => !!r) });
    if (mark === "acampamento") landmarks.push({ id, kind: "camp", landmark: mark, x, y: y + 60, label: `Acampamento de ${place}`,
      text: "Uma fogueira de pedras e uma tenda de lona deixada por batedores. Acampar usa duas madeiras.", solids: [rect(x - 40, y - 40, x + 40, y - 4)] });
    if (mark === "fim") landmarks.push({ id, kind: "marker", landmark: mark, x, y: y + 60, label: "Fim da estrada conhecida",
      text: "Aqui terminam os mapas dos reinos. A bruma a leste é espessa demais; talvez um dia a estrada siga adiante.", solids: [rect(x - 8, y - 14, x + 8, y + 2)] });
    reserved.push(rect(x - 150, y - 130, x + 150, y + 150));
  }
  // Ermos: um eremita ou batedor junto do acampamento.
  if (!settled) {
    const camp = landmarks.find(l => l.landmark === "acampamento") ?? landmarks[0];
    if (camp) locals.push(person(rng, zone, 0, { role: pick(rng, ["ranger", "pilgrim", "traveler"]), x: camp.x + 70, y: camp.y + 10, facing: -1.2 }, header, next));
  }

  // ── Serras ganham cristas rochosas sólidas longe da estrada.
  if (header.biome === "serra") {
    for (let r = 0; r < 4; r++) for (let attempt = 0; attempt < 40; attempt++) {
      const w = 140 + rng() * 220, d = 90 + rng() * 120;
      const x = 200 + rng() * (W - 400), y = 180 + rng() * (H - 360);
      const area = rect(Math.round(x - w / 2), Math.round(y - d / 2), Math.round(x + w / 2), Math.round(y + d / 2));
      const c = { x, y };
      if (distanceToRoads(c, roads) < Math.max(w, d) / 2 + 140) continue;
      if (reserved.some(r => inside(c, r, Math.max(w, d) / 2 + 40)) || ridges.some(r => inside(c, r, 260))) continue;
      ridges.push(area); reserved.push(rect(area.left - 50, area.top - 50, area.right + 50, area.bottom + 60));
      break;
    }
  }

  // ── Reservas de trabalho: mesma balança finita dos Ermos.
  const resources: ResourceNodeDefinition[] = [];
  const mix: Record<"wood" | "stone" | "herb" | "ore", number> = header.biome === "serra" ? { wood: 3, stone: 4, herb: 2, ore: 3 }
    : header.biome === "charneca" ? { wood: 2, stone: 4, herb: 4, ore: header.kind === "ermo" ? 2 : 1 }
    : header.biome === "floresta" ? { wood: 6, stone: 2, herb: 4, ore: header.kind === "ermo" ? 1 : 0 }
    : { wood: 4, stone: 3, herb: 4, ore: 0 };
  const total = 11 + Math.floor(rng() * 5);
  const counts: Record<string, number> = {};
  const nounFor = { wood: header.biome === "serra" ? "Pinheiro" : pick(rng, ["Carvalho", "Castanheiro", "Freixo"]), stone: "Afloramento", herb: "Ervas", ore: "Veio de ferro" };
  for (let n = 0, attempts = 0; n < total && attempts < 900; attempts++) {
    const resource = weighted(rng, mix);
    const p = { x: Math.round(220 + rng() * (W - 440)), y: Math.round(220 + rng() * (H - 400)) };
    const roadGap = distanceToRoads(p, roads);
    if (roadGap < 90 || roadGap > 600) continue;
    if (reserved.some(r => inside(p, r, 40)) || resources.some(o => Math.hypot(o.x - p.x, o.y - p.y) < 210)) continue;
    if (Math.hypot(p.x - west.x, p.y - west.y) < 260 || Math.hypot(p.x - east.x, p.y - east.y) < 260) continue;
    counts[resource] = (counts[resource] ?? 0) + 1;
    const wood = resource === "wood", herb = resource === "herb", ore = resource === "ore";
    const id = `${zone}/${resource}-${counts[resource]}`;
    const where = p.x < W / 3 ? "do oeste" : p.x > W * 2 / 3 ? "do leste" : p.y < H / 2 ? "do norte" : "do sul";
    resources.push({ id, zone, x: p.x, y: p.y, label: `${nounFor[resource]} ${where}`, resource, kind: wood ? "resource" : resource,
      tool: wood ? "axe" : herb ? null : "pickaxe", duration: herb ? 2 : ore ? 4 : 3, stamina: herb ? 4 : ore ? 8 : 6,
      yield: herb || ore ? 2 : 3, capacity: wood || ore ? 4 : 5, respawnDays: ore ? 3 : 2,
      skill: wood ? "woodcutting" : herb ? "herbalism" : "mining" });
    n++;
  }
  // Rótulos únicos: "Pinheiro do leste", "Pinheiro do leste II".
  const seen = new Map<string, number>();
  for (const node of resources) {
    const count = (seen.get(node.label) ?? 0) + 1; seen.set(node.label, count);
    if (count > 1) node.label = `${node.label} ${ORDINALS[Math.min(count - 1, 4)]}`;
  }

  // ── Floresta: densidade e espécies pelo bioma, clareiras para estrada, povoado e trabalho.
  const decor: VillageDecoration[] = [];
  const density = header.biome === "floresta" ? 96 : header.biome === "serra" ? 112 : header.biome === "campina" ? 150 : 170;
  const species: Record<"tree1" | "tree2" | "pine", number> = header.biome === "serra" ? { pine: 8, tree1: 1, tree2: 1 }
    : header.biome === "floresta" ? { tree1: 4, tree2: 4, pine: 2 } : header.biome === "campina" ? { tree1: 5, tree2: 3, pine: 1 } : { tree1: 2, tree2: 1, pine: 3 };
  const meadows = Array.from({ length: 3 }, () => ({ x: 300 + rng() * (W - 600), y: 260 + rng() * (H - 520), rx: 160 + rng() * 220, ry: 110 + rng() * 140 }));
  for (let y = 150; y < H - 90; y += density) for (let x = 110; x < W - 90; x += density) {
    const p = { x: Math.round(x + (rng() - .5) * density * .7), y: Math.round(y + (rng() - .5) * density * .7) };
    const key = weighted(rng, species), scale = .8 + rng() * .4;
    if (distanceToRoads(p, roads) < 95) continue;
    if (reserved.some(r => inside(p, r, 30)) || ridges.some(r => inside(p, r, 50))) continue;
    if (resources.some(o => Math.abs(p.x - o.x) < 110 && p.y > o.y - 80 && p.y < o.y + 165)) continue;
    if (Math.hypot(p.x - west.x, p.y - west.y) < 200 || Math.hypot(p.x - east.x, p.y - east.y) < 200) continue;
    if (meadows.some(m => ((p.x - m.x) / m.rx) ** 2 + ((p.y - m.y) / m.ry) ** 2 < 1)) continue;
    if (plaza && Math.hypot(p.x - plaza.x, p.y - plaza.y) < 700 && rng() < .75) continue;
    decor.push({ x: p.x, y: p.y, key, scale });
  }

  // ── Portais: volta para oeste, adiante para leste.
  const portals: Portal[] = [];
  portals.push(index === 1
    ? { id: `${zone}/volta`, kind: "portal", x: west.x, y: west.y, label: "Desfiladeiro de volta a Brumavale", to: "highlands", spawn: { x: 2300, y: 735 } }
    : { id: `${zone}/volta`, kind: "portal", x: west.x, y: west.y, label: `Estrada de volta a ${previous!.name}`, to: previous!.zone, spawn: { x: W - 360, y: previous!.eastY } });
  if (next) portals.push({ id: `${zone}/adiante`, kind: "portal", x: east.x, y: east.y,
    label: `Estrada para ${next.name}${next.kingdom.index !== kingdom.index ? ` · ${next.kingdom.name}` : ""}`, to: next.zone, spawn: { x: 360, y: next.westY } });

  const solids: Rectangle[] = [
    ...buildings.map(b => b.footprint), ...ridges, ...landmarks.flatMap(l => l.solids),
    ...fields.flatMap(f => f.fence),
    ...resources.filter(n => n.kind !== "herb").map(n => n.kind === "resource" ? rect(n.x - 8, n.y - 20, n.x + 8, n.y - 4) : rect(n.x - 16, n.y - 22, n.x + 16, n.y - 6)),
    ...decor.map(item => { const s = item.scale ?? 1; return rect(item.x - 6 * s, item.y - 19 * s, item.x + 8 * s, item.y - 5 * s); }),
  ];
  const objects: WorldObject[] = [...portals, ...buildings.map(({ footprint: _f, model: _m, ...b }) => b), ...landmarks.map(({ solids: _s, text: _t, landmark: _l, ...l }) => l),
    ...locals.map(({ id, kind, x, y, label }) => ({ id, kind, x, y, label })), ...resources];
  const region: RegionDefinition = { id: zone, name: header.name, width: W, height: H, objects, portals, decor, solids };
  const lore = [
    kingdom.index === 0 ? `${header.name} ainda pertence ao Reino de Auren.` : `${header.name} pertence ao ${kingdom.name}, ${kingdom.relation}.`,
    kingdom.legend,
    `Soberano: ${kingdom.ruler}. Padroeiro: ${kingdom.saint}. Estandarte ${kingdom.banner.name}.`,
  ];
  return { ...header, color: BIOME_COLOR[header.biome], roads, plaza, buildings, locals, landmarks, fields, ridges, resources, portals, region, lore };
}

function person(rng: () => number, zone: LandZone, n: number, spot: { role: string; x: number; y: number; facing: number },
  land: LandHeader, next: LandHeader | null): LandLocal {
  const female = rng() < .5;
  const name = `${pick(rng, female ? FEMALE : MALE)} ${pick(rng, ["de", "da", "do"])} ${placeName(rng)}`.replace(/ (da|do) /, female ? " da " : " do ");
  const label = ROLE_LABEL[spot.role] ?? "Morador";
  return {
    id: `${zone}/pessoa-${n}`, kind: "local", x: Math.round(spot.x), y: Math.round(spot.y), label: name, name,
    role: spot.role, roleLabel: female ? FEMALE_ROLE[label] ?? label : label, sex: female ? "female" : "male",
    age: 18 + Math.floor(rng() * 46), skin: pick(rng, SKINS), hair: pick(rng, HAIRS), eyes: pick(rng, EYES), outfit: pick(rng, OUTFITS),
    facing: spot.facing, lines: sentenceFor(spot.role, land, next, rng),
  };
}

/** Lookup of generated items by their composite id "terra-N/algo" (":" separates action verbs). */
export function landOfId(id: string): LandZone | null {
  const cut = id.indexOf("/");
  const zone = id.slice(0, cut);
  return cut > 0 && isLandZone(zone) ? zone : null;
}
export function landResource(id: string): ResourceNodeDefinition | undefined {
  const zone = landOfId(id);
  return zone ? landForZone(zone).resources.find(node => node.id === id) : undefined;
}
export function landLocal(id: string): LandLocal | undefined {
  const zone = landOfId(id);
  return zone ? landForZone(zone).locals.find(local => local.id === id) : undefined;
}
export function landLandmark(id: string): LandLandmark | undefined {
  const zone = landOfId(id);
  return zone ? landForZone(zone).landmarks.find(mark => mark.id === id) : undefined;
}
export function landBuilding(id: string): LandBuilding | undefined {
  const zone = landOfId(id);
  return zone ? landForZone(zone).buildings.find(building => building.id === id) : undefined;
}
