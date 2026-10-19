import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Check, Coins, Compass, Crown, Hammer, House, MapPin, Package, ScrollText, Shield } from "lucide-react";
import type { ReactNode } from "react";
import type { EstateId, GameState, ItemId } from "./types";
import { ITEMS } from "./data";
import { carriedWeight, carryingCapacity } from "./frontier";
import { estateActionReason } from "./territory";
import { ESTATE_BUILDINGS, ESTATE_DEFS, ESTATE_STORAGE_CAPACITY, estateLimit, estateStorageWeight } from "./territory-data";
import { store } from "./simulation";
import { interiorForZone } from "./interiors";
import { formatRestPreview } from "./rest";
import "./territory.css";

const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
const format = (amount: number) => amount.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

function TerritoryAction({ state, action, children, outline = false, hint = true }: {
  state: GameState;
  action: string;
  children: ReactNode;
  outline?: boolean;
  hint?: boolean;
}) {
  const reason = estateActionReason(state, action);
  return <>
    <button className={`panel-button panel-button-full${outline ? " panel-button-outline" : ""}`} disabled={!!reason} title={reason || undefined} onClick={() => store.act(action)}>{children}</button>
    {hint && reason ? <p className="panel-hint">{reason}</p> : null}
  </>;
}

function WalkTo({ state, id, zone, onClose }: { state: GameState; id: string; zone: GameState["zone"]; onClose: () => void }) {
  if (state.zone !== zone || state.phase !== "playing" || !state.apostle.alive) return null;
  return <button className="panel-button panel-button-outline panel-button-full" onClick={() => {
    document.dispatchEvent(new CustomEvent("kg-navigate", { detail: { id } }));
    onClose();
  }}><Compass size={15} /> Caminhar até {id === "sign" ? "o registro da vila" : "o marco da parcela"}</button>;
}

function EstateStorage({ state, id }: { state: GameState; id: EstateId }) {
  const [item, setItem] = useState<ItemId>("wood");
  const holding = state.territory.parcels[id];
  const used = estateStorageWeight(holding);
  const depositReason = estateActionReason(state, `estate-deposit:${id}:${item}:1`);
  const withdrawReason = estateActionReason(state, `estate-withdraw:${id}:${item}:1`);
  return <section className="territory-storage" aria-label={`Armazém de ${ESTATE_DEFS.find((estate) => estate.id === id)?.name}`}>
    <div className="territory-storage-heading"><Package size={17} /><strong>Armazém da propriedade</strong><span>{format(used)} / {ESTATE_STORAGE_CAPACITY} kg</span></div>
    <div className="panel-condition-track" role="progressbar" aria-label="Capacidade ocupada do armazém" aria-valuemin={0} aria-valuemax={ESTATE_STORAGE_CAPACITY} aria-valuenow={used}><span style={{ width: `${Math.min(100, used / ESTATE_STORAGE_CAPACITY * 100)}%` }} /></div>
    <label className="territory-item-label" htmlFor={`estate-item-${id}`}>Item para transferir</label>
    <select className="territory-item-select" id={`estate-item-${id}`} value={item} onChange={(event) => setItem(event.target.value as ItemId)}>
      {ITEM_IDS.map((itemId) => <option key={itemId} value={itemId}>{ITEMS[itemId].name} · mochila {state.inventory[itemId]} · armazém {holding.storage[itemId]}</option>)}
    </select>
    <div className="territory-transfer-counts"><span>Mochila: <b>{state.inventory[item]}</b></span><span>Armazém: <b>{holding.storage[item]}</b></span></div>
    <div className="territory-transfer-actions">
      {[1, 5].map((quantity) => <TerritoryAction key={`deposit-${quantity}`} state={state} action={`estate-deposit:${id}:${item}:${quantity}`} outline hint={false}><ArrowDownToLine size={14} /> Guardar {quantity}</TerritoryAction>)}
      {[1, 5].map((quantity) => <TerritoryAction key={`withdraw-${quantity}`} state={state} action={`estate-withdraw:${id}:${item}:${quantity}`} outline hint={false}><ArrowUpFromLine size={14} /> Retirar {quantity}</TerritoryAction>)}
    </div>
    <p className="panel-hint">Sua mochila: {format(carriedWeight(state))} / {format(carryingCapacity(state))} kg. As transferências movem os itens entre a mochila e esta propriedade.</p>
    {depositReason ? <p className="panel-hint">Para guardar: {depositReason}</p> : null}
    {withdrawReason ? <p className="panel-hint">Para retirar: {withdrawReason}</p> : null}
    {holding.condition < 25 ? <p className="panel-hint">O armazém está danificado. Os bens guardados continuam disponíveis para retirada.</p> : null}
  </section>;
}

