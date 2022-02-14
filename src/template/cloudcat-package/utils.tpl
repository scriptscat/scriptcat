const fs = require('fs');
const { ScriptCat } = require("scriptcat-nodejs/dist/src/scriptcat");
const { ModelValues } = require("scriptcat-nodejs/dist/src/storage/values");
const { cookies } = require('./cookies');
const { values } = require('./values');

exports.run = function () {
	const code = fs.readFileSync('userScript.js', 'utf8');

	const run = new ScriptCat();
	run.RunOnce(code, {
		cookies: cookies,
		values: new ModelValues(values),
	}).then((res) => {
		console.log(res);
	});
}
