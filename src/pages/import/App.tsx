import React from "react";
import { Card, Space } from "@arco-design/web-react";

function App() {
  // const [data, setData] = React.useState([]);
  // const syncCtrl = IoC.instance(SynchronizeController) as SynchronizeController;
  // const url = new URL(window.location.href);
  // const uuid = url.searchParams.get("uuid") || "";
  // useEffect(() => {
  //   syncCtrl
  //     .fetchImportInfo(uuid)
  //     .then((resp: { filename: string; url: string }) => {
  //       // syncCtrl.
  //     })
  //     .catch((e) => {
  //       Message.error(`获取导入信息失败: ${e}`);
  //     });
  // }, []);
  return (
    <div>
      <Card bordered={false} title="数据导入">
        <Space direction="vertical" />
      </Card>
    </div>
  );
}

export default App;
