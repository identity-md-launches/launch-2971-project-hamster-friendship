interface FriendshipItem {
  id: string; name: string; price: number; slot: string; color: string; description: string;
}
interface FriendshipEnvironment { id: number; name: string; boss: string; seconds: number; attack: string; types: string[]; atmosphere: string; floor: string; edge: string; accent: string; }
interface FriendshipRules {
  readonly maps: readonly FriendshipEnvironment[];
  environment(map: number): FriendshipEnvironment;
  growth(points: number): {tier: number; scale: number};
  readonly catalogue: readonly FriendshipItem[];
  readonly spawns: ReadonlyArray<[string, number, number]>;
  hp(map: number, boss?: boolean, size?: string): number;
  monster(roll: number, sizeRoll: number, map: number): FriendshipMonster;
  drop(roll: number): string | null;
  damage(kind: string, purchases: string[]): number;
  cooldown(kind: string): number;
  forageValue(source: string): number;
  costumeArt(id: string): Array<[number, number, number, number, string]>;
  validName(name: string): boolean;
}
interface FriendshipMonster { type: string; size: string; hp: number; }
interface FriendshipBadge { id: string; source: 'skill' | 'contribution'; tier: string; }
interface FriendshipAudio {
  unlock(): Promise<boolean>; play(on: boolean): void; sfx(kind: string): void;
  set(name: string, value: number | boolean): void;
  snapshot(): { available: boolean; unlocked: boolean; playing: boolean; storageOK: boolean; music: number; sfx: number; musicMuted: boolean; sfxMuted: boolean };
}
interface FriendshipProfile {
  name: string; sqk: number; total_score: number; highest_map: number; produce_points?: number;
  wallet?: string;
  badges?: FriendshipBadge[];
  purchases: string[]; cosmetics: Record<string, string | null>;
}
interface FriendshipSaveSnapshot {
  profile: FriendshipProfile; cloud: boolean; configured: boolean; status: string;
  backendState: string; backendError: string; backendCheckedAt: string;
  storageOK: boolean; pendingCoins: number; pendingEvents: number;
  runConflict: boolean; recoveryEvents: number;
  ranked: boolean; playingGuest: boolean; legacyAvailable: boolean; localLegacyAvailable: boolean; wallet: string;
}
interface FriendshipSave {
  ready: Promise<void>;
  checkConnection(): Promise<void>;
  beginMap(map: number): Promise<{loot: string[]; monsters: FriendshipMonster[]; rulesVersion: number; ranked: boolean; purchases: string[]}>;
  record(kind: string, data: Record<string, unknown>, frame: number): number | null;
  flush(): Promise<void>;
  setWallet(address: string): Promise<void>;
  signIn(provider: FriendshipProvider, address: string, keepLegacy?: boolean): Promise<unknown>;
  saveName(name: string): Promise<void>;
  purchase(id: string): Promise<void>;
  equip(slot: string, id: string | null): Promise<void>;
  leaderboard(): Promise<{updatedAt: string; rows: Array<{name: string; score: number; highest_map: number}>}>;
  subscribe(listener: () => void): void;
  retry(): Promise<void>;
  recover(): Promise<void>;
  legacyRecord(): Record<string, unknown>;
  recoveryRecord(): {wallet: string; runs: Array<Record<string, unknown>>};
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
  webkitAudioContext?: typeof AudioContext;
  HamsterAudio: FriendshipAudio;
  HAMSTER_CONFIG: {supabaseUrl: string; supabasePublishableKey: string};
  HamsterRules: FriendshipRules;
  HamsterSave: FriendshipSave;
  HamsterWallet: {snapshot(): {address: string; chainId: string; connected: boolean; pending: boolean}};
  __hamster: {pause(): void; resume(): void; restart(): Promise<void>; snapshot(): Record<string, unknown>};
  ethereum?: FriendshipProvider;
}

interface Navigator { readonly standalone?: boolean; }
interface ScreenOrientation { lock?(orientation: string): Promise<void>; }
