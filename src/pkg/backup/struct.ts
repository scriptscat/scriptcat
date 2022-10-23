/* eslint-disable camelcase */

export type ResourceMeta = {
  name: string;
  url: string;
  ts: number;
  mimetype: string;
};

export type Resource = {
  meta: ResourceMeta;
  source: string;
  base64: string;
};

export type ValueStorage = {
  data: { [key: string]: string };
  ts: number;
};

export type ScriptOptions = {
  check_for_updates: boolean;
  comment: string | null;
  compat_foreach: boolean;
  compat_metadata: boolean;
  compat_prototypes: boolean;
  compat_wrappedjsobject: boolean;
  compatopts_for_requires: boolean;
  noframes: boolean | null;
  override: {
    merge_connects: boolean;
    merge_excludes: boolean;
    merge_includes: boolean;
    merge_matches: boolean;
    orig_connects: Array<string>;
    orig_excludes: Array<string>;
    orig_includes: Array<string>;
    orig_matches: Array<string>;
    orig_noframes: boolean | null;
    orig_run_at: string;
    use_blockers: Array<string>;
    use_connects: Array<string>;
    use_excludes: Array<string>;
    use_includes: Array<string>;
    use_matches: Array<string>;
  };
  run_at: string | null;
};

export type ScriptOptionsFile = {
  options: ScriptOptions;
  settings: { enabled: boolean; position: number };
  meta: {
    name: string;
    // uuid: script.script.uuid,
    modified: number;
    file_url: string;
    subscribe_url?: string;
  };
};

export type ScriptInfo = {
  name: string;
  code: string;
};

export type ScriptBackupData = {
  code: string;
  options: ScriptOptionsFile;
  storage: ValueStorage;
  enabled: boolean;
  position: number;
  requires: Resource[];
  requiresCss: Resource[];
  resources: Resource[];
};

export type SubscribeScript = {
  uuid: string;
  url: string;
};

export type SubscribeOptionsFile = {
  settings: { enabled: boolean };
  scripts: { [key: string]: SubscribeScript };
  meta: {
    name: string;
    modified: number;
    url: string;
  };
};

export type SubscribeBackupData = {
  source: string;
  options: SubscribeOptionsFile;
};

export type BackupData = {
  script: ScriptBackupData[];
  subscribe: SubscribeBackupData[];
};
