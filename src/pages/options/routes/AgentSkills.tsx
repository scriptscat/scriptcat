import { Button, Card, Empty, Input, Message, Modal, Popconfirm, Space, Tag, Typography } from "@arco-design/web-react";
import { IconDelete, IconEye, IconPlus } from "@arco-design/web-react/icon";
import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SkillSummary, SkillRecord, SkillReference, CATToolRecord } from "@App/app/service/agent/types";
import { SkillRepo } from "@App/app/repo/skill_repo";
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

// ---- Main Page ----

function AgentSkills() {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailSkill, setDetailSkill] = useState<SkillRecord | null>(null);
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
    </Space>
  );
}

export default AgentSkills;
