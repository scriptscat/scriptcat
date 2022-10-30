export default class Storage {
  sync = {
    get(callback: (data: any) => void) {
      callback({});
    },
    set() {},
  };

  local = {};
}
