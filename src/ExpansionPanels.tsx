import { ArrowRight, BookOpen, Check, Coins, Compass, Download, Hammer, Heart, Package, Shield, Upload, Users } from "lucide-react";
import type { EducationFocus, GameState, Npc, Person, ToolId } from "./types";
import { ITEMS } from "./data";
import { objectsForZone } from "./regions";
import { TOOL_DEFS } from "./frontier";
import { availableGuardians, educationLabels } from "./life";
import { store } from "./simulation";

const TOOL_IDS: ToolId[] = ["axe", "pickaxe"];
const playing = (state: GameState) => state.phase === "playing" && state.apostle.alive;
const nearObject = (state: GameState, id: string) => {
  const object = objectsForZone(state.zone).find((item) => item.id === id);
  return !!object && (Math.hypot(state.apostle.x - object.x, state.apostle.y - object.y) <= 190 ||
    (id === "property" && state.zone === "village" && state.property.building &&
      Math.hypot(state.apostle.x - 2090, state.apostle.y - 815) <= 190));
};
const nearNpc = (state: GameState, npc: Npc) => state.zone === (npc.id === "matron" ? "orphanage" : "village") && Math.hypot(state.apostle.x - npc.x, state.apostle.y - npc.y) <= 180;
const familyLocation = (state: GameState) => {
  const spouse = state.npcs.find((npc) => npc.id === state.apostle.partnerId);
  return (state.property.owned && state.property.building && nearObject(state, "property")) || (!!spouse && nearNpc(state, spouse));
};
const act = (action: string) => store.act(action);

function ToolIcon({ id }: { id: ToolId }) {
  return <svg width="52" height="52" viewBox="0 0 48 48" aria-hidden="true" className="panel-tool-icon">
    <ellipse cx="24" cy="40" rx="17" ry="3" fill="#78664b" opacity=".1" />
    <path d="m13 39 21-29 4 3-21 29Z" fill="#a27a4d" stroke="#695338" strokeWidth="1.5" />
    <path d="m17 36 17-23" stroke="#d1ac72" strokeWidth="2" />
    {id === "axe" ? <path d="m25 9 9 7-9 17-14-7 8-14Z" fill="#9faeaa" stroke="#58685f" strokeWidth="1.5" /> : <path d="M8 15c10-7 26-7 33 9l-11-7-11 2-11 7Z" fill="#9faeaa" stroke="#58685f" strokeWidth="1.5" />}
    <path d={id === "axe" ? "m12 26 13 7 2-4-14-7Z" : "m8 26 11-7 11-2 11 7"} fill={id === "axe" ? "#d4ded5" : "none"} stroke="#d4ded5" strokeWidth="1.5" />
  </svg>;
}

