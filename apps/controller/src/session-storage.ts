const STORAGE_KEY = "morder:player-session:v1";

export interface StoredPlayerSession {
  roomCode: string;
  reconnectToken: string;
}

export const readStoredSession = (): StoredPlayerSession | null => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const value = JSON.parse(raw) as Partial<StoredPlayerSession>;
    if (
      typeof value.roomCode !== "string" ||
      typeof value.reconnectToken !== "string" ||
      value.reconnectToken.length < 20
    ) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      roomCode: value.roomCode,
      reconnectToken: value.reconnectToken,
    };
  } catch {
    return null;
  }
};

export const storeSession = (session: StoredPlayerSession) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // The live page session still works if storage is unavailable.
  }
};

export const clearStoredSession = () => {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing else is required when storage is unavailable.
  }
};
