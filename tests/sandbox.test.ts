import { buildThis, init } from '@App/pkg/sandbox/sandbox';

describe('sandbox', () => {
	const context: AnyMap = {};
	const global: AnyMap = {
		gbok: 'gbok',
		onload: null,
		eval: () => {
			console.log('eval');
		},
	};
	init.set('onload', true);
	init.set('gbok', true);
	const _this = buildThis(global, context);

	it('set contenxt', () => {
		_this['md5'] = 'ok';
		expect(_this['md5']).toEqual('ok');
		expect(context['md5']).toEqual('ok');
		expect(global['md5']).toEqual(undefined);
	});

	it('set window null', () => {
		_this['onload'] = 'ok';
		expect(_this['onload']).toEqual('ok');
		expect(context['onload']).toEqual(undefined);
		expect(global['onload']).toEqual('ok');
	});

	it('update', () => {
		_this['okk'] = 'ok';
		expect(_this['okk']).toEqual('ok');
		expect(context['okk']).toEqual('ok');
		expect(global['okk']).toEqual(undefined);
		_this['okk'] = 'ok2';
		expect(_this['okk']).toEqual('ok2');
		expect(context['okk']).toEqual('ok2');
		expect(global['okk']).toEqual(undefined);
	});

	it('访问global的对象', () => {
		expect(_this['gbok']).toEqual('gbok');
	});
});
