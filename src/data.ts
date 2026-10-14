import type { ItemId, WorldObject } from "./types";
export const WORLD_W = 2560,
  WORLD_H = 1920;
export const ITEMS: Record<
  ItemId,
  {
    name: string;
    description: string;
    price: number;
    weight: number;
    icon: string;
  }
> = {
  bread: {
    name: "Pão de centeio",
    description: "Recupera 28 de vitalidade e 20 de energia.",
    price: 6,
    weight: 0.3,
    icon: "bread",
  },
  wood: {
    name: "Madeira",
    description: "Material para construir e manter sua propriedade.",
    price: 4,
    weight: 2,
    icon: "wood",
  },
  stone: {
    name: "Pedra",
    description: "Material resistente para construções.",
    price: 5,
    weight: 3,
    icon: "stone",
  },
  wheat: {
    name: "Trigo",
    description: "Colheita usada por moinhos e padarias.",
    price: 9,
    weight: 1,
    icon: "wheat",
  },
  flour: {
    name: "Farinha de trigo",
    description: "Moída a partir do trigo. Use na padaria para produzir pão.",
    price: 13,
    weight: 0.6,
    icon: "flour",
  },
  seed: {
    name: "Sementes de trigo",
    description:
      "Plante na sua parcela. O prazo e a colheita dependem da estação.",
    price: 5,
    weight: 0.1,
    icon: "seed",
  },
  sword: {
    name: "Espada de ferro",
    description: "Dano maior, influenciado por força e prática.",
    price: 32,
    weight: 3,
    icon: "sword",
  },
  herb: {
    name: "Erva medicinal",
    description: "Recupera 18 de vitalidade.",
    price: 7,
    weight: 0.1,
    icon: "herb",
  },
  ore: {
    name: "Minério de ferro",
    description: "Extraído da cripta. Tem valor no mercado.",
    price: 12,
    weight: 2,
    icon: "ore",
  },
};
export const OBJECTS: WorldObject[] = [
  {
    id: "mill",
    kind: "mill",
    x: 1260,
    y: 430,
    label: "Moinho de Valeverde",
    w: 190,
    h: 170,
  },
  {
    id: "bakery",
    kind: "bakery",
    x: 1230,
    y: 1410,
    label: "Padaria do Carvalho",
    w: 175,
    h: 140,
  },
  {
    id: "orphanage",
    kind: "house",
    x: 710,
    y: 620,
    label: "Orfanato de Santa Elara",
    w: 220,
    h: 168,
  },
  {
    id: "market",
    kind: "market",
    x: 1280,
    y: 820,
    label: "Mercado de Valeverde",
    w: 170,
    h: 100,
  },
  {
    id: "forge",
    kind: "forge",
    x: 1560,
    y: 660,
    label: "Forja de Aldric",
    w: 180,
    h: 140,
  },
  {
    id: "inn",
    kind: "house",
    x: 1000,
    y: 1080,
    label: "Estalagem do Carvalho",
    w: 200,
    h: 150,
  },
  {
    id: "house1",
    kind: "house",
    x: 1640,
    y: 1100,
    label: "Casa de Mira",
    w: 170,
    h: 130,
  },
  {
    id: "property",
    kind: "farm",
    x: 1900,
    y: 880,
    label: "Parcela do Moinho",
    w: 260,
    h: 210,
  },
  { id: "well", kind: "well", x: 1130, y: 800, label: "Poço da praça" },
  {
    id: "dungeon",
    kind: "dungeon",
    x: 2110,
    y: 340,
    label: "Cripta das Raízes",
  },
  {
    id: "tree1",
    kind: "resource",
    x: 590,
    y: 1080,
    label: "Carvalho · obter madeira",
  },
  { id: "herb1", kind: "herb", x: 1800, y: 440, label: "Ervas medicinais" },
  { id: "stone1", kind: "stone", x: 1780, y: 1320, label: "Pedras do caminho" },
  {
    id: "sign",
    kind: "sign",
    x: 1390,
    y: 1090,
    label: "Mural de oportunidades",
  },
];
export const BLESSINGS = {
  vigor: {
    name: "Vigor",
    subtitle: "O corpo que persevera",
    description: "+25 vitalidade · +20 energia · mais resistência física",
    color: "#bb9270",
  },
  wisdom: {
    name: "Sabedoria",
    subtitle: "A mente que descobre",
    description: "+4 inteligência · +4 sabedoria · prática 40% mais eficaz",
    color: "#86b9b0",
  },
  fortune: {
    name: "Fortuna",
    subtitle: "O destino que sussurra",
    description: "+3 carisma · preços de compra 12% menores",
    color: "#d6bc72",
  },
};
export const ATTR_NAMES: Record<string, string> = {
  strength: "Força",
  dexterity: "Destreza",
  constitution: "Constituição",
  intelligence: "Inteligência",
  wisdom: "Sabedoria",
  charisma: "Carisma",
  perception: "Percepção",
  will: "Vontade",
  vitality: "Vitalidade",
  endurance: "Resistência",
  energy: "Energia",
};
export const SKILL_NAMES: Record<string, string> = {
  sword: "Espadas",
  farming: "Agricultura",
  mining: "Mineração",
  trading: "Negociação",
  building: "Construção",
  leadership: "Liderança",
  cooking: "Culinária",
  smithing: "Ferraria",
};
