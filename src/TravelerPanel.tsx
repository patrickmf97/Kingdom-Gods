import { useState } from "react";
import { Coins, MapPin, ShoppingBasket } from "lucide-react";
import { ITEMS } from "./data";
import { populationDefinition, VISITOR_DEFINITIONS } from "./population";
import { regionForZone } from "./regions";
import { travelerQuote } from "./travelers";
import type { GameState, ItemId } from "./types";

const itemIds = Object.keys(ITEMS) as ItemId[];
const money = (value: number) => new Intl.NumberFormat("pt-BR").format(value);

export function TravelerPanel({ state, onAction }: { state: GameState; onAction: (action: string) => void }) {
  const merchants = VISITOR_DEFINITIONS.filter(definition => definition.role === "merchant" &&
    populationDefinition(state, definition.id) && state.npcs.some(npc => npc.id === definition.id));
  const [selectedId, setSelectedId] = useState(() => merchants.find(definition => {
    const npc = state.npcs.find(person => person.id === definition.id)!;
    return npc.zone === state.zone && Math.hypot(npc.x - state.apostle.x, npc.y - state.apostle.y) <= 150;
  })?.id ?? merchants[0]?.id ?? "");
  const [item, setItem] = useState<ItemId>("bread");
  const merchant = merchants.find(definition => definition.id === selectedId) ?? merchants[0];
  const npc = state.npcs.find(person => person.id === merchant?.id);
  const traveler = merchant && state.worldLife.travelers[merchant.id];
  if (!merchant || !npc || !traveler) return <div className="panel-empty"><ShoppingBasket size={32} /><h3>Nenhuma caravana disponível</h3><p>Seu diário registrará os comerciantes presentes nesta campanha.</p></div>;
  const merchantAlive = state.family.find(person => person.id === npc.id)?.alive !== false && state.apostle.id !== npc.id;
  const nearby = state.started && state.phase === "playing" && state.apostle.alive && merchantAlive && state.zone === npc.zone &&
    Math.hypot(state.apostle.x - npc.x, state.apostle.y - npc.y) <= 150;
  const buying = travelerQuote(state, npc.id, item, true);
  const selling = travelerQuote(state, npc.id, item, false);
  const canBuy = nearby && buying && traveler.stock[item] > 0 && state.gold >= buying.price &&
    Number.isSafeInteger(state.inventory[item] + 1) && Number.isSafeInteger(traveler.gold + buying.price);
  const canSell = nearby && selling && state.inventory[item] > 0 && traveler.gold >= selling.price &&
    Number.isSafeInteger(traveler.stock[item] + 1) && Number.isSafeInteger(state.gold + selling.price);
  return <>
    <p className="panel-prose">As caravanas viajam entre a vila, o acampamento e a serra. Encontre o comerciante para trocar uma unidade por vez.</p>
    <div className="panel-traveler-list" role="group" aria-label="Escolher caravana">
      {merchants.map(definition => {
        const person = state.npcs.find(candidate => candidate.id === definition.id)!;
        return <button key={definition.id} aria-pressed={definition.id === merchant.id}
          onClick={() => setSelectedId(definition.id)}>
          <ShoppingBasket size={19} aria-hidden="true" /><span><strong>{person.name}</strong><small>{person.role} · {regionForZone(person.zone).name}</small></span>
        </button>;
      })}
    </div>
    <section className="panel-traveler-detail" aria-label={`Negociar com ${npc.name}`}>
      <div className="panel-section-heading"><h3>{npc.role}</h3><Coins size={18} aria-hidden="true" /></div>
      <dl className="panel-traveler-balances"><div><dt>Caixa de {npc.name}</dt><dd>{money(traveler.gold)} ouro</dd></div><div><dt>Localização atual</dt><dd>{regionForZone(npc.zone).name}</dd></div></dl>
      <label className="panel-traveler-item">Mercadoria<select value={item} onChange={event => setItem(event.target.value as ItemId)}>{itemIds.map(id => <option key={id} value={id}>{ITEMS[id].name}</option>)}</select></label>
      <dl className="panel-traveler-balances"><div><dt>Estoque da caravana</dt><dd>{traveler.stock[item]}</dd></div><div><dt>No seu inventário</dt><dd>{state.inventory[item]}</dd></div></dl>
      <div className="panel-traveler-quotes"><div><span>Você paga</span><strong>{buying ? `${money(buying.price)} ouro` : "Indisponível"}</strong></div><div><span>Você recebe</span><strong>{selling ? `${money(selling.price)} ouro` : "Indisponível"}</strong></div></div>
      <div className="panel-actions"><button className="panel-button" disabled={!canBuy} onClick={() => onAction(`traveler-buy:${npc.id}:${item}`)}>Comprar 1</button><button className="panel-button panel-button-outline" disabled={!canSell} onClick={() => onAction(`traveler-sell:${npc.id}:${item}`)}>Vender 1</button></div>
      {!nearby ? <p className="panel-notice"><MapPin size={16} aria-hidden="true" /><span>Encontre {npc.name} em {regionForZone(npc.zone).name}, e aproxime-se para negociar.</span></p> : <p className="panel-hint">Estoque, seu inventário e o ouro de cada lado limitam as trocas.</p>}
    </section>
    <p className="panel-hint">O estoque e o caixa acompanham a caravana durante a viagem. Não são repostos gratuitamente a cada dia.</p>
  </>;
}
