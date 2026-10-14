import type { Creation, Dialog, GameState, Zone } from "./types";
import { GameStore, store } from "./simulation";

/** Serializable intentions form the boundary for a future server authority. */
export type GameCommand =
  | { type: "create"; creation: Creation }
  | { type: "move"; dx: number; dy: number; deltaSeconds: number }
  | { type: "tick"; deltaSeconds: number }
  | { type: "attack" | "dodge" }
  | { type: "interact"; id: string }
  | { type: "choose"; action: string }
  | { type: "act"; action: string }
  | { type: "zone"; zone: Zone };

export interface SimulationTransport {
  dispatch(command: GameCommand): Dialog | null;
  snapshot(): GameState;
  subscribe(listener: () => void): () => void;
  save(): Promise<void>;
  load(): Promise<boolean>;
}

/** Default single-player implementation; no connection or external account required. */
export class LocalTransport implements SimulationTransport {
  constructor(private readonly authority: GameStore = store) {}
  dispatch(command: GameCommand): Dialog | null {
    switch (command.type) {
      case "create":
        this.authority.create(command.creation);
        break;
      case "move":
        this.authority.move(command.dx, command.dy, command.deltaSeconds);
        break;
      case "tick":
        this.authority.tick(command.deltaSeconds);
        break;
      case "attack":
        this.authority.attack();
        break;
      case "dodge":
        this.authority.dodge();
        break;
      case "interact":
        return this.authority.interact(command.id);
      case "choose":
        return this.authority.choose(command.action);
      case "act":
        this.authority.act(command.action);
        break;
      case "zone":
        this.authority.setZone(command.zone);
        break;
    }
    return null;
  }
  snapshot(): GameState {
    return JSON.parse(JSON.stringify(this.authority.state)) as GameState;
  }
  subscribe(listener: () => void): () => void {
    return this.authority.subscribe(listener);
  }
  save(): Promise<void> {
    return this.authority.save();
  }
  load(): Promise<boolean> {
    return this.authority.load();
  }
}

export const transport: SimulationTransport = new LocalTransport();
