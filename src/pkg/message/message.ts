
export type MsgCallback = (msg: any) => void

export interface MsgClient {
	sendMessage(topic: string, msg: any): void;
}

export interface ConnectClient {
	connect(topic: string): void;
}

// export interface Connect

export interface EventClient {
	eventListener(topic: string, callback: MsgCallback): number;
	removeListener(id: number): void;
}

export interface MsgServer {
	listenerMessage(topic: string, callback: MsgCallback): number;
	removeListener(id: number): void;
}

export interface ConnectServer {
	onConnect(topic: string): ConnectEvent;
}

export interface ConnectEvent {
	addListener(callback: (connect: Connect) => void): number
	removeListener(id: number): number
}

export interface Connect {
	send(msg: any): void
}


export interface EventServer {
	listenerEvent(topic: string): void
}
