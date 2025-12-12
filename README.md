# PageNotes AI - Chrome Extension

Chrome extension để highlight văn bản, thêm ghi chú và sử dụng AI trên bất kỳ trang web nào.

## Tính năng

- ✨ Highlight văn bản với 3 màu sắc (Yellow, Blue, Pink)
- 📝 Thêm ghi chú cho mỗi highlight
- 🎯 Click vào note trong sidebar để scroll đến vị trí highlight
- 🔍 Tìm kiếm và lọc highlights
- 🤖 Tích hợp AI (demo)
- 💾 Lưu trữ dữ liệu với Supabase
- 🎨 Giao diện đẹp, dark mode

## Cài đặt Extension

### Bước 1: Load Extension vào Chrome

1. Mở Chrome và truy cập `chrome://extensions/`
2. Bật "Developer mode" ở góc trên bên phải
3. Click "Load unpacked"
4. Chọn thư mục `extension` trong project này

### Bước 2: Sử dụng Extension

1. Click vào icon PageNotes AI trên toolbar để mở sidebar
2. Trên bất kỳ trang web nào, chọn văn bản bạn muốn highlight
3. Chọn màu highlight từ tooltip xuất hiện
4. Click vào highlight để thêm ghi chú
5. Trong sidebar, click vào bất kỳ note card nào để scroll đến vị trí highlight

## Cấu trúc Extension

```
extension/
├── manifest.json          # Cấu hình extension
├── background.js          # Service worker xử lý background tasks
├── content.js            # Script chạy trên mỗi trang web
├── content.css           # Styles cho highlights
├── sidebar.html          # Giao diện sidebar
├── sidebar.css           # Styles cho sidebar
├── sidebar.js            # Logic cho sidebar
└── icons/                # Icons cho extension
```

## Tính năng chi tiết

### Highlighting
- Chọn văn bản trên trang web
- Tooltip xuất hiện với 3 màu: Yellow 💛, Blue 💙, Pink 💗
- Click màu để tạo highlight
- Highlight được lưu tự động

### Ghi chú
- Click vào highlight để thêm/sửa ghi chú
- Ghi chú hiển thị trong sidebar
- Tìm kiếm ghi chú bằng search box

### Navigation
- Click vào note card trong sidebar
- Tự động scroll đến vị trí highlight trên trang
- Nếu khác trang, sẽ chuyển đến trang đó trước
- Highlight sẽ có animation pulse để dễ nhận biết

### Filters & Sort
- Lọc theo màu: All, Yellow, Blue, Pink
- Sắp xếp: Recent, Oldest, URL
- Search: Tìm trong nội dung, ghi chú, tiêu đề trang

### AI Features (Demo)
- Tab Analysis: Phân tích tổng quan highlights
- Tab Ask AI: Chat với AI về nội dung đã lưu
- Placeholder cho tích hợp AI thực tế

## Tích hợp Supabase

Database schema đã được tạo với bảng `highlights`:

```sql
- id: uuid
- user_id: uuid (auth)
- url: text
- page_title: text
- text_content: text
- note: text
- color: text
- xpath: text
- text_offset_start: integer
- text_offset_end: integer
- created_at: timestamptz
- updated_at: timestamptz
```

### Để tích hợp Supabase vào extension:

1. Cập nhật `content.js` và `sidebar.js` để sử dụng Supabase client
2. Thêm authentication flow
3. Thay thế `chrome.storage.local` bằng Supabase queries
4. Sync highlights giữa các thiết bị

## Phát triển tiếp

### Cải thiện có thể thêm:
- Authentication với Supabase Auth
- Sync real-time giữa devices
- Export highlights to PDF/Markdown
- Tích hợp AI thực tế (OpenAI, Claude)
- Share highlights với người khác
- Tags và categories
- Browser action popup nhanh
- Keyboard shortcuts
- Highlight trên PDF files

## Troubleshooting

### Extension không load được:
- Kiểm tra manifest.json có đúng format
- Reload extension tại chrome://extensions/

### Highlight không xuất hiện:
- Kiểm tra content.js đã load
- Xem Console để tìm errors
- Refresh trang web

### Sidebar không mở:
- Click icon extension trên toolbar
- Kiểm tra permissions trong manifest

## Lưu ý bảo mật

- XPath được sử dụng để định vị highlights
- Dữ liệu hiện lưu local với chrome.storage
- Khi tích hợp Supabase, cần implement authentication
- RLS policies đã được setup để bảo vệ dữ liệu

## License

MIT
