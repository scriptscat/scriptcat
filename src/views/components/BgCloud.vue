<template>
	<v-dialog transition="dialog-bottom-transition" max-width="600">
		<template v-slot:activator="{ on, attrs }">
			<v-icon small v-bind="attrs" v-on="on">{{ icons.mdiCloudUpload }} </v-icon>
		</template>
		<template v-slot:default="dialog">
			<v-snackbar v-model="snackbar" timeout="5000" multi-line :color="snackbarColor">
				{{ snackbarText }}
				<template v-slot:action="{ attrs }">
					<v-btn text v-bind="attrs" @click="snackbar = false"> 关闭 </v-btn>
				</template>
			</v-snackbar>
			<v-card>
				<v-toolbar color="primary" dark>
					<v-toolbar-title>上传至云端执行</v-toolbar-title>
					<v-spacer></v-spacer>
					<v-toolbar-items>
						<v-btn icon dark @click="dialog.value = false" right>
							<v-icon>{{ icons.mdiClose }}</v-icon>
						</v-btn>
					</v-toolbar-items>
				</v-toolbar>
				<div style="padding: 10px; box-sizing: border-box">
					<a href="https://docs.scriptcat.org/dev/cloudcat.html" target="_blank"
						>云端执行文档</a
					>
					<v-input :v-model="exportConfig.uuid" disabled> </v-input>
					<v-select
						label="上传至"
						v-model="exportDest"
						:items="dests"
						item-text="value"
						item-value="key"
						hint="将脚本上传至云端自动运行,如果选择本地将会导出成一个文件."
						persistent-hint
						return-object
						single-line
						@change="onChangeDest"
					></v-select>

					<div v-if="exportDest.key == EXPORT_TENCENT_CLOUD">
						<v-text-field
							v-if="exportConfig.param"
							v-model="exportConfig.param.functionName"
							label="FunctionName"
						>
						</v-text-field>
						<v-text-field
							v-if="exportConfig.param"
							v-model="exportConfig.param.secretId"
							label="SecretId"
						>
						</v-text-field>
						<v-text-field
							v-if="exportConfig.param"
							v-model="exportConfig.param.secretKey"
							type="password"
							label="SecretKey"
						>
						</v-text-field>
						<v-select
							v-if="exportConfig.param"
							label="地域选择"
							v-model="exportConfig.param.region"
							:items="exportConfig.param.regionList"
							item-text="value"
							item-value="key"
							hint="地域请查看 https://cloud.tencent.com/document/product/583/17237"
							persistent-hint
							return-object
							single-line
						></v-select>
					</div>

					<v-textarea
						v-model="exportConfig.exportValue"
						label="值导出表达式"
						rows="2"
						row-height="2"
						hide-details
					></v-textarea>
					<v-checkbox
						v-model="exportConfig.overwriteValue"
						label="导入时覆盖原值"
						color="success"
						hide-details
					></v-checkbox>
					<v-textarea
						v-model="exportConfig.exportCookie"
						label="Cookie导出表达式"
						rows="2"
						row-height="2"
						hide-details
					></v-textarea>
					<v-checkbox
						v-model="exportConfig.overwriteCookie"
						label="导入时覆盖原Cookie"
						color="success"
						hide-details
					></v-checkbox>
					<div v-if="exportConfig.dest == 'local'"></div>
					<div v-else-if="exportConfig.dest == 'remote'"></div>
				</div>
				<v-card-actions class="justify-end">
					<v-btn text color="error" @click="clear">清除配置</v-btn>
					<v-btn text color="success" @click="submit" :loading="submitLoading">{{
						exportDest.btnLabel || '提交'
					}}</v-btn>
				</v-card-actions>
			</v-card>
		</template>
	</v-dialog>
</template>

