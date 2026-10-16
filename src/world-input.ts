/** Input shared by the active renderer and the React mobile controls. */
export const worldInput = {
  x: 0,
  y: 0,
  attack: () => {},
  interact: () => {},
  dodge: () => {},
};

export function resetWorldInput(): void {
  worldInput.x = 0;
  worldInput.y = 0;
  worldInput.attack = () => {};
  worldInput.interact = () => {};
  worldInput.dodge = () => {};
}

export function blockedWorldInput(): boolean {
  if (typeof document === "undefined") return false;
  return document.body?.dataset.overlay === "true" ||
    !!document.activeElement?.matches('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
}

export function activeAutonomy(state: { day: number; minutes: number; simulation?: { autonomousUntil?: number } }): boolean {
  return (state.simulation?.autonomousUntil ?? 0) > (state.day - 1) * 1440 + state.minutes;
}
