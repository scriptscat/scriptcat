import { CronTime } from 'cron';

export function nextTime(crontab: string): string {
  let oncePos = 0;
  if (crontab.indexOf('once') !== -1) {
    const vals = crontab.split(' ');
    vals.forEach((val, index) => {
      if (val == 'once') {
        oncePos = index;
      }
    });
    if (vals.length == 5) {
      oncePos++;
    }
  }
  let cron;
  try {
    cron = new CronTime(crontab.replace(/once/g, '*'));
  } catch (e) {
    return '错误的定时表达式';
  }
  if (oncePos) {
    switch (oncePos) {
      case 1: //每分钟
        return cron
          .sendAt()
          .add(1, 'minute')
          .format('YYYY-MM-DD HH:mm 每分钟运行一次');
      case 2: //每小时
        return cron
          .sendAt()
          .add(1, 'hour')
          .format('YYYY-MM-DD HH 每小时运行一次');
      case 3: //每天
        return cron
          .sendAt()
          .add(1, 'day')
          .format('YYYY-MM-DD 每天运行一次');
      case 4: //每月
        return cron
          .sendAt()
          .add(1, 'month')
          .format('YYYY-MM 每月运行一次');
      case 5: //每年
        return cron
          .sendAt()
          .add(1, 'year')
          .format('YYYY 每年运行一次');
      case 6: //每星期
        return cron.sendAt().format('YYYY-MM-DD 每星期运行一次');
    }
    return '错误表达式';
  } else {
    return cron.sendAt().format('YYYY-MM-DD HH:mm:ss');
  }
}

export function toStorageValueStr(val: unknown): string {
  switch (typeof val) {
    case 'string':
      return 's' + val;
    case 'number':
      return 'n' + val.toString();
    case 'boolean':
      return 'b' + (val ? 'true' : 'false');
    default:
      try {
        return 'o' + JSON.stringify(val);
      } catch (e) {
        return '';
      }
  }
}

export function parseStorageValue(str: string): any {
  if (str === '') {
    return undefined;
  }
  const t = str[0];
  const s = str.substring(1);
  switch (t) {
    case 'b':
      return s == 'true';
    case 'n':
      return parseFloat(s);
    case 'o':
      try {
        return JSON.parse(s);
      } catch (e) {
        return str;
      }
    case 's':
      return s;
    default:
      return str;
  }
}


// 处理once的crontab表达式,将once之前的时间替换成最小值运行.
export function parseOnceCrontab(crontab: string): string {
  const ss = crontab.split(' ');
  switch (ss.length) {
    case 5:
      ss.unshift('0');
      break;
    case 6:
      break;
    default:
      return '';
  }
  const cron: string[] = [];
  for (let i = 0; i < ss.length; i++) {
    if (ss[i] == 'once') {
      cron.push('*');
      // 将之前的时间替换为最小值
      let n = i - 1;
      for (; n >= 0; n--) {
        if (cron[n][0] == '*') {
          // 为*替换为当前位最小值
          switch (n) {
            // 秒 分 时
            case 0:
            case 1:
            case 2:
              cron[n] = '0'
              break
            // 日 月
            case 3:
            case 4:
              cron[n] = '1'
              break
          }
        } else if (cron[n].indexOf('-') !== -1) {
          // 为一个范围,替换为范围内最小值
          cron[n] = cron[n].split('-')[0];
        } else if (cron[n].indexOf(',') !== -1) {
          // 取第一个分割
          cron[n] = cron[n].split(',')[0];
        }
      }
    } else {
      cron.push(ss[i]);
    }
  }
  return cron.join(' ');
}