<script lang="ts">
import { Script } from '@App/model/do/script';
import { Component, Prop, Vue } from 'vue-property-decorator';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { ValueModel } from '@App/model/value';
import { ExportModel } from '@App/model/export';
import { Value } from '@App/model/do/value';
import { Export, EXPORT_DEST, EXPORT_DEST_LOCAL, EXPORT_TENCENT_CLOUD } from '@App/model/do/export';
import { v4 as uuidv4 } from 'uuid';
import { mdiCloudUpload, mdiClose } from '@mdi/js';
import { ExtVersion } from '@App/apps/config';
import packageTpl from '@App/template/cloudcat-package/package.tpl';
import utilsTpl from '@App/template/cloudcat-package/utils.tpl';
import indexTpl from '@App/template/cloudcat-package/index.tpl';
import { ClientConfig } from '@App/pkg/sdk/tencent_cloud/client';
import { ScfClient } from '@App/pkg/sdk/tencent_cloud/scf';
import { parseOnceCrontab } from '../pages/utils';

interface TencentCloud {
	functionName: string;
	secretId: string;
	secretKey: string;
	region: string;
	regionList: { key: string; value: string }[];
}

interface ExportConfig {
	[key: string]: any;
	key: string;
	value: string;
	param?: AnyMap;
}

@Component({})
export default class BgCloud extends Vue {
	EXPORT_TENCENT_CLOUD = EXPORT_TENCENT_CLOUD;

	icons = { mdiCloudUpload, mdiClose };

	snackbar = false;
	snackbarText = '';
	snackbarColor = 'red';

	@Prop()
	script!: Script;
	exportConfig: Export = {
		id: 0,
		uuid: '',
		scriptId: 0,
		dest: EXPORT_DEST_LOCAL,
		overwriteValue: false,
		overwriteCookie: false,
		exportCookie: '',
		exportValue: '',
	};

	exportDest: ExportConfig = {
		key: EXPORT_DEST_LOCAL,
		value: '本地',
	};

	exportModel = new ExportModel();
	valueModel = new ValueModel();

	dests: ExportConfig[] = [
		{ key: EXPORT_DEST_LOCAL, value: '本地', btnLabel: '导出' },
		{
			key: EXPORT_TENCENT_CLOUD,
			value: '腾讯云',
			param: <TencentCloud>{
				functionName: 'sc-' + this.script.uuid,
				secretId: '',
				secretKey: '',
				region: 'ap-shanghai',
				regionList: [
					{ value: '华东地区(上海)', key: 'ap-shanghai' },
					{ value: '华北地区(北京)', key: 'ap-beijing' },
					{ value: '西南地区(成都)', key: 'ap-chengdu' },
					{ value: '西南地区(重庆)', key: 'ap-chongqing' },
					{ value: '港澳台地区(中国香港)', key: 'ap-hongkong' },
					{ value: '亚太东南(新加坡)', key: 'ap-singapore' },
					{ value: '亚太东南(曼谷)', key: 'ap-bangkok' },
					{ value: '亚太南部(孟买)', key: 'ap-mumbai' },
					{ value: '亚太东北(首尔)', key: 'ap-seoul' },
					{ value: '亚太东北(东京)', key: 'ap-tokyo' },
					{ value: '美国东部(弗吉尼亚)', key: 'na-ashburn' },
					{ value: '美国西部(硅谷)', key: 'na-siliconvalley' },
					{ value: '北美地区(多伦多)', key: 'na-toronto' },
					{ value: '欧洲地区(法兰克福)', key: 'eu-frankfurt' },
					{ value: '欧洲地区(莫斯科)', key: 'eu-moscow' },
				],
			},
			btnLabel: '上传',
		},
		// { key: "remote", value: "云端" },
		// { key: "self", value: "自建服务器" },
	];

	mounted() {
		const exportDest = localStorage['export_' + this.script.id.toString()];
		if (exportDest) {
			for (let i = 0; i < this.dests.length; i++) {
				if (this.dests[i].key == exportDest) {
					this.exportDest = this.dests[i];
				}
			}
		}

		void this.onChangeDest();
	}

