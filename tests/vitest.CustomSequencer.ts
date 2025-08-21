import path from "node:path";
import { BaseSequencer, type TestSpecification } from "vitest/node";

export default class CustomSequencer extends BaseSequencer {
  async sort(files: TestSpecification[]) {
    // File basenames in the exact order you want:
    const order = ["regex_to_glob.test.ts"];

    const rank = (s: TestSpecification) => {
      const name = path.basename(s.moduleId); // moduleId is the file path
      const i = order.indexOf(name);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    const ret = [...files].sort((a, b) => rank(a) - rank(b));

    const names = ret.map((s) => path.basename(s.moduleId));

    console.log("vitest 测试顺序：", names);

    return ret;
  }

  // (optional) keep default sharding
  async shard(files: TestSpecification[]) {
    return super.shard(files);
  }
}
