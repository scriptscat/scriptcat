const grantValuePrompts = {
  none: "Không yêu cầu quyền GM API đặc biệt; script chạy gần giống script trang thông thường.",
  unsafeWindow: "Truy cập đối tượng window thật của trang để tương tác với script gốc của trang.",
  GM_getValue: "Đọc một giá trị từ bộ nhớ lưu trữ bền vững của script.",
  GM_getValues: "Đọc nhiều giá trị từ bộ nhớ lưu trữ bền vững của script.",
  GM_setValue: "Ghi một giá trị vào bộ nhớ lưu trữ bền vững của script.",
  GM_setValues: "Ghi nhiều giá trị vào bộ nhớ lưu trữ bền vững của script.",
  GM_deleteValue: "Xóa một giá trị khỏi bộ nhớ lưu trữ bền vững của script.",
  GM_deleteValues: "Xóa nhiều giá trị khỏi bộ nhớ lưu trữ bền vững của script.",
  GM_listValues: "Liệt kê tất cả khóa trong bộ nhớ lưu trữ bền vững của script.",
  GM_addValueChangeListener: "Theo dõi thay đổi của giá trị trong bộ nhớ script.",
  GM_removeValueChangeListener: "Gỡ bộ lắng nghe thay đổi giá trị trong bộ nhớ script.",
  GM_xmlhttpRequest: "Gửi yêu cầu mạng cross-origin; host đích thường cần được cho phép bằng @connect.",
  GM_download:
    "Tải tệp xuống. Nhận URL và tên tệp, hoặc đối tượng chi tiết có các trường như url, name, headers, saveAs, và trả về handle có thể abort.",
  GM_openInTab: "Mở tab mới, có thể chọn mở ở nền hoặc phía trước.",
  GM_closeInTab: "Đóng tab do script mở hoặc quản lý.",
  GM_getTab: "Đọc dữ liệu tạm thời gắn với tab hiện tại.",
  GM_saveTab: "Lưu dữ liệu tạm thời gắn với tab hiện tại.",
  GM_getTabs: "Đọc tất cả dữ liệu tab tạm thời mà script đã lưu.",
  GM_notification: "Hiển thị thông báo trình duyệt và xử lý các sự kiện như nhấp hoặc đóng.",
  GM_closeNotification: "Đóng một thông báo script cụ thể.",
  GM_updateNotification: "Cập nhật một thông báo script cụ thể.",
  GM_setClipboard: "Ghi vào clipboard hệ thống.",
  GM_registerMenuCommand: "Đăng ký lệnh menu của script.",
  GM_unregisterMenuCommand: "Hủy đăng ký lệnh menu của script.",
  CAT_registerMenuInput: "API ScriptCat: đăng ký lệnh menu script có ô nhập.",
  CAT_unregisterMenuInput: "API ScriptCat: hủy đăng ký lệnh menu script có ô nhập.",
  GM_addStyle: "Chèn CSS vào trang.",
  GM_addElement: "Tạo và chèn phần tử vào trang.",
  GM_getResourceText: "Đọc nội dung văn bản của tài nguyên khai báo bằng @resource.",
  GM_getResourceURL: "Lấy URL của tài nguyên khai báo bằng @resource.",
  GM_cookie: "Truy cập Cookie API để đọc, ghi hoặc xóa cookie.",
  GM_audio: "Điều khiển và theo dõi trạng thái tắt tiếng và phát âm thanh của tab trình duyệt hiện tại.",
  CAT_fetchBlob: "API nội bộ ScriptCat: đọc tài nguyên có thể truy cập từ phía tiện ích và trả về Blob.",
  CAT_fileStorage: "API ScriptCat: truy cập bộ nhớ tệp của script.",
  CAT_userConfig: "API ScriptCat: truy cập cấu hình người dùng của script.",
  CAT_scriptLoaded: "API ScriptCat: chờ script tải hoàn tất trong tình huống @early-start.",
  "window.close": "Cho phép script gọi window.close().",
  "window.focus": "Cho phép script gọi window.focus().",
  "window.onurlchange": "Cho phép script lắng nghe sự kiện thay đổi URL.",
} as const;

