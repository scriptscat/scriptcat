<template>
  <div>
    <Panels :configs="configs" />
  </div>
</template>

<script lang="ts">
import { UserController } from '@App/apps/user/controller';
import { SystemConfig } from '@App/pkg/config';
import { Vue, Component } from 'vue-property-decorator';
import Panels from '@App/views/components/Panels.vue';

@Component({
  components: { Panels },
})
export default class Config extends Vue {
  userCtl = new UserController();

  configs = {
    同步与资源更新: {
      items: [
        {
          type: 'check',
          value: SystemConfig.enable_auto_sync,
          title: '开启云同步',
          describe: '如果登录了账号会自动将数据同步到云,每半小时同步一次',
          change(val: any) {
            chrome.storage.local.get(['currentUser'], (items) => {
              if (!items['currentUser']) {
                alert('请先点击右上角登录账号');
                return;
              }
              SystemConfig.enable_auto_sync = val.value;
            });
          },
        },
        {
          type: 'button',
          title: '手动点击同步一次',
          color: 'accent',
          loading: false,
          click: this.sync,
        },
        {
          type: 'check',
          value: SystemConfig.update_disable_script,
          title: '更新已禁用脚本',
          describe: '禁用了的脚本也会检查更新',
          change(val: any) {
            SystemConfig.update_disable_script = val.value;
          },
        },
        {
          type: 'select',
          value: { key: SystemConfig.check_script_update_cycle },
          title: '脚本/订阅检查更新间隔',
          describe: '每n秒检查一次脚本/订阅是否更新',
          options: [
            { key: 0, val: '从不' },
            { key: 21600, val: '6小时' },
            { key: 43200, val: '12小时' },
            { key: 86400, val: '每天' },
            { key: 604800, val: '每周' },
          ],
          change(val: any) {
            SystemConfig.check_script_update_cycle = val.value.key;
          },
        },
        {
          type: 'check',
          value: SystemConfig.silence_update_script,
          title: '非重要变更静默更新脚本',
          describe: '@connect未发生变化将静默更新脚本',
          change(val: any) {
            SystemConfig.silence_update_script = val.value;
          },
        },
      ],
    },
  };

  async sync(val: any) {
    val.loading = true;
    let ret = await this.userCtl.sync();
    val.loading = false;
    alert(ret);
  }
}
</script>
