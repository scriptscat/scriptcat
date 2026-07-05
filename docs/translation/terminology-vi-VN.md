# Hướng dẫn thuật ngữ và nội dung giao diện vi-VN

Tài liệu này quy định thuật ngữ dùng cho giao diện và tài liệu tiếng Việt (`vi-VN`) của ScriptCat. Mục đích là giữ rõ các khái niệm sản phẩm, dùng câu chữ tự nhiên trong giao diện và bảo toàn các định danh kỹ thuật khi tiếp tục bản địa hóa.

Nguồn sử dụng đã kiểm tra: `src/locales/vi-VN/*.json`, `docs/ARCHITECTURE.md`

## Nguyên tắc

1. Dùng câu chữ tiếng Việt ngắn gọn, tự nhiên và nêu rõ thao tác hoặc trạng thái.
2. Giữ riêng các loại `script người dùng`, `script trang`, `script nền` và `script hẹn giờ`; không gộp chúng chỉ vì đều là script.
3. Không thay thế từ hàng loạt theo mặt chữ. Cần kiểm tra tính năng, vị trí giao diện và ngữ cảnh đầy đủ.
4. Giữ đúng ý nghĩa kỹ thuật của `regex`, `biểu thức cron`, `lưu trữ` và các định danh như `@match`, `@exclude`, `@grant`, `@connect`.
5. Không thay đổi placeholder, thẻ HTML/React, nội suy i18next, URL hoặc định danh metadata trong một lần chỉnh sửa câu chữ.
6. Các key liệt kê dưới đây ghi lại cách dùng hiện tại hoặc điểm cần rà soát; quy tắc tương tự áp dụng cho chuỗi mới cùng ý nghĩa.

## Phân loại

| Nhóm | Cách dùng |
| --- | --- |
| **A. Thuật ngữ sản phẩm và tính năng** | Tên các khả năng của ScriptCat và các loại script. |
| **B. Thao tác và trạng thái giao diện** | Cách viết ưu tiên cho nút, nhãn và thông báo. |
| **C. Thuật ngữ phụ thuộc ngữ cảnh** | Từ cần kiểm tra tính năng trước khi chọn cách dịch. |
| **D. Thuật ngữ kỹ thuật cần giữ** | Thuật ngữ và định danh phải giữ đúng ý nghĩa kỹ thuật. |
| **E. Điểm cần rà soát sau** | Chuỗi hiện tại có sự không thống nhất hoặc cần xác nhận ngữ cảnh. |

## A. Thuật ngữ sản phẩm và tính năng

| Khái niệm | Cách viết ưu tiên | Key ví dụ hiện tại | Ghi chú |
| --- | --- | --- | --- |
| ScriptCat browser extension | `tiện ích ScriptCat` | `welcome_title`, `ext_update_notification` | Giữ tên sản phẩm là `ScriptCat`. |
| generic user script | `script người dùng` | `create_user_script`, `script_list_content` | Dùng cho khái niệm userscript chung. |
| normal userscript type | `script người dùng` / nhãn danh mục hiện tại `script bình thường` | `create_user_script`, `script_list.sidebar.normal_script` | Không gộp với script nền hoặc script hẹn giờ. |
| Tampermonkey compatibility | `script người dùng tương thích Tampermonkey` / `script Tampermonkey` | `docs/ARCHITECTURE.md` | Chỉ dùng khi cần nói rõ tính tương thích; không thay thế mọi tên gọi userscript hoặc danh mục script. |
| page script | `script trang` | `script_list_enable_content` | Chỉ khái niệm script chạy trên trang trong nội dung UI; không tự động thay thế nhãn danh mục `script bình thường`. |
| background script | `script nền` | `create_background_script`, `background_script` | Loại script chạy nền của sản phẩm. |
| scheduled script | `script hẹn giờ` | `create_scheduled_script`, `scheduled_script` | Dùng thay cho việc giới thiệu thêm tên `script crontab`. |
| script synchronization | `đồng bộ script` | `script_sync`, `sync_status` | Khi liên quan đến xóa, cần nói rõ trạng thái hoặc thao tác xóa được đồng bộ. |
| subscription | `đăng ký` | `subscribe_url`, `subscribe`, `importpage.count_subscribes` | Cần phân biệt với thao tác đăng ký bằng ngữ cảnh câu. |
| script gallery / market | `thư viện script` / `chợ script` | `script_gallery`, `script_list_title` | Dùng tên phù hợp với trang đích thực tế. |

