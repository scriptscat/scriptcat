// 避免直接把OPFS打包到 content.js / inject.js
import type * as K from "./opfs_impl";

// runtime vars that will be assigned once
export let getOPFSRoot!: typeof K.getOPFSRoot;
export let setOPFSTemp!: typeof K.setOPFSTemp;
export let getOPFSTemp!: typeof K.getOPFSTemp;
export let initOPFS!: typeof K.initOPFS;

export function assignOPFS(impl: typeof K) {
  getOPFSRoot = impl.getOPFSRoot;
  setOPFSTemp = impl.setOPFSTemp;
  getOPFSTemp = impl.getOPFSTemp;
  initOPFS = impl.initOPFS;
}
