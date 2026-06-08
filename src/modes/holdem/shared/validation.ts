/**
 * Authoritative input validation for client commands (ported from Feltline's
 * socket.io Zod schemas, re-homed onto the PartyKit message protocol). Every
 * inbound message is parsed here before reaching the engine; malformed or
 * unknown-key payloads are rejected.
 */
import { z } from 'zod';
import type { ClientCommand } from './types';

const customModes = ['holdem', 'omaha4', 'bomb_pot', 'show_one', 'straddle'] as const;

const settingsPatchSchema = z
  .object({
    roomName: z.string().max(64).optional(),
    smallBlind: z.number().finite().optional(),
    bigBlind: z.number().finite().optional(),
    ante: z.number().finite().optional(),
    buyIn: z.number().finite().optional(),
    startingStack: z.number().finite().optional(),
    minSeats: z.number().finite().optional(),
    maxSeats: z.number().finite().optional(),
    autoApproveChips: z.boolean().optional(),
    selfServiceChips: z.boolean().optional(),
    chipMode: z.enum(['strict', 'casual']).optional(),
    locked: z.boolean().optional(),
    spectatorsAllowed: z.boolean().optional(),
    straddle: z
      .object({
        enabled: z.boolean().optional(),
        amount: z.number().finite().optional(),
        mode: z.enum(['off', 'utg', 'button']).optional()
      })
      .strict()
      .optional(),
    custom: z
      .object({
        enabled: z.boolean().optional(),
        permission: z.enum(['creator_only', 'button', 'everyone_with_cooldown']).optional(),
        cooldownHands: z.number().finite().optional(),
        allowedModes: z.array(z.enum(customModes)).max(customModes.length).optional()
      })
      .strict()
      .optional(),
    sevenTwo: z
      .object({
        enabled: z.boolean().optional(),
        bounty: z.number().finite().optional(),
        suitedBonus: z.number().finite().optional()
      })
      .strict()
      .optional(),
    largeBetThresholdPct: z.number().finite().optional(),
    actionTimerSeconds: z.number().finite().optional()
  })
  .strict();

const reqId = z.string().max(80).optional();

const clientCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('join'), name: z.string().max(64), sessionToken: z.string().max(80).optional(), spectator: z.boolean().optional(), reqId }).strict(),
  z.object({ type: z.literal('updateSettings'), patch: settingsPatchSchema, reqId }).strict(),
  z.object({ type: z.literal('sit'), seat: z.number().int().min(0).max(9), reqId }).strict(),
  z.object({ type: z.literal('ready'), ready: z.boolean(), reqId }).strict(),
  z.object({ type: z.literal('startGame'), reqId }).strict(),
  z.object({ type: z.literal('act'), action: z.enum(['fold', 'check', 'call', 'bet', 'raise', 'all_in']), amount: z.number().finite().optional(), nonce: z.number().int().nonnegative(), reqId }).strict(),
  z.object({ type: z.literal('requestChips'), amount: z.number().finite(), reason: z.string().max(280).optional(), reqId }).strict(),
  z.object({ type: z.literal('approveChips'), playerId: z.string().max(80), amount: z.number().finite(), reason: z.string().max(280).optional(), reqId }).strict(),
  z.object({ type: z.literal('queueMode'), mode: z.enum(customModes), reqId }).strict(),
  z.object({ type: z.literal('hostAction'), action: z.enum(['kick', 'ban', 'mute', 'forceSitOut', 'transferHost', 'lock', 'spectators']), playerId: z.string().max(80).optional(), value: z.boolean().optional(), reqId }).strict(),
  z.object({ type: z.literal('chat'), message: z.string().max(1000), reqId }).strict(),
  z.object({ type: z.literal('addBot'), reqId }).strict(),
  z.object({ type: z.literal('removeBot'), playerId: z.string().max(80), reqId }).strict(),
  z.object({ type: z.literal('endSession'), reqId }).strict(),
  z.object({ type: z.literal('leave'), reqId }).strict()
]);

/** Parse + validate a raw inbound message into a typed ClientCommand, or null. */
export function parseCommand(raw: unknown): ClientCommand | null {
  const parsed = clientCommandSchema.safeParse(raw);
  return parsed.success ? (parsed.data as ClientCommand) : null;
}
