import AsyncStorage from "@react-native-async-storage/async-storage";

export type LocalUser = {
  user_id: number;
  username: string;
  email: string;
};

export async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJSON(key: string, value: unknown) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function removeKey(key: string) {
  await AsyncStorage.removeItem(key);
}

export async function getLocalUser(): Promise<LocalUser | null> {
  const user = await readJSON<LocalUser | null>("smartgo_user", null);
  return user && user.user_id ? user : null;
}
