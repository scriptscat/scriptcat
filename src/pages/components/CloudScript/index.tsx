import { Script } from "@App/app/repo/scripts";
import {
  Button,
  Checkbox,
  Form,
  Input,
  Modal,
  Select,
} from "@arco-design/web-react";
import FormItem from "@arco-design/web-react/es/Form/form-item";
import { IconQuestionCircleFill } from "@arco-design/web-react/icon";
import CloudScriptFactory from "@Pkg/cloudscript/factory";
import React, { useEffect } from "react";

const cloudScriptParams = CloudScriptFactory.params();

const CloudScriptList = [
  {
    key: "local",
    name: "本地",
  },
];

const CloudScript: React.FC<{
  // eslint-disable-next-line react/require-default-props
  script?: Script;
  onClose: () => void;
}> = ({ script, onClose }) => {
  const [visible, setVisible] = React.useState(false);
  const [cloudScriptType, setCloudScriptType] = React.useState("local");

  useEffect(() => {
    if (script) {
      setVisible(true);
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
      visible={visible}
      onCancel={() => {
        setVisible(false);
        onClose();
      }}
    >
      <Form
        autoComplete="off"
        style={{
          width: "100%",
        }}
        layout="vertical"
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
        <FormItem label="值导出表达式">
          <Input.TextArea />
        </FormItem>
        <FormItem label="">
          <Checkbox>导入时覆盖原值</Checkbox>
        </FormItem>
        <FormItem label="cookie导出表达式">
          <Input.TextArea />
        </FormItem>
        <FormItem label="">
          <Checkbox>导入时覆盖原值</Checkbox>
        </FormItem>
        <Button type="primary">恢复默认值</Button>
      </Form>
    </Modal>
  );
};

export default CloudScript;
