import { v4, v5 } from "uuid";
export const uuidv4 = typeof crypto.randomUUID === "function" ? () => crypto.randomUUID() : v4;
export const uuidv5 = v5;
