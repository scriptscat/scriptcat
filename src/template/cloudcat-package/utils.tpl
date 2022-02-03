const { ScriptCat } = require("scriptcat-nodejs/dist/src/scriptcat");
const fs = require('fs');
const cookies = require('./cookies');

exports.run = function () {
	const code = fs.readFileSync('userScript.js', 'utf8');

	const run = new ScriptCat();

	run.RunOnce(code, {
		cookies: cookies.cookies,
	}).then((res) => {
		console.log(res);
	});
}
