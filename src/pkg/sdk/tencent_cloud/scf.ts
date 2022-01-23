import { Client, ClientConfig } from './client';

export interface CreateFunctionRequest {
	FunctionName: string,
	Code: {
		// base64的zip文件
		ZipFile: string,
	},
}

export class ScfClient extends Client {

	constructor(client: ClientConfig) {
		let service = 'scf';
		if (client.region != '') {
			service += '.' + client.region;
		}
		super(client, service, '2018-04-16');
	}

	// 创建新的函数
	CreateFunction(req: CreateFunctionRequest) {
		return this.request('CreateFunction', req);
	}

}
