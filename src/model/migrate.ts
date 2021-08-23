import { db } from "./model";

export function migrate() {
    // 数据库索引定义,建议每一次commit都要更新version
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
    db.version(10).stores({
        scripts: "++id,&uuid,name,namespace,author,origin_domain,type,sort,status,runStatus,createtime,updatetime,checktime",
    }).upgrade(tx => {
        return tx.table("scripts").toCollection().modify(script => {
            script.sort = 0;
        });
    });
    db.version(11).stores({
        export: "++id,&uuid,scriptId"
    });
}
