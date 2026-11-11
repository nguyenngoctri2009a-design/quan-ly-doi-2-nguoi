# Hệ Thống Quản Lý Đội 2 Người (Rust Axum + Firebase RTDB + T1 Design System)

Ứng dụng quản lý đội thi đấu 2 người với khả năng đồng bộ thời gian thực (Realtime), chống xung đột cấp số thứ tự tự động và giao diện 3D Neumorphic-Glass Hybrid theo chuẩn T1.

---

## 1. Cấu Trúc Dự Án

```
d:\HI/
├── docs/
│   └── IMPLEMENTATION_PLAN.md   # Đặc tả chi tiết kiến trúc & kiểm thử
├── backend/                     # Rust Axum Backend
│   ├── Cargo.toml
│   ├── .env.example
│   ├── .env
│   ├── src/
│   │   ├── main.rs              # Khởi tạo server & graceful shutdown
│   │   ├── config.rs            # Đọc cấu hình biến môi trường
│   │   ├── errors.rs            # Chuẩn hóa lỗi API
│   │   ├── models/              # Struct Team, DTOs, Event
│   │   ├── firebase/            # Client Reqwest giao tiếp Firebase RTDB
│   │   ├── services/            # TeamService (atomic naming), RealtimeService
│   │   ├── handlers/            # Axum request handlers
│   │   └── routes/              # Routing & CORS
│   └── tests/
│       └── team_test.rs         # Unit tests
├── frontend/                    # Vite + TypeScript SPA (T1 UI)
│   ├── package.json
│   ├── index.html
│   └── src/
│       ├── styles/              # t1-core.css (Chuẩn T1 3D) & app.css
│       ├── types/               # TypeScript interfaces
│       ├── services/            # api.ts (HTTP client) & sse.ts (Realtime SSE)
│       ├── components/          # KPI Cards, Pro Table, Modal 3D, Confirm, Toast
│       └── main.ts              # Entry point & state management
├── run_backend.bat              # Script khởi chạy nhanh Backend
└── run_frontend.bat             # Script khởi chạy nhanh Frontend
```

---

## 2. Cách Khởi Chạy Nhanh

### Bước 1: Khởi chạy Backend (Rust)
Chạy tệp `run_backend.bat` hoặc thực thi lệnh sau:
```bash
cd backend
cargo run
```
> Server sẽ lắng nghe tại `http://127.0.0.1:3000`. Endpoint sức khỏe: `http://127.0.0.1:3000/api/health`.

### Bước 2: Khởi chạy Frontend (Vite + TypeScript)
Chạy tệp `run_frontend.bat` hoặc thực thi lệnh sau:
```bash
cd frontend
npm run dev
```
> Giao diện sẽ mở tại `http://localhost:5173`.

---

## 3. Các Tính Năng Đã Triển Khai Hoàn Chỉnh

1. **Quy tắc tên đội tự động & chống xung đột:**
   - Khi chưa có đội: Đội đầu tiên tự nhận "Đội 1".
   - Tự động tìm số khuyết nhỏ nhất ("Đội 1", "Đội 2", "Đội 3"...).
   - Khi người dùng đổi tên -> Đánh dấu `customName = true` và không tự động đổi lại.
   - Xóa đội không làm đổi tên hay ID của các đội còn lại.
   - Cơ chế khóa Mutex tại `TeamService` đảm bảo an toàn tuyệt đối khi nhiều người cùng tạo đội đồng thời.
2. **Đồng bộ thời gian thực (Realtime SSE):**
   - Kênh Server-Sent Events `/api/teams/events` tự động phát thông báo khi có đội được tạo, cập nhật hoặc xóa.
   - Frontend tự động kết nối lại khi mạng bị gián đoạn.
3. **Giao diện chuẩn T1 3D Neumorphic-Glass:**
   - Tone nền trắng sáng `#f8fafc` lưới chấm vi tế 24px.
   - Nút bấm 3D viền kép lún thật (`.t1-btn`).
   - 3 Thẻ thống kê KPI (Tổng đội, Tổng thành viên, Đội đủ 2 người).
   - Thanh tìm kiếm tức thời với cơ chế Debounce 300ms.
   - Bảng Pro Table kèm avatar chip và huy hiệu xếp hạng (🥇, 🥈, 🥉).
   - Modal thủy tinh mờ sang trọng cho tạo/sửa đội và Dialog xác nhận xóa an toàn.
