// 控制反转+单例模式, 用于管理全局的单例对象
// 用于解决循环依赖问题

type InjectOptions = {
  isSingleton?: boolean;
  nolazy?: boolean;
  depend?: any[];
  alias?: any[];
};

export default class IoC {
  // 单例集合
  static instances: Map<any, any> = new Map<any, any>();

  // 对象参数
  static objectParams: Map<any, InjectOptions & { object: any }> = new Map();

  // 以对象参数的形式注入
  static Options(options?: InjectOptions) {
    const opts = options || <InjectOptions>{};
    return {
      Singleton() {
        opts.isSingleton = true;
        return this.Register();
      },
      Depend(...depend: any[]) {
        opts.depend = depend;
        return this;
      },
      Lazy() {
        opts.nolazy = true;
        return this;
      },
      Alias(alias: any[]) {
        opts.alias = alias;
        return this;
      },
      Register() {
        return (object: any) => {
          const save = <InjectOptions & { object: any }>{ ...opts };
          save.object = object;
          IoC.objectParams.set(object, save);
          if (opts.nolazy) {
            IoC.instance(object);
          }
          // 非单例, 将别名与参数映射
          // 单例, 别名与实例映射
          if (!opts.isSingleton) {
            opts.alias?.forEach((item) => {
              IoC.objectParams.set(item, save);
            });
          }
        };
      },
    };
  }

  // 注册对象
  static Register(...depend: any) {
    return IoC.Options()
      .Depend(...depend)
      .Register();
  }

  // 声明单例, 默认懒加载
  static Singleton(...depend: any) {
    // 注册对象
    return IoC.Options()
      .Depend(...depend)
      .Singleton();
  }

  // 注册实例
  static registerInstance(object: any, instance: any) {
    if (IoC.instances.has(object)) {
      throw new Error("has been registered");
    }
    IoC.instances.set(object, instance);
    return {
      Alias(alias: any[] | any) {
        if (!alias) {
          return this;
        }
        if (alias instanceof Array) {
          alias.forEach((item: any) => {
            IoC.registerInstanceAlias(object, item);
          });
        } else {
          IoC.registerInstanceAlias(object, alias);
        }
        return this;
      },
    };
  }

  // 注册别名
  static registerInstanceAlias(object: any, alias: any): IoC {
    if (!IoC.instances.has(object)) {
      throw new Error("not registered");
    }
    IoC.instances.set(alias, IoC.instances.get(object));
    return IoC;
  }

  // 获取实例
  static instance(object: any): any {
    if (IoC.instances.has(object)) {
      return IoC.instances.get(object);
    }
    if (!IoC.objectParams.has(object)) {
      throw new Error(`${object.name} not registered`);
    }
    const params = IoC.objectParams.get(object)!;
    const deps: any[] = [];
    params.depend?.forEach((item: any) => {
      switch (typeof item) {
        case "function":
        case "object":
          deps.push(IoC.instance(item));
          break;
        default:
          deps.push(item);
          break;
      }
    });
    // eslint-disable-next-line new-cap
    const instance = new params.object(...deps);

    if (params.isSingleton) {
      // 单利, 别名与实例映射
      IoC.registerInstance(params.object, instance).Alias(params.alias);
    }
    return instance;
  }
}
