import { Client, ClientConfig } from './client';

export interface CreateFunctionRequest {
	FunctionName: string,
	Code: {
		// base64的zip文件
		ZipFile: string,
	},
	Handler?: string
	Type?: 'Event'
	Runtime?: 'Python2.7' | 'Python3.6' | 'Nodejs10.15' | 'Nodejs12.16' | ' Php5' | ' Php7' | 'Go1' | 'Java8' | 'CustomRuntime'
	Description?: string
}

export class ScfClient extends Client {

	constructor(client: ClientConfig) {
		let url = 'scf';
		if (client.region != '') {
			url += '.' + client.region;
		}
		url += '.tencentcloudapi.com';
		super(client, {
			url: url,
			service: 'scf',
			version: '2018-04-16',
		});
	}

	// 创建新的函数
	CreateFunction(req: CreateFunctionRequest) {
		return this.request('CreateFunction', req);
	}

}
