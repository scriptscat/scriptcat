import type { ConfirmParam } from "@App/app/service/service_worker/permission_verify";
import { Button, Message, Space } from "@arco-design/web-react";
import React, { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { permissionClient } from "../store/features/script";

// 权限确认组件
function PermissionConfirmRequest({ uuid }: { uuid: string }) {
  const [confirm, setConfirm] = React.useState<ConfirmParam>();
  const [likeNum, setLikeNum] = React.useState(0);
  const [second, setSecond] = React.useState(30);

  const { t } = useTranslation();

  useEffect(() => {
    const timer = setInterval(() => {
      setSecond((s) => {
        if (s <= 1) {
          clearInterval(timer);
          window.close();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handler = () => {
      permissionClient.confirm(uuid, {
        allow: false,
        type: 0,
      });
    };
    window.addEventListener("beforeunload", handler, false);
    return () => window.removeEventListener("beforeunload", handler, false);
  }, [uuid]);

  useEffect(() => {
    permissionClient
      .getPermissionInfo(uuid)
      .then((data) => {
        console.log(data);
        setConfirm(data.confirm);
        setLikeNum(data.likeNum);
      })
      .catch((e: any) => {
        Message.error(e.message || t("get_confirm_error"));
      });
  }, [uuid, t]);

  const handleConfirm = (allow: boolean, type: number) => {
    return async () => {
      try {
        await permissionClient.confirm(uuid, {
          allow,
          type,
        });
        window.close();
      } catch (e: any) {
        Message.error(e.message || t("confirm_error"));
        setTimeout(() => {
          window.close();
        }, 3000);
      }
    };
  };

  const metadata = useMemo(() => (confirm && confirm.metadata && Object.keys(confirm.metadata)) || [], [confirm]);

  return (
    <div className="tw-h-full">
      <Space direction="vertical">
        <span className="tw-text-2xl tw-font-500">{confirm?.title}</span>
        {metadata.map((key) => (
          <span className="tw-text-base" key={key}>
            {`${key}: ${confirm!.metadata![key]}`}
          </span>
        ))}
        <span className="tw-text-xl tw-font-500">{confirm?.describe}</span>
        <div>
          <Button type="primary" onClick={handleConfirm(false, 1)}>
            {`${t("ignore")} (${second})`}
          </Button>
        </div>
        <div>
          <Space>
            <Button onClick={handleConfirm(true, 1)} status="success">
              {t("allow_once")}
            </Button>
            <Button onClick={handleConfirm(true, 3)} status="success">
              {t("temporary_allow", {
                permissionContent: confirm?.permissionContent,
              })}
            </Button>
            {likeNum > 2 && (
              <Button onClick={handleConfirm(true, 2)} status="success">
                {t("temporary_allow_all", {
                  permissionContent: confirm?.permissionContent,
                })}
              </Button>
            )}
            <Button onClick={handleConfirm(true, 5)} status="success">
              {t("permanent_allow", {
                permissionContent: confirm?.permissionContent,
              })}
            </Button>
            {likeNum > 2 && (
              <Button onClick={handleConfirm(true, 4)} status="success">
                {t("permanent_allow_all", {
                  permissionContent: confirm?.permissionContent,
                })}
              </Button>
            )}
          </Space>
        </div>
        <div>
          <Space>
            <Button onClick={handleConfirm(false, 1)} status="danger">
              {t("deny_once")}
            </Button>
            <Button onClick={handleConfirm(false, 3)} status="danger">
              {t("temporary_deny", {
                permissionContent: confirm?.permissionContent,
              })}
            </Button>
            {likeNum > 2 && (
              <Button onClick={handleConfirm(false, 2)} status="danger">
                {t("temporary_deny_all", {
                  permissionContent: confirm?.permissionContent,
                })}
              </Button>
            )}
            <Button onClick={handleConfirm(false, 5)} status="danger">
              {t("permanent_deny", {
                permissionContent: confirm?.permissionContent,
              })}
            </Button>
            {likeNum > 2 && (
              <Button onClick={handleConfirm(false, 4)} status="danger">
                {t("permanent_deny_all", {
                  permissionContent: confirm?.permissionContent,
                })}
              </Button>
            )}
          </Space>
        </div>
      </Space>
    </div>
  );
}

function App() {
  const params = new URLSearchParams(location.search);
  const uuid = params.get("uuid");

  if (uuid) {
    return <PermissionConfirmRequest uuid={uuid} />;
  }

  return null;
}

export default App;
