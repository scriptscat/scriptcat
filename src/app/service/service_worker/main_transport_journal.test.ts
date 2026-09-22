import { describe, expect, it, beforeEach } from "vitest";
import { initTestEnv } from "@Tests/utils";
import { MainTransportJournal } from "./main_transport_journal";

initTestEnv();

describe("MainTransportJournal", () => {
  beforeEach(async () => {
    await chrome.storage.session.clear();
  });

  it("round-trips the session-scoped transport state", async () => {
    const journal = new MainTransportJournal();
    const state = {
      version: 1 as const,
      records: [{ transportToken: "transport-1" }],
      activeFrameIndex: [["41:0", "transport-1"]] as Array<[string, string]>,
      bindings: [{ handle: "handle-1" }],
      bootstraps: [{ key: "bootstrap-1" }],
      sessions: [{ key: "session-1" }],
    };

    await journal.write(state);

    expect(await journal.hydrate()).toEqual(state);
  });

  it("treats a missing or malformed journal as empty state", async () => {
    const journal = new MainTransportJournal();

    expect((await journal.hydrate()).records).toEqual([]);
    await chrome.storage.session.set({ "scriptcat.mainTransportJournal": { version: 99 } });
    expect(await journal.hydrate()).toEqual({
      version: 1,
      records: [],
      activeFrameIndex: [],
      bindings: [],
      bootstraps: [],
      sessions: [],
    });
  });
});
