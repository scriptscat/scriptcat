import MessageInternal from "./app/message/internal";

const message = new MessageInternal("content");

console.log(message);

message.send("pageLoad", null);
