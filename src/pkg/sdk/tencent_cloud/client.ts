import { unixTime } from '@App/pkg/utils/utils';
import axios from 'axios';
import { HmacSHA256, SHA256 } from 'crypto-js';

export interface ClientConfig {
	credential: {
		secretId: string,
		secretKey: string
	},
	region: string
	profile: {
		httpProfile: {
			reqMethod: 'POST'
			reqTimeout: number
		}
	}
}

export interface Api {
	url: string
	service: string
	version: string
}

export class Client {
	config: ClientConfig;
	api: Api

	constructor(config: ClientConfig, api: Api) {
		this.config = config;
		this.api = api;
	}

	protected request(action: string, req: AnyMap): Promise<AnyMap> {
		return new Promise(resolve => {

			const algorithm = 'TC3-HMAC-SHA256'
			const now = new Date();
			const date = this.getDate(now);
			const signedHeaders = 'content-type;host';

			const canonicalHeaders = 'content-type:application/json; charset=utf-8\n' + 'host:' + this.api.url + '\n';

			const payload = JSON.stringify(req);
			const hashedRequestPayload = SHA256(payload).toString();

			const canonicalRequest = this.config.profile.httpProfile.reqMethod + '\n'
				+ '/\n'
				+ '\n'
				+ canonicalHeaders + '\n'
				+ signedHeaders + '\n'
				+ hashedRequestPayload;

			const credentialScope = date + '/' + this.api.service + '/' + 'tc3_request';

			const secretDate = HmacSHA256(date, 'TC3' + this.config.credential.secretKey);
			const secretService = HmacSHA256(this.api.service, secretDate);
			const secretSigning = HmacSHA256('tc3_request', secretService);

			const hashedCanonicalRequest = SHA256(canonicalRequest).toString();
			const stringToSign = algorithm + '\n' + parseInt((now.getTime() / 1000).toString()).toString() + '\n' + credentialScope + '\n' + hashedCanonicalRequest;

			const signature = HmacSHA256(stringToSign, secretSigning).toString();

			const Authorization = algorithm + ' Credential=' + this.config.credential.secretId +
				'/' + credentialScope +
				', SignedHeaders=' + signedHeaders +
				', Signature=' + signature;
			const handler = async () => {
				const headers: AnyMap = {
					'X-TC-Action': action,
					'X-TC-Region': this.config.region,
					'X-TC-Timestamp': unixTime(),
					'X-TC-Version': this.api.version,
					'Authorization': Authorization,
					'Content-Type': 'application/json; charset=utf-8'
				};
				if (!this.config.region) {
					delete headers['X-TC-Region'];
				}
				const resp = await axios.post('https://' + this.api.url, payload, {
					headers: headers,
					responseType: 'json',
				});

				resolve(<AnyMap>resp.data);
			}
			void handler();
		});
	}

	protected getDate(date: Date) {
		const year = date.getUTCFullYear()
		const month = ('0' + (date.getUTCMonth() + 1).toString()).slice(-2)
		const day = ('0' + date.getUTCDate().toString()).slice(-2)
		return `${year}-${month}-${day}`
	}

}