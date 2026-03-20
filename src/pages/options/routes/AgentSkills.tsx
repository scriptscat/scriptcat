import {
  Button,
  Card,
  Empty,
  Input,
  InputNumber,
  Message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
} from "@arco-design/web-react";
import { IconDelete, IconEye, IconPlus, IconRefresh, IconSettings } from "@arco-design/web-react/icon";
import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  SkillSummary,
  SkillRecord,
  SkillReference,
  SkillScriptRecord,
  SkillConfigField,
} from "@App/app/service/agent/types";
import { SkillRepo } from "@App/app/repo/skill_repo";
import { agentClient } from "@App/pages/store/features/script";

const skillRepo = new SkillRepo();

// ---- Skill Card ----

function SkillCard({
  skill,
  onDetail,
  onUninstall,
  onRefresh,
  onConfig,
  onToggleEnabled,
  t,
}: {
  skill: SkillSummary;
  onDetail: () => void;
  onUninstall: () => void;
  onRefresh: () => void;
  onConfig?: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  t: (key: string, opts?: Record<string, string>) => string;
}) {
  const enabled = skill.enabled !== false;
  return (
    <div
      className={`tw-group tw-relative tw-rounded-xl tw-p-5 tw-transition-all tw-duration-200 tw-cursor-default tw-bg-[var(--color-bg-2)] tw-shadow-[0_1px_4px_rgba(0,0,0,0.06)] hover:tw-shadow-[0_4px_16px_rgba(0,0,0,0.1)] ${!enabled ? "tw-opacity-60" : ""}`}
    >
      {/* Header */}
      <div className="tw-flex tw-items-start tw-justify-between tw-mb-3">
        <div className="tw-flex tw-items-center tw-gap-3">
          <div className="tw-w-10 tw-h-10 tw-rounded-lg tw-flex tw-items-center tw-justify-center tw-text-xs tw-font-bold tw-shrink-0 tw-bg-[rgb(var(--arcoblue-1))] tw-text-[rgb(var(--arcoblue-6))]">
            {"Sk"}
          </div>
          <div className="tw-flex tw-flex-col tw-gap-0.5">
            <Typography.Text className="tw-font-semibold tw-text-base !tw-mb-0">{skill.name}</Typography.Text>
            {skill.description && (
              <Typography.Text type="secondary" className="tw-text-xs !tw-mb-0">
                {skill.description}
              </Typography.Text>
            )}
          </div>
        </div>
        <Switch size="small" checked={enabled} onChange={onToggleEnabled} />
      </div>

      {/* Tags */}
      <div className="tw-flex tw-flex-wrap tw-gap-1.5 tw-mb-3">
        {skill.toolNames.length > 0 && (
          <Tag size="small" color="arcoblue">
            {t("agent_skills_tools")}
            {": "}
            {skill.toolNames.length}
          </Tag>
        )}
        {skill.referenceNames.length > 0 && (
          <Tag size="small" color="green">
            {t("agent_skills_references")}
            {": "}
            {skill.referenceNames.length}
          </Tag>
        )}
        {skill.hasConfig && (
          <Tag size="small" color="orange">
            {t("agent_skills_config")}
          </Tag>
        )}
      </div>

      {/* Install time */}
      <div className="tw-text-xs tw-text-[var(--color-text-3)] tw-mb-3">
        {t("agent_skills_installed_at")}
        {": "}
        {new Date(skill.installtime).toLocaleString()}
      </div>

      {/* Actions */}
      <div className="tw-flex tw-items-center tw-justify-end tw-gap-0.5 tw-pt-3 tw-border-t tw-border-solid tw-border-[var(--color-border-1)] tw-border-x-0 tw-border-b-0 tw-opacity-60 group-hover:tw-opacity-100 tw-transition-opacity">
        <Button type="text" size="small" icon={<IconEye />} onClick={onDetail}>
          {t("agent_skills_detail")}
        </Button>
        {skill.hasConfig && onConfig && (
          <Button type="text" size="small" icon={<IconSettings />} onClick={onConfig}>
            {t("agent_skills_config")}
          </Button>
        )}
        <Button type="text" size="small" icon={<IconRefresh />} onClick={onRefresh}>
          {t("agent_skills_refresh")}
        </Button>
        <Popconfirm title={t("agent_skills_uninstall_confirm", { name: skill.name })} onOk={onUninstall}>
          <Button type="text" size="small" status="danger" icon={<IconDelete />}>
            {t("agent_skills_uninstall")}
          </Button>
        </Popconfirm>
      </div>
    </div>
  );
}

