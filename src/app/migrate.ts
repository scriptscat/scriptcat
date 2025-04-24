import { getStorageName } from "@App/pkg/utils/utils";
import { db } from "./repo/dao";
import { Script, ScriptAndCode, ScriptCodeDAO, ScriptDAO } from "./repo/scripts";
import { Subscribe, SubscribeDAO } from "./repo/subscribe";
import { Value, ValueDAO } from "./repo/value";
import { Permission, PermissionDAO } from "./repo/permission";

// 0.10.0重构,重命名字段,统一使用小峰驼
function renameField() {
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
  const v = 36;
  // 将脚本数据迁移到chrome.storage
  db.version(v).upgrade(() => {
    // 默认使用的事务，这里加个延时，用db.open()打开数据库后，再执行
    setTimeout(async () => {
      try {
        // 迁移脚本
        const scripts = await db.table("scripts").toArray();
        const scriptDAO = new ScriptDAO();
        const scriptCodeDAO = new ScriptCodeDAO();
        console.log("开始迁移脚本数据", scripts.length);
        await Promise.all(
          scripts.map(async (script: ScriptAndCode) => {
            const {
              uuid,
              name,
              namespace,
              author,
              originDomain,
              subscribeUrl,
              type,
              sort,
              status,
              runStatus,
              metadata,
              createtime,
              checktime,
              code,
              checkUpdateUrl,
              downloadUrl,
              selfMetadata,
              config,
              error,
              updatetime,
              lastruntime,
              nextruntime,
            } = script;
            const s = await scriptDAO.save({
              uuid,
              name,
              namespace,
              author,
              originDomain,
              origin,
              checkUpdateUrl,
              downloadUrl,
              metadata,
              selfMetadata,
              subscribeUrl,
              config,
              type,
              status,
              sort,
              runStatus,
              error,
              createtime,
              updatetime,
              checktime,
              lastruntime,
              nextruntime,
            });
            return scriptCodeDAO
              .save({
                uuid: s.uuid,
                code,
              })
              .catch((e) => {
                console.log("脚本代码迁移失败", e);
                return Promise.reject(e);
              });
          })
        );
        // 迁移订阅
        const subscribe = await db.table("subscribe").toArray();
        const subscribeDAO = new SubscribeDAO();
        if (subscribe.length) {
          await Promise.all(
            subscribe.map((s: Subscribe) => {
              console.log("1234", s);
              const { url, name, code, author, scripts, metadata, status, createtime, updatetime, checktime } = s;
              return subscribeDAO.save({
                url,
                name,
                code,
                author,
                scripts,
                metadata,
                status,
                createtime,
                updatetime,
                checktime,
              });
            })
          );
        }
        console.log("订阅数据迁移完成", subscribe.length);
        // 迁移value
        interface MV2Value {
          id: number;
          scriptId: number;
          storageName?: string;
          key: string;
          value: any;
          createtime: number;
          updatetime: number;
        }
        const values = await db.table("value").toArray();
        const valueDAO = new ValueDAO();
        const valueMap = new Map<string, Value>();
        await Promise.all(
          values.map((v: MV2Value) => {
            const { scriptId, storageName, key, value, createtime } = v;
            return db
              .table("scripts")
              .where("id")
              .equals(scriptId)
              .first((script: Script) => {
                if (script) {
                  let data: { [key: string]: any } = {};
                  if (!valueMap.has(script.uuid)) {
                    valueMap.set(script.uuid, {
                      uuid: script.uuid,
                      storageName: getStorageName(script),
                      data: data,
                      createtime,
                      updatetime: 0,
                    });
                  } else {
                    data = valueMap.get(script.uuid)!.data;
                  }
                  data[key] = value;
                }
              });
          })
        );
        // 保存到数据库
        await Promise.all(
          Array.from(valueMap.keys()).map((uuid) => {
            const { storageName, data, createtime } = valueMap.get(uuid)!;
            return valueDAO.save(storageName!, {
              uuid,
              storageName,
              data,
              createtime,
              updatetime: 0,
            });
          })
        );
        console.log("脚本value数据迁移完成", values.length);
        // 迁移permission
        const permissions = await db.table("permission").toArray();
        const permissionDAO = new PermissionDAO();
        await Promise.all(
          permissions.map((p: Permission & { scriptId: number }) => {
            const { scriptId, permission, permissionValue, createtime, updatetime, allow } = p;
            return db
              .table("scripts")
              .where("id")
              .equals(scriptId)
              .first((script: Script) => {
                if (script) {
                  return permissionDAO.save({
                    uuid: script.uuid,
                    permission,
                    permissionValue,
                    createtime,
                    updatetime,
                    allow,
                  });
                }
              });
          })
        );
        console.log("脚本permission数据迁移完成", permissions.length);
        // 打开页面，告知数据储存+升级至了mv3，重启一次扩展
        setTimeout(async () => {
          const scripts = await scriptDAO.all();
          console.log("脚本数据迁移完成", scripts.length);
          if (scripts.length > 0) {
            chrome.tabs.create({
              url: "https://docs.scriptcat.org/docs/change/v0.17/",
            });
            setTimeout(() => {
              chrome.runtime.reload();
            }, 1000);
          }
        }, 2000);
      } catch (e) {
        console.error("脚本数据迁移失败", e);
      }
    }, 200);
  });
  return db.open();
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
      return tx
        .table("value")
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
  return renameField();
}