function EstateCard({ state, id, onClose }: { state: GameState; id: EstateId; onClose: () => void }) {
  const definition = ESTATE_DEFS.find((estate) => estate.id === id)!;
  const holding = state.territory.parcels[id];
  return <article className="panel-order-card territory-estate" aria-label={definition.name}>
    <div className="territory-estate-heading"><MapPin size={21} /><div><span className="panel-overline">Ermos de Alvor · Reino de Auren</span><h3>{definition.name}</h3></div></div>
    <p className="panel-prose">{definition.description}</p>
    <dl className="territory-facts">
      <div><dt>Registro</dt><dd>{holding.owned ? `Casa ${state.apostle.surname}` : "Terra disponível"}</dd></div>
      <div><dt>Dimensões</dt><dd>{definition.width} × {definition.height} passos</dd></div>
      <div><dt>Localização</dt><dd>X {definition.x} · Y {definition.y}</dd></div>
      <div><dt>Tributo</dt><dd>1 ouro por dia de posse</dd></div>
    </dl>
    <WalkTo state={state} id={id} zone="wilderness" onClose={onClose} />
    {state.zone !== "wilderness" && !interiorForZone(state.zone)?.stations.some(station => station.kind === "estate") ? <p className="panel-hint">Saia pela estrada ao sudeste de Valeverde. Nos Ermos, o mapa mostra os marcos de registro.</p> : null}
    {!holding.owned ? <>
      <TerritoryAction state={state} action={`estate-buy:${id}`}><ScrollText size={15} /> Registrar terreno · {definition.cost} ouro</TerritoryAction>
      <p className="panel-hint">O pagamento entra no fundo da vila. A escritura permanece na família durante a sucessão.</p>
    </> : <>
      <span className="panel-status panel-status-good">Registrado no dia {holding.registeredDay}</span>
      {holding.building === "none" ? <>
        <p className="panel-prose">Escolha uma construção para esta parcela. A implantação é fixa e deixa o acesso ao marco livre.</p>
        <div className="territory-building-options">
          {(["warehouse", "shelter"] as const).map((building) => {
            const recipe = ESTATE_BUILDINGS[building];
            return <section key={building} className="territory-building-option"><strong>{recipe.name}</strong><p>{recipe.description}</p><p className="territory-cost">{recipe.wood} madeira · {recipe.stone} pedra · {recipe.stamina} energia</p><TerritoryAction state={state} action={`estate-build:${id}:${building}`}><Hammer size={15} /> Construir {recipe.name.toLowerCase()}</TerritoryAction></section>;
          })}
        </div>
      </> : <>
        <div className="panel-section-heading"><h3>{ESTATE_BUILDINGS[holding.building].name}</h3><House size={17} /></div>
        <div className="territory-condition-caption"><span>Conservação</span><b>{holding.condition} / 100</b></div>
        <div className="panel-condition-track" role="progressbar" aria-label={`Conservação de ${definition.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={holding.condition}><span style={{ width: `${holding.condition}%` }} /></div>
        <p className="panel-hint">A construção perde 2 pontos por dia. Um reparo usa 3 madeira, 2 pedra e 8 energia para recuperar 40 pontos, até 100.</p>
        <TerritoryAction state={state} action={`estate-repair:${id}`} outline><Hammer size={15} /> Reparar construção</TerritoryAction>
        {holding.building === "warehouse" ? <EstateStorage state={state} id={id} /> : <>
          <p className="panel-prose">O abrigo permite descansar por 4 horas, recuperando vitalidade e energia com 1 madeira para o fogo. O relógio e as obrigações continuam avançando.</p>
          <p className="panel-hint">{formatRestPreview(state, 4)}</p>
          <TerritoryAction state={state} action={`estate-rest:${id}`}><House size={15} /> Descansar no abrigo · 1 madeira</TerritoryAction>
        </>}
      </>}
    </>}
  </article>;
}

export function TerritoryPanels({ state, onClose }: { state: GameState; onClose: () => void }) {
  const territory = state.territory;
  const owned = ESTATE_DEFS.filter((estate) => territory.parcels[estate.id].owned).length;
  const hasLand = state.property.owned || owned > 0;
  const requirements = [
    { done: state.apostle.age >= 16, label: "Apóstolo com 16 anos ou mais" },
    { done: territory.influence >= 12, label: `${territory.influence} / 12 influência em Auren` },
    { done: hasLand, label: "Possuir uma parcela em Valeverde ou nos Ermos" },
    { done: territory.arrears === 0, label: "Tributos dos Ermos em dia" },
    { done: state.gold >= 60, label: "60 ouro para registrar a carta" },
  ];
  return <section className="territory-panels">
    <div className="territory-realm-banner"><Shield size={30} /><div><span className="panel-overline">Sob a lei do Reino de Auren</span><h3>Terras e reconhecimento</h3><p>{territory.charter ? "Carta de Guardião de Alvor registrada" : "Habitante livre de Auren"}</p></div></div>
    <div className="territory-realm-stats"><div><span>Influência</span><b>{territory.influence}</b></div><div><span>Terras nos Ermos</span><b>{owned}<small> / {estateLimit(state)}</small></b></div><div><span>Tributo diário</span><b>{owned + (territory.charter ? 1 : 0)}<small> ouro</small></b></div></div>
    <p className="panel-prose">Concluir oportunidades, atender pedidos da vila, colher e construir cria reconhecimento. Há duas parcelas registráveis nos Ermos. A carta amplia sua posse de uma para duas; suas terras continuam vinculadas a Auren.</p>
    <details className="territory-influence-guide"><summary>Como conquistar influência</summary><p>4 por oportunidade de exploração ou entrega concluída; 3 por pedido cívico, nos seis primeiros pedidos distintos; 2 pela primeira colheita, primeira moradia e cada construção dos Ermos. Cada feito só conta uma vez.</p></details>
    {territory.arrears > 0 ? <div className="territory-arrears" role="status"><Coins size={18} /><div><strong>{territory.arrears} ouro em tributos pendentes</strong><p>Regularize o registro no mural da vila para adquirir, construir, guardar bens ou descansar nos Ermos.</p></div></div> : <p className="panel-hint">Tributos dos Ermos em dia. A cada amanhecer, 1 ouro por parcela e 1 pela carta vai ao fundo da vila. A Parcela do Moinho mantém sua tributação própria.</p>}
    {territory.arrears > 0 ? <>
      <TerritoryAction state={state} action="realm-pay-debt"><Coins size={15} /> Pagar tributos · {Math.min(state.gold, territory.arrears)} ouro</TerritoryAction>
      {state.gold < territory.arrears ? <p className="panel-hint">Pagamento parcial; o saldo permanece pendente.</p> : null}
    </> : null}
    <div className="territory-charter">
      <div className="panel-section-heading"><h3>Carta de Guardião de Alvor</h3><Crown size={18} /></div>
      {territory.charter ? <p className="panel-prose">A Casa {state.apostle.surname} tem autorização para manter as duas parcelas dos Ermos. A carta acompanha os bens na sucessão e exige 1 ouro diário adicional.</p> : <>
        <p className="panel-prose">Reconhecimento local que autoriza sua família a manter uma segunda parcela nos Ermos. Registre a carta pessoalmente no mural de Valeverde.</p>
        <ul className="territory-requirements">{requirements.map((requirement) => <li key={requirement.label} className={requirement.done ? "territory-requirement-done" : ""}>{requirement.done ? <Check size={14} /> : <span className="territory-requirement-circle" />}<span>{requirement.label}</span></li>)}</ul>
        <TerritoryAction state={state} action="realm-charter"><ScrollText size={15} /> Registrar carta · 60 ouro</TerritoryAction>
      </>}
      {!territory.charter || territory.arrears > 0 ? <WalkTo state={state} id="sign" zone="village" onClose={onClose} /> : null}
    </div>
    <div className="panel-section-heading"><h3>Parcelas dos Ermos</h3><MapPin size={18} /></div>
    <div className="panel-order-list">{ESTATE_DEFS.map((estate) => <EstateCard key={estate.id} state={state} id={estate.id} onClose={onClose} />)}</div>
    <div className="panel-section-heading territory-original-farm"><h3>Sua vida em Valeverde</h3><House size={18} /></div>
  </section>;
}
