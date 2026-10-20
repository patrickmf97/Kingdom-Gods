import { Cloud, CloudFog, CloudLightning, CloudRain, Sun } from "lucide-react";
import type { GameState } from "./types";
import { weatherFor, weatherForecast } from "./weather";
import { interiorForZone } from "./interiors";

const WEATHER_ICONS = { clear: Sun, cloudy: Cloud, rain: CloudRain, storm: CloudLightning, fog: CloudFog };

export function StormWarning({ state }: { state: GameState }) {
  const warning = state.worldLife?.storm.warning;
  if (!warning || state.phase !== "playing" || !state.apostle.alive || warning.zone !== state.zone ||
    !["village", "wilderness", "highlands"].includes(state.zone)) return null;
  const seconds = Math.ceil(Math.max(0, warning.remaining));
  return <div className="storm-warning" role="status" aria-live="polite" aria-atomic="true">
    <CloudLightning size={20} aria-hidden="true" />
    <div><strong>Raio em {seconds} s</strong><span>Saia da área marcada ou procure abrigo</span></div>
  </div>;
}

export function WeatherChip({ state, season, onOpen }: {
  state: GameState;
  season: string;
  onOpen: () => void;
}) {
  const weather = weatherFor(state.day, state.minutes, state.zone);
  const Icon = WEATHER_ICONS[weather.kind];
  return <button className="weather-chip" onClick={onOpen}
    aria-label={`${weather.label}, ${weather.temperature} graus. ${weather.outdoors ? season : "Ao abrigo"}. Abrir previsão no diário.`}>
    <Icon size={16} aria-hidden="true" />
    <span>{weather.temperature}° · {weather.label}<span className="weather-chip-season"><i aria-hidden="true" />{weather.outdoors ? season : "Ao abrigo"}</span></span>
  </button>;
}

export function WeatherPanel({ state }: { state: GameState }) {
  const current = weatherFor(state.day, state.minutes, state.zone);
  const forecastZone = interiorForZone(state.zone)?.entrance.zone
    ?? (state.zone === "mine" ? "wilderness" : state.zone === "dungeon" ? "village" : state.zone);
  const exterior = weatherFor(state.day, state.minutes, forecastZone);
  const forecast = weatherForecast(state.day, forecastZone, 3);
  return <section className="panel-weather" aria-label="Previsão e condições de trabalho">
    <div className="panel-weather-heading">
      <div><span className="panel-overline">Prepare sua jornada</span><h3>Tempo & trabalho</h3></div>
      <span>{current.outdoors ? "Ao ar livre" : "Ao abrigo"}</span>
    </div>
    <ol className="panel-weather-days">
      {forecast.map((weather, index) => {
        const Icon = WEATHER_ICONS[weather.kind];
        return <li key={weather.day}>
          <span>{index === 0 ? "Hoje" : index === 1 ? "Amanhã" : "Depois"} · {weather.day}</span>
          <Icon size={23} aria-hidden="true" />
          <strong>{weather.label}</strong><span>{weather.temperature}°</span>
        </li>;
      })}
    </ol>
    <p className="panel-weather-current">{current.description}</p>
    {exterior.kind === "storm" && <p className="panel-weather-risk"><CloudLightning size={17} aria-hidden="true" /><span>Risco de raios ao ar livre. Afaste-se do círculo anunciado antes do impacto ou procure abrigo. Interiores, mina e cripta protegem você.</span></p>}
    <dl className="panel-weather-effects">
      <div><dt>Coleta neste local</dt><dd>{Math.round(current.gatheringRate * 100)}% do ritmo</dd></div>
      <div><dt>Reposição externa</dt><dd>{exterior.supplyPenalty > 0 ? `Capacidade −${exterior.supplyPenalty} por produto` : "Capacidade normal"}</dd></div>
      <div><dt>Oficinas internas</dt><dd>Trabalho normal</dd></div>
    </dl>
    <p className="panel-hint">Previsão para o exterior. Estoque, insumos e trabalhadores também limitam a reposição.</p>
  </section>;
}
