import { Button, Select } from "@arco-design/web-react";
import { IconClose } from "@arco-design/web-react/icon";
import React from "react";
import "./index.css";

export type Query = {
  key: string;
  condition: "=" | "=~" | "!=" | "!~";
  value: string;
};

export type Labels = {
  [key: string]: { [key: string | number]: boolean };
};

const LogLabel: React.FC<{
  value: Query;
  labels: Labels;
  onChange: (value: Query) => void;
  onClose: () => void;
}> = ({ value, labels, onChange, onClose }) => {
  const values = labels[value.key] || {};
  return (
    <div className="log-query-label">
      <Select
        showSearch
        placeholder="key"
        value={value.key || undefined}
        onChange={(opt) => {
          onChange({ ...value, key: opt });
        }}
        triggerProps={{
          autoAlignPopupWidth: false,
          autoAlignPopupMinWidth: true,
          position: "bl",
        }}
      >
        {Object.keys(labels).map((option) => (
          <Select.Option key={option} value={option}>
            {option}
          </Select.Option>
        ))}
      </Select>
      <Select
        placeholder="condition"
        value={value.condition || "="}
        onChange={(opt) => {
          onChange({ ...value, condition: opt });
        }}
      >
        <Select.Option value="=">=</Select.Option>
        <Select.Option value="=~">=~</Select.Option>
        <Select.Option value="!=">!=</Select.Option>
        <Select.Option value="!~">!~</Select.Option>
      </Select>
      <Select
        showSearch
        placeholder="value"
        value={value.value || undefined}
        onChange={(opt) => {
          onChange({ ...value, value: opt });
        }}
        triggerProps={{
          autoAlignPopupWidth: false,
          autoAlignPopupMinWidth: true,
          position: "bl",
        }}
      >
        {Object.keys(values).map((option) => (
          <Select.Option key={option} value={option}>
            {option}
          </Select.Option>
        ))}
      </Select>
      <Button iconOnly icon={<IconClose />} onClick={onClose} />
    </div>
  );
};

export default LogLabel;