// ---- Tool Code Viewer Modal ----

function ToolCodeModal({
  visible,
  tool,
  onClose,
  t,
}: {
  visible: boolean;
  tool: SkillScriptRecord | null;
  onClose: () => void;
  t: (key: string) => string;
}) {
  if (!tool) return null;

  return (
    <Modal
      title={`${t("agent_skills_tool_code")} - ${tool.name}`}
      visible={visible}
      onCancel={onClose}
      footer={
        <Button type="primary" onClick={onClose}>
          {t("confirm")}
        </Button>
      }
      autoFocus={false}
      focusLock
      unmountOnExit
      style={{ width: 720 }}
    >
      <pre
        style={{
          background: "var(--color-fill-2)",
          borderRadius: 8,
          padding: 16,
          fontSize: 13,
          fontFamily: "monospace",
          overflow: "auto",
          maxHeight: 480,
          margin: 0,
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
        }}
      >
        {tool.code}
      </pre>
    </Modal>
  );
}

// ---- Config Modal ----

function SkillConfigModal({
  visible,
  skill,
  onClose,
  t,
}: {
  visible: boolean;
  skill: SkillRecord | null;
  onClose: () => void;
  t: (key: string) => string;
}) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && skill?.config) {
      setLoading(true);
      agentClient
        .getSkillConfigValues(skill.name)
        .then((saved) => {
          // 用 default 值填充未保存的字段
          const merged: Record<string, unknown> = {};
          for (const [key, field] of Object.entries(skill.config!)) {
            merged[key] = saved[key] !== undefined ? saved[key] : (field.default ?? "");
          }
          setValues(merged);
        })
        .catch(() => {
          // 初始化为默认值
          const defaults: Record<string, unknown> = {};
          for (const [key, field] of Object.entries(skill.config!)) {
            defaults[key] = field.default ?? "";
          }
          setValues(defaults);
        })
        .finally(() => setLoading(false));
    }
  }, [visible, skill]);

  const handleSave = async () => {
    if (!skill) return;
    setSaving(true);
    try {
      await agentClient.saveSkillConfig({ name: skill.name, values });
      Message.success(t("agent_skills_config_saved"));
      onClose();
    } catch (e: any) {
      Message.error(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!skill?.config) return null;

  const renderField = (key: string, field: SkillConfigField) => {
    const value = values[key];
    const onChange = (v: unknown) => setValues((prev) => ({ ...prev, [key]: v }));
    const label = (
      <div className="tw-text-sm tw-font-medium tw-mb-1 tw-text-[var(--color-text-2)]">
        {field.title || key}
        {field.required && <span className="tw-text-red-500 tw-ml-0.5">{"*"}</span>}
      </div>
    );

    switch (field.type) {
      case "number":
        return (
          <div key={key}>
            {label}
            <InputNumber value={value as number} onChange={(v) => onChange(v)} className="tw-w-full" />
          </div>
        );
      case "select":
        return (
          <div key={key}>
            {label}
            <Select value={value as string} onChange={(v) => onChange(v)} className="tw-w-full">
              {(field.values || []).map((v) => (
                <Select.Option key={v} value={v}>
                  {v}
                </Select.Option>
              ))}
            </Select>
          </div>
        );
      case "switch":
        return (
          <div key={key} className="tw-flex tw-items-center tw-justify-between">
            <span className="tw-text-sm tw-font-medium tw-text-[var(--color-text-2)]">
              {field.title || key}
              {field.required && <span className="tw-text-red-500 tw-ml-0.5">{"*"}</span>}
            </span>
            <Switch checked={!!value} onChange={(v) => onChange(v)} />
          </div>
        );
      default: // text
        return (
          <div key={key}>
            {label}
            {field.secret ? (
              <Input.Password value={String(value || "")} onChange={(v) => onChange(v)} />
            ) : (
              <Input value={String(value || "")} onChange={(v) => onChange(v)} />
            )}
          </div>
        );
    }
  };

  return (
    <Modal
      title={`${t("agent_skills_config")} - ${skill.name}`}
      visible={visible}
      onOk={handleSave}
      onCancel={onClose}
      confirmLoading={saving}
      autoFocus={false}
      focusLock
      unmountOnExit
      style={{ width: 520 }}
    >
      {loading ? (
        <div className="tw-py-8 tw-text-center tw-text-[var(--color-text-3)]">{"Loading..."}</div>
      ) : (
        <Space direction="vertical" size={12} className="tw-w-full">
          {Object.entries(skill.config).map(([key, field]) => renderField(key, field))}
        </Space>
      )}
    </Modal>
  );
}

// ---- Detail/Edit Modal ----

function SkillDetailModal({
  visible,
  skill,
  onClose,
  onSaved,
  t,
}: {
  visible: boolean;
  skill: SkillRecord | null;
  onClose: () => void;
  onSaved: () => void;
  t: (key: string) => string;
}) {
  const [prompt, setPrompt] = useState("");
  const [scripts, setScripts] = useState<SkillScriptRecord[]>([]);
  const [references, setReferences] = useState<SkillReference[]>([]);
  const [saving, setSaving] = useState(false);
  const [viewingTool, setViewingTool] = useState<SkillScriptRecord | null>(null);

  useEffect(() => {
    if (skill) {
      setPrompt(skill.prompt);
      // Load scripts and references
      skillRepo.getSkillScripts(skill.name).then(setScripts);
      skillRepo.getSkillReferences(skill.name).then(setReferences);
    }
  }, [skill]);

  const handleSave = async () => {
    if (!skill) return;
    setSaving(true);
    try {
      const skillMd = `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n${prompt}`;
      await agentClient.installSkill({
        skillMd,
        scripts: scripts.map((s) => ({ name: s.name, code: s.code })),
        references: references.map((r) => ({ name: r.name, content: r.content })),
      });
      Message.success(t("agent_skills_save_success"));
      onSaved();
      onClose();
    } catch (e: any) {
      Message.error(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!skill) return null;

  return (
    <>
      <Modal
        title={t("agent_skills_detail")}
        visible={visible}
        onOk={handleSave}
        onCancel={onClose}
        confirmLoading={saving}
        autoFocus={false}
        focusLock
        unmountOnExit
        style={{ width: 640 }}
      >
        <Space direction="vertical" size={16} className="tw-w-full">
          {/* Name & Description (read-only) */}
          <div>
            <div className="tw-text-sm tw-font-medium tw-mb-1 tw-text-[var(--color-text-2)]">{"Name"}</div>
            <Typography.Text>{skill.name}</Typography.Text>
          </div>
          {skill.description && (
            <div>
              <div className="tw-text-sm tw-font-medium tw-mb-1 tw-text-[var(--color-text-2)]">{"Description"}</div>
              <Typography.Text type="secondary">{skill.description}</Typography.Text>
            </div>
          )}

          {/* Prompt (editable) */}
          <div>
            <div className="tw-text-sm tw-font-medium tw-mb-1 tw-text-[var(--color-text-2)]">
              {t("agent_skills_prompt")}
            </div>
            <Input.TextArea
              value={prompt}
              onChange={setPrompt}
              autoSize={{ minRows: 6, maxRows: 16 }}
              style={{ fontFamily: "monospace", fontSize: 13 }}
            />
          </div>

          {/* Scripts - clickable to view code */}
          {scripts.length > 0 && (
            <div>
              <div className="tw-text-sm tw-font-medium tw-mb-1 tw-text-[var(--color-text-2)]">
                {t("agent_skills_tools")} {"("}
                {scripts.length}
                {")"}
              </div>
              <div className="tw-flex tw-flex-wrap tw-gap-1.5">
                {scripts.map((s) => (
                  <Tag
                    key={s.name}
                    color="arcoblue"
                    className="tw-cursor-pointer hover:tw-opacity-80"
                    onClick={() => setViewingTool(s)}
                  >
                    {s.name}
                  </Tag>
                ))}
              </div>
              <div className="tw-text-xs tw-text-[var(--color-text-3)] tw-mt-1">
                {t("agent_skills_click_to_view_code")}
              </div>
            </div>
          )}

          {/* References */}
          {references.length > 0 && (
            <div>
              <div className="tw-text-sm tw-font-medium tw-mb-1 tw-text-[var(--color-text-2)]">
                {t("agent_skills_references")} {"("}
                {references.length}
                {")"}
              </div>
              <div className="tw-flex tw-flex-wrap tw-gap-1.5">
                {references.map((r) => (
                  <Tag key={r.name} color="green">
                    {r.name}
                  </Tag>
                ))}
              </div>
            </div>
          )}
        </Space>
      </Modal>

      <ToolCodeModal visible={!!viewingTool} tool={viewingTool} onClose={() => setViewingTool(null)} t={t} />
    </>
  );
}

// ---- Main Page ----

function AgentSkills() {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailSkill, setDetailSkill] = useState<SkillRecord | null>(null);
  const [configVisible, setConfigVisible] = useState(false);
  const [configSkill, setConfigSkill] = useState<SkillRecord | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadSkills = useCallback(async () => {
    const list = await skillRepo.listSkills();
    setSkills(list);
  }, []);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  const handleDetail = async (name: string) => {
    const record = await skillRepo.getSkill(name);
    if (record) {
      setDetailSkill(record);
      setDetailVisible(true);
    }
  };

  const handleUninstall = async (name: string) => {
    await agentClient.removeSkill(name);
    loadSkills();
  };

  const handleConfig = async (name: string) => {
    const record = await skillRepo.getSkill(name);
    if (record?.config) {
      setConfigSkill(record);
      setConfigVisible(true);
    }
  };

  const handleToggleEnabled = async (name: string, enabled: boolean) => {
    try {
      await agentClient.setSkillEnabled(name, enabled);
      await loadSkills();
    } catch (e: any) {
      Message.error(e.message || String(e));
    }
  };

  const handleRefresh = async (name: string) => {
    try {
      await agentClient.refreshSkill(name);
      await loadSkills();
      Message.success(t("agent_skills_refresh_success"));
    } catch (e: any) {
      Message.error(e.message || String(e));
    }
  };

  // 选择 ZIP 文件后走安装页面流程
  const handleZipFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      const uuid = await agentClient.prepareSkillInstall(base64);
      window.open(`/src/install.html?skill=${uuid}`, "_blank");
    } catch (err: any) {
      Message.error(err.message || String(err));
    } finally {
      // 清空 input 以便再次选择相同文件
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <Space className="tw-w-full tw-h-full tw-overflow-auto tw-relative" direction="vertical">
      <Card
        title={t("agent_skills_title")}
        bordered={false}
        extra={
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              onChange={handleZipFileSelect}
              style={{ display: "none" }}
            />
            <Button type="primary" icon={<IconPlus />} onClick={() => fileInputRef.current?.click()}>
              {t("agent_skills_add")}
            </Button>
          </>
        }
      >
        {skills.length === 0 ? (
          <div className="tw-py-12">
            <Empty description={t("agent_skills_empty")} />
          </div>
        ) : (
          <div className="tw-grid tw-grid-cols-1 md:tw-grid-cols-2 tw-gap-4">
            {skills.map((skill) => (
              <SkillCard
                key={skill.name}
                skill={skill}
                onDetail={() => handleDetail(skill.name)}
                onUninstall={() => handleUninstall(skill.name)}
                onRefresh={() => handleRefresh(skill.name)}
                onConfig={skill.hasConfig ? () => handleConfig(skill.name) : undefined}
                onToggleEnabled={(enabled) => handleToggleEnabled(skill.name, enabled)}
                t={t}
              />
            ))}
          </div>
        )}
      </Card>

      <SkillDetailModal
        visible={detailVisible}
        skill={detailSkill}
        onClose={() => setDetailVisible(false)}
        onSaved={loadSkills}
        t={t}
      />

      <SkillConfigModal visible={configVisible} skill={configSkill} onClose={() => setConfigVisible(false)} t={t} />
    </Space>
  );
}

export default AgentSkills;
