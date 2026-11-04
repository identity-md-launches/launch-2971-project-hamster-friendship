interface FriendshipItem {
  id: string; name: string; price: number; slot: string; color: string; description: string;
}
interface FriendshipRules {
  readonly catalogue: readonly FriendshipItem[];
  readonly spawns: ReadonlyArray<[string, number, number]>;
  hp(map: number, boss?: boolean): number;
  drop(roll: number): string | null;
  damage(kind: string, purchases: string[]): number;
  cooldown(kind: string): number;
  validName(name: string): boolean;
}
interface FriendshipProfile {
  name: string; sqk: number; total_score: number; highest_map: number;
  purchases: string[]; cosmetics: Record<string, string | null>;
}
interface FriendshipSaveSnapshot {
  profile: FriendshipProfile; cloud: boolean; configured: boolean; status: string;
  storageOK: boolean; pendingCoins: number; pendingEvents: number;
  ranked: boolean; playingGuest: boolean;
}
interface FriendshipSave {
  ready: Promise<void>;
  beginMap(map: number): Promise<{loot: Array<string | null>; ranked: boolean; purchases: string[]}>;
  record(kind: string, data: Record<string, unknown>, frame: number): number | null;
  flush(): Promise<void>;
  saveName(name: string): Promise<void>;
  purchase(id: string): Promise<void>;
  equip(slot: string, id: string | null): Promise<void>;
  leaderboard(): Promise<Array<Pick<FriendshipProfile, 'name' | 'total_score' | 'highest_map'>>>;
  subscribe(listener: () => void): void;
  retry(): Promise<void>;
  snapshot(): FriendshipSaveSnapshot;
}
interface FriendshipProvider {
  request(args: {method: string; params?: unknown[]}): Promise<unknown>;
  on?(event: string, listener: (...args: any[]) => void): void;
  removeListener?(event: string, listener: (...args: any[]) => void): void;
  isMetaMask?: boolean;
  providers?: FriendshipProvider[];
}
declare var HamsterRules: FriendshipRules;
interface Window {
  HAMSTER_CONFIG: {supabaseUrl: string; supabasePublishableKey: string};
  HamsterRules: FriendshipRules;
  HamsterSave: FriendshipSave;
  HamsterWallet: {snapshot(): {address: string; chainId: string; connected: boolean; pending: boolean}};
  __hamster: {pause(): void; snapshot(): Record<string, unknown>};
  ethereum?: FriendshipProvider;
}
