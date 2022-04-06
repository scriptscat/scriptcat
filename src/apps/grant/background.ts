import { PermissionModel } from '@App/model/permission';
import { base64ToBlob, isFirefox } from '@App/pkg/utils/utils';
import { App } from '../app';
import {
	AppEvent,
	ListenGmLog,
	PermissionConfirm,
	RequestBackgroundRandCode,
	ScriptGrant,
	ScriptValueChange,
	TabMenuClick,
	TabRemove,
} from '../msg-center/event';
import { MsgCenter } from '../msg-center/msg-center';
import { ScriptManager } from '../script/manager';
import {
	Grant,
	Api,
	IPostMessage,
	IGrantListener,
	ConfirmParam,
	PermissionParam,
	FreedCallback,
} from './interface';
import { v4 as uuidv4 } from 'uuid';
import { ValueModel } from '@App/model/value';
import { LOGGER_LEVEL, LOGGER_LEVEL_INFO } from '@App/model/do/logger';
import { Permission } from '@App/model/do/permission';
import { Script } from '@App/model/do/script';
import { Value } from '@App/model/do/value';
import { execMethod, getIcon } from './utils';

class postMessage implements IPostMessage {
	public port: chrome.runtime.Port;

	constructor(port: chrome.runtime.Port) {
		this.port = port;
	}

	public sender(): any {
		return this.port.sender;
	}

	public postMessage(msg: string): void {
		this.port.postMessage(msg);
	}
}

export class grantListener implements IGrantListener {
	public listen(callback: (msg: any, postMessage: IPostMessage) => Promise<any>): void {
		MsgCenter.listener(ScriptGrant, async (msg, port): Promise<any> => {
			return callback(msg, new postMessage(port));
		});
	}
}

export class BackgroundGrant {
	protected static apis = new Map<string, Api>();
	protected static freedCallback = new Map<string, FreedCallback>();
	protected static _singleInstance: BackgroundGrant;
	protected listener: IGrantListener;
	protected scriptMgr: ScriptManager;
	protected permissionModel: PermissionModel = new PermissionModel();
	protected valueModel = new ValueModel();
	protected rand = uuidv4();
	protected isdebug = false;

	private constructor(scriptMgr: ScriptManager, listener: IGrantListener, isdebug: boolean) {
		this.listener = listener;
		this.scriptMgr = scriptMgr;
		this.isdebug = isdebug;
		//处理xhrcookie的问题,firefox不支持
		if (this.isdebug) {
			// 从bg获取rand码
			MsgCenter.sendMessage(RequestBackgroundRandCode, undefined, (rand) => {
				this.rand = rand;
			});
			return;
		}
		MsgCenter.listenerMessage(RequestBackgroundRandCode, (data, send) => {
			send(this.rand);
		});
		try {
			const reqOpt = ['blocking', 'requestHeaders'];
			const respOpt = ['blocking', 'responseHeaders'];
			if (!isFirefox()) {
				reqOpt.push('extraHeaders');
				respOpt.push('extraHeaders');
			}
			const maxRedirects = new Map<string, [number, number]>();
			// 处理重定向请求
			chrome.webRequest.onBeforeSendHeaders.addListener(
				(details) => {
					if (!this.isExtensionRequest(details)) {
						return;
					}
					let setCookie = '';
					let cookie = '';
					let anonymous = false;
					let origin = '';
					let isScriptcat = false;
					const requestHeaders: chrome.webRequest.HttpHeader[] = [];
					const unsafeHeader: { [key: string]: string } = {};
					details.requestHeaders?.forEach((val) => {
						const lowerCase = val.name.toLowerCase();
						switch (lowerCase) {
							case 'x-cat-' + this.rand + '-max-redirects': {
								maxRedirects.set(details.requestId, [0, parseInt(val.value || '')]);
								break;
							}
							case 'x-cat-' + this.rand + '-cookie': {
								setCookie = val.value || '';
								break;
							}
							case 'x-cat-' + this.rand + '-anonymous': {
								anonymous = true;
								break;
							}
							case 'x-cat-' + this.rand + '-scriptcat': {
								isScriptcat = true;
								break;
							}
							case 'x-cat-' + this.rand + '-host':
							case 'x-cat-' + this.rand + '-user-agent':
							case 'x-cat-' + this.rand + '-referer':
							case 'x-cat-' + this.rand + '-origin':
							case 'x-cat-' + this.rand + '-accept-encoding':
							case 'x-cat-' + this.rand + '-connection': {
								unsafeHeader[lowerCase.substr(this.rand.length + 7)] =
									val.value || '';
								break;
							}
							case 'cookie': {
								cookie = val.value || '';
								break;
							}
							case 'origin': {
								origin = val.value || '';
								break;
							}
							case 'user-agent':
							case 'host':
							case 'referer':
							case 'accept-encoding':
							case 'connection': {
								unsafeHeader[lowerCase] =
									unsafeHeader[lowerCase] || val.value || '';
								break;
							}
							default: {
								requestHeaders.push(val);
							}
						}
					});
					// 不是脚本管理器,加上origin
					if (!isScriptcat && origin) {
						unsafeHeader['Origin'] = origin;
					}
					if (anonymous) {
						cookie = '';
					}
					if (setCookie) {
						if (!cookie || cookie.endsWith(';')) {
							cookie += setCookie;
						} else {
							cookie += ';' + setCookie;
						}
					}
					cookie &&
						requestHeaders.push({
							name: 'Cookie',
							value: cookie,
						});
					for (const name in unsafeHeader) {
						requestHeaders.push({
							name: name,
							value: unsafeHeader[name],
						});
					}
					return {
						requestHeaders: requestHeaders,
					};
				},
				{
					urls: ['<all_urls>'],
				},
				reqOpt
			);
			const responseHeader: { [key: string]: boolean } = { 'set-cookie': true };
			chrome.webRequest.onHeadersReceived.addListener(
				(details) => {
					if (this.isExtensionRequest(details)) {
						details.responseHeaders?.forEach((val) => {
							if (responseHeader[val.name]) {
								val.name = 'x-cat-' + this.rand + '-' + val.name;
							}
							if (val.name.toLowerCase() === 'location') {
								const nums = maxRedirects.get(details.requestId);
								if (nums) {
									nums[0]++;
									if (nums[0] > nums[1]) {
										val.name = 'x-cat-' + this.rand + '-' + val.name;
									}
								}
							}
						});
						return {
							responseHeaders: details.responseHeaders,
						};
					}
				},
				{
					urls: ['<all_urls>'],
				},
				respOpt
			);
			chrome.webRequest.onCompleted.addListener(
				(details) => {
					if (!this.isExtensionRequest(details)) {
						return;
					}
					maxRedirects.delete(details.requestId);
				},
				{ urls: ['<all_urls>'] }
			);
		} catch (e) {
			console.log(e);
		}
	}

