import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const { parseChunk } = createRequire(import.meta.url)('../../electron/logParser.cjs') as {
  parseChunk: (text: string, opts?: { final?: boolean }) => { events: Record<string, unknown>[]; rest: string };
};

// Shapes copied from real logs, with ids replaced.
const QUEST = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const push = (type: number, suffix: string, time = '12:11:34.624') => `2026-10-30 ${time}|1.3.0.0.48484|Info|push-notifications|Got notification | ChatMessageReceived
{
  "type": "new_message",
  "message": {
    "type": ${type},
    "text": "quest started",
    "templateId": "${QUEST} ${suffix}",
    "hasRewards": false
  }
}
2026-10-30 ${time}|1.3.0.0.48484|Info|push-notifications|NotificationMessageProcessor.ProcessMessage | Received notification
`;

describe('log parser', () => {
  it('reads quest started, completed and failed messages', () => {
    const { events } = parseChunk(push(10, 'description') + push(12, 'successMessageText') + push(11, 'failMessageText'), { final: true });
    expect(events.map((e) => [e.kind, e.status, e.questId])).toEqual([
      ['quest', 'started', QUEST],
      ['quest', 'completed', QUEST],
      ['quest', 'failed', QUEST],
    ]);
    expect(events[0].time).toBe(new Date('2026-10-30T12:11:34.624').getTime());
  });

  it('reads the raid map, start and end', () => {
    const text = `2026-10-25 08:15:03.807|0.48146|Info|application|GamePrepared:14.9 real:18.97 diff:4.06
2026-10-25 08:15:04.332|0.48146|Debug|application|TRACE-NetworkGameCreate profileStatus: 'Profileid: x, Status: Busy, RaidMode: Online, Ip: 0.0.0.0, Port: 17001, Location: TarkovStreets, Sid: y, GameMode: deathmatch, shortId: Z'
2026-10-25 08:15:40.543|0.48146|Info|application|GameStarted:47.58(47.58) real:55.7(55.7) diff:8.11
2026-10-25 08:40:00.000|0.48146|Info|push-notifications|Got notification | UserMatchOver
{ "type": "userMatchOver" }
`;
    const { events } = parseChunk(text, { final: true });
    expect(events.map((e) => e.kind)).toEqual(['raid-map', 'raid-start', 'raid-end']);
    expect(events[0].nameId).toBe('TarkovStreets');
  });

  it('holds back the last entry until more text arrives', () => {
    const text = push(12, 'successMessageText');
    const firstHalf = text.slice(0, 120);
    const a = parseChunk(firstHalf);
    expect(a.events).toEqual([]);
    const b = parseChunk(a.rest + text.slice(120));
    expect(b.events.map((e) => e.status)).toEqual(['completed']);
  });
});
