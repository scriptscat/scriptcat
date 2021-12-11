<template>
  <v-card>
    <v-card-title>
      <v-text-field
        v-model="search"
        :append-icon="icons.mdiMagnify"
        label="搜索键"
        single-line
        hide-details
      ></v-text-field>
      <v-spacer></v-spacer>
      <v-btn
        color="blue-grey"
        dark
        class="mb-2"
        @click="reload"
        style="margin-right: 10px"
      >
        重新加载
      </v-btn>
      <v-btn
        color="error"
        dark
        class="mb-2"
        @click="clearAll"
        style="margin-right: 10px"
      >
        清空
      </v-btn>
      <v-dialog v-model="dialog" max-width="500px">
        <template v-slot:activator="{ on, attrs }">
          <v-btn color="primary" dark class="mb-2" v-bind="attrs" v-on="on">
            添加新值
          </v-btn>
        </template>
        <v-card>
          <v-card-title>
            <span class="text-h5">添加新值</span>
          </v-card-title>
          <v-card-text>
            <v-container>
              <v-row>
                <v-col>
                  <v-text-field
                    v-model="editedItem.key"
                    label="储存键"
                  ></v-text-field>
                </v-col>
                <v-col>
                  <v-text-field
                    v-model="editedItem.value"
                    label="储存值"
                  ></v-text-field>
                </v-col>
              </v-row>
            </v-container>
          </v-card-text>

          <v-card-actions>
            <v-spacer></v-spacer>
            <v-btn color="blue darken-1" text @click="close"> 取消</v-btn>
            <v-btn color="blue darken-1" text @click="save"> 保存</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </v-card-title>
    <v-data-table
      :headers="headers"
      :items="values"
      :search="search"
      :footer-props="{
        itemsPerPageAllText: '显示全部',
        itemsPerPageText: '每行页数',
      }"
    >
      <template v-slot:top>
        <v-toolbar flat>
          <p>
            储存空间:
            {{
              (script.metadata["storagename"] &&
                script.metadata["storagename"][0]) ||
              "匿名空间"
            }}
          </p>
          <v-spacer></v-spacer>
          <v-dialog v-model="dialogDelete" max-width="500px">
            <v-card>
              <v-card-title class="text-h5">请确定是否删除储存项?</v-card-title>
              <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn color="blue darken-1" text @click="closeDelete"
                  >取消
                </v-btn>
                <v-btn color="blue darken-1" text @click="deleteItemConfirm"
                  >确定
                </v-btn>
                <v-spacer></v-spacer>
              </v-card-actions>
            </v-card>
          </v-dialog>
        </v-toolbar>
      </template>
      <template v-slot:[`item.value`]="{ item }">
        {{ toStorageValueStr(item.value) }}
      </template>
      <template v-slot:[`item.actions`]="{ item }">
        <v-icon small class="mr-2" @click="editItem(item)">
          {{ icons.mdiPencil }}
        </v-icon>
        <v-icon small @click="deleteItem(item)">
          {{ icons.mdiDelete }}
        </v-icon>
      </template>
      <template v-slot:no-data> 没有储存数据</template>
    </v-data-table>
    <v-card-subtitle>
      值的第一个字符表示该值的类型,在编辑值时请也按照此规则进行编辑,否则默认识别为文本.
      s:文本 n:数字 b:布尔值 o:对象
    </v-card-subtitle>
  </v-card>
</template>

<script lang="ts">
import { ScriptController } from '@App/apps/script/controller';
import { Script } from '@App/model/do/script';
import { Value } from '@App/model/do/value';
import { parseStorageValue, toStorageValueStr } from '@App/views/pages/utils';
import { Component, Prop, Vue, Watch } from 'vue-property-decorator';
import { mdiMagnify, mdiPencil, mdiDelete } from '@mdi/js';

@Component({})
export default class CloseButton extends Vue {
  icons = {
    mdiMagnify: mdiMagnify,
    mdiPencil: mdiPencil,
    mdiDelete: mdiDelete,
  };
  scriptCtrl = new ScriptController();
  values: Array<Value> = [];
  dialog = false;
  dialogDelete = false;
  editedIndex = -1;
  editedItem = { key: '', value: '' };

  @Prop() script!: Script;

  async created() {
    let values = await this.scriptCtrl.getValues(this.script);
    for (const key in values) {
      this.values.push(values[key]);
    }
  }

  data() {
    return {
      search: '',
      headers: [
        { text: '储存键', value: 'key' },
        { text: '储存值', value: 'value' },
        { text: '操作', value: 'actions' },
      ],
    };
  }

  toStorageValueStr = toStorageValueStr;

  @Watch('dialog')
  watchDialog(val: any) {
    val || this.close();
  }

  @Watch('dialogDelete')
  watchDialogDelete(val: any) {
    val || this.closeDelete();
  }

  close() {
    this.dialog = false;
    this.$nextTick(() => {
      this.editedItem = { key: '', value: '' };
      this.editedIndex = -1;
    });
  }

  closeDelete() {
    this.dialogDelete = false;
    this.$nextTick(() => {
      this.editedItem = { key: '', value: '' };
      this.editedIndex = -1;
    });
  }

  async save() {
    let value = await this.scriptCtrl.saveValue(
      this.script,
      this.editedItem.key,
      parseStorageValue(this.editedItem.value)
    );
    if (!value) {
      alert('保存失败');
      return;
    }
    if (this.editedIndex > -1) {
      this.values[this.editedIndex].value = value.value;
    } else {
      this.values.unshift(value);
    }
    this.close();
  }

  editItem(item: Value) {
    this.editedIndex = this.values.indexOf(item);
    this.editedItem = Object.assign({}, item);
    this.editedItem.value = toStorageValueStr(item.value);
    this.dialog = true;
  }

  deleteItem(item: Value) {
    this.editedIndex = this.values.indexOf(item);
    this.editedItem = Object.assign({}, item);
    this.editedItem.value = toStorageValueStr(item.value);
    this.dialogDelete = true;
  }

  deleteItemConfirm() {
    this.values.splice(this.editedIndex, 1);
    void this.scriptCtrl.deleteValue(this.script, this.editedItem.key);
    this.closeDelete();
  }

  async reload() {
    this.values = [];
    let values = await this.scriptCtrl.getValues(this.script);
    for (const key in values) {
      this.values.push(values[key]);
    }
  }

  async clearAll() {
    for (let i = 0; i < this.values.length; i++) {
      await this.scriptCtrl.deleteValue(this.script, this.values[i].key);
    }
    void (await this.reload());
  }
}
</script>

<style></style>