## B. Thao tác và trạng thái giao diện

| Khái niệm | Cách viết ưu tiên | Key ví dụ hiện tại | Ghi chú |
| --- | --- | --- | --- |
| create | `Tạo` | `create_script`, `create_background_script` | Thêm đối tượng khi nhãn cần rõ nghĩa. |
| save / save as | `Lưu` / `Lưu thành` | `save`, `save_as` | Giữ nhất quán với giao diện hiện tại. |
| import / export | `Nhập` / `Xuất` | `import`, `export`, `import_file`, `export_file` | Dùng cho dữ liệu hoặc tệp theo ngữ cảnh. |
| install / update | `Cài đặt` / `Cập nhật` | `script`, `update_script` | Có thể thêm `script` hoặc `đăng ký` để phân biệt. |
| run / runtime | `Chạy` / `Thời gian chạy` | `run`, `runtime`, `log_title` | Dùng cho việc thực thi script. |
| enable / disable | `Bật` / `Tắt`; trạng thái `Đã bật` / `Đã tắt` | `enable`, `disable`, `script_disabled` | Không dùng như thao tác mở hoặc đóng thành phần giao diện. |
| settings | `Cài đặt` | `settings`, `script_setting` | Dành cho các tùy chọn sản phẩm. |
| permission | `Quyền` / `Cấp quyền` | `permission`, `confirm_script_operation` | Phân biệt loại quyền và thao tác cho phép. |
| connect / sync | `Kết nối` / `Đồng bộ` | `connect`, `script_sync` | Không gộp trạng thái kết nối với đồng bộ dữ liệu. |
| directory | `Thư mục` | `open_directory`, `open_backup_dir` | Dùng cho thao tác hệ thống tệp. |
| browser tab | `Tab` | `close_current_tab`, `script_run_env.all` | Dùng nhất quán khi nói về tab trình duyệt. |

## C. Thuật ngữ phụ thuộc ngữ cảnh

| Khái niệm | Cách viết có thể dùng | Quy tắc chọn | Key ví dụ hiện tại |
| --- | --- | --- | --- |
| local / cloud | `Cục bộ` / `Đám mây` | Dùng cho nguồn, nơi lưu hoặc đích đồng bộ; thêm đối tượng nếu câu chưa rõ. | `local`, `cloud`, `source_local_script` |
| panel / console | `bảng điều khiển` / `console` | Thành phần điều khiển của sản phẩm dùng `bảng điều khiển`; đầu ra công cụ phát triển cần giữ nghĩa console. | `background_script_description`, `build_success_message` |
| source | `Nguồn`, `Nguồn cài đặt`, `Nguồn đăng ký` | Nêu rõ nguồn cung cấp nội dung gì. | `source`, `importpage.col_source`, `source_subscribe_link` |
| storage | `Lưu trữ`, `không gian lưu trữ`, `API lưu trữ` | Phân biệt dữ liệu script, vị trí được cấu hình và tên API. | `script_storage`, `script_operation_description`, `storage_api` |
| sync deletion | `Đồng bộ trạng thái xóa` / `Đồng bộ xóa` | Chỉ thống nhất sau khi xác nhận hành vi thực tế của tùy chọn. | `sync_delete`, `sync_delete_desc`, `notification.script_sync_delete` |

## D. Thuật ngữ kỹ thuật cần giữ

