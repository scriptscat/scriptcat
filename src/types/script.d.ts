interface Script {
    id: number;
    uuid: string;
    //script name
    name: string;
    //script code
    code: string;
    namespace: string;
    author: string;
    origin_domain: string;
    //script origin
    origin: string;
    //script checkupdate meta url
    checkupdate_url: string;
    //script metadata
    metadata: Metadata;
    // user config
    config?: UserConfig;
    //script type. 1:normal 2:crontab
    type: SCRIPT_TYPE;
    //script status. 1:enable 2:disable 3:error 4:prepare
    status: SCRIPT_STATUS;
    //script run status.
    runStatus: SCRIPT_RUN_STATUS;
    //script error info
    error?: string;
    //script install timestamp
    createtime?: number;
    //script update timestamp
    updatetime?: number;
    //last check update timestamp
    checktime: number;
    lastruntime?: number;
    delayruntime?: number;
}
