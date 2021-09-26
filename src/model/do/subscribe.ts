
// model用到的do对象

export type Metadata = { [key: string]: string[] };

export type SUBSCRIBE_STATUS = 1 | 2 | 3 | 4;
export const SUBSCRIBE_STATUS_ENABLE: SUBSCRIBE_STATUS = 1;
export const SUBSCRIBE_STATUS_DISABLE: SUBSCRIBE_STATUS = 2;

export interface SubscribeScript {
	scriptId: number;
	url: string;
};

export interface Subscribe {
	id: number;
	url: string
	name: string;
	code: string;
	author: string;
	scripts: { [key: string]: SubscribeScript };
	metadata: Metadata;
	status: SUBSCRIBE_STATUS;
	error?: string;
	createtime?: number;
	updatetime?: number;
	checktime: number;
}
