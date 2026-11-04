// Party Mode (pass the phone): 2–6 players fly the same seeded Endless course; podium with ties.
import { PARTY } from '../../config';

export interface PartyPlayer {
  avatar: string;
  name: string;
  distance: number | null;
}

export interface PartyState {
  seed: number;
  players: PartyPlayer[];
  turn: number;
}

export function newParty(avatars: string[], seed: number): PartyState {
  const n = Math.max(PARTY.minPlayers, Math.min(PARTY.maxPlayers, avatars.length));
  const players = Array.from({ length: n }, (_, i) => ({
    avatar: avatars[i] ?? avatars[i % Math.max(1, avatars.length)] ?? 'bear',
    name: '',
    distance: null,
  }));
  return { seed, players, turn: 0 };
}

export function recordTurn(p: PartyState, distance: number): void {
  const pl = p.players[p.turn];
  if (!pl || pl.distance !== null) return;
  pl.distance = Math.max(0, Math.floor(distance));
  p.turn++;
}

export function partyOver(p: PartyState): boolean {
  return p.turn >= p.players.length;
}

export interface PodiumEntry {
  place: number;
  player: PartyPlayer;
  index: number;
}

/** Standard competition ranking (1, 1, 3 …): ties share a place. */
export function podium(p: PartyState): PodiumEntry[] {
  const list = p.players
    .map((player, index) => ({ player, index }))
    .sort((a, b) => (b.player.distance ?? 0) - (a.player.distance ?? 0) || a.index - b.index);
  const out: PodiumEntry[] = [];
  list.forEach((e, i) => {
    const prev = out[i - 1];
    const place =
      prev && (prev.player.distance ?? 0) === (e.player.distance ?? 0) ? prev.place : i + 1;
    out.push({ place, ...e });
  });
  return out;
}

/** Party turns are capped so the phone keeps moving around the room. */
export const PARTY_TURN_SEC = 75;
