import { buildThis } from "@App/pkg/sandbox";


describe("sandbox", () => {
	let context: any = {};
	let global: any = { onload: null };
	let _this = buildThis(global, context);

	it("set contenxt", () => {
		_this['md5'] = 'ok';
		expect(_this['md5']).toEqual("ok");
		expect(context['md5']).toEqual("ok");
		expect(global['md5']).toEqual(undefined);
	});

	it("set window null", () => {
		_this['onload'] = 'ok';
		expect(_this['onload']).toEqual("ok");
		expect(context['onload']).toEqual(undefined);
		expect(global['onload']).toEqual('ok');
	})

});