	async onChangeDest() {
		localStorage['export_' + this.script.id.toString()] = this.exportDest.key;
		let e = await this.exportModel.findOne({
			scriptId: this.script.id,
			dest: this.exportDest.key,
		});
		if (e) {
			this.exportConfig = e;
		} else {
			let exportCookie = '';
			this.script.metadata['exportcookie'] &&
				this.script.metadata['exportcookie'].forEach((val) => {
					exportCookie += val + '\n';
				});
			let exportValue = '';
			this.script.metadata['exportvalue'] &&
				this.script.metadata['exportvalue'].forEach((val) => {
					exportValue += val + '\n';
				});

			this.exportConfig = {
				id: 0,
				uuid: uuidv4(),
				scriptId: this.script.id,
				dest: <EXPORT_DEST>this.exportDest.key,
				param: this.exportDest.param,
				overwriteValue: false,
				overwriteCookie: false,
				exportCookie: exportCookie,
				exportValue: exportValue,
			};
			void this.exportModel.save(this.exportConfig);
		}
	}

	async clear() {
		let e = await this.exportModel.findOne({
			scriptId: this.script.id,
			dest: this.exportDest.key,
		});
		if (e) {
			await this.exportModel.delete(e.id);
		}
		void this.onChangeDest();
	}

	submitLoading = false;
	async submit() {
		this.submitLoading = true;
		this.exportConfig.dest = <EXPORT_DEST>this.exportDest.key;
		switch (this.exportDest.key) {
			case EXPORT_DEST_LOCAL:
				await this.local();
				break;
			case EXPORT_TENCENT_CLOUD:
				await this.tencent();
				break;
		}
		void this.exportModel.save(this.exportConfig);
		this.submitLoading = false;
	}

	tencent(): Promise<void> {
		return new Promise((resolve) => {
			let crontab = this.script.metadata['crontab'] && this.script.metadata['crontab'][0];
			if (!crontab) {
				this.message('未检测到@crontab声明暂时只支持定时脚本');
				return resolve();
			}

			const param = <TencentCloud>this.exportConfig.param;
			const clientConfig: ClientConfig = {
				credential: {
					secretId: param.secretId,
					secretKey: param.secretKey,
				},
				region: param.region,
				profile: {
					httpProfile: {
						reqMethod: 'POST',
						reqTimeout: 30,
					},
				},
			};
			const cli = new ScfClient(clientConfig);
			const handler = async () => {
				let zip = await this.pack();
				void zip.generateAsync({ type: 'base64' }).then(async (content) => {
					// 上传函数
					let resp = await cli.CreateFunction({
						FunctionName: param.functionName,
						Code: {
							ZipFile: content,
						},
						Handler: 'utils.run',
						Type: 'Event',
						Runtime: 'Nodejs16.13',
						Description:
							this.script.name +
							' ' +
							(this.script.metadata['description'] &&
								this.script.metadata['description'][0]),
						InstallDependency: 'TRUE',
					});
					if (resp.Response.Error) {
						this.message(
							'上传失败! ' +
								resp.Response.Error.Code +
								': ' +
								resp.Response.Error.Message
						);
						return resolve();
					}
					const handler = () => {
						setTimeout(() => {
							const getFunc = async () => {
								const resp = await cli.GetFunction({
									FunctionName: param.functionName,
								});
								if (resp.Response.Error) {
									this.message(
										'状态查询失败! ' +
											resp.Response.Error.Code +
											': ' +
											resp.Response.Error.Message
									);
									return resolve();
								}
								if (resp.Response.Status.indexOf('Failed') !== -1) {
									this.message('函数状态错误:' + resp.Response.Status);
									return resolve();
								}
								if (resp.Response.Status == 'Active') {
									// 创建触发器
									const resp = await cli.CreateTrigger({
										FunctionName: param.functionName,
										TriggerName: param.functionName,
										Type: 'timer',
										TriggerDesc: parseOnceCrontab(crontab) + ' *', // 腾讯云有7位,最后一位为年,参考: https://cloud.tencent.com/document/product/583/9708#cron-.E8.A1.A8.E8.BE.BE.E5.BC.8F
									});
									if (resp.Response.Error) {
										this.message(
											'触发器创建失败! ' +
												resp.Response.Error.Code +
												': ' +
												resp.Response.Error.Message
										);
										return resolve();
									}
									this.message('上传成功!请前往云函数控制台查看详情!', 'success');
									resolve();
								} else {
									handler();
								}
							};
							void getFunc();
						}, 2000);
					};
					handler();
				});
			};
			void handler();
		});
	}

