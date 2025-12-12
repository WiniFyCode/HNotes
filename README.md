# TECHVANGUARD - Chrome Extension

Chrome extension để highlight văn bản và thêm ghi chú trên bất kỳ trang web nào.

## Tính năng

- ✨ Highlight văn bản với 7 màu sắc (Yellow, Blue, Pink, Green, Purple, Red, Orange)
- 📝 Thêm ghi chú cho mỗi highlight
- 💬 Hover vào highlight để xem nhanh ghi chú (tooltip hiển thị đúng màu highlight)
- 🏷️ Gắn tag để phân loại highlights
- 🎯 Click vào highlight card trong sidebar để scroll đến vị trí trên trang
- 🔍 Tìm kiếm và lọc highlights theo website, ngày, màu sắc, tag
- 📋 Copy nội dung highlight kèm note và source URL
- 🎨 Tùy chỉnh tên hiển thị cho từng màu
- 📝 Thêm Page Note - ghi chú cho cả trang mà không cần highlight
- 🤖 Demo tích hợp AI (phân tích và chat)
- 💾 Lưu trữ local với Chrome Storage
- 🌙 Giao diện dark mode

## Cài đặt

1. Mở Chrome và truy cập `chrome://extensions/`
2. Bật "Developer mode" ở góc trên bên phải
3. Click "Load unpacked"
4. Chọn thư mục chứa extension này

## Sử dụng

1. Click vào icon TECHVANGUARD trên toolbar để mở sidebar
2. Trên bất kỳ trang web nào, chọn (bôi đen) văn bản bạn muốn highlight
3. Chọn màu highlight từ tooltip xuất hiện
4. Click vào highlight để thêm/sửa ghi chú
5. Hover vào highlight để xem nhanh ghi chú đã lưu
6. Trong sidebar:
   - Click vào highlight card để scroll đến vị trí trên trang
   - Sử dụng các nút filter (Website, Date, Color, Tag) để lọc
   - Search để tìm kiếm trong nội dung, ghi chú, tiêu đề trang
   - Click icon edit để sửa note, label để thêm tag, copy để sao chép, delete để xóa

## Cấu trúc

```
├── manifest.json           # Cấu hình extension
├── js/
│   ├── background.js       # Service worker
│   ├── content.js          # Script chạy trên mỗi trang web
│   ├── shared.js           # Constants dùng chung (màu sắc)
│   └── sidebar.js          # Logic cho sidebar
├── css/
│   ├── content.css         # Styles cho highlights và tooltips
│   └── sidebar.css         # Styles cho sidebar
├── html/
│   └── sidebar.html        # Giao diện sidebar
└── icons/                  # Icons cho extension
```

## License

MIT