export function ToolsPanel({ state, mode }: { state: GameState; mode: "inventory" | "market" | "repair" }) {
  const trade = playing(state) && (nearObject(state, "market") || nearObject(state, "forge"));
  const forge = playing(state) && nearObject(state, "forge");
  const tools = mode === "repair" ? TOOL_IDS.filter((id) => state.frontier.tools[id].owned) : TOOL_IDS;
  return <section className="panel-expansion-section">
    <div className="panel-section-heading"><h3>{mode === "repair" ? "Cuidar das ferramentas" : "Ferramentas de trabalho"}</h3><Hammer size={17} /></div>
    <p className="panel-prose">{mode === "repair" ? "Na forja, 1 minério, 1 madeira e 3 ouro restauram 50 pontos de durabilidade, até 100." : "Machado e picareta abrem novas atividades nos Ermos e na mina. Cada trabalho desgasta a ferramenta; conserte-a na forja."}</p>
    <div className="panel-tool-list">
      {tools.map((id) => {
        const tool = state.frontier.tools[id];
        const definition = TOOL_DEFS[id];
        const repairable = tool.owned && tool.durability < 100;
        const canRepair = forge && repairable && state.inventory.ore >= 1 && state.inventory.wood >= 1 && state.gold >= 3;
        return <article key={id} className="panel-tool-card">
          <div className="panel-tool-heading"><ToolIcon id={id} /><div><strong>{definition.name}</strong><span>{tool.owned ? `${Math.round(tool.durability)}/100 durabilidade` : `${state.frontier.toolStock[id]} em estoque · ${definition.cost} ouro`}</span></div></div>
          <p>{definition.description}</p>
          {tool.owned ? <><div className="panel-condition-track" role="progressbar" aria-label={`Durabilidade de ${definition.name}`} aria-valuenow={Math.round(tool.durability)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${tool.durability}%` }} /></div>{tool.durability <= 0 ? <p className="panel-hint">Ferramenta quebrada. Faça um reparo antes de trabalhar.</p> : null}</> : null}
          {mode === "market" && !tool.owned ? <button className="panel-button panel-button-full" disabled={!trade || state.gold < definition.cost || state.frontier.toolStock[id] < 1} onClick={() => act(`buy-tool:${id}`)}><Coins size={15} /> Comprar {definition.name.toLowerCase()} · {definition.cost} ouro</button> : tool.owned && repairable ? <button className="panel-button panel-button-outline panel-button-full" disabled={!canRepair} onClick={() => act(`repair-tool:${id}`)}><Hammer size={15} /> Reparar {definition.name.toLowerCase()}</button> : null}
          {mode === "inventory" && !tool.owned ? <p className="panel-hint">À venda no mercado e na forja.</p> : tool.owned && repairable && !forge ? <p className="panel-hint">Aproxime-se da forja para reparar.</p> : tool.owned && repairable && !canRepair ? <p className="panel-hint">Reúna 1 minério, 1 madeira e 3 ouro.</p> : null}
        </article>;
      })}
    </div>
    {!tools.length ? <p className="panel-hint">Você ainda não possui ferramentas. Compre-as no mercado ou na forja.</p> : null}
  </section>;
}

const JOB_STATUS = { available: "Disponível", accepted: "Em andamento", complete: "Objetivo cumprido", claimed: "Concluído", resolved: "Atendido pelos moradores", failed: "Prazo encerrado" };
const LANDMARK_LABELS: Record<string, string> = { "wild-camp": "Acampamento dos viajantes", "wild-ruins": "Ruínas da Torre de Alvor", "wild-lake": "Lago do Espelho" };
export function FrontierJobs({ state }: { state: GameState }) {
  const atBoard = playing(state) && (nearObject(state, "sign") || nearObject(state, "market"));
  const atCamp = playing(state) && nearObject(state, "wild-camp");
  return <section className="panel-expansion-section">
    <div className="panel-section-heading"><h3>Caminhos além da vila</h3><Compass size={18} /></div>
    <p className="panel-prose">A exploração e o trabalho também deixam um legado. Aceite estas oportunidades no mural ou mercado; o reconhecimento das trilhas também pode começar no acampamento.</p>
    <div className="panel-order-list">{state.frontier.jobs.map((job) => {
      const inTime = state.day < job.deadline;
      const canAccept = (atBoard || (job.kind === "survey" && atCamp)) && inTime;
      const objectivesDone = job.kind === "survey" ? job.targets.every((id) => state.frontier.discovered.includes(id)) : !!job.item && state.inventory[job.item] >= job.quantity;
      const accepted = job.status === "accepted" || job.status === "complete";
      return <article className="panel-order-card" key={job.id}>
        <span className={`panel-status ${job.status === "claimed" || job.status === "complete" || job.status === "resolved" ? "panel-status-good" : ""}`}>{JOB_STATUS[job.status]}</span>
        <h3>{job.title}</h3><p>{job.description}</p>
        {job.kind === "survey" ? <ul className="panel-job-targets">{job.targets.map((id) => <li key={id}><span className={state.frontier.discovered.includes(id) ? "panel-target-discovered" : ""}>{state.frontier.discovered.includes(id) ? <Check size={15} /> : <Compass size={15} />}{LANDMARK_LABELS[id] || id}</span></li>)}</ul> : job.item ? <div className="panel-objective"><Package size={20} /><div><strong>{job.quantity} × {ITEMS[job.item].name}</strong><p>{state.inventory[job.item]} na mochila</p></div>{objectivesDone ? <Check size={19} /> : null}</div> : null}
        <div className="panel-order-reward"><Coins size={15} /> {job.reward} ouro · até o dia {job.deadline}</div>
        {job.status === "available" ? <button className="panel-button panel-button-full" disabled={!canAccept} onClick={() => act(`frontier-accept:${job.id}`)}>Aceitar oportunidade <ArrowRight size={15} /></button> : accepted ? <button className="panel-button panel-button-full" disabled={!(atBoard || (job.kind === "survey" && atCamp)) || !inTime || !objectivesDone} onClick={() => act(`frontier-claim:${job.id}`)}>{job.kind === "survey" ? "Registrar descobertas" : "Entregar suprimentos"}<ArrowRight size={15} /></button> : null}
        {accepted && inTime ? <p className="panel-hint">{job.kind === "survey" ? "Visite os locais e registre a caminhada no mural, mercado ou acampamento." : "Faça a entrega no mural ou mercado. Os materiais saem da mochila e abastecem a vila."} A recompensa está reservada no fundo da tarefa.</p> : job.status === "available" && !canAccept ? <p className="panel-hint">Procure o mural ou o mercado{job.kind === "survey" ? ", ou o acampamento nos Ermos" : ""} para aceitar.</p> : null}
      </article>;
    })}</div>
  </section>;
}

export function NpcNeeds({ state, npc, nearby }: { state: GameState; npc: Npc; nearby: boolean }) {
  const needs = state.life.needs[npc.id];
  if (!needs) return null;
  const labels = { work: "Cuidar do trabalho", eat: "Encontrar uma refeição", rest: "Descansar", socialize: "Encontrar companhia" };
  return <section className="panel-npc-needs">
    <div className="panel-section-heading"><h3>O dia de {npc.name}</h3><Users size={16} /></div>
    <p className="panel-prose">Agora deseja: <strong>{labels[needs.goal]}</strong>.</p>
    <div className="panel-needs-grid">{[["Fome", needs.hunger], ["Cansaço", needs.fatigue]].map(([name, value]) => <div key={name}><span>{name}<b>{Math.round(Number(value))}/100</b></span><div className="panel-progress"><i style={{ width: `${value}%` }} /></div></div>)}</div>
    <button className="panel-button panel-button-outline panel-button-full" disabled={!nearby || state.inventory.bread < 1 || needs.hunger <= 0} onClick={() => act(`feed-npc:${npc.id}`)}><Heart size={15} /> Compartilhar um pão</button>
    <p className="panel-hint">Um pão da sua mochila reduz 35 de fome e cria 5 de confiança. Encontre a pessoa para oferecer.</p>
  </section>;
}

export function FamilyEducation({ state, person, eligible }: { state: GameState; person: Person; eligible: boolean }) {
  const child = person.alive && person.age < 16 && person.parents.includes(state.apostle.id);
  const profile = state.life.education[person.id];
  const guardians = availableGuardians(state);
  const atHome = playing(state) && familyLocation(state);
  const isMinorApostle = person.id === state.apostle.id && person.age < 16;
  const preferred = state.family.find((member) => member.id === state.life.heirId);
  return <section className="panel-expansion-section">
    {child && profile ? <>
      <div className="panel-section-heading"><h3>Educação de {person.name}</h3><BookOpen size={17} /></div>
      <div className="panel-education-form">
        <label>Aprendizagem<select value={profile.focus} disabled={!atHome} onChange={(event) => act(`education:${person.id}:${event.target.value}`)}>{Object.entries(educationLabels).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label>Tutor<select value={profile.guardianId || ""} disabled={!atHome} onChange={(event) => act(`guardian:${person.id}:${event.target.value}`)}><option value="" disabled>Escolher uma pessoa adulta</option>{guardians.map((guardian) => <option key={guardian.id} value={guardian.id}>{guardian.name}</option>)}</select></label>
      </div>
      <div className="panel-summary"><span>Prática <b>{profile.practice.toFixed(1)}</b></span><span>Vínculo <b>{Math.round(profile.bond)}/100</b></span><span>{profile.lessons} aulas</span></div>
      <button className="panel-button panel-button-full" disabled={!atHome || state.apostle.age < 16 || state.inventory.bread < 1 || state.apostle.stamina < 8 || profile.lastLessonDay >= state.day} onClick={() => act(`teach:${person.id}`)}><BookOpen size={15} /> Ensinar {educationLabels[profile.focus as EducationFocus].toLowerCase()}</button>
      <p className="panel-hint">Uma aula por dia: 1 pão e 8 energia. A prática prepara habilidades que seu descendente poderá usar na sucessão. O tutor acompanha a aprendizagem com os dias.</p>
      {profile.lastLessonDay >= state.day ? <p className="panel-hint">A aula de hoje já foi registrada.</p> : null}
    </> : null}
    {isMinorApostle ? <><div className="panel-section-heading"><h3>Regência</h3><Shield size={17} /></div><label className="panel-guardian-label">Adulto responsável<select value={state.life.guardianId || ""} disabled={!atHome} onChange={(event) => act(`regent:${event.target.value}`)}><option value="" disabled>Escolher um regente</option>{guardians.map((guardian) => <option key={guardian.id} value={guardian.id}>{guardian.name}</option>)}</select></label><p className="panel-hint">A tutela acompanha seu apóstolo até os 16 anos. Crianças mantêm limitações de trabalho e combate.</p></> : null}
    {eligible && person.id !== state.apostle.id && playing(state) ? <><div className="panel-section-heading"><h3>Preparar a sucessão</h3><Shield size={17} /></div><button className="panel-button panel-button-outline panel-button-full" disabled={!atHome || state.life.heirId === person.id} onClick={() => act(`heir:${person.id}`)}><Users size={15} />{state.life.heirId === person.id ? `${person.name} é seu herdeiro preferido` : `Indicar ${person.name} como herdeiro`}</button></> : null}
    <p className="panel-hint">{preferred ? `Herdeiro preferido: ${preferred.name}. ` : ""}A sucessão continua restrita ao cônjuge ou aos filhos vivos. A indicação organiza o legado; a escolha acontece após a morte.</p>
    {(child || isMinorApostle || (eligible && person.id !== state.apostle.id)) && !atHome ? <p className="panel-hint">Visite sua moradia construída ou encontre seu cônjuge para organizar a família.</p> : null}
  </section>;
}

function historicalDate(day: number) {
  if (day < 1) return `${Math.max(1, Math.round((1 - day) / 360))} anos antes do início da jornada`;
  return `Dia ${(day - 1) % 30 + 1}, mês ${Math.floor(((day - 1) % 360) / 30) + 1}, ano ${Math.floor((day - 1) / 360) + 1}`;
}
export function FamilyHistory({ state, person }: { state: GameState; person: Person }) {
  const history = state.life.history.filter((event) => event.personId === person.id || event.relatedId === person.id);
  const death = history.find((event) => event.kind === "death" && event.personId === person.id);
  return <section className="panel-family-history">
    <dl className="panel-history-dates"><div><dt>Nascimento</dt><dd>{historicalDate(person.birthDay)}</dd></div>{death ? <div><dt>Falecimento</dt><dd>{historicalDate(death.day)}</dd></div> : null}</dl>
    {history.length ? <details><summary>Acontecimentos da família <span>{history.length}</span></summary><div className="panel-ledger">{[...history].reverse().map((event, index) => <article key={`${event.day}-${event.kind}-${index}`}><div><span>{historicalDate(event.day)}</span>{event.kind === "inheritance" ? <b>{event.gold} ouro{event.property ? " · propriedade" : ""}</b> : null}</div><p>{event.text}</p></article>)}</div></details> : null}
  </section>;
}

export function CampaignTransfer() {
  return <section className="panel-expansion-section panel-campaign-transfer">
    <div className="panel-section-heading"><h3>Leve sua história com você</h3><Download size={17} /></div>
    <p className="panel-prose">Exporte um arquivo da campanha para guardar uma cópia ou continuar em outro dispositivo. Importar substitui a campanha deste navegador após sua confirmação.</p>
    <div className="panel-actions"><button className="panel-button" onClick={() => document.dispatchEvent(new CustomEvent("kg-export-campaign"))}><Download size={15} /> Exportar campanha</button><button className="panel-button panel-button-outline" onClick={() => document.dispatchEvent(new CustomEvent("kg-import-campaign"))}><Upload size={15} /> Importar campanha</button></div>
  </section>;
}
