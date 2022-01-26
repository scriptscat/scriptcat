import { parseOnceCrontab } from '@App/views/pages/utils';

describe('parseOnceCrontab', () => {

	it('once', () => {
		expect(parseOnceCrontab('* * once * *')).toEqual('0 0 0 * * *');
		expect(parseOnceCrontab('* 1-23 once * *')).toEqual('0 0 1 * * *');
		expect(parseOnceCrontab('* 1,3,5 once * *')).toEqual('0 0 1 * * *');
		expect(parseOnceCrontab('* */4 once * *')).toEqual('0 0 0 * * *');
		expect(parseOnceCrontab('* 1-23/4 once * *')).toEqual('0 0 1 * * *');
		expect(parseOnceCrontab('* 10 once * *')).toEqual('0 0 10 * * *');
		expect(parseOnceCrontab('* * * once *')).toEqual('0 0 0 1 * *');
	});

});

