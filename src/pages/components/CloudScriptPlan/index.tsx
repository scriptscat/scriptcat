import { Export, ExportDAO, ExportTarget } from "@App/app/repo/export";
import { Script } from "@App/app/repo/scripts";
import { Button, Checkbox, Form, Input, Message, Modal, Select } from "@arco-design/web-react";
import { IconQuestionCircleFill } from "@arco-design/web-react/icon";
import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";

const FormItem = Form.Item;

function defaultParams(script: Script) {
  return {
    exportValue: script.metadata.exportvalue && script.metadata.exportvalue[0],
    exportCookie: script.metadata.exportcookie && script.metadata.exportcookie[0],
  };
}

const CloudScriptPlan: React.FC<{
  // eslint-disable-next-line react/require-default-props
  script?: Script;
  onClose: () => void;
}> = ({ script, onClose }) => {
  const [form] = Form.useForm();
  const [visible, setVisible] = React.useState(false);
  const [cloudScriptType, setCloudScriptType] = React.useState<ExportTarget>("local");
  const [, setModel] = React.useState<Export>();
  const { t } = useTranslation();

  const CloudScriptList = [
    {
      key: "local",
      name: t("local"),
    },
  ];

  useEffect(() => {
    if (script) {
      setVisible(true);
      // 设置默认值
      // 从数据库中获取导出数据
      const dao = new ExportDAO();
      dao.findByScriptID(script.uuid).then((data) => {
        setModel(data);
        if (data && data.params[data.target]) {
          setCloudScriptType(data.target);
          form.setFieldsValue(data.params[data.target]);
        } else {
          setCloudScriptType("local");
          form.setFieldsValue(defaultParams(script));
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
            {script?.name} {t("upload_to_cloud")}
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
      okText={t("export")}
      visible={visible}
      onCancel={() => {
        setVisible(false);
        onClose();
      }}
      onConfirm={async () => {
        // 保存并导出
        const dao = new ExportDAO();
        const params = form.getFieldsValue() as unknown as ExportParams;
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
            Message.error(`${t("save_failed")}: ${err}`);
          });
          return prevModel;
        });
        Message.info(t("exporting")!);
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
          }, 30 * 1000);
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
        form={form}
      >
        <FormItem label={t("upload_to")}>
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
        {/* {Object.keys(cloudScriptParams[cloudScriptType]).map((key) => {
          const item = cloudScriptParams[cloudScriptType][key];
          return (
            <FormItem key={key} label={item.title}>
              <Input />
            </FormItem>
          );
        })} */}
        <FormItem label={t("value_export_expression")} field="exportValue">
          <Input.TextArea />
        </FormItem>
        <FormItem label="" field="overwriteValue">
          <Checkbox>{t("overwrite_original_value_on_import")}</Checkbox>
        </FormItem>
        <FormItem label={t("cookie_export_expression")} field="exportCookie">
          <Input.TextArea />
        </FormItem>
        <FormItem label="" field="overwriteCookie">
          <Checkbox>{t("overwrite_original_cookie_on_import")}</Checkbox>
        </FormItem>
        <Button
          type="primary"
          onClick={() => {
            if (script) {
              form.setFieldsValue(defaultParams(script));
            }
          }}
        >
          {t("restore_default_values")}
        </Button>
      </Form>
    </Modal>
  );
};

export default CloudScriptPlan;
