export interface CloudScriptParams {
  [key: string]: {
    title: string;
    type?: "select";
    options?: string[];
  };
}

export default class CloudScriptFactory {
  static create() {}

  static params(): { [key: string]: CloudScriptParams } {
    return {
      local: {},
    };
  }
}
