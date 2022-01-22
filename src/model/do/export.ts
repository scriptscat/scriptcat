
export type EXPORT_DEST = 'local' | 'tencentCloud' | '';

export const EXPORT_DEST_LOCAL = 'local';
export const EXPORT_TENCENT_CLOUD = 'tencentCloud';
// 导出与本地脚本关联记录
export interface Export {
	id: number
	uuid: string
	scriptId: number
	dest: EXPORT_DEST
	overwriteValue: boolean
	overwriteCookie: boolean
	exportCookie: string
	exportValue: string
}
