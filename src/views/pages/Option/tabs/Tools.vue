<template>
  <div>
    <input
      id="import-file"
      type="file"
      @change="importFileChange"
      style="display: none"
    />
    <Panels :configs="configs" />
  </div>
</template>

<script lang="ts">
import { ScriptController } from '@App/apps/script/controller';
import { Vue, Component } from 'vue-property-decorator';
import Panels, {
  ConfigItem,
  PanelConfigs,
} from '@App/views/components/Panels.vue';
import { Resource } from '@App/model/do/backup';
import { SCRIPT_STATUS_ENABLE } from '@App/model/do/script';
import { strToBase64 } from '@App/pkg/utils/utils';
import { SUBSCRIBE_STATUS_ENABLE } from '@App/model/do/subscribe';
import { ToolsController } from '@App/apps/tools/controller';
import { SystemConfig } from '@App/pkg/config';
import { toStorageValueStr } from '../../utils';
import { Backup, JsonBackup, ZipBackup } from '@App/pkg/utils/backup';

@Component({
  components: { Panels },
})
export default class Tools extends Vue {
  scriptCtl = new ScriptController();
  toolsCtrl = new ToolsController();

  panel = [0, 1, 2, 3];

  configs: PanelConfigs = {
    备份: {
      items: [
        {
          type: 'button',
          title: '导出文件(压缩包)',
          describe: '以zip压缩包的形式导出备份文件',
          color: 'accent',
          loading: false,
          disabled: false,
          click: this.clickExportZipFile,
        },
        {
          type: 'button',
          title: '导出文件(JSON文件)',
          describe:
            '以json文件的形式导出备份文件,大的文件会出现卡死问题,推荐压缩包形式导出',
          color: 'accent',
          loading: false,
          disabled: false,
          click: this.clickExportFile,
        },
        {
          type: 'button',
          title: '导入文件',
          describe: '导入备份文件,会根据后缀识别',
          color: 'blue-grey',
          click: this.clickImportFile,
        },
      ],
    },
    开发调试: {
      items: [
        {
          type: 'text',
          title: 'VSCode地址',
          describe:
            "连接地址,默认一般为: ws://localhost:8642,需要在vscode扩展商店中安装'scriptcat-vscode'配合食用",
          value: SystemConfig.vscode_url,
          loading: false,
          disabled: false,
          change(val: ConfigItem) {
            SystemConfig.vscode_url = val.value;
          },
        },
        {
          type: 'check',
          title: '自动连接vscode服务',
          describe: '启动时自动连接到vscode扩展服务,断开连接后也会自动重连',
          value: SystemConfig.vscode_reconnect,
          change(val: any) {
            SystemConfig.vscode_reconnect = val.value;
          },
        },
        {
          type: 'button',
          title: '连接',
          color: 'blue-grey',
          click: this.connectVScode,
        },
      ],
    },
  };

  importFileChange(ev: Event) {
    let file = (<HTMLInputElement>ev.target!).files![0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      // 处理导入文件
      let { data, err } = this.scriptCtl.parseBackFile(<string>reader.result);
      if (err) {
        return alert(err);
      }
      this.scriptCtl.openImportFileWindow(data!);
    };
    reader.readAsText(file);
  }

  async clickExportZipFile(val: ConfigItem) {
    val.loading = true;
    val.disabled = true;
    await this.export(new ZipBackup());
    val.loading = false;
    val.disabled = false;
  }

  clickImportZipFile() {
    console.log('import zip');
  }

  clickImportFile() {
    let importFile = <HTMLInputElement>document.getElementById('import-file')!;
    importFile.click();
  }

  export(backup: Backup): Promise<void> {
    return new Promise((resolve) => {
      const handler = async () => {
        let nowTime = new Date();
        let list = await this.scriptCtl.scriptList(undefined);
        for (let i = 0; i < list.length; i++) {
          let script = list[i];
          let storage: { [key: string]: string } = {};
          let requires: Resource[] = [];
          let resources: Resource[] = [];
          let requires_css: Resource[] = [];

          // value导出
          let values = await this.scriptCtl.getScriptValue(script);
          for (const key in values) {
            let value = values[key];
            storage[key] = toStorageValueStr(value.value);
          }

          // resource导出
          let resourcesList = await this.scriptCtl.getResources(script);
          for (let key in resourcesList) {
            let resource = resourcesList[key];
            let val = {
              meta: {
                name: this.getUrlName(resource.url),
                url: resource.url,
                ts: resource.createtime || nowTime.getTime(),
                mimetype: resource.contentType || '',
              },
              source: resource.content,
              base64: resource.base64,
              hash: resource.hash,
            };
            switch (resource.type) {
              case 'require':
                requires.push(val);
                break;
              case 'resource':
                resources.push(val);
                break;
              case 'require-css':
                requires_css.push(val);
                break;
            }
          }

          backup.WriteScript({
            name: script.name,
            options: {},
            storage: {
              data: storage,
              ts: nowTime.getTime(),
            },
            enabled: script.status == SCRIPT_STATUS_ENABLE,
            position: script.sort,
            uuid: script.uuid,
            file_url: script.origin,
            source: script.code,
            requires: requires,
            requires_css: requires_css,
            resources: resources,
            self_metadata: script.selfMetadata,
            subscribe_url: script.subscribeUrl,
            modified: script.updatetime || script.createtime,
          });
        }

        // 处理订阅脚本
        let subList = await this.scriptCtl.subscribeList(undefined);
        for (let i = 0; i < subList.length; i++) {
          let subscribe = subList[i];
          backup.WriteSubscribe({
            name: subscribe.name,
            url: subscribe.url,
            enabled: subscribe.status === SUBSCRIBE_STATUS_ENABLE,
            source: subscribe.code,
            scripts: subscribe.scripts,
            modified: subscribe.updatetime || subscribe.createtime,
          });
        }

        void backup.Export().then(() => {
          resolve();
        });
      };
      void handler();
    });
  }

  async clickExportFile(val: ConfigItem) {
    val.loading = true;
    val.disabled = true;

    await this.export(new JsonBackup());

    val.loading = false;
    val.disabled = false;
  }

  getUrlName(url: string): string {
    let t = url.indexOf('?');
    if (t !== -1) {
      url = url.substring(0, t);
    }
    t = url.lastIndexOf('/');
    if (t !== -1) {
      url = url.substring(t + 1);
    }
    return url;
  }

  async connectVScode(val: ConfigItem) {
    val.loading = true;
    val.disabled = true;
    let ret = await this.toolsCtrl.connectVScode(
      this.configs.开发调试.items[0].value!
    );
    if (typeof ret === 'string') {
      alert(ret);
    } else {
      alert('连接成功');
    }
    val.loading = false;
    val.disabled = false;
  }
}
</script>