export default {
  title: "Tiếng Việt",
  thisIsAUserScript: "Một user script",
  undefinedPrompt: "Prompt chưa được định nghĩa",
  quickfix: "Sửa lỗi {0}",
  addEslintDisableNextLine: "Thêm chú thích eslint-disable-next-line",
  addEslintDisable: "Thêm chú thích eslint-disable",
  declareGlobal: "Khai báo '{0}' là biến toàn cục (/* global */)",
  removeConnectWildcard: "Bỏ ký tự đại diện @connect: {0}",
  replaceMatchTldWildcardWithInclude: "Thay wildcard TLD @match bằng @include {0}",
  replaceIncludeWithMatch: "Thay @include bằng @match {0}",
  grantConflict: "@grant none không thể dùng cùng GM API. Hãy xóa none hoặc tất cả GM API.",
  grantValuePrompts,
  prompt: {
    name: "Tên script",
    namespace: "Namespace của script",
    copyright: "Thông tin bản quyền của script",
    license: "Giấy phép mã nguồn mở của script",
    version: "Phiên bản script",
    description: "Mô tả script",
    icon: "Biểu tượng script",
    iconURL: "Biểu tượng script",
    defaulticon: "Biểu tượng script",
    icon64: "Biểu tượng script kích thước 64x64",
    icon64URL: "Biểu tượng script kích thước 64x64",
    grant: "Quyền API đặc biệt mà script yêu cầu",
    author: "Tác giả script",
    "run-at":
      "Thời điểm chạy script<br>`document-start`: chèn script sớm nhất có thể sau khi khớp URL<br>`document-end`: chèn sau khi DOM tải xong (ảnh v.v. có thể vẫn đang tải)<br>`document-idle`: chèn sau khi toàn bộ nội dung đã tải xong<br>`document-body`: chỉ chèn khi trang có phần tử body",
    "run-in": "Ngữ cảnh mà script được chèn vào",
    homepage: "Trang chủ script",
    homepageURL: "Trang chủ script",
    website: "Trang chủ script",
    background: "Script nền (background)",
    include: "Trang có URL khớp và chạy script",
    match: "Trang có URL khớp và chạy script",
    exclude: "Trang có URL khớp nhưng KHÔNG chạy script",
    connect: "Trang web mà script được phép truy cập",
    resource: "Tệp tài nguyên được import",
    require: "Tệp JS bên ngoài được import",
    "require-css": "Tệp CSS bên ngoài được import",
    noframes: "Không chạy script bên trong `<frame>`",
    compatible: "Thông tin tương thích hiển thị trên GreasyFork",
    "inject-into":
      "Ngữ cảnh chèn script<br>`content`: chèn vào ngữ cảnh content<br>`page`: chèn vào ngữ cảnh trang (mặc định)<br>Lưu ý: SC không hỗ trợ `inject-into: auto`, lựa chọn ngữ cảnh dựa trên CSP.",
    "early-start":
      "Dùng cùng với `run-at: document-start`. `early-start` cho phép script chạy sớm hơn cả trang, nhưng có thể gây ảnh hưởng hiệu năng và giới hạn một số GM API. (Chỉ có trong SC)",
    unwrap:
      "Cho phép script người dùng bỏ qua sandbox và được chèn, thực thi trực tiếp trong phạm vi toàn cục gốc của trang. <br>Script có thể trực tiếp truy cập và chỉnh sửa các biến toàn cục thực sự của trang, nhưng sẽ không thể sử dụng các API đặc quyền của user script như GM.*. <br>Thường được dùng trong các trường hợp cần tương tác sâu với script gốc của trang hoặc khi chuyển đổi từ script trang thông thường.",
    definition: "Tính năng riêng của ScriptCat: URL tới tệp `.d.ts` giúp bật gợi ý tự động trong trình soạn thảo",
    antifeature: `Liên quan đến chợ script: các tính năng không được ưa thích cần thêm giá trị mô tả này
referral-link: Script này sửa đổi hoặc chuyển hướng đến liên kết giới thiệu của tác giả
ads: Script này chèn quảng cáo vào các trang bạn truy cập
payment: Script này yêu cầu thanh toán để sử dụng đúng cách
miner: Script này tham gia vào các hoạt động đào coin
membership: Script này yêu cầu đăng ký làm thành viên để sử dụng đúng cách
tracking: Script này theo dõi thông tin người dùng của bạn`.replace(/\n/g, "<br>"),
    updateURL: "URL dùng để kiểm tra cập nhật script",
    downloadURL: "URL tải về bản cập nhật script",
    supportURL: "Trang hỗ trợ / báo lỗi",
    source: "Trang mã nguồn script",
    scriptUrl: "URL user script được tham chiếu bởi script đăng ký",
    storageName: "Tên vùng lưu trữ giá trị script, dùng để chia sẻ cùng một vùng lưu trữ giữa nhiều script",
    tag: "Thẻ script, phân tách bằng dấu phẩy hoặc khoảng trắng",
    cloudCat: "Đánh dấu script có thể xuất thành gói cloud script CloudCat",
    cloudServer: "Dịch vụ CloudCat cloud mà script sử dụng",
    exportValue: "Giá trị lưu trữ script cần xuất khi xuất thành cloud script",
    exportCookie: "Cookie cần xuất khi xuất thành cloud script",
    crontab: `Ví dụ crontab cho script chạy định kỳ (không áp dụng cho script trên cloud)
* * * * * * Chạy mỗi giây
* * * * * Chạy mỗi phút
0 */6 * * * Chạy 1 lần vào phút 0 mỗi 6 giờ
15 */6 * * * Chạy 1 lần vào phút 15 mỗi 6 giờ
* once * * * Chạy 1 lần mỗi giờ
* * once * * Chạy 1 lần mỗi ngày
* 10 once * * Chạy 1 lần mỗi ngày trong khoảng 10:00-10:59; nếu chạy lúc 10:04 thì hôm đó không chạy lại trong 10:05-10:59
* 1,3,5 once * * Chạy 1 lần lúc 1:00, 3:00, 5:00 mỗi ngày; nếu chạy lúc 1:00 thì hôm đó không chạy lại lúc 3:00 hoặc 5:00
* */4 once * * Kiểm tra và chạy 1 lần mỗi 4 giờ; nếu chạy lúc 4:00 thì hôm đó không chạy lại lúc 8:00, 12:00, 16:00, 20:00, 24:00
* 10-23 once * * Chạy 1 lần mỗi ngày trong khoảng 10:00-23:59; nếu chạy lúc 10:04 thì hôm đó không chạy lại trong 10:05-23:59
* once 13 * * Chạy 1 lần mỗi giờ vào ngày 13 hằng tháng
* once(9-17) * * * Mỗi ngày từ 9 giờ đến 17 giờ, chạy 1 lần mỗi giờ
0,30 once * * * Mỗi giờ chạy 1 lần vào phút 0 hoặc 30, lần đầu kích hoạt thắng, lần sau bị bỏ qua
* * once(9-18) * * Từ ngày 9 đến ngày 18 hằng tháng, mỗi ngày chạy 1 lần
* * * * once(1-5) Mỗi tuần chạy 1 lần, chỉ trong các ngày thứ Hai đến thứ Sáu`.replace(/\n/g, "<br>"),
  },
} as const;
