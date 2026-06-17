import { useEffect, useState } from "react";
import { SettingCard } from "../../../components/SettingCard";
import { SettingRow } from "../../../components/SettingRow";
import { Switch } from "@App/pages/components/ui/switch";
import { Button } from "@App/pages/components/ui/button";
import FileSystemParams from "../../../components/FileSystemParams";
import { systemConfig } from "@App/pages/store/global";
import FileSystemFactory from "@Packages/filesystem/factory";
import { isPermissionOk, isFirefox } from "@App/pkg/utils/utils";
import { t } from "@App/locales/locales";
import { toast } from "sonner";
import type { CATFileStorage } from "@App/pkg/config/config";

const STORAGE_EXAMPLE_URL = "https://github.com/scriptscat/scriptcat/blob/main/example/cat_file_storage.js";

export function RuntimeSection({ register }: { register: (id: string) => (el: HTMLElement | null) => void }) {
  const [bg, setBg] = useState(false);
  const [storage, setStorage] = useState<CATFileStorage | undefined>(undefined);

  useEffect(() => {
    if (!isFirefox()) {
      isPermissionOk("background").then((r) => {
        if (r !== null) setBg(r);
      });
    }
    Promise.resolve(systemConfig.get("cat_file_storage")).then((v) => setStorage(v as CATFileStorage));
  }, []);

  const toggleBg = (enable: boolean) => {
    if (enable) {
      chrome.permissions.request({ permissions: ["background"] }, (granted) => {
        if (chrome.runtime.lastError) {
          toast.error(t("settings:enable_background.enable_failed")!);
          return;
        }
        setBg(granted);
      });
    } else {
      chrome.permissions.remove({ permissions: ["background"] }, (removed) => {
        if (chrome.runtime.lastError) {
          toast.error(t("settings:enable_background.disable_failed")!);
          return;
        }
        if (removed) {
          setBg(false);
        } else {
          isPermissionOk("background").then((r) => {
            if (r !== null) setBg(r);
          });
        }
      });
    }
  };

  const storageStatusLabel =
    storage?.status === "success"
      ? t("editor:in_use")
      : storage?.status === "error"
        ? t("editor:storage_error")
        : t("editor:not_set");

  const saveStorage = async () => {
    if (!storage) return;
    try {
      await FileSystemFactory.create(storage.filesystem, storage.params[storage.filesystem]);
    } catch (e) {
      toast.error(`${t("editor:account_validation_failed")}: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    const next: CATFileStorage = { ...storage, status: "success" };
    setStorage(next);
    systemConfig.set("cat_file_storage", next);
    toast.success(t("save_success"));
  };

  const resetStorage = () => {
    const next: CATFileStorage = { status: "unset", filesystem: "webdav", params: {} };
    setStorage(next);
    systemConfig.set("cat_file_storage", next);
  };

  const openDirectory = async () => {
    if (!storage) return;
    try {
      let fs = await FileSystemFactory.create(storage.filesystem, storage.params[storage.filesystem]);
      fs = await fs.openDir("ScriptCat/app");
      window.open(await fs.getDirUrl(), "_blank");
    } catch (e) {
      toast.error(`${t("editor:account_validation_failed")}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <SettingCard id="runtime" title={t("logs:runtime")} register={register}>
      {!isFirefox() && (
        <SettingRow
          label={t("settings:enable_background.title")}
          description={t("settings:enable_background.description")}
        >
          <Switch checked={bg} onCheckedChange={toggleBg} />
        </SettingRow>
      )}

      {storage && (
        <div className="flex flex-col gap-3 pt-2">
          <div className="text-[13px] font-semibold text-foreground">{t("editor:storage_api")}</div>
          <FileSystemParams
            headerContent={
              <span className="text-sm text-muted-foreground">
                {t("editor:settings")}{" "}
                <a className="text-primary hover:underline" href={STORAGE_EXAMPLE_URL} target="_blank" rel="noreferrer">
                  CAT_fileStorage
                </a>{" "}
                {t("editor:use_file_system")}
              </span>
            }
            fileSystemType={storage.filesystem}
            fileSystemParams={storage.params[storage.filesystem] || {}}
            onChangeFileSystemType={(type) => setStorage((s) => (s ? { ...s, filesystem: type } : s))}
            onChangeFileSystemParams={(params) =>
              setStorage((s) => (s ? { ...s, params: { ...s.params, [s.filesystem]: params } } : s))
            }
          >
            <Button aria-label="cat_storage_save" size="sm" onClick={saveStorage}>
              {t("save")}
            </Button>
            <Button aria-label="cat_storage_reset" size="sm" variant="destructive" onClick={resetStorage}>
              {t("reset")}
            </Button>
            <Button aria-label="cat_storage_open" size="sm" variant="secondary" onClick={openDirectory}>
              {t("editor:open_directory")}
            </Button>
          </FileSystemParams>
          <span
            className={
              storage.status === "success"
                ? "text-xs text-success-fg"
                : storage.status === "error"
                  ? "text-xs text-destructive"
                  : "text-xs text-muted-foreground"
            }
          >
            {storageStatusLabel}
          </span>
        </div>
      )}
    </SettingCard>
  );
}
