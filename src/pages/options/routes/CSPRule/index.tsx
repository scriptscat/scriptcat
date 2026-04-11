import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Drawer,
  Form,
  Input,
  InputNumber,
  Message,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from "@arco-design/web-react";
import { IconPlus, IconQuestionCircle, IconSearch, IconDelete, IconEdit } from "@arco-design/web-react/icon";
import { useTranslation } from "react-i18next";
import type { CSPRule, CSPRuleAction } from "@App/app/repo/cspRule";
import { CSPRuleClient } from "@App/app/service/service_worker/client";
import { message } from "@App/pages/store/global";
import { match as patternMatch, parsePatternType } from "@App/pkg/utils/patternMatcher";
import type { ColumnProps } from "@arco-design/web-react/es/Table";

const { Title, Text, Paragraph } = Typography;
const { useForm } = Form;

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

type MatchTestResult = {
  matched: boolean;
  patternType: string;
  details: string;
};

function CSPRulePage() {
  const { t } = useTranslation();
  const [form] = useForm();

  const [rules, setRules] = useState<CSPRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [globalEnabled, setGlobalEnabled] = useState(false);
  const [globalLoading, setGlobalLoading] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingRule, setEditingRule] = useState<CSPRule | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formAction, setFormAction] = useState<CSPRuleAction>("remove");

  const [testDrawerVisible, setTestDrawerVisible] = useState(false);
  const [testPattern, setTestPattern] = useState("");
  const [testUrl, setTestUrl] = useState("");
  const [testResult, setTestResult] = useState<MatchTestResult | null>(null);
  const [testing, setTesting] = useState(false);

  const [helpVisible, setHelpVisible] = useState(false);

  const client = useMemo(() => new CSPRuleClient(message), []);

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const data = await client.getAllRules();
      setRules(data || []);
    } catch (e: any) {
      console.warn("[CSPRule] Failed to load rules:", e);
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, [client]);

  const loadConfig = useCallback(async () => {
    try {
      const config = await client.getCSPConfig();
      setGlobalEnabled(config.globalEnabled);
    } catch {
      // ignore
    }
  }, [client]);

  useEffect(() => {
    loadRules();
    loadConfig();
  }, [loadRules, loadConfig]);

  const handleToggleGlobal = useCallback(
    async (checked: boolean) => {
      setGlobalLoading(true);
      try {
        const config = await client.toggleGlobal(checked);
        setGlobalEnabled(config.globalEnabled);
        Message.success(checked ? t("csp_global_enabled") : t("csp_global_disabled"));
      } catch (e: any) {
        Message.error(`${t("operation_failed")}: ${e.message}`);
      } finally {
        setGlobalLoading(false);
      }
    },
    [client, t]
  );

  const handleCreate = useCallback(() => {
    setEditingRule(null);
    setFormAction("remove");
    form.resetFields();
    setHelpVisible(false);
    setModalVisible(true);
  }, [form]);

  const handleEdit = useCallback(
    (record: CSPRule) => {
      setEditingRule(record);
      setFormAction(record.action);
      form.setFieldsValue({
        name: record.name,
        description: record.description,
        path: record.path,
        action: record.action,
        actionValue: record.actionValue || "",
        priority: record.priority,
        enabled: record.enabled,
      });
      setHelpVisible(false);
      setModalVisible(true);
    },
    [form]
  );

  const handleSubmit = useCallback(async () => {
    try {
      const values = await form.validate();
      setSubmitting(true);
      if (editingRule) {
        await client.updateRule({
          id: editingRule.id,
          changes: {
            name: values.name,
            description: values.description || "",
            path: values.path,
            action: values.action,
            actionValue: values.action === "modify" ? values.actionValue : undefined,
            priority: values.priority,
            enabled: values.enabled,
          },
        });
        Message.success(t("csp_save_success"));
      } else {
        await client.createRule({
          name: values.name,
          description: values.description || "",
          path: values.path,
          action: values.action,
          actionValue: values.action === "modify" ? values.actionValue : undefined,
          priority: values.priority,
          enabled: values.enabled,
        });
        Message.success(t("csp_save_success"));
      }
      setModalVisible(false);
      form.resetFields();
      loadRules();
    } catch (e: any) {
      if (e?.message) {
        Message.error(`${t("operation_failed")}: ${e.message}`);
      }
    } finally {
      setSubmitting(false);
    }
  }, [editingRule, form, client, loadRules, t]);

  const handleDelete = useCallback(
    (record: CSPRule) => {
      Modal.confirm({
        title: t("csp_delete_rule_confirm").replace("{name}", record.name),
        okButtonProps: { status: "danger" },
        onOk: async () => {
          try {
            await client.deleteRule(record.id);
            Message.success(t("csp_delete_success"));
            loadRules();
          } catch (e: any) {
            Message.error(`${t("operation_failed")}: ${e.message}`);
          }
        },
      });
    },
    [client, loadRules, t]
  );

  const handleToggle = useCallback(
    (record: CSPRule, checked: boolean) => {
      client
        .toggleRule({ id: record.id, enabled: checked })
        .then(() => {
          setRules((prev) => prev.map((r) => (r.id === record.id ? { ...r, enabled: checked } : r)));
          Message.success(t("csp_toggle_success"));
        })
        .catch((e: any) => {
          Message.error(`${t("operation_failed")}: ${e.message}`);
        });
    },
    [client, t]
  );

  const handleOpenTest = useCallback((pathValue?: string) => {
    if (pathValue) {
      setTestPattern(pathValue);
    }
    setTestUrl("");
    setTestResult(null);
    setHelpVisible(false);
    setTestDrawerVisible(true);
  }, []);

  const handleTest = useCallback(() => {
    if (!testPattern.trim() || !testUrl.trim()) {
      Message.warning(t("csp_rule_path_required"));
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const matched = patternMatch(testPattern, testUrl);
      const patternType = parsePatternType(testPattern);
      setTestResult({
        matched,
        patternType,
        details: `Pattern: ${testPattern}\nURL: ${testUrl}\nType: ${patternType}`,
      });
    } catch (e: any) {
      setTestResult({
        matched: false,
        patternType: "error",
        details: e.message,
      });
    } finally {
      setTesting(false);
    }
  }, [testPattern, testUrl, t]);

  const columns: ColumnProps[] = [
    {
      title: t("csp_rule_name"),
      dataIndex: "name",
      key: "name",
      ellipsis: true,
      width: 160,
      sorter: (a: CSPRule, b: CSPRule) => a.name.localeCompare(b.name),
    },
    {
      title: t("csp_rule_description"),
      dataIndex: "description",
      key: "description",
      ellipsis: true,
      width: 160,
      render: (val: string) => val || "-",
    },
    {
      title: t("csp_rule_path"),
      dataIndex: "path",
      key: "path",
      ellipsis: true,
      width: 240,
      render: (val: string) => (
        <Typography.Text style={{ maxWidth: 220 }} ellipsis={{ showTooltip: true }}>
          {val}
        </Typography.Text>
      ),
    },
    {
      title: t("csp_rule_action"),
      dataIndex: "action",
      key: "action",
      width: 110,
      align: "center",
      filters: [
        { text: t("csp_rule_action_remove"), value: "remove" },
        { text: t("csp_rule_action_modify"), value: "modify" },
      ],
      onFilter: (value, row) => row.action === value,
      render: (val: CSPRuleAction) => (
        <Tag color={val === "remove" ? "red" : "blue"}>
          {val === "remove" ? t("csp_rule_action_remove") : t("csp_rule_action_modify")}
        </Tag>
      ),
    },
    {
      title: t("csp_rule_priority"),
      dataIndex: "priority",
      key: "priority",
      width: 80,
      align: "center",
      sorter: (a: CSPRule, b: CSPRule) => a.priority - b.priority,
      defaultSortOrder: "descend",
    },
    {
      title: t("csp_rule_enabled"),
      dataIndex: "enabled",
      key: "enabled",
      width: 80,
      align: "center",
      render: (_: boolean, record: CSPRule) => (
        <Switch size="small" checked={record.enabled} onChange={(checked) => handleToggle(record, checked)} />
      ),
    },
    {
      title: t("csp_rule_createtime"),
      dataIndex: "createtime",
      key: "createtime",
      width: 170,
      align: "center",
      sorter: (a: CSPRule, b: CSPRule) => a.createtime - b.createtime,
      defaultSortOrder: "descend",
      render: (val: number) => (val ? formatDateTime(val) : "-"),
    },
    {
      title: t("csp_rule_updatetime"),
      dataIndex: "updatetime",
      key: "updatetime",
      width: 170,
      align: "center",
      sorter: (a: CSPRule, b: CSPRule) => a.updatetime - b.updatetime,
      defaultSortOrder: "descend",
      render: (val: number) => (val ? formatDateTime(val) : "-"),
    },
    {
      title: t("action"),
      key: "action_ops",
      width: 120,
      align: "center",
      fixed: "right",
      render: (_: any, record: CSPRule) => (
        <Space>
          <Button type="text" size="small" icon={<IconEdit />} onClick={() => handleEdit(record)} />
          <Button type="text" size="small" status="danger" icon={<IconDelete />} onClick={() => handleDelete(record)} />
        </Space>
      ),
    },
  ];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          flexShrink: 0,
        }}
      >
        <Title heading={5} style={{ margin: 0 }}>
          {t("csp_rule")}
        </Title>
        <Space>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginRight: 8,
              padding: "4px 12px",
              borderRadius: 6,
              background: globalEnabled ? "var(--color-primary-light-1)" : "var(--color-fill-2)",
              transition: "background 0.2s",
            }}
          >
            <Switch size="small" checked={globalEnabled} loading={globalLoading} onChange={handleToggleGlobal} />
            <Text style={{ fontSize: 13, whiteSpace: "nowrap" }}>{t("csp_global_switch")}</Text>
          </div>
          <Button
            type="outline"
            icon={<IconQuestionCircle />}
            onClick={() => {
              setTestDrawerVisible(false);
              setHelpVisible(true);
            }}
          >
            {t("csp_rule_guide")}
          </Button>
          <Button type="primary" icon={<IconPlus />} onClick={handleCreate} disabled={globalEnabled}>
            {t("csp_create_rule")}
          </Button>
        </Space>
      </div>

      {globalEnabled && (
        <div
          style={{
            marginBottom: 12,
            padding: "8px 12px",
            borderRadius: 6,
            background: "var(--color-primary-light-1)",
            color: "var(--color-primary-6)",
            fontSize: 13,
          }}
        >
          {t("csp_global_switch_desc")}
        </div>
      )}

      <Card style={{ flex: 1, overflow: "auto" }}>
        <Table
          rowKey="id"
          columns={columns}
          data={rules}
          loading={loading}
          pagination={false}
          tableLayoutFixed
          scroll={{ x: 1400 }}
          style={{
            minWidth: 800,
            opacity: globalEnabled ? 0.5 : 1,
            pointerEvents: globalEnabled ? "none" : "auto",
            transition: "opacity 0.2s",
          }}
          noDataElement={
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--color-text-3)" }}>
              {t("csp_no_rules")}
            </div>
          }
        />

        {/* 创建/编辑规则弹窗 */}
        <Modal
          title={editingRule ? t("csp_edit_rule") : t("csp_create_rule")}
          visible={modalVisible}
          confirmLoading={submitting}
          onOk={handleSubmit}
          onCancel={() => {
            setModalVisible(false);
            form.resetFields();
          }}
          unmountOnExit
          maskClosable={false}
          style={{ width: 560 }}
        >
          <Form
            form={form}
            layout="vertical"
            initialValues={{
              action: "remove",
              priority: 1,
              enabled: true,
            }}
          >
            <Form.Item
              label={t("csp_rule_name")}
              field="name"
              rules={[{ required: true, message: t("csp_rule_name_required") }]}
            >
              <Input placeholder={t("csp_rule_name_placeholder")} maxLength={100} />
            </Form.Item>

            <Form.Item label={t("csp_rule_description")} field="description">
              <Input.TextArea
                placeholder={t("csp_rule_description_placeholder")}
                autoSize={{ minRows: 2, maxRows: 4 }}
                maxLength={500}
              />
            </Form.Item>

            <Form.Item
              label={t("csp_rule_path")}
              field="path"
              required
              rules={[{ required: true, message: t("csp_rule_path_required") }]}
              extra={
                <Space style={{ marginTop: 4 }}>
                  <Button
                    type="text"
                    size="mini"
                    icon={<IconSearch />}
                    onClick={() => {
                      const pathVal = form.getFieldValue("path");
                      handleOpenTest(pathVal || "");
                    }}
                  >
                    {t("csp_rule_test")}
                  </Button>
                  <Button type="text" size="mini" icon={<IconQuestionCircle />} onClick={() => setHelpVisible(true)}>
                    {t("csp_rule_path_help")}
                  </Button>
                </Space>
              }
            >
              <Input placeholder={t("csp_rule_path_placeholder")} />
            </Form.Item>

            <Form.Item label={t("csp_rule_action")} field="action">
              <Select
                value={formAction}
                onChange={(val) => {
                  setFormAction(val as CSPRuleAction);
                  form.setFieldValue("action", val);
                }}
              >
                <Select.Option value="remove">{t("csp_rule_action_remove")}</Select.Option>
                <Select.Option value="modify">{t("csp_rule_action_modify")}</Select.Option>
              </Select>
            </Form.Item>

            {formAction === "modify" && (
              <Form.Item
                label={t("csp_rule_action_value")}
                field="actionValue"
                rules={[{ required: true, message: t("csp_rule_action_value_required") }]}
              >
                <Input.TextArea
                  placeholder={t("csp_rule_action_value_placeholder")}
                  autoSize={{ minRows: 2, maxRows: 6 }}
                />
              </Form.Item>
            )}

            <Form.Item label={t("csp_rule_priority")} field="priority">
              <InputNumber min={1} max={9999} defaultValue={1} style={{ width: "100%" }} />
            </Form.Item>

            <Form.Item label={t("csp_rule_enabled")} field="enabled" triggerPropName="checked">
              <Switch defaultChecked />
            </Form.Item>
          </Form>
        </Modal>

        {/* 模式测试抽屉 */}
        <Drawer
          title={t("csp_test_title")}
          visible={testDrawerVisible}
          width={480}
          onCancel={() => setTestDrawerVisible(false)}
          footer={
            <Button type="primary" loading={testing} onClick={handleTest} long>
              {t("csp_rule_test")}
            </Button>
          }
          unmountOnExit
        >
          <Space direction="vertical" size="medium" style={{ width: "100%" }}>
            <div>
              <Text bold style={{ display: "block", marginBottom: 8 }}>
                {t("csp_test_pattern")}
              </Text>
              <Input value={testPattern} onChange={setTestPattern} placeholder={t("csp_rule_path_placeholder")} />
            </div>
            <div>
              <Text bold style={{ display: "block", marginBottom: 8 }}>
                {t("csp_test_url")}
              </Text>
              <Input
                value={testUrl}
                onChange={setTestUrl}
                placeholder="https://example.com/page"
                onPressEnter={handleTest}
              />
            </div>

            {testResult && (
              <Card
                style={{
                  marginTop: 8,
                  background: testResult.matched ? "var(--color-success-light-1)" : "var(--color-danger-light-1)",
                }}
                bordered={false}
              >
                <Space direction="vertical" size="small">
                  <Text bold>
                    {testResult.matched ? t("csp_test_result_matched") : t("csp_test_result_not_matched")}
                  </Text>
                  <Text>
                    {t("csp_test_pattern_type")}: {testResult.patternType}
                  </Text>
                  <Paragraph style={{ margin: 0, fontSize: 13 }}>
                    {t("csp_test_details")}: {testResult.details}
                  </Paragraph>
                </Space>
              </Card>
            )}
          </Space>
        </Drawer>

        {/* 模式指南抽屉 */}
        <Drawer
          title={t("csp_guide_title")}
          visible={helpVisible}
          width={520}
          onCancel={() => setHelpVisible(false)}
          unmountOnExit
        >
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
            <div>
              <Title heading={6}>{t("csp_guide_domain_title")}</Title>
              <Paragraph>{t("csp_guide_domain_desc")}</Paragraph>
              <Input.TextArea
                readOnly
                value={`example.com
*.example.com
**.example.com
***.example.com`}
                autoSize={{ minRows: 4 }}
                style={{ marginBottom: 8 }}
              />
              <Paragraph type="secondary" style={{ fontSize: 13 }}>
                *. 仅匹配子域名 | **. 匹配多级子域名 | ***. 同时匹配根域名和多级子域名
              </Paragraph>
            </div>

            <div>
              <Title heading={6}>{t("csp_guide_wildcard_title")}</Title>
              <Paragraph>{t("csp_guide_wildcard_desc")}</Paragraph>
              <Input.TextArea
                readOnly
                value={`*
*://*.example.com/*
https://*.example.com:8080/api/*
http*://test.abc**.com`}
                autoSize={{ minRows: 4 }}
                style={{ marginBottom: 8 }}
              />
              <Paragraph type="secondary" style={{ fontSize: 13 }}>
                * 匹配所有 URL | 域名中 * 匹配单段 | 协议中 * 匹配任意字母或冒号 | **. 匹配多级子域
              </Paragraph>
            </div>

            <div>
              <Title heading={6}>路径通配符（需 ^ 前缀）</Title>
              <Paragraph>
                在路径中使用通配符时，需要在表达式前加 <Text code>^</Text> 显式声明。
              </Paragraph>
              <Input.TextArea
                readOnly
                value={`^http://*.example.com/data/*/result?q=*
^http://**.example.com/data/**file
^http://*.example.com/data/***file`}
                autoSize={{ minRows: 3 }}
                style={{ marginBottom: 8 }}
              />
              <Paragraph type="secondary" style={{ fontSize: 13 }}>
                路径中 * 匹配单级（不含 / 和 ?） | ** 匹配多级（不含 ?） | *** 匹配任意字符（含 / 和 ?）
              </Paragraph>
            </div>

            <div>
              <Title heading={6}>{t("csp_guide_regex_title")}</Title>
              <Paragraph>{t("csp_guide_regex_desc")}</Paragraph>
              <Input.TextArea
                readOnly
                value={String.raw`/https?:\/\/example\.com\/.*/i
/\.test\./`}
                autoSize={{ minRows: 2 }}
                style={{ marginBottom: 8 }}
              />
              <Paragraph type="secondary" style={{ fontSize: 13 }}>
                支持 JavaScript 正则表达式，格式为 /正则体/标志
              </Paragraph>
            </div>

            <div>
              <Title heading={6}>{t("csp_guide_exact_title")}</Title>
              <Paragraph>{t("csp_guide_exact_desc")}</Paragraph>
              <Input.TextArea readOnly value="https://www.example.com/page" autoSize={{ minRows: 1 }} />
            </div>
          </Space>
        </Drawer>
      </Card>
    </div>
  );
}

export default CSPRulePage;
