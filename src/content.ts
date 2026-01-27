import { negotiateEventFlag } from "@Packages/message/common";
import { randomMessageFlag } from "./pkg/utils/utils";

const MessageFlag = process.env.SC_RANDOM_KEY || "scriptcat-default-flag";

const EventFlag = randomMessageFlag();

negotiateEventFlag(MessageFlag, EventFlag);

