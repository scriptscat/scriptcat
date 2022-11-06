import { Export, ExportDAO, ExportTarget } from "@App/app/repo/export";
import { Script } from "@App/app/repo/scripts";
import {
  Button,
  Checkbox,
  Form,
  FormInstance,
  Input,
  Message,
  Modal,
  Select,
} from "@arco-design/web-react";
import FormItem from "@arco-design/web-react/es/Form/form-item";
import { IconQuestionCircleFill } from "@arco-design/web-react/icon";
import {
  ExportParams,
  parseExportCookie,
  parseExportValue,
} from "@Pkg/cloudscript/cloudscript";
import CloudScriptFactory from "@Pkg/cloudscript/factory";
import JSZip from "jszip";
import React, { useEffect, useRef } from "react";

const cloudScriptParams = CloudScriptFactory.params();

const CloudScriptList = [
  {
    key: "local",
    name: "本地",
  },
];

function defaultParams(script: Script) {
  return {
    exportValue: script.metadata.exportvalue && script.metadata.exportvalue[0],
    exportCookie:
      script.metadata.exportcookie && script.metadata.exportcookie[0],
  };
}

const CloudScriptPlan: React.FC<{
  // eslint-disable-next-line react/require-default-props
  script?: Script;
  onClose: () => void;
}> = ({ script, onClose }) => {
  const formRef = useRef<FormInstance>(null);
  const [visible, setVisible] = React.useState(false);
  const [cloudScriptType, setCloudScriptType] =
    React.useState<ExportTarget>("local");
  const [model, setModel] = React.useState<Export>();

  useEffect(() => {
    if (script) {
      setVisible(true);
      // 设置默认值
      // 从数据库中获取导出数据
      const dao = new ExportDAO();
      dao.findByScriptID(script.id).then((data) => {
        setModel(data);
        if (data && data.params[data.target]) {
          setCloudScriptType(data.target);
          formRef.current?.setFieldsValue(data.params[data.target]);
        } else {
          setCloudScriptType("local");
          formRef.current?.setFieldsValue(defaultParams(script));
        }
      });
    }
  }, [script]);
  return (
    <Modal
      title={
        <div>
          <span
            style={{
              height: "32px",
              lineHeight: "32px",
            }}
          >
            {script?.name} 上传至云
          </span>
          <Button
            type="text"
            icon={
              <IconQuestionCircleFill
                style={{
                  margin: 0,
                }}
              />
            }
            href="https://docs.scriptcat.org/docs/dev/cloudcat/"
            target="_blank"
            iconOnly
          />
        </div>
      }
      okText="导出"
      visible={visible}
      onCancel={() => {
        setVisible(false);
        onClose();
      }}
      onConfirm={async () => {
        // 保存并导出
        const dao = new ExportDAO();
        const params =
          formRef.current?.getFieldsValue() as unknown as ExportParams;
        if (!params || !script) {
          return;
        }
        setModel((prevModel) => {
          if (!prevModel) {
            prevModel = {
              id: 0,
              scriptId: script!.id,
              target: "local",
              params: {},
            };
          }
          prevModel.params[cloudScriptType] = params;
          prevModel.target = cloudScriptType;
          dao.save(prevModel).catch((err) => {
            Message.error(`保存失败: ${err}`);
          });
          return prevModel;
        });
        Message.info("导出中...");
        // 本地特殊处理
        const values = await parseExportValue(script, params.exportValue);
        const cookies = await parseExportCookie(params.exportCookie);
        if (cloudScriptType === "local") {
          const jszip = new JSZip();
          const cloudScript = CloudScriptFactory.create("local", {
            zip: jszip,
            ...params,
          });
          cloudScript.exportCloud(script, values, cookies);
          // 生成文件,并下载
          const files = await jszip.generateAsync({
            type: "blob",
            compression: "DEFLATE",
            compressionOptions: {
              level: 9,
            },
            comment: "Created by Scriptcat",
          });
          const url = URL.createObjectURL(files);
          setTimeout(() => {
            URL.revokeObjectURL(url);
          }, 60 * 1000);
          chrome.downloads.download({
            url,
            saveAs: true,
            filename: `${script.uuid}.zip`,
          });
        }
      }}
    >
      <Form
        autoComplete="off"
        style={{
          width: "100%",
        }}
        layout="vertical"
        ref={formRef}
      >
        <FormItem label="上传至">
          <Select
            value={cloudScriptType}
            onChange={(value) => {
              setCloudScriptType(value);
            }}
          >
            {CloudScriptList.map((item) => (
              <Select.Option key={item.key} value={item.key}>
                {item.name}
              </Select.Option>
            ))}
          </Select>
        </FormItem>
        {Object.keys(cloudScriptParams[cloudScriptType]).map((key) => {
          const item = cloudScriptParams[cloudScriptType][key];
          return (
            <FormItem key={key} label={item.title}>
              <Input />
            </FormItem>
          );
        })}
        <FormItem label="值导出表达式" field="exportValue">
          <Input.TextArea />
        </FormItem>
        <FormItem label="" field="overwriteValue">
          <Checkbox>导入时覆盖原值</Checkbox>
        </FormItem>
        <FormItem label="cookie导出表达式" field="exportCookie">
          <Input.TextArea />
        </FormItem>
        <FormItem label="" field="overwriteCookie">
          <Checkbox>导入时覆盖原值</Checkbox>
        </FormItem>
        <Button
          type="primary"
          onClick={() => {
            if (script) {
              formRef.current?.setFieldsValue(defaultParams(script));
            }
          }}
        >
          恢复默认值
        </Button>
      </Form>
    </Modal>
  );
};

export default CloudScriptPlan;
