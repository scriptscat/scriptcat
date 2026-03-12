import {
  Button,
  Card,
  Empty,
  Input,
  Message,
  Modal,
  Popconfirm,
  Space,
  Tabs,
  Tag,
  Typography,
} from "@arco-design/web-react";
import { IconDelete, IconEye, IconPlus } from "@arco-design/web-react/icon";
import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useState } from "react";
import type { SkillSummary, SkillRecord, SkillReference, CATToolRecord } from "@App/app/service/agent/types";
import { SkillRepo } from "@App/app/repo/skill_repo";
import { parseSkillMd } from "@App/pkg/utils/skill";
import { agentClient } from "@App/pages/store/features/script";

const skillRepo = new SkillRepo();

// ---- Skill Card ----

function SkillCard({
  skill,
  onDetail,
  onUninstall,
  t,
}: {
  skill: SkillSummary;
  onDetail: () => void;
  onUninstall: () => void;
  t: (key: string, opts?: Record<string, string>) => string;
}) {
  return (
    <div className="tw-group tw-relative tw-rounded-xl tw-p-5 tw-transition-all tw-duration-200 tw-cursor-default tw-bg-[var(--color-bg-2)] tw-shadow-[0_1px_4px_rgba(0,0,0,0.06)] hover:tw-shadow-[0_4px_16px_rgba(0,0,0,0.1)]">
      {/* Header */}
      <div className="tw-flex tw-items-start tw-justify-between tw-mb-3">
        <div className="tw-flex tw-items-center tw-gap-3">
          <div className="tw-w-10 tw-h-10 tw-rounded-lg tw-flex tw-items-center tw-justify-center tw-text-xs tw-font-bold tw-shrink-0 tw-bg-[rgb(var(--arcoblue-1))] tw-text-[rgb(var(--arcoblue-6))]">
            Sk
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
      </div>

      {/* Tags */}
      <div className="tw-flex tw-flex-wrap tw-gap-1.5 tw-mb-3">
        {skill.toolNames.length > 0 && (
          <Tag size="small" color="arcoblue">
            {t("agent_skills_tools")}: {skill.toolNames.length}
          </Tag>
        )}
        {skill.referenceNames.length > 0 && (
          <Tag size="small" color="green">
            {t("agent_skills_references")}: {skill.referenceNames.length}
          </Tag>
        )}
      </div>

      {/* Install time */}
      <div className="tw-text-xs tw-text-[var(--color-text-3)] tw-mb-3">
        {t("agent_skills_installed_at")}: {new Date(skill.installtime).toLocaleString()}
      </div>

      {/* Actions */}
      <div className="tw-flex tw-items-center tw-justify-end tw-gap-0.5 tw-pt-3 tw-border-t tw-border-solid tw-border-[var(--color-border-1)] tw-border-x-0 tw-border-b-0 tw-opacity-60 group-hover:tw-opacity-100 tw-transition-opacity">
        <Button type="text" size="small" icon={<IconEye />} onClick={onDetail}>
          {t("agent_skills_detail")}
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
  const [scripts, setScripts] = useState<CATToolRecord[]>([]);
  const [references, setReferences] = useState<SkillReference[]>([]);
  const [saving, setSaving] = useState(false);

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
          <div className="tw-text-sm tw-font-medium tw-mb-1 tw-text-[var(--color-text-2)]">Name</div>
          <Typography.Text>{skill.name}</Typography.Text>
        </div>
        {skill.description && (
          <div>
            <div className="tw-text-sm tw-font-medium tw-mb-1 tw-text-[var(--color-text-2)]">Description</div>
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

        {/* Scripts */}
        {scripts.length > 0 && (
          <div>
            <div className="tw-text-sm tw-font-medium tw-mb-1 tw-text-[var(--color-text-2)]">
              {t("agent_skills_tools")} ({scripts.length})
            </div>
            <div className="tw-flex tw-flex-wrap tw-gap-1.5">
              {scripts.map((s) => (
                <Tag key={s.name} color="arcoblue">
                  {s.name}
                </Tag>
              ))}
            </div>
          </div>
        )}

        {/* References */}
        {references.length > 0 && (
          <div>
            <div className="tw-text-sm tw-font-medium tw-mb-1 tw-text-[var(--color-text-2)]">
              {t("agent_skills_references")} ({references.length})
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
  );
}

// ---- Install Modal ----

function InstallSkillModal({
  visible,
  onClose,
  onInstalled,
  t,
}: {
  visible: boolean;
  onClose: () => void;
  onInstalled: () => void;
  t: (key: string) => string;
}) {
  const [activeTab, setActiveTab] = useState("url");
  const [url, setUrl] = useState("");
  const [pasteContent, setPasteContent] = useState("");
  const [fetching, setFetching] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [preview, setPreview] = useState<{ name: string; description: string; prompt: string } | null>(null);
  const [skillMdContent, setSkillMdContent] = useState("");
  const [scripts, setScripts] = useState<Array<{ name: string; code: string }>>([]);
  const [references, setReferences] = useState<Array<{ name: string; content: string }>>([]);

  const resetState = () => {
    setUrl("");
    setPasteContent("");
    setPreview(null);
    setSkillMdContent("");
    setScripts([]);
    setReferences([]);
    setActiveTab("url");
  };

  const handleFetchUrl = async () => {
    if (!url.trim()) return;
    setFetching(true);
    try {
      const resp = await fetch(url.trim());
      if (!resp.ok) {
        Message.error(`${t("agent_skills_fetch_failed")}: ${resp.status}`);
        return;
      }
      const text = await resp.text();
      parseAndPreview(text);
    } catch (e: any) {
      Message.error(`${t("agent_skills_fetch_failed")}: ${e.message || e}`);
    } finally {
      setFetching(false);
    }
  };

  const handlePastePreview = () => {
    if (!pasteContent.trim()) return;
    parseAndPreview(pasteContent.trim());
  };

  const parseAndPreview = (content: string) => {
    const parsed = parseSkillMd(content);
    if (!parsed) {
      Message.error("Invalid SKILL.md format");
      return;
    }
    setSkillMdContent(content);
    setPreview({
      name: parsed.metadata.name,
      description: parsed.metadata.description,
      prompt: parsed.prompt,
    });
  };

  const handleInstall = async () => {
    if (!skillMdContent) return;
    setInstalling(true);
    try {
      await agentClient.installSkill({
        skillMd: skillMdContent,
        scripts: scripts.filter((s) => s.name && s.code),
        references: references.filter((r) => r.name && r.content),
      });
      Message.success(t("agent_skills_install_success"));
      onInstalled();
      onClose();
      resetState();
    } catch (e: any) {
      Message.error(e.message || String(e));
    } finally {
      setInstalling(false);
    }
  };

  const handleClose = () => {
    onClose();
    resetState();
  };

  return (
    <Modal
      title={t("agent_skills_install")}
      visible={visible}
      onOk={handleInstall}
      onCancel={handleClose}
      okButtonProps={{ disabled: !preview }}
      confirmLoading={installing}
      autoFocus={false}
      focusLock
      unmountOnExit
      style={{ width: 640 }}
    >
      <Space direction="vertical" size={16} className="tw-w-full">
        <Tabs activeTab={activeTab} onChange={setActiveTab}>
          <Tabs.TabPane key="url" title={t("agent_skills_install_url")}>
            <div className="tw-flex tw-gap-2 tw-mt-3">
              <Input
                className="tw-flex-1"
                value={url}
                onChange={setUrl}
                placeholder="https://example.com/skill.md"
                onPressEnter={handleFetchUrl}
              />
              <Button type="primary" loading={fetching} onClick={handleFetchUrl}>
                {t("agent_skills_install_url")}
              </Button>
            </div>
          </Tabs.TabPane>
          <Tabs.TabPane key="paste" title={t("agent_skills_install_paste")}>
            <div className="tw-mt-3">
              <Input.TextArea
                value={pasteContent}
                onChange={setPasteContent}
                placeholder={"---\nname: my-skill\ndescription: ...\n---\nYour prompt here..."}
                autoSize={{ minRows: 6, maxRows: 12 }}
                style={{ fontFamily: "monospace", fontSize: 13 }}
              />
              <div className="tw-mt-2 tw-flex tw-justify-end">
                <Button type="outline" onClick={handlePastePreview}>
                  Preview
                </Button>
              </div>
            </div>
          </Tabs.TabPane>
        </Tabs>

        {/* Preview */}
        {preview && (
          <Card size="small" title={preview.name}>
            {preview.description && (
              <Typography.Text type="secondary" className="tw-block tw-mb-2">
                {preview.description}
              </Typography.Text>
            )}
            <Typography.Text className="tw-text-xs tw-block" style={{ fontFamily: "monospace" }}>
              {preview.prompt.length > 200 ? preview.prompt.slice(0, 200) + "..." : preview.prompt}
            </Typography.Text>
          </Card>
        )}

        {/* Optional scripts */}
        <div>
          <div className="tw-flex tw-items-center tw-justify-between tw-mb-2">
            <span className="tw-text-sm tw-font-medium tw-text-[var(--color-text-2)]">
              {t("agent_skills_add_script")}
            </span>
            <Button
              size="mini"
              type="text"
              icon={<IconPlus />}
              onClick={() => setScripts([...scripts, { name: "", code: "" }])}
            />
          </div>
          {scripts.map((s, i) => (
            <div key={i} className="tw-mb-2 tw-p-3 tw-rounded-lg tw-bg-[var(--color-fill-1)]">
              <Input
                size="small"
                className="tw-mb-2"
                placeholder="Tool name"
                value={s.name}
                onChange={(v) => {
                  const next = [...scripts];
                  next[i] = { ...next[i], name: v };
                  setScripts(next);
                }}
              />
              <Input.TextArea
                value={s.code}
                onChange={(v) => {
                  const next = [...scripts];
                  next[i] = { ...next[i], code: v };
                  setScripts(next);
                }}
                autoSize={{ minRows: 3, maxRows: 8 }}
                style={{ fontFamily: "monospace", fontSize: 12 }}
              />
              <div className="tw-flex tw-justify-end tw-mt-1">
                <Button
                  size="mini"
                  type="text"
                  status="danger"
                  icon={<IconDelete />}
                  onClick={() => setScripts(scripts.filter((_, j) => j !== i))}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Optional references */}
        <div>
          <div className="tw-flex tw-items-center tw-justify-between tw-mb-2">
            <span className="tw-text-sm tw-font-medium tw-text-[var(--color-text-2)]">
              {t("agent_skills_add_reference")}
            </span>
            <Button
              size="mini"
              type="text"
              icon={<IconPlus />}
              onClick={() => setReferences([...references, { name: "", content: "" }])}
            />
          </div>
          {references.map((r, i) => (
            <div key={i} className="tw-mb-2 tw-p-3 tw-rounded-lg tw-bg-[var(--color-fill-1)]">
              <Input
                size="small"
                className="tw-mb-2"
                placeholder="Reference name"
                value={r.name}
                onChange={(v) => {
                  const next = [...references];
                  next[i] = { ...next[i], name: v };
                  setReferences(next);
                }}
              />
              <Input.TextArea
                value={r.content}
                onChange={(v) => {
                  const next = [...references];
                  next[i] = { ...next[i], content: v };
                  setReferences(next);
                }}
                autoSize={{ minRows: 3, maxRows: 8 }}
                style={{ fontFamily: "monospace", fontSize: 12 }}
              />
              <div className="tw-flex tw-justify-end tw-mt-1">
                <Button
                  size="mini"
                  type="text"
                  status="danger"
                  icon={<IconDelete />}
                  onClick={() => setReferences(references.filter((_, j) => j !== i))}
                />
              </div>
            </div>
          ))}
        </div>
      </Space>
    </Modal>
  );
}

// ---- Main Page ----

function AgentSkills() {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailSkill, setDetailSkill] = useState<SkillRecord | null>(null);
  const [installVisible, setInstallVisible] = useState(false);

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

  return (
    <Space className="tw-w-full tw-h-full tw-overflow-auto tw-relative" direction="vertical">
      <Card
        title={t("agent_skills_title")}
        bordered={false}
        extra={
          <Button type="primary" icon={<IconPlus />} onClick={() => setInstallVisible(true)}>
            {t("agent_skills_add")}
          </Button>
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

      <InstallSkillModal
        visible={installVisible}
        onClose={() => setInstallVisible(false)}
        onInstalled={loadSkills}
        t={t}
      />
    </Space>
  );
}

export default AgentSkills;