| Khái niệm | Sử dụng | Key ví dụ hiện tại | Lý do |
| --- | --- | --- | --- |
| regular expression | `regex` / `biểu thức chính quy` | `search_regex` | Thuật ngữ kỹ thuật thông dụng; chọn dạng đầy đủ khi cần giải thích. |
| cron expression | `biểu thức cron` | `cron_invalid_expr`, `error_cron_invalid` | Nêu chính xác cú pháp lịch chạy được chấp nhận. |
| expression | `biểu thức` | `value_export_expression`, `expression_format_error` | Giữ nghĩa kỹ thuật của biểu thức được nhập hoặc đánh giá. |
| watch file changes | `Theo dõi tệp` / `Dừng theo dõi` | `watch_file`, `stop_watch_file` | Mô tả việc theo dõi thay đổi tệp liên tục. |
| metadata declaration | `khai báo` | `error_metadata_line_duplicated` | Tương ứng với cú pháp metadata. |
| product/API identifiers | Giữ `ESLint`, `VSCode`, `Cookie`, `GM API`, `@match`, `@exclude`, `@grant`, `@connect`, `@resource`, `@require` | `enable_eslint`, `vscode_url`, `confirm_operation_description`, `script_resource_tooltip` | Tên sản phẩm và định danh mã phải nhận biết được và chính xác. |

## E. Điểm cần rà soát sau

Các mục dưới đây ghi nhận vấn đề đã tồn tại. Việc tạo hướng dẫn không tự thay đổi `*.json`; mọi sửa đổi nên là một đợt chỉnh riêng có kiểm tra giao diện.

| Chủ đề | Hiện trạng | Hướng ưu tiên | Key ví dụ hiện tại |
| --- | --- | --- | --- |
| `script` / `tập lệnh` | Hai cách gọi xuất hiện trong cùng luồng giao diện. | Xác nhận giọng điệu sản phẩm rồi thống nhất; với chuỗi mới trong ngữ cảnh hiện đang dùng rộng rãi, ưu tiên `script`. | `installed_scripts`, `create_user_script`, `script_list_action_content` |
| scheduled script naming | Loại sản phẩm là `script hẹn giờ` nhưng một thông báo dùng `script crontab`. | Dùng `script hẹn giờ` cho cùng loại sản phẩm; chỉ nhắc `cron` khi nói đến biểu thức lịch chạy. | `scheduled_script`, `only_background_scheduled_can_run`, `cron_invalid_expr` |
| identifier and brand capitalization | Có các dạng `scriptcat`, `eslint`, `vscode`, `api`, `Url` trong văn bản hiện tại. | Trong chỉnh sửa có phạm vi rõ ràng, giữ `ScriptCat`, `ESLint`, `VSCode`, `API`, `URL`. | `script_list_content`, `api_docs`, `enable_eslint`, `vscode_url` |
| documentation link locale | Một số chuỗi tiếng Việt liên kết đến tài liệu `/en/`. | Chỉ đổi khi đã xác nhận có trang tiếng Việt tương ứng. | `script_list_content`, `develop_mode_guide` |

## Danh sách kiểm tra cho AI và người đóng góp

Khi thêm hoặc sửa nội dung tiếng Việt:

1. Xác nhận locale đích là `vi-VN`, rồi đọc hướng dẫn này và các chuỗi giao diện lân cận.
2. Giữ riêng các loại script và dùng cùng thuật ngữ cho cùng một tính năng.
3. Với thuật ngữ phụ thuộc ngữ cảnh, kiểm tra hành vi thực tế và vị trí giao diện trước khi sửa.
4. Giữ nguyên thuật ngữ kỹ thuật, placeholder, thẻ, nội suy, URL và định danh metadata.
5. Không biến các điểm cần rà soát thành thay thế hàng loạt khi chưa kiểm tra phạm vi ảnh hưởng.
6. Trước khi bàn giao, tìm trong nội dung mới hoặc đã sửa để kiểm tra việc trộn `script`/`tập lệnh`, tên script hẹn giờ và các định danh bị thay đổi.
