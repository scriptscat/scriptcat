const JOURNAL_KEY = "scriptcat.mainTransportJournal";
const JOURNAL_VERSION = 1;

export type MainTransportJournalState = {
  version: typeof JOURNAL_VERSION;
  records: unknown[];
  activeFrameIndex: Array<[string, string]>;
  bindings: unknown[];
  bootstraps: unknown[];
  sessions: unknown[];
};

const emptyState = (): MainTransportJournalState => ({
  version: JOURNAL_VERSION,
  records: [],
  activeFrameIndex: [],
  bindings: [],
  bootstraps: [],
  sessions: [],
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isState = (value: unknown): value is MainTransportJournalState => {
  if (!isRecord(value) || value.version !== JOURNAL_VERSION) return false;
  return (
    Array.isArray(value.records) &&
    Array.isArray(value.activeFrameIndex) &&
    value.activeFrameIndex.every(
      (entry) =>
        Array.isArray(entry) && entry.length === 2 && typeof entry[0] === "string" && typeof entry[1] === "string"
    ) &&
    Array.isArray(value.bindings) &&
    Array.isArray(value.bootstraps) &&
    Array.isArray(value.sessions)
  );
};

/** The session journal reconstructs SW authority after a normal MV3 worker restart. */
export class MainTransportJournal {
  async hydrate(): Promise<MainTransportJournalState> {
    const stored = await chrome.storage.session.get(JOURNAL_KEY);
    return isState(stored[JOURNAL_KEY]) ? stored[JOURNAL_KEY] : emptyState();
  }

  async write(state: MainTransportJournalState): Promise<void> {
    if (!isState(state)) throw new Error("invalid MAIN transport journal state");
    await chrome.storage.session.set({ [JOURNAL_KEY]: state });
  }

  async remove(): Promise<void> {
    await chrome.storage.session.remove(JOURNAL_KEY);
  }
}
