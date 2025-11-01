import { Repo } from "./repo";

export type FaviconRecord = {
  match: string;
  website: string;
  icon?: string;
};

export interface Favicon {
  uuid: string;
  favicons: FaviconRecord[];
}

export class FaviconDAO extends Repo<Favicon> {
  constructor() {
    super("favicon");
  }

  save(key: string, value: Favicon) {
    return super._save(key, value);
  }
}
