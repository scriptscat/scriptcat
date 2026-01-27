import { getEventFlag } from "@Packages/message/common";

const MessageFlag = process.env.SC_RANDOM_KEY || "scriptcat-default-flag";

const EventFlag = getEventFlag(MessageFlag);

console.log("inject", { MessageFlag, EventFlag });
