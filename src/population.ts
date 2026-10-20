import type { GameState, ItemId, Npc, Zone } from './types';

export type PopulationRole = 'baker' | 'miller' | 'innkeeper' | 'porter' | 'ranger' | 'fisher' | 'merchant' | 'pilgrim' | 'courier';
export interface PopulationStop { readonly zone: Zone; readonly x: number; readonly y: number; readonly wait: number }
export interface PopulationDefinition {
  readonly id: string;
  readonly role: PopulationRole;
  readonly resident: boolean;
  readonly npc: Readonly<Npc>;
  readonly work: PopulationStop;
  readonly shelter: PopulationStop;
  readonly route: readonly PopulationStop[];
  readonly stock: Readonly<Partial<Record<ItemId,number>>>;
  readonly gold: number;
}
const stop = (zone: Zone, x=450, y=550, wait=16): PopulationStop => Object.freeze({zone,x,y,wait});
const inn = stop('inn-room'), camp = stop('camp-room'), ranger = stop('ranger-room');
function definition(id: string, name: string, title: string, role: PopulationRole, color: string,
  home: PopulationStop, work: PopulationStop, shelter: PopulationStop,
  route: readonly PopulationStop[]=[], stock: Partial<Record<ItemId,number>>={}, gold=0): PopulationDefinition {
  return Object.freeze({ id:`alpha12-${id}`, role, resident:route.length===0,
    npc:Object.freeze({id:`alpha12-${id}`,name,role:title,x:home.x,y:home.y,homeX:home.x,homeY:home.y,
      zone:home.zone,color,relation:35,trust:45,mood:route.length?'Viajando pelas estradas':'Cuidando de seu ofício'}),
    work,shelter,route:Object.freeze([...route]),stock:Object.freeze(stock),gold });
}
export const RESIDENT_DEFINITIONS: readonly PopulationDefinition[] = Object.freeze([
  definition('baker','Beatriz','Padeira','baker','#ac7959',stop('village',1220,1490),stop('bakery-room',360,580),stop('inn-room',350,710)),
  definition('miller','Otávio','Moleiro','miller','#a59872',stop('village',1240,520),stop('mill-room',360,675),stop('inn-room',550,710)),
  definition('innkeeper','Rosa','Estalajadeira','innkeeper','#916b87',stop('village',900,1340),stop('inn-room',340,350),stop('inn-room',450,650)),
  definition('porter','Tobias','Carregador','porter','#8b7551',stop('village',1830,1150),stop('farm-store-room',400,520),stop('inn-room',450,710)),
  definition('ranger','Íria','Guarda-florestal','ranger','#59846d',stop('highlands',1100,880),stop('highlands',1180,690),stop('ranger-room',350,650)),
  definition('fisher','Nuno','Pescador','fisher','#637f9b',stop('wilderness',2190,1740),stop('wilderness',2210,1740),stop('camp-room',350,650)),
]);
export const VISITOR_DEFINITIONS: readonly PopulationDefinition[] = Object.freeze([
  definition('merchant-grain','Gaspar','Caravana dos grãos','merchant','#be9753',stop('village',1070,1180),inn,inn,[stop('inn-room',400,550),stop('camp-room',400,550),stop('ranger-room',400,550)],{bread:12,wheat:16,flour:8,seed:10},140),
  definition('merchant-trail','Samira','Caravana da serra','merchant','#8374a0',stop('wilderness',1130,1500),camp,camp,[stop('camp-room',500,550),stop('ranger-room',500,550),stop('inn-room',500,550)],{bread:6,wood:14,stone:10,ore:6,herb:8},180),
  definition('pilgrim','Celina','Peregrina','pilgrim','#a7a395',stop('village',1100,1230),inn,inn,[stop('inn-room',400,650),stop('camp-room',400,650),stop('chapel-room',400,650)],{bread:4}),
  definition('courier','Dário','Mensageiro','courier','#aa6658',stop('highlands',1000,1000),ranger,ranger,[stop('ranger-room',500,650),stop('inn-room',500,650),stop('camp-room',500,650)],{bread:4}),
]);
export const POPULATION_DEFINITIONS = Object.freeze([...RESIDENT_DEFINITIONS,...VISITOR_DEFINITIONS]);
export const POPULATION_IDS = Object.freeze(POPULATION_DEFINITIONS.map(d=>d.id));
const ITEMS: readonly ItemId[] = ['bread','wood','stone','wheat','flour','seed','sword','herb','ore'];
export function populationDefinition(state: GameState,id: string): PopulationDefinition | undefined {
  const definition = POPULATION_DEFINITIONS.find(d=>d.id===id);
  return definition && (definition.resident ? state.worldLife?.residents.includes(id) : Object.hasOwn(state.worldLife?.travelers??{},id))
    ? definition : undefined;
}
export function populationRole(state: GameState,id: string): PopulationRole | undefined { return populationDefinition(state,id)?.role; }
export function isVisitor(state: GameState,id: string): boolean { return !!populationDefinition(state,id) && !populationDefinition(state,id)!.resident; }

/** New identities are an endowment once; a colliding historical identity always wins. */
export function initializePopulation(state: GameState): void {
  const occupied = new Set([...state.npcs.map(n=>n.id),...state.family.map(p=>p.id),state.apostle.id]);
  const holdings = [state.gold,state.merchantGold,state.economy.civicFunds,state.frontier.escrow,
    ...Object.values(state.economy.npcSavings),...Object.values(state.worldLife.travelers).map(t=>t.gold)];
  let headroom = Number.MAX_SAFE_INTEGER;
  for (const gold of holdings) headroom = Math.max(0,headroom-gold);
  for (const d of POPULATION_DEFINITIONS) {
    // Even tracked but absent identities may reflect succession/death; never resurrect them.
    if (occupied.has(d.id) || state.worldLife.residents.includes(d.id) || Object.hasOwn(state.worldLife.travelers,d.id)) continue;
    occupied.add(d.id); state.npcs.push({...d.npc});
    state.life.needs[d.id] ??= {hunger:20,fatigue:10,goal:'work'};
    if (d.resident) state.worldLife.residents.push(d.id);
    else {
      const gold = Math.min(d.gold,headroom); headroom -= gold;
      state.worldLife.travelers[d.id] = {routeIndex:0,wait:d.route[0].wait,gold,
        stock:Object.fromEntries(ITEMS.map(item=>[item,d.stock[item]??0])) as Record<ItemId,number>};
    }
  }
}