	message(text: string, color = 'red') {
		this.snackbar = true;
		this.snackbarText = text;
		this.snackbarColor = color;
	}

	async local(): Promise<void> {
		return new Promise((resolve) => {
			const handler = async () => {
				let zip = await this.pack();
				void zip.generateAsync({ type: 'blob' }).then((content) => {
					saveAs(content, this.script.name + '.zip');
					resolve();
				});
			};
			void handler();
		});
	}

	pack(): Promise<JSZip> {
		return new Promise((resolve) => {
			const handler = async () => {
				let zip = new JSZip();
				zip.file('userScript.js', this.script.code);
				let lines = this.exportConfig.exportCookie.split('\n');
				let cookies: ExportCookies[] = [];
				for (let i = 0; i < lines.length; i++) {
					let val = lines[i];
					if (!val) {
						continue;
					}
					let detail: ExportCookies = {};
					val.split(';').forEach((param) => {
						let s = param.split('=');
						if (s.length != 2) {
							return;
						}
						(<AnyMap>detail)[s[0]] = s[1].trim();
					});
					if (!detail.url && !detail.domain) {
						continue;
					}
					detail.cookies = await this.getCookies(detail);
					cookies.push(detail);
				}
				cookies.length &&
					zip.file('cookies.js', 'exports.cookies = ' + JSON.stringify(cookies));

				lines = this.exportConfig.exportValue.split('\n');
				let values: Value[] = [];
				for (let i = 0; i < lines.length; i++) {
					let val = lines[0];
					let keys = val.split(',');
					for (let n = 0; n < keys.length; n++) {
						const key = keys[n];
						if (!key) {
							continue;
						}
						let value = await this.getValues(key);
						console.log(value);
						if (value) {
							values.push(value);
						}
					}
				}
				zip.file('values.js', 'exports.values = ' + JSON.stringify(values));
				zip.file(
					'config.js',
					'export default ' +
						JSON.stringify({
							version: ExtVersion,
							uuid: this.exportConfig.uuid,
							overwrite: {
								value: this.exportConfig.overwriteValue,
								cookie: this.exportConfig.overwriteCookie,
							},
						})
				);
				zip.file('package.json', <string>packageTpl);
				zip.file('utils.js', <string>utilsTpl);
				zip.file('index.js', <string>indexTpl);
				resolve(zip);
			};
			void handler();
		});
	}

	getCookies(detail: chrome.cookies.GetAllDetails): Promise<chrome.cookies.Cookie[]> {
		return new Promise((resolve) => {
			chrome.cookies.getAll(detail, (cookies) => {
				resolve(cookies);
			});
		});
	}

	getValues(key: string): Promise<Value | undefined> {
		return new Promise((resolve) => {
			const handler = async () => {
				let model: Value | undefined;
				if (this.script.metadata['storagename']) {
					model = await this.valueModel.findOne({
						storageName: this.script.metadata['storagename'][0],
						key: key,
					});
				} else {
					model = await this.valueModel.findOne({
						scriptId: this.script.id,
						key: key,
					});
				}
				if (model) {
					resolve(model);
				} else {
					resolve(undefined);
				}
			};
			void handler();
		});
	}
}
</script>
