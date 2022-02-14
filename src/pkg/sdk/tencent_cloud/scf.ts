import { Client, ClientConfig, Response } from './client';

export interface CreateFunctionRequest {
	FunctionName: string,
	Code: {
		// base64的zip文件
		ZipFile: string,
	},
	Handler?: string
	Type?: 'Event'
	Runtime?: 'Python2.7' | 'Python3.6' | 'Nodejs10.15'|'Nodejs14.18' | 'Nodejs16.13' | 'Php5' | 'Php7' | 'Go1' | 'Java8' | 'CustomRuntime'
	Description?: string
	InstallDependency?: 'TRUE' | 'FALSE'
}

export interface CreateTriggerRequest {
	FunctionName: string,
	TriggerName?: string
	Type?: 'timer'
	TriggerDesc?: string
}

export interface GetFunctionRequest {
	FunctionName: string
}

export interface GetFunctionResponse extends Response {
	FunctionName: string
	Status: 'Creating' | 'CreateFailed' | 'Active' | 'Updating' | 'UpdateFailed' | 'Publishing' | 'PublishFailed' | 'Deleting' | 'DeleteFailed'
}

export class ScfClient extends Client {

	constructor(client: ClientConfig) {
		super(client, {
			url: 'scf.tencentcloudapi.com',
			service: 'scf',
			version: '2018-04-16',
		});
	}

	GetFunction(req: GetFunctionRequest) {
		return this.request<GetFunctionResponse>('GetFunction', req);
	}

	// 创建新的函数
	CreateFunction(req: CreateFunctionRequest) {
		return this.request('CreateFunction', req);
	}

	CreateTrigger(req: CreateTriggerRequest) {
		return this.request('CreateTrigger', req);
	}

}
