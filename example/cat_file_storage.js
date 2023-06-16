// ==UserScript==
// @name         cat file storage
// @namespace    https://bbs.tampermonkey.net.cn/
// @version      0.1.0
// @description  脚本同步储存空间操作
// @author       You
// @match        https://bbs.tampermonkey.net.cn/
// @grant        CAT_fileStorage
// @run-at       document-start
// ==/UserScript==

CAT_fileStorage("upload", {
	path: "test.txt",
	baseDir: "test-dir",
	data: new Blob(["Hello World"]),
	onload() {
		CAT_fileStorage("list", {
			baseDir: "test-dir",
			onload(list) {
				console.log(list);
				list.forEach(value => {
					if (value.name === "test.txt") {
						CAT_fileStorage("download", {
							file: value,
							baseDir: "test-dir",
							async onload(data) {
								console.log(await data.text());
								CAT_fileStorage("delete", {
									path: value.name,
									baseDir: "test-dir",
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
	}, onerror(err) {
		console.log(err);
		switch (err.code) {
			case 1:
			case 2:
				CAT_fileStorage("config");
				break;
		}
	}
})