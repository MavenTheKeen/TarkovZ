/// <reference types="vite/client" />

/** An event read from the game's log files. */
type GameLogEvent =
  | { kind: 'quest'; status: 'started' | 'completed' | 'failed'; questId: string; time: number }
  | { kind: 'raid-map'; nameId: string; time: number }
  | { kind: 'raid-start'; time: number }
  | { kind: 'raid-end'; time: number }
  | { kind: 'session'; session: string };

interface GameLogStatus {
  logsDir: string | null;
  session: string | null;
  watching: boolean;
}

interface DesktopBridge {
  cacheRead: (key: string) => Promise<unknown>;
  cacheWrite: (key: string, value: unknown) => Promise<void>;
  gameLog: {
    start: (dir?: string | null) => Promise<GameLogStatus>;
    stop: () => Promise<GameLogStatus>;
    status: () => Promise<GameLogStatus>;
    /** Every quest event in all past sessions, oldest first. */
    history: (dir?: string | null, since?: number) => Promise<Extract<GameLogEvent, { kind: 'quest' }>[]>;
    chooseFolder: () => Promise<string | null>;
    onEvent: (callback: (event: GameLogEvent) => void) => () => void;
  };
}

interface Window {
  // Present only when running inside the Electron shell.
  desktop?: DesktopBridge;
}
