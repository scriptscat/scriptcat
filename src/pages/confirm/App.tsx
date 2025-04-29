import { ConfirmParam } from "@App/app/service/service_worker/permission_verify";
import { Button, Message, Space } from "@arco-design/web-react";
import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { permissionClient } from "../store/features/script";

function App() {
  const uuid = window.location.search.split("=")[1];
  const [confirm, setConfirm] = React.useState<ConfirmParam>();
  const [likeNum, setLikeNum] = React.useState(0);
  const [second, setSecond] = React.useState(30);

  const { t } = useTranslation();

  if (second === 0) {
    window.close();
  }

  setTimeout(() => {
    setSecond(second - 1);
  }, 1000);

  useEffect(() => {
    window.addEventListener("beforeunload", () => {
      permissionClient.confirm(uuid, {
        allow: false,
        type: 0,
      });
    });

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
  }, []);

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

  return (
    <div className="h-full">
      <Space direction="vertical">
        <span className="text-2xl font-500">{confirm?.title}</span>
        {confirm &&
          confirm.metadata &&
          Object.keys(confirm.metadata).map((key) => (
            <span className="text-base" key={key}>
              {key}: {confirm!.metadata![key]}
            </span>
          ))}
        <span className="text-xl font-500">{confirm?.describe}</span>
        <div>
          <Button type="primary" onClick={handleConfirm(false, 1)}>
            {t("ignore")} ({second})
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

export default App;
