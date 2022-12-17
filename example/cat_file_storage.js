// ==UserScript==
// @name         cat file storage
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  脚本同步储存空间操作
// @author       You
// @match        https://bbs.tampermonkey.net.cn/
// @grant        CAT_fileStorage
// ==/UserScript==

CAT_fileStorage("upload", {
	path: "test.txt",
	data: new Blob(["Hello World"]),
	onload() {
		CAT_fileStorage("list", {
			onload(list) {
				console.log(list);
				list.forEach(value => {
					if (value.name === "test.txt") {
						CAT_fileStorage("download", {
							file: value,
							async onload(data) {
								console.log(await data.text());
								CAT_fileStorage("delete", {
									path: value.name,
									onload() {
										console.log('ok');
									}
								});
							}
						});
					}
				});
			}
		})
	}
})