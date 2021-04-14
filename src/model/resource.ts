import { db, Model } from "./model";

export interface Resource {
    id: number
    url: string
    content: string
    hash: hash,
    createtime?: number
    updatetime?: number
}

export interface hash {
    md5: string
    sha1: string
    sha256: string
    sha384: string
    sha512: string
}

export interface ResourceLink {
    id: number
    url: string
    scriptId: number
    createtime?: number
}

export class ResourceModel extends Model<Resource> {

    public tableName = 'resource';

    constructor() {
        super();
        this.table = db.table(this.tableName);
    }


}

export class ResourceLinkModel extends Model<ResourceLink>{

    public tableName = 'resourceLink';

    constructor() {
        super();
        this.table = db.table(this.tableName);
    }

}

