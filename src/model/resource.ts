import { Resource, ResourceLink } from "./do/resource";
import { db, Model } from "./model";


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