	protected isExtensionRequest(
		details: chrome.webRequest.ResourceRequest & { originUrl?: string }
	): boolean {
		return (details.initiator && chrome.runtime.getURL('').startsWith(details.initiator)) ||
			(details.originUrl && details.originUrl.startsWith(chrome.runtime.getURL('')))
			? true
			: false;
	}

	// 单实例
	public static SingleInstance(
		scriptMgr: ScriptManager,
		listener: IGrantListener,
		isdebug: boolean
	): BackgroundGrant {
		if (!BackgroundGrant._singleInstance) {
			BackgroundGrant._singleInstance = new BackgroundGrant(scriptMgr, listener, isdebug);
		}
		return BackgroundGrant._singleInstance;
	}

	public static Instance(): BackgroundGrant {
		return BackgroundGrant._singleInstance;
	}

	// NOTE: 一大长串 尝试优化?
	public static GMFunction(permission: PermissionParam = {}) {
		return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
			const oldApi = <Api>descriptor.value;
			if (permission.listener) {
				permission.listener();
			}
			if (permission.freed) {
				BackgroundGrant.freedCallback.set(propertyName, permission.freed);
			}
			descriptor.value = function (grant: Grant, post: IPostMessage): Promise<any> {
				const _this: BackgroundGrant = <BackgroundGrant>this;
				return new Promise((resolve, reject) => {
					const handler = async () => {
						const script = <Script | undefined>await App.Cache.getOrSet(
							'script:grant:' + grant.id.toString(),
							() => {
								return _this.scriptMgr.getScriptSelfMeta(grant.id);
							}
						);
						if (!script) {
							return reject('permission denied');
						}
						App.Log.Debug('script', 'call function: ' + propertyName, script.name);
						const metaGrant = script.metadata['grant'] || [];
						// TODO: 使用map优化效率
						if (!permission.default) {
							let flag = false;
							for (let i = 0; i < metaGrant.length; i++) {
								if (
									metaGrant[i] == propertyName ||
									metaGrant[i].replace('.', '_') == propertyName
								) {
									flag = true;
									break;
								}
								if (permission.alias) {
									for (let n = 0; n < permission.alias.length; n++) {
										if (permission.alias[n] == metaGrant[i]) {
											flag = true;
											break;
										}
									}
								}
								if (flag) {
									break;
								}
							}
							if (!flag) {
								return reject('permission denied');
							}
						}

						grant.tabId = (<chrome.runtime.MessageSender>post.sender())?.tab?.id;
						// 判断是否只能后台环境调用
						if (permission.background) {
							if (grant.tabId) {
								return reject('background method');
							}
						}

						if (!_this.isdebug && permission.confirm) {
							let confirmParam;
							try {
								confirmParam = await permission.confirm(grant, script);
							} catch (e) {
								return reject(e);
							}
							if (typeof confirmParam == 'object') {
								const confirm = confirmParam;
								const cacheKey =
									'permission:' +
									script.id.toString() +
									':' +
									(confirm.permissionValue || '') +
									':' +
									(confirm.permission || '');
								let ret = <Permission>await App.Cache.getOrSet(cacheKey, () => {
									return new Promise((resolve) => {
										const handler = async () => {
											let ret = await _this.permissionModel.findOne({
												scriptId: script?.id,
												permission: confirm?.permission,
												permissionValue: confirm?.permissionValue,
											});
											if (!ret) {
												if (confirm?.wildcard) {
													ret = await _this.permissionModel.findOne({
														scriptId: script?.id,
														permission: confirm?.permission,
														permissionValue: '*',
													});
												}
											}
											return resolve(ret);
										};
										void handler();
									});
								});
								if (ret) {
									if (ret.allow) {
										return void execMethod(
											propertyName,
											script.name,
											resolve,
											reject,
											oldApi,
											this,
											grant,
											post,
											script
										);
									} else {
										return reject('permission not allowed');
									}
								}
								confirm.uuid = uuidv4();
								// 一个脚本只打开一个权限确定窗口,话说js中这个list是像是传递的指针,我后面直接操作list即可
								let list = <Array<ConfirmParam>>(
									await App.Cache.get(
										'confirm:window:' +
											confirm.permission +
											':list:' +
											script.id.toString()
									)
								);
								let open = false;
								if (list) {
									list.push(confirm);
								} else {
									open = true;
									list = [confirm];
									void App.Cache.set(
										'confirm:window:' +
											confirm.permission +
											':list:' +
											script.id.toString(),
										list
									);
									// 超时清理数据
									setTimeout(() => {
										void App.Cache.del('confirm:info:' + confirm.uuid);
										MsgCenter.removeListenerAll(
											PermissionConfirm + confirm.uuid
										);
										next();
									}, 300000);
								}
								// 处理下一个
								const next = () => {
									// 一个打开确定,一群不打开只监听消息
									const item = list.pop();
									if (item) {
										void App.Cache.set('confirm:info:' + item.uuid, [
											item,
											list.length,
										]);
										void chrome.tabs.create({
											url: chrome.runtime.getURL(
												'confirm.html?uuid=' + item.uuid
											),
										});
									} else {
										void App.Cache.del(
											'confirm:window:' +
												confirm.permission +
												':list:' +
												script.id.toString()
										);
									}
								};
								const listener = async (param: IPermissionConfirm) => {
									void App.Cache.del('confirm:info:' + confirm.uuid);
									MsgCenter.removeListenerAll(PermissionConfirm + confirm.uuid);
									ret = {
										id: 0,
										scriptId: script.id,
										permission: confirm.permission || '',
										permissionValue: '',
										allow: param.allow,
										createtime: new Date().getTime(),
										updatetime: 0,
									};
									switch (param.type) {
										case 4:
										case 2: {
											ret.permissionValue = '*';
											break;
										}
										case 5:
										case 3: {
											ret.permissionValue = confirm.permissionValue || '';
											next();
											break;
										}
										default:
											next();
											break;
									}
									//临时 放入缓存
									if (param.type >= 2) {
										void App.Cache.set(cacheKey, ret);
									}
									//总是 放入数据库
									if (param.type >= 4) {
										const oldConfirm = await _this.permissionModel.findOne({
											scriptId: script.id,
											permission: ret.permission,
											permissionValue: ret.permissionValue,
										});
										if (!oldConfirm) {
											void _this.permissionModel.save(ret);
										}
									}
									if (ret.permissionValue == '*') {
										// 如果是通配,处理掉全部list
										let item: ConfirmParam | undefined;
										while ((item = list?.pop())) {
											MsgCenter.trigger(PermissionConfirm + item.uuid, param);
										}
									}
									if (param.allow) {
										return void execMethod(
											propertyName,
											script.name,
											resolve,
											reject,
											oldApi,
											this,
											grant,
											post,
											script
										);
									}
									return reject('permission not allowed');
								};
								MsgCenter.listener(PermissionConfirm + confirm.uuid, listener);
								open && next();
							} else if (confirmParam === true) {
								return void execMethod(
									propertyName,
									script.name,
									resolve,
									reject,
									oldApi,
									this,
									grant,
									post,
									script
								);
							} else {
								return reject('permission not allowed');
							}
						} else {
							return void execMethod(
								propertyName,
								script.name,
								resolve,
								reject,
								oldApi,
								this,
								grant,
								post,
								script
							);
						}
					};
					void handler();
				});
			};
			BackgroundGrant.apis.set(propertyName, <Api>descriptor.value);
		};
	}

	public listenScriptGrant() {
		chrome.tabs.onRemoved.addListener((tabId) => {
			BackgroundGrant.freedCallback.forEach((v) => {
				v(0, tabId, true);
			});
		});
		chrome.tabs.onUpdated.addListener((tabId, info) => {
			if (info.status == 'loading' && !info.url) {
				BackgroundGrant.freedCallback.forEach((v) => {
					v(0, tabId, false);
				});
			}
		});
		this.listener.listen((msg, postMessage) => {
			return new Promise((resolve) => {
				const grant = <Grant>msg;
				if (!grant.value) {
					return;
				}
				const api = BackgroundGrant.apis.get(grant.value);
				if (api == undefined) {
					return resolve(undefined);
				}
				const ret = api.apply(this, [grant, postMessage]);
				if (ret instanceof Promise) {
					ret.then((result: any) => {
						if (
							grant.value == 'CAT_runComplete' ||
							(grant.value == 'CAT_setRunError' && grant.params[0])
						) {
							//后台脚本执行完毕,释放资源
							BackgroundGrant.freedCallback.forEach((v) => {
								v(grant.id, grant.tabId);
							});
						}
						resolve(result);
					}).catch((e: string) => {
						grant.error = 'GM_ERROR';
						grant.errorMsg = e;
						resolve(grant);
					});
				}
			});
		});
	}

	protected dealXhr(config: GMSend.XHRDetails, xhr: XMLHttpRequest): GM_Types.XHRResponse {
		const removeXCat = new RegExp('x-cat-' + this.rand + '-', 'g');
		const respond: GM_Types.XHRResponse = {
			finalUrl: xhr.responseURL || config.url,
			readyState: <any>xhr.readyState,
			status: xhr.status,
			statusText: xhr.statusText,
			responseHeaders: xhr.getAllResponseHeaders().replace(removeXCat, ''),
			responseType: config.responseType,
		};
		if (xhr.readyState === 4) {
			if (config.responseType == 'arraybuffer' || config.responseType == 'blob') {
				if (xhr.response instanceof ArrayBuffer) {
					respond.response = URL.createObjectURL(new Blob([xhr.response]));
				} else {
					respond.response = URL.createObjectURL(<Blob>xhr.response);
				}
				setTimeout(() => {
					URL.revokeObjectURL(<string>respond.response);
				}, 60e3);
			} else if (config.responseType == 'json') {
				try {
					respond.response = JSON.parse(xhr.responseText);
				} catch (e) {}
			} else {
				try {
					respond.response = xhr.response;
				} catch (e) {}
			}
			try {
				respond.responseText = xhr.responseText;
			} catch (e) {}
		}
		return respond;
	}

	request = new Map<number, XMLHttpRequest>();
	requestId = 0;

	@BackgroundGrant.GMFunction({
		alias: ['GM_xmlhttpRequest'],
	})
	protected CAT_abortXhr(grant: Grant): Promise<void> {
		return new Promise((resolve) => {
			const id = <number>grant.params[0];
			const xhr = this.request.get(id);
			if (xhr) {
				xhr.abort();
				this.request.delete(id);
			}
			resolve();
		});
	}

	//TODO:按照tampermonkey文档实现
	@BackgroundGrant.GMFunction({
		confirm: (grant: Grant, script: Script) => {
			return new Promise((resolve) => {
				const config = <GM_Types.XHRDetails>grant.params[0];
				const url = new URL(config.url);
				if (script.metadata['connect']) {
					const connect = script.metadata['connect'];
					for (let i = 0; i < connect.length; i++) {
						if (url.hostname.endsWith(connect[i])) {
							return resolve(true);
						}
					}
				}
				const ret: ConfirmParam = {
					permission: 'cors',
					permissionValue: url.hostname,
					title: '脚本正在试图访问跨域资源',
					metadata: {
						脚本名称: script.name,
						请求域名: url.hostname,
						请求地址: config.url,
					},
					describe: '请您确认是否允许脚本进行此操作,脚本也可增加@connect标签跳过此选项',
					wildcard: true,
					permissionContent: '域名',
					uuid: '',
				};
				resolve(ret);
			});
		},
		alias: ['GM.xmlHttpRequest'],
	})
	protected GM_xmlhttpRequest(grant: Grant, post: IPostMessage): Promise<any> {
		return new Promise((resolve, reject) => {
			if (grant.params.length <= 0) {
				//错误
				return reject('param is null');
			}
			const config = <GMSend.XHRDetails>grant.params[0];

			const xhr = new XMLHttpRequest();

			this.request.set(++this.requestId, xhr);
			grant.data = { type: 'requestId', data: this.requestId };
			post.postMessage(grant);

			xhr.open(
				config.method || 'GET',
				config.url,
				true,
				config.user || '',
				config.password || ''
			);
			config.overrideMimeType && xhr.overrideMimeType(config.overrideMimeType);
			if (config.responseType != 'json') {
				xhr.responseType = config.responseType || '';
			}

			const deal = (event: string, data?: AnyMap) => {
				const respond: AnyMap = this.dealXhr(config, xhr);
				if (data) {
					for (const key in data) {
						respond[key] = data[key];
					}
				}
				grant.data = { type: event, data: respond };
				try {
					post.postMessage(grant);
				} catch (e) {
					xhr.abort();
				}
			};
			xhr.onload = () => {
				deal('onload');
			};
			xhr.onloadstart = () => {
				deal('onloadstart');
			};
			xhr.onloadend = () => {
				deal('onloadstart');
			};
			xhr.onabort = () => {
				deal('onabort');
			};
			xhr.onerror = () => {
				deal('onerror');
			};
			xhr.onprogress = (event) => {
				const respond: GM_Types.XHRProgress = {
					done: xhr.DONE,
					lengthComputable: event.lengthComputable,
					loaded: event.loaded,
					total: event.total,
					totalSize: event.total,
				};
				deal('onprogress', respond);
			};
			xhr.onreadystatechange = () => {
				deal('onreadystatechange');
			};
			xhr.ontimeout = () => {
				grant.data = { type: 'ontimeout', data: '' };
				post.postMessage(grant);
			};

			this.dealUnsafeHeader(config, xhr, config.headers);

			if (config.timeout) {
				xhr.timeout = config.timeout;
			}

			if (config.overrideMimeType) {
				xhr.overrideMimeType(config.overrideMimeType);
			}
			if (config.dataType == 'FormData') {
				const data = new FormData();
				if (config.data && config.data instanceof Array) {
					config.data.forEach((val: GMSend.XHRFormData) => {
						if (val.type == 'file') {
							data.append(val.key, base64ToBlob(val.val), val.filename);
						} else {
							data.append(val.key, val.val);
						}
					});
					xhr.send(data);
				}
			} else if (config.dataType == 'Blob') {
				const handler = async () => {
					if (!config.data) {
						return reject('data is null');
					}
					const resp = await (await fetch(<string>config.data)).blob();
					xhr.send(resp);
				};
				void handler();
			} else {
				xhr.send(<string>config.data);
			}
			return resolve(undefined);
		});
	}

	// CAT_fetchBlob与CAT_createBlobUrl 沙盒中才有效,前端的在src/content.ts中处理
	@BackgroundGrant.GMFunction({
		default: true,
	})
	protected CAT_fetchBlob(grant: Grant): Promise<any> {
		return new Promise((resolve) => {
			const handler = async () => {
				const resp = await (await fetch(<string>grant.params[0])).blob();
				resolve(resp);
			};
			void handler();
		});
	}

	@BackgroundGrant.GMFunction({
		default: true,
	})
	protected CAT_createBlobUrl(grant: Grant): Promise<any> {
		return new Promise((resolve) => {
			resolve(URL.createObjectURL(<Blob>grant.params[0]));
		});
	}

	@BackgroundGrant.GMFunction({
		confirm: (grant: Grant, script: Script) => {
			return new Promise((resolve, reject) => {
				if (grant.params[0] == 'store') {
					resolve(true);
				}
				const detail = <GM_Types.CookieDetails>grant.params[1];
				if (!detail.url && !detail.domain) {
					return reject('there must be one of url or domain');
				}
				let url: URL = <URL>{};
				if (detail.url) {
					url = new URL(detail.url);
				} else {
					url.host = detail.domain || '';
					url.hostname = detail.domain || '';
				}
				let flag = false;
				if (script.metadata['connect']) {
					const connect = script.metadata['connect'];
					for (let i = 0; i < connect.length; i++) {
						if (url.hostname.endsWith(connect[i])) {
							flag = true;
							break;
						}
					}
				}
				if (!flag) {
					return reject('hostname must be in the definition of connect');
				}
				const ret: ConfirmParam = {
					permission: 'cookie',
					permissionValue: url.host,
					title: '脚本正在试图访问网站cookie内容',
					metadata: {
						脚本名称: script.name,
						请求域名: url.host,
					},
					describe:
						'请您确认是否允许脚本进行此操作,cookie是一项重要的用户数据,请务必只给信任的脚本授权.',
					permissionContent: 'Cookie域',
					uuid: '',
				};
				resolve(ret);
			});
		},
	})
	protected GM_cookie(grant: Grant): Promise<any> {
		return new Promise((resolve, reject) => {
			const param = grant.params;
			if (param.length != 2) {
				return reject('there must be two parameters');
			}
			const detail = <GM_Types.CookieDetails>grant.params[1];
			if (param[0] == 'store') {
				chrome.cookies.getAllCookieStores((res) => {
					const data: any[] = [];
					res.forEach((val) => {
						if (detail.tabId) {
							for (let n = 0; n < val.tabIds.length; n++) {
								if (val.tabIds[n] == detail.tabId) {
									data.push({ storeId: val.id });
									break;
								}
							}
						} else {
							data.push({ storeId: val.id });
						}
					});
					resolve({ type: 'done', data: data });
				});
				return;
			}
			// url或者域名不能为空
			if (detail.url) {
				detail.url = detail.url.trim();
			}
			if (detail.domain) {
				detail.domain = detail.domain.trim();
			}
			if (!detail.url && !detail.domain) {
				return reject('there must be one of url or domain');
			}
			switch (param[0]) {
				case 'list': {
					chrome.cookies.getAll(
						{
							domain: detail.domain,
							name: detail.name,
							path: detail.path,
							secure: detail.secure,
							session: detail.session,
							url: detail.url,
							storeId: detail.storeId,
						},
						(cookies) => {
							resolve({ type: 'done', data: cookies });
						}
					);
					break;
				}
				case 'delete': {
					if (!detail.url || !detail.name) {
						return reject('delete operation must have url and name');
					}
					chrome.cookies.remove(
						{
							name: detail.name,
							url: detail.url,
							storeId: detail.storeId,
						},
						() => {
							resolve({ type: 'done', data: [] });
						}
					);
					break;
				}
				case 'set': {
					if (!detail.url || !detail.name) {
						return reject(
							'set operation must have url or domain, and the name must exist'
						);
					}
					chrome.cookies.set(
						{
							url: detail.url,
							name: detail.name,
							domain: detail.domain,
							value: detail.value,
							expirationDate: detail.expirationDate,
							path: detail.path,
							httpOnly: detail.httpOnly,
							secure: detail.secure,
							storeId: detail.storeId,
						},
						() => {
							resolve({ type: 'done', data: [] });
						}
					);
					break;
				}
				default: {
					return reject('action can only be: get, set, delete, store');
				}
			}
		});
	}

	protected static tabMap = new Map<number, Array<any>>();

	@BackgroundGrant.GMFunction({
		listener: () => {
			chrome.tabs.onRemoved.addListener((tabId) => {
				const tab = <[Grant, IPostMessage]>BackgroundGrant.tabMap.get(tabId);
				if (tab) {
					tab[0].data = { type: 'close' };
					tab[1].postMessage(tab[0]);
					BackgroundGrant.tabMap.delete(tabId);
				}
			});
		},
		alias: ['GM_closeInTab'],
	})
	protected GM_openInTab(grant: Grant, post: IPostMessage): Promise<any> {
		return new Promise((resolve) => {
			const param: GM_Types.OpenTabOptions = grant.params[1] || {};
			chrome.tabs.create(
				{
					url: grant.params[0],
					active: param.active || false,
				},
				(tab) => {
					resolve({ type: 'tabid', tabId: tab.id });
					BackgroundGrant.tabMap.set(<number>tab.id, [grant, post]);
				}
			);
		});
	}

	// 隐藏函数
	@BackgroundGrant.GMFunction({ default: true })
	protected GM_closeInTab(grant: Grant): Promise<any> {
		return new Promise((resolve) => {
			void chrome.tabs.remove(<number>grant.params[0]);
			resolve(undefined);
		});
	}

	@BackgroundGrant.GMFunction({
		listener: () => {
			chrome.notifications.onClosed.addListener((id, user) => {
				const handler = async () => {
					const ret = await App.Cache.get('GM_notification:' + id);
					if (ret) {
						const [grant, post] = <[Grant, IPostMessage]>ret;
						grant.data = { type: 'done', id: id, user: user };
						post.postMessage(grant);
						void App.Cache.del('GM_notification:' + id);
					}
				};
				void handler();
			});
			chrome.notifications.onClicked.addListener((id) => {
				const handler = async () => {
					const ret = await App.Cache.get('GM_notification:' + id);
					if (ret) {
						const [grant, post] = <[Grant, IPostMessage]>ret;
						grant.data = { type: 'click', id: id, index: undefined };
						post.postMessage(grant);
						grant.data = { type: 'done', id: id, user: true };
						post.postMessage(grant);
						void App.Cache.del('GM_notification:' + id);
					}
				};
				void handler();
			});
			chrome.notifications.onButtonClicked.addListener((id, buttonIndex) => {
				const handler = async () => {
					const ret = await App.Cache.get('GM_notification:' + id);
					if (ret) {
						const [grant, post] = <[Grant, IPostMessage]>ret;
						grant.data = { type: 'click', id: id, index: buttonIndex };
						post.postMessage(grant);
						grant.data = { type: 'done', id: id, user: true };
						post.postMessage(grant);
						void App.Cache.del('GM_notification:' + id);
					}
				};
				void handler();
			});
		},
	})
	protected GM_notification(grant: Grant, post: IPostMessage, script: Script): Promise<any> {
		return new Promise((resolve, reject) => {
			const params = grant.params;
			if (params.length == 0) {
				return reject('param is null');
			}
			const details: GM_Types.NotificationDetails = params[0];
			const options: chrome.notifications.NotificationOptions<true> = {
				title: details.title || 'ScriptCat',
				message: details.text || '无消息内容',
				iconUrl:
					details.image || getIcon(script) || chrome.runtime.getURL('assets/logo.png'),
				type: isFirefox() || details.progress === undefined ? 'basic' : 'progress',
			};
			if (!isFirefox()) {
				options.silent = details.silent;
				options.buttons = details.buttons;
			}

			chrome.notifications.create(options, (notificationId) => {
				void App.Cache.set('GM_notification:' + notificationId, [grant, post]);
				grant.data = { type: 'create', id: notificationId };
				post.postMessage(grant);
				if (details.timeout) {
					setTimeout(() => {
						chrome.notifications.clear(notificationId);
						grant.data = { type: 'done', id: notificationId, user: false };
						post.postMessage(grant);
						void App.Cache.del('GM_notification:' + notificationId);
					}, details.timeout);
				}
			});
			return resolve(undefined);
		});
	}

	@BackgroundGrant.GMFunction()
	protected GM_closeNotification(grant: Grant): Promise<any> {
		return new Promise((resolve) => {
			chrome.notifications.clear(<string>grant.params[0]);
			void App.Cache.get('GM_notification:' + <string>grant.params[0]).then((ret) => {
				if (ret) {
					const [grant, post] = <[Grant, IPostMessage]>ret;
					grant.data = { type: 'done', id: grant.params[0], user: false };
					post.postMessage(grant);
					void App.Cache.del('GM_notification:' + <string>grant.params[0]);
				}
				return resolve(undefined);
			});
		});
	}

	@BackgroundGrant.GMFunction()
	protected GM_updateNotification(grant: Grant): Promise<any> {
		return new Promise((resolve, reject) => {
			if (isFirefox()) {
				return reject('firefox does not support this method');
			}
			const id = grant.params[0];
			const details: GM_Types.NotificationDetails = grant.params[1];
			const options: chrome.notifications.NotificationOptions = {
				title: details.title,
				message: details.text,
				iconUrl: details.image,
				type: details.progress === undefined ? 'basic' : 'progress',
				silent: details.silent,
				progress: details.progress,
			};
			chrome.notifications.update(<string>id, options);
			return resolve(undefined);
		});
	}

	@BackgroundGrant.GMFunction({ default: true, background: true })
	protected CAT_setLastRuntime(grant: Grant): Promise<any> {
		return new Promise((resolve) => {
			void this.scriptMgr.setLastRuntime(grant.id, <number>grant.params[0]);
			return resolve(undefined);
		});
	}

	@BackgroundGrant.GMFunction({ default: true, background: true })
	protected CAT_setRunError(grant: Grant): Promise<any> {
		return new Promise((resolve) => {
			void this.scriptMgr.setRunError(
				grant.id,
				<string>grant.params[0],
				<number>grant.params[1]
			);
			return resolve(undefined);
		});
	}

	@BackgroundGrant.GMFunction({ default: true, background: true })
	protected CAT_runComplete(grant: Grant): Promise<any> {
		return new Promise((resolve) => {
			void this.scriptMgr.setRunComplete(grant.id);
			return resolve(undefined);
		});
	}

	@BackgroundGrant.GMFunction({ default: true })
	protected GM_log(grant: Grant): Promise<any> {
		return new Promise((resolve, reject) => {
			if (grant.params.length == 0) {
				return reject('param is null');
			}
			App.Log.Logger(
				<LOGGER_LEVEL>grant.params[1] ?? LOGGER_LEVEL_INFO,
				'GM_log',
				<string>grant.params[0],
				grant.name,
				grant.id
			);
			AppEvent.trigger(ListenGmLog, {
				level: grant.params[1] ?? LOGGER_LEVEL_INFO,
				scriptId: grant.id,
				message: grant.params[0],
			});
			return resolve(undefined);
		});
	}

	@BackgroundGrant.GMFunction()
	protected GM_setValue(grant: Grant, post: IPostMessage, script?: Script): Promise<any> {
		//getValue直接从缓存中返回了,无需编写
		return new Promise((resolve) => {
			const hanlder = async () => {
				const [key, value] = grant.params;
				let model: Value | undefined;
				if (script?.metadata['storagename']) {
					model = await this.valueModel.findOne({
						storageName: script.metadata['storagename'][0],
						key: key,
					});
				} else {
					model = await this.valueModel.findOne({ scriptId: script?.id, key: key });
				}
				if (!model) {
					model = {
						id: 0,
						scriptId: script?.id || 0,
						storageName:
							(script?.metadata['storagename'] &&
								script?.metadata['storagename'][0]) ||
							'',
						key: key,
						value: value,
						createtime: new Date().getTime(),
					};
				} else {
					model.value = value;
				}
				if (value === undefined || value === null) {
					model.value = undefined;
					void this.valueModel.delete(model.id);
					AppEvent.trigger(ScriptValueChange, { model, tabid: grant.tabId });
					return resolve(undefined);
				}
				void this.valueModel.save(model);
				AppEvent.trigger(ScriptValueChange, { model, tabid: grant.tabId });
				resolve(undefined);
			};
			void hanlder();
		});
	}

	protected static proxyRule = new Map<number, CAT_Types.ProxyRule[] | string>();

	protected static buildProxyPACScript(): string {
		let ret = 'function FindProxyForURL(url, host) {\nlet ret;';
		BackgroundGrant.proxyRule.forEach((val, key) => {
			if (typeof val == 'string') {
				ret += `\nfunction pac${key}(){\n${val}\nreturn FindProxyForURL(url,host)}\nret=pac${key}();if(ret && ret!='DIRECT'){return ret;}`;
			} else {
				val.forEach((val) => {
					val.matchUrl.forEach((url) => {
						let regex = url;
						if (regex.indexOf('*') === -1) {
							regex = regex.replace(/\./g, '\\.');
							if (regex.indexOf('.') === 1 || regex.indexOf('//.') !== -1) {
								regex = regex.replace('\\.', '(?:^|www)\\.');
							}
						} else {
							regex = regex.replace(/\./g, '\\.');
							regex = regex.replace('*', '(?:^|.*?)');
						}
						regex = regex.replace(/\//g, '\\/');
						ret +=
							`if(/${regex}/.test(url)){return "${
								val.proxyServer.scheme?.toUpperCase() || 'HTTP'
							} ${val.proxyServer.host}` +
							(val.proxyServer.port ? ':' + val.proxyServer.port.toString() : '') +
							'"}\n';
					});
				});
			}
		});
		return ret + '\nreturn "DIRECT"}';
	}

	protected static freedProxy(id: number) {
		BackgroundGrant.proxyRule.delete(id);
		if (BackgroundGrant.proxyRule.size == 0) {
			return chrome.proxy.settings.clear({});
		}
		chrome.proxy.settings.set({
			value: {
				mode: 'pac_script',
				pacScript: {
					data: BackgroundGrant.buildProxyPACScript(),
				},
			},
		});
	}

	@BackgroundGrant.GMFunction({
		background: true,
		freed: (id: number) => {
			BackgroundGrant.freedProxy(id);
		},
	})
	protected CAT_setProxy(grant: Grant): Promise<any> {
		return new Promise((resolve) => {
			BackgroundGrant.proxyRule.set(grant.id, <CAT_Types.ProxyRule[]>grant.params[0]);
			App.Log.Debug('background', 'enable proxy', grant.name);
            chrome.extension
			chrome.proxy.settings.set({
				value: {
					mode: 'pac_script',
					pacScript: {
						data: BackgroundGrant.buildProxyPACScript(),
					},
				},
			});
			resolve(undefined);
		});
	}

	@BackgroundGrant.GMFunction({ background: true })
	protected CAT_clearProxy(grant: Grant): Promise<any> {
		return new Promise((resolve) => {
			BackgroundGrant.freedProxy(grant.id);
			resolve(undefined);
		});
	}

    // 真实点击,未来将会废弃
	@BackgroundGrant.GMFunction()
	public CAT_click(grant: Grant, post: IPostMessage): Promise<any> {
		return new Promise((resolve) => {
			const target = { tabId: (<chrome.runtime.MessageSender>post.sender()).tab?.id };
			const param = grant.params;
			chrome.debugger.getTargets((result) => {
				let flag = false;
				for (let i = 0; i < result.length; i++) {
					if (result[i].tabId == target.tabId) {
						flag = result[i].attached;
						break;
					}
				}
				if (flag) {
					chrome.debugger.sendCommand(
						target,
						'Input.dispatchMouseEvent',
						{
							type: 'mousePressed',
							x: param[0],
							y: param[1],
							button: 'left',
							clickCount: 1,
						},
						() => {
							chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
								type: 'mouseReleased',
								x: param[0],
								y: param[1],
								button: 'left',
								clickCount: 1,
							});
						}
					);
				} else {
					chrome.debugger.attach(target, '1.2', () => {
						chrome.debugger.sendCommand(
							target,
							'Input.dispatchMouseEvent',
							{
								type: 'mousePressed',
								x: param[0],
								y: param[1],
								button: 'left',
								clickCount: 1,
							},
							() => {
								chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
									type: 'mouseReleased',
									x: param[0],
									y: param[1],
									button: 'left',
									clickCount: 1,
								});
							}
						);
					});
				}
			});
			resolve(undefined);
		});
	}

	protected static textarea: HTMLElement = document.createElement('textarea');
	public static clipboardData: { type?: string; data: string } | undefined;

	@BackgroundGrant.GMFunction({
		listener: () => {
			document.body.appendChild(BackgroundGrant.textarea);
			document.addEventListener('copy', (e: ClipboardEvent) => {
				if (!BackgroundGrant.clipboardData || !e.clipboardData) {
					return;
				}
				e.preventDefault();
				const { type, data } = BackgroundGrant.clipboardData;
				e.clipboardData.setData(type || 'text/plain', data);
				BackgroundGrant.clipboardData = undefined;
			});
		},
	})
	public GM_setClipboard(grant: Grant): Promise<any> {
		return new Promise((resolve) => {
			BackgroundGrant.clipboardData = {
				type: grant.params[1],
				data: grant.params[0],
			};
			BackgroundGrant.textarea.focus();
			document.execCommand('copy', false, <any>null);
			resolve(undefined);
		});
	}

	protected static menu = new Map<number, Map<number, Map<number, any>>>();
	protected static bgMenu = new Map<number, Map<number, any>>();

	@BackgroundGrant.GMFunction({
		listener: () => {
			AppEvent.listener(TabRemove, (val) => {
				BackgroundGrant.menu.delete(val);
			});
			MsgCenter.listener(TabMenuClick, (msg) => {
				let scriptMenu: Map<number, any> | undefined;
				if (msg.tabId) {
					const tabMenu = BackgroundGrant.menu.get(msg.tabId);
					if (!tabMenu) {
						return;
					}
					scriptMenu = tabMenu.get(msg.scriptId);
				} else {
					scriptMenu = BackgroundGrant.bgMenu.get(msg.scriptId);
				}
				if (!scriptMenu) {
					return;
				}
				const menu = scriptMenu.get(msg.id);
				if (menu) {
					menu.grant.data = { action: 'click' };
					menu.post.postMessage(menu.grant);
				}
			});
		},
		freed: () => {
			console.log();
		},
	})
	public GM_registerMenuCommand(grant: Grant, post: IPostMessage): Promise<any> {
		return new Promise((resolve) => {
			grant.params[0].scriptId = grant.id;
			let scriptMenu: Map<number, any> | undefined;
			if (grant.tabId) {
				grant.params[0].tabId = grant.tabId;
				AppEvent.trigger('GM_registerMenuCommand', {
					type: 'frontend',
					param: grant.params[0],
				});
				let tabMenu = BackgroundGrant.menu.get(grant.tabId);
				if (!tabMenu) {
					tabMenu = new Map();
				}
				scriptMenu = tabMenu.get(grant.id);
				if (!scriptMenu) {
					scriptMenu = new Map();
				}
				tabMenu.set(grant.id, scriptMenu);
				BackgroundGrant.menu.set(grant.tabId, tabMenu);
			} else {
				AppEvent.trigger('GM_registerMenuCommand', {
					type: 'backend',
					param: grant.params[0],
				});
				scriptMenu = BackgroundGrant.bgMenu.get(grant.id);
				if (!scriptMenu) {
					scriptMenu = new Map();
				}
				BackgroundGrant.bgMenu.set(grant.id, scriptMenu);
			}
			scriptMenu.set(grant.params[0].id, {
				grant: grant,
				post: post,
			});
			resolve(undefined);
		});
	}

	@BackgroundGrant.GMFunction({})
	public GM_unregisterMenuCommand(grant: Grant): Promise<any> {
		return new Promise((resolve) => {
			grant.params[0].scriptId = grant.id;
			if (grant.tabId) {
				grant.params[0].tabId = grant.tabId;
				AppEvent.trigger('GM_unregisterMenuCommand', {
					type: 'frontend',
					param: grant.params[0],
				});
				// 清理交给removetab事件,直接清理tab下所有的
			} else {
				AppEvent.trigger('GM_unregisterMenuCommand', {
					type: 'backend',
					param: grant.params[0],
				});
				const scriptMenu = BackgroundGrant.bgMenu.get(grant.id);
				if (scriptMenu) {
					scriptMenu.delete(grant.params[0]);
				}
			}
			resolve(undefined);
		});
	}

	public static tabDatas = new Map<number, Map<number, any>>();

	@BackgroundGrant.GMFunction({
		freed: (id, tabId, windowClose) => {
			const datas = BackgroundGrant.tabDatas.get(id);
			if (!datas) {
				return;
			}
			if (tabId && windowClose) {
				datas.delete(tabId);
			} else {
				datas.delete(0);
			}
		},
	})
	public GM_getTab(grant: Grant): Promise<any> {
		return new Promise((resolve) => {
			if (!grant.tabId) {
				// 对后台脚本的处理
				grant.tabId = 0;
			}
			const datas = BackgroundGrant.tabDatas.get(grant.id);
			if (!datas) {
				grant.data = {};
			} else {
				grant.data = datas.get(grant.tabId) || {};
			}
			resolve(grant.data);
		});
	}

	@BackgroundGrant.GMFunction()
	public GM_saveTab(grant: Grant): Promise<any> {
		return new Promise((resolve) => {
			if (!grant.tabId) {
				// 对后台脚本的处理
				grant.tabId = 0;
			}
			let datas = BackgroundGrant.tabDatas.get(grant.id);
			if (!datas) {
				datas = new Map();
				BackgroundGrant.tabDatas.set(grant.id, datas);
			}
			datas.set(grant.tabId, grant.params[0]);
			resolve(undefined);
		});
	}

	@BackgroundGrant.GMFunction()
	public GM_getTabs(grant: Grant): Promise<any> {
		return new Promise((resolve) => {
			const datas = BackgroundGrant.tabDatas.get(grant.id);
			if (!datas) {
				return resolve({});
			}
			const ret: { [key: number]: any } = {};
			datas.forEach((val, key) => {
				ret[key] = val;
			});
			return resolve(ret);
		});
	}

	protected dealUnsafeHeader(
		config: GMSend.XHRDetails,
		xhr: XMLHttpRequest,
		headers?: { [key: string]: string }
	): { [key: string]: string } {
		xhr.setRequestHeader('X-Cat-' + this.rand + '-Scriptcat', 'true');
		for (let key in headers) {
			const val = headers[key];
			// 处理unsafe的header
			switch (key.toLowerCase()) {
				case 'user-agent':
				case 'host':
				case 'origin':
				case 'accept-encoding':
				case 'connection':
				case 'referer': {
					key = 'X-Cat-' + this.rand + '-' + key;
					break;
				}
			}
			try {
				xhr.setRequestHeader(key, val);
			} catch (e) {
				App.Log.Debug('gmxhr', (e as Error).message, 'GM_xmlhttpRequest');
			}
		}
		if (config.maxRedirects !== undefined) {
			xhr.setRequestHeader(
				'X-Cat-' + this.rand + '-Max-redirects',
				config.maxRedirects.toString()
			);
		}
		if (config.cookie) {
			xhr.setRequestHeader('X-Cat-' + this.rand + '-Cookie', config.cookie);
		}
		if (config.anonymous) {
			xhr.setRequestHeader('X-Cat-' + this.rand + '-Anonymous', 'true');
		}
		return headers || {};
	}

	@BackgroundGrant.GMFunction()
	public GM_download(grant: Grant, post: IPostMessage): Promise<any> {
		return new Promise((resolve) => {
			const config = <GM_Types.DownloadDetails>grant.params[0];
			// blob本地文件直接下载
			if (config.url.startsWith('blob:')) {
				chrome.downloads.download(
					{
						url: config.url,
						saveAs: config.saveAs,
						filename: config.name,
					},
					() => {
						resolve({ type: 'onload' });
					}
				);
				return;
			}
			// 使用ajax下载blob,再使用download api创建下载
			const xhr = new XMLHttpRequest();
			xhr.open(config.method || 'GET', config.url, true);
			xhr.responseType = 'blob';
			const deal = (event: string, data?: AnyMap) => {
				const removeXCat = new RegExp('x-cat-' + this.rand + '-', 'g');
				const respond: AnyMap = {
					finalUrl: xhr.responseURL || config.url,
					readyState: <any>xhr.readyState,
					status: xhr.status,
					statusText: xhr.statusText,
					responseHeaders: xhr.getAllResponseHeaders().replace(removeXCat, ''),
				};
				if (data) {
					for (const key in data) {
						respond[key] = data[key];
					}
				}
				grant.data = { type: event, data: respond };
				post.postMessage(grant);
			};
			xhr.onload = () => {
				deal('onload');
				const url = URL.createObjectURL(xhr.response);
				setTimeout(() => {
					URL.revokeObjectURL(url);
				}, 6000);
				chrome.downloads.download({
					url: url,
					saveAs: config.saveAs,
					filename: config.name,
				});
			};
			xhr.onerror = () => {
				deal('onerror');
			};
			xhr.onprogress = (event) => {
				const respond: GM_Types.XHRProgress = {
					done: xhr.DONE,
					lengthComputable: event.lengthComputable,
					loaded: event.loaded,
					total: event.total,
					totalSize: event.total,
				};
				deal('onprogress', respond);
			};
			xhr.ontimeout = () => {
				grant.data = { type: 'ontimeout', data: '' };
				post.postMessage(grant);
			};

			this.dealUnsafeHeader(config, xhr, config.headers);

			if (config.timeout) {
				xhr.timeout = config.timeout;
			}

			xhr.send();
			return resolve(undefined);
		});
	}
}
