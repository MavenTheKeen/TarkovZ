// Parses Escape from Tarkov's own log files into app events. Only reads text
// the game writes to disk; nothing here touches the game process.
//
// Each log entry starts with a line like
//   2026-10-30 12:11:34.624|1.3.0.0.48484|Info|push-notifications|Got notification | ChatMessageReceived
// and may continue over several lines (notifications carry a JSON body).

const ENTRY_START = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}\.\d{3})\|/m;
const ENTRY_SPLIT = /^(?=\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\|)/m;

// Chat message types the game uses for quest status changes.
const QUEST_STATUS = { 10: 'started', 11: 'failed', 12: 'completed' };

/** Log timestamps are local time. */
function entryTime(entry) {
  const m = entry.match(ENTRY_START);
  return m ? new Date(`${m[1]}T${m[2]}`).getTime() : Date.now();
}

/** Turns one log entry into an event, or null if it isn't one we care about. */
function parseEntry(entry) {
  const time = entryTime(entry);

  if (entry.includes('Got notification | ChatMessageReceived')) {
    const json = entry.slice(entry.indexOf('{'));
    try {
      const message = JSON.parse(json).message;
      const status = QUEST_STATUS[message?.type];
      const questId = String(message?.templateId ?? '').match(/^[0-9a-f]{24}/)?.[0];
      if (status && questId) return { kind: 'quest', status, questId, time };
    } catch {
      // Not a complete JSON body; ignore it.
    }
    return null;
  }

  if (entry.includes('Got notification | UserMatchOver')) return { kind: 'raid-end', time };

  if (entry.includes('TRACE-NetworkGameCreate profileStatus')) {
    const location = entry.match(/Location: ([^,']+)/)?.[1]?.trim();
    if (location) return { kind: 'raid-map', nameId: location, time };
    return null;
  }

  if (/\|GameStarted:/.test(entry)) return { kind: 'raid-start', time };

  return null;
}

/**
 * Parses a chunk of log text. The last entry may still be being written, so
 * it's returned as `rest` to be prefixed to the next chunk.
 */
function parseChunk(text, { final = false } = {}) {
  const entries = text.split(ENTRY_SPLIT);
  const rest = final ? '' : entries.pop() ?? '';
  const events = [];
  for (const entry of entries) {
    const event = parseEntry(entry);
    if (event) events.push(event);
  }
  return { events, rest };
}

module.exports = { parseChunk, parseEntry };
