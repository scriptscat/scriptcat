
export type EXPORT_DEST = 1 | 2 | 3;

export const EXPORT_DEST_LOCAL = 1;
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
