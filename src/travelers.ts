import { ITEMS } from './data';
import { interiorForZone } from './interiors';
import { marketQuote, type MarketQuote } from './market';
import { isVisitor, populationDefinition, type PopulationStop } from './population';
import { weatherFor } from './weather';
import { npcVisualIdentity } from './character-identity';
import type { Dialog, ExpansionHooks, GameState, ItemId, Npc } from './types';
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
const count=(n:number)=>Number.isSafeInteger(n)&&n>=0;
const alive=(state:GameState,id:string)=>state.family.find(p=>p.id===id)?.alive!==false && state.apostle.id!==id;
const nearby=(state:GameState,npc:Npc)=>npc.zone===state.zone&&distance(npc,state.apostle)<=150;
const active=(state:GameState)=>state.started&&state.phase==='playing'&&state.apostle.alive;

/** A structural read-only view shares the village formula without ever replacing saved market data. */
export function travelerQuote(state:GameState,id:string,item:ItemId,buy:boolean):MarketQuote|null {
  const d=populationDefinition(state,id), trader=state.worldLife?.travelers[id];
  if(d?.role!=='merchant'||!trader||!Object.hasOwn(ITEMS,item))return null;
  return marketQuote({...state,market:trader.stock},item,buy);
}
export function travelerDialog(state:GameState,id:string):Dialog|null {
  const npc=state.npcs.find(n=>n.id===id), d=populationDefinition(state,id);
  if(!npc||!d||d.resident)return null;
  const speaker=npcVisualIdentity(state,npc);
  if(d.role!=='merchant')return {name:npc.name,role:npc.role,speaker,text:d.role==='pilgrim'
    ?'Sigo até a capela da serra. Cada abrigo e cada encontro fazem parte da caminhada.'
    :'Levo notícias entre a vila, o acampamento e a serra. Aguardo aqui antes de retomar a estrada.',options:[]};
  const trader=state.worldLife.travelers[id];
  return {name:npc.name,role:npc.role,speaker,text:`Meu estoque e meu caixa são finitos. Tenho ${trader.gold} moedas para negociar.`,
    options:(Object.keys(ITEMS) as ItemId[]).flatMap(item=>{
      const buy=travelerQuote(state,id,item,true)!,sell=travelerQuote(state,id,item,false)!;
      return [{label:`Comprar ${ITEMS[item].name} · ${buy.price} moedas (${buy.stock})`,action:`traveler-buy:${id}:${item}`,
        disabled:!nearby(state,npc)||!alive(state,id)||buy.stock<1||state.gold<buy.price},
      {label:`Vender ${ITEMS[item].name} · ${sell.price} moedas`,action:`traveler-sell:${id}:${item}`,
        disabled:!nearby(state,npc)||!alive(state,id)||state.inventory[item]<1||trader.gold<sell.price}];
    })};
}
/** Own recognized verbs even on rejection. All resource/physical gates precede every mutation. */
export function executeTravelerAction(state:GameState,action:string,hooks:ExpansionHooks):boolean {
  const [verb,id,item,...extra]=action.split(':');
  if(verb!=='traveler-buy'&&verb!=='traveler-sell')return false;
  if(!active(state))return true;
  const npc=state.npcs.find(n=>n.id===id), trader=state.worldLife?.travelers[id];
  if(extra.length||!npc||!trader||!alive(state,id)||!nearby(state,npc)||!Object.hasOwn(ITEMS,item)){
    hooks.message('Aproxime-se da caravana viva para negociar.','warning');return true;
  }
  const key=item as ItemId,buy=verb==='traveler-buy',quote=travelerQuote(state,id,key,buy);
  if(!quote)return true;
  const price=quote.price, gold=state.gold+(buy?-price:price), till=trader.gold+(buy?price:-price),
    inventory=state.inventory[key]+(buy?1:-1),stock=trader.stock[key]+(buy?-1:1);
  if(![price,state.gold,trader.gold,state.inventory[key],trader.stock[key],gold,till,inventory,stock].every(count)||price<1){
    hooks.message('Estoque, moedas ou capacidade insuficientes para essa troca.','warning');return true;
  }
  state.gold=gold;trader.gold=till;state.inventory[key]=inventory;trader.stock[key]=stock;
  const text=`${buy?'Comprou':'Vendeu'} ${ITEMS[key].name} ${buy?'de':'para'} ${npc.name} por ${price} moedas.`;
  state.economy.ledger.push({day:state.day,type:buy?'buy':'sell',text,goldDelta:buy?-price:price});
  if(state.economy.ledger.length>30)state.economy.ledger.splice(0,state.economy.ledger.length-30);
  hooks.practice('trading',.15);hooks.message(text,'success');return true;
}

/** Local shelter avoids sending every traveler back across the world for a night's sleep. */
export function travelerShelter(npc:Npc):PopulationStop {
  const room=interiorForZone(npc.zone), zone=room?.entrance.zone??npc.zone;
  const index=['alpha12-merchant-grain','alpha12-merchant-trail','alpha12-pilgrim','alpha12-courier'].indexOf(npc.id);
  return {zone:room?.zone??(zone==='highlands'?'ranger-room':zone==='wilderness'?'camp-room':'inn-room'),
    x:index%2===0?400:500,y:index<2?550:650,wait:16};
}
export function travelerDestination(state:GameState,npc:Npc):PopulationStop|null {
  if(!isVisitor(state,npc.id))return null;
  const hour=((state.minutes%1440)+1440)%1440/60, needs=state.life.needs[npc.id];
  const storm=weatherFor(state.day,state.minutes,npc.zone).kind==='storm';
  if(storm||hour>=22||hour<6||(needs?.hunger??0)>=70||(needs?.fatigue??0)>=75)return travelerShelter(npc);
  const d=populationDefinition(state,npc.id)!,t=state.worldLife.travelers[npc.id];
  return d.route[t.routeIndex]??null;
}
/** Tick only after physical movement. A stop's countdown never advances while remotely travelling/resting. */
export function updateTravelerRoutes(state:GameState,delta:number):void {
  if(!active(state)||!Number.isFinite(delta)||delta<=0)return;
  for(const npc of state.npcs){
    if(!isVisitor(state,npc.id)||!alive(state,npc.id))continue;
    const d=populationDefinition(state,npc.id)!,t=state.worldLife.travelers[npc.id],stop=d.route[t.routeIndex],destination=travelerDestination(state,npc);
    if(!stop||!destination||destination!==stop||npc.zone!==stop.zone||distance(npc,stop)>12)continue;
    t.wait=Math.max(0,t.wait-Math.min(delta,1));
    if(t.wait===0){t.routeIndex=(t.routeIndex+1)%d.route.length;t.wait=d.route[t.routeIndex].wait;}
  }
}
