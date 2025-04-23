import { db } from "./repo/dao";
import { Script } from "./repo/scripts";

// 0.10.0重构,重命名字段,统一使用小峰驼
function renameField(): void {
  db.version(16)
    .stores({
      scripts:
        "++id,&uuid,name,namespace,author,originDomain,subscribeUrl,type,sort,status," +
        "runStatus,createtime,updatetime,checktime",
      logger: "++id,level,createtime",
      // export: "++id,&scriptId",
    })
    .upgrade(async (tx) => {
      await tx.table("export").clear();
      return tx
        .table("scripts")
        .toCollection()
        .modify((script: { [key: string]: any }) => {
          if (script.origin_domain) {
            script.originDomain = script.origin_domain;
          }
          if (script.checkupdate_url) {
            script.checkUpdateUrl = script.checkupdate_url;
          }
          if (script.download_url) {
            script.downloadUrl = script.download_url;
          }
        });
    });
  db.version(17).stores({
    // export是0.10.x时的兼容性处理
    export: "++id,&scriptId",
  });
  // 将脚本数据迁移到chrome.storage
  // db.version(18)
  //   .stores({})
  //   .upgrade((tx) => {});
}

export default function migrate() {
  // 数据库索引定义,每一次变动必须更新version
  db.version(1).stores({
    scripts: "++id,&uuid,name,namespace,author,origin_domain,type,status,createtime,updatetime,checktime",
  });
  db.version(2).stores({
    logger: "++id,level,origin,createtime",
    permission: "++id,[scriptId+permission+permissionValue],createtime,updatetime",
  });
  db.version(3).stores({
    logger: "++id,level,title,origin,createtime",
  });
  db.version(4).stores({
    value: "++id,scriptId,namespace,key,createtime",
  });
  db.version(5).stores({
    logger: "++id,level,origin,createtime,title,[origin+title],[level+origin+title]",
  });
  db.version(6).stores({
    scripts: "++id,&uuid,name,namespace,author,origin_domain,type,status,runStatus,createtime,updatetime,checktime",
  });
  db.version(7).stores({
    resource: "++id,&url,content,type,createtime,updatetime",
    resourceLink: "++id,url,scriptId,createtime",
  });
  db.version(8).stores({
    logger: "++id,level,origin,createtime",
  });
  db.version(9).stores({
    logger: "++id,level,scriptId,origin,createtime",
  });
  db.version(10)
    .stores({
      scripts:
        "++id,&uuid,name,namespace,author,origin_domain,type,sort,status,runStatus,createtime,updatetime,checktime",
    })
    .upgrade((tx) => {
      return tx
        .table("scripts")
        .toCollection()
        .modify((script: Script) => {
          script.sort = 0;
        });
    });
  db.version(11).stores({
    export: "++id,&uuid,scriptId",
  });
  db.version(12)
    .stores({
      value: "++id,scriptId,storageName,key,createtime",
    })
    .upgrade((tx) => {
      tx.table("value")
        .toCollection()
        .modify((value) => {
          if (value.namespace) {
            value.storageName = value.namespace;
            delete value.namespace;
          }
        });
    });
  db.version(13).stores({
    subscribe: "++id,&url,createtime,updatetime,checktime",
    scripts:
      "++id,&uuid,name,namespace,author,origin_domain,subscribeUrl,type,sort,status,runStatus,createtime,updatetime,checktime",
    sync: "++id,&key,[user+device+type],createtime",
  });
  db.version(14).stores({
    value: "++id,[scriptId+key],[storageName+key]",
  });
  db.version(15).stores({
    permission: "++id,scriptId,[scriptId+permission+permissionValue],createtime,updatetime",
  });
  // 使用小峰驼统一命名规范
  renameField();
}
