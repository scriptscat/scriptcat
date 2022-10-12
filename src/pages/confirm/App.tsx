import PermissionController from "@App/app/service/permission/controller";
import { ConfirmParam } from "@App/runtime/background/permission_verify";
import { Button, Message, Space } from "@arco-design/web-react";
import React, { useEffect } from "react";

function App() {
  // 从query中获取uuid
  const uuid = window.location.search.split("=")[1];
  const [confirm, setConfirm] = React.useState<ConfirmParam>();
  const [likeNum, setLikeNum] = React.useState(0);
  // 秒数
  const [second, setSecond] = React.useState(30);
  // 超时关闭
  if (second === 0) {
    window.close();
  }
  setTimeout(() => {
    setSecond(second - 1);
  }, 1000);
  useEffect(() => {
    // 拦截关闭
    window.addEventListener("beforeunload", () => {
      PermissionController.getInstance().sendConfirm(uuid, {
        allow: false,
        type: 0,
      });
    });
    // 通过uuid获取确认信息
    PermissionController.getInstance()
      .getConfirm(uuid)
      .then((data) => {
        setConfirm(data.confirm);
        setLikeNum(data.likeNum);
      })
      .catch((e: any) => {
        Message.error(e.message || "获取确认信息失败");
      });
  }, []);
  const handleConfirm = (allow: boolean, type: number) => {
    return async () => {
      try {
        await PermissionController.getInstance().sendConfirm(uuid, {
          allow,
          type,
        });
        window.close();
      } catch (e: any) {
        Message.error(e.message || "confirm error");
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
            忽略({second})
          </Button>
        </div>
        <div>
          <Space>
            <Button onClick={handleConfirm(true, 1)} status="success">
              允许一次
            </Button>
            <Button onClick={handleConfirm(true, 3)} status="success">
              临时允许此{confirm?.permissionContent}
            </Button>
            {likeNum > 2 && (
              <Button onClick={handleConfirm(true, 2)} status="success">
                临时允许全部{confirm?.permissionContent}
              </Button>
            )}
            <Button onClick={handleConfirm(true, 5)} status="success">
              永久允许此{confirm?.permissionContent}
            </Button>
            {likeNum > 2 && (
              <Button onClick={handleConfirm(true, 4)} status="success">
                永久允许全部{confirm?.permissionContent}
              </Button>
            )}
          </Space>
        </div>
        <div>
          <Space>
            <Button onClick={handleConfirm(false, 1)} status="danger">
              拒绝一次
            </Button>
            <Button onClick={handleConfirm(false, 3)} status="danger">
              临时拒绝此{confirm?.permissionContent}
            </Button>
            {likeNum > 2 && (
              <Button onClick={handleConfirm(false, 2)} status="danger">
                临时拒绝全部{confirm?.permissionContent}
              </Button>
            )}
            <Button onClick={handleConfirm(false, 5)} status="danger">
              永久拒绝此{confirm?.permissionContent}
            </Button>
            {likeNum > 2 && (
              <Button onClick={handleConfirm(false, 4)} status="danger">
                永久拒绝全部{confirm?.permissionContent}
              </Button>
            )}
          </Space>
        </div>
      </Space>
    </div>
  );
}

export default App;
