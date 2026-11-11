# ĐẶC TẢ VÀ KẾ HOẠCH TRIỂN KHAI HỆ THỐNG QUẢN LÝ ĐỘI 2 NGƯỜI
## (Rust Axum + Firebase Realtime Database + T1 3D Design System)

> **Tài liệu tham chiếu:** `docs/IMPLEMENTATION_PLAN.md`  
> **Trạng thái:** Chờ phê duyệt (Giai đoạn A - Khảo sát & Đặc tả kỹ thuật)  
> **Ngày lập:** 11/11/2026  
> **Mục tiêu:** Đặc tả chi tiết toàn bộ kiến trúc, API, mô hình dữ liệu, cơ chế đồng bộ realtime, giải pháp chống xung đột (race condition), giao diện T1 3D Neumorphic-Glass và lộ trình kiểm thử cho hệ thống quản lý đội 2 người.

---

## 1. Khảo Sát Hiện Trạng Dự Án

### 1.1. Hiện trạng thư mục và mã nguồn
- **Không gian làm việc:** `d:\HI`
- **Kết quả quét hệ thống tệp:** Thư mục hiện tại hoàn toàn sạch sẽ/trống (chưa có mã nguồn hay framework khởi tạo trước đó).
- **Môi trường máy chủ phát triển (Host):**
  - **Hệ điều hành:** Windows 11
  - **Rust Toolchain:** `rustc 1.99.1`, `cargo 1.99.1` (sẵn sàng cho Axum 0.7/0.8 + Tokio runtime).
  - **Node.js Toolchain:** `v26.13.0`, `npm 11.20.0` (sẵn sàng cho build tooling Vite).
  - **Git:** `git version 2.56.0.windows.4`.
- **Hệ thống thiết kế có sẵn:**
  - Quy chuẩn toàn cục: `C:/Users/PC/.gemini/config/rules/t1.md`
  - Skill UI: `C:/Users/PC/.gemini/config/skills/t1-design-system/SKILL.md` (chuẩn giao diện T1 3D Neumorphic-Glass Hybrid: nền `#f8fafc` lưới chấm vi tế 24px, nút bấm 3D viền kép lún thật, thẻ KPI đa tầng, bảng Pro, modal kính mờ).

### 1.2. Quyết định lựa chọn Frontend Framework
Vì thư mục gốc đang trống, để tuân thủ nguyên tắc không đưa thư viện cồng kềnh, tối ưu tốc độ render và đạt 100% chuẩn giao diện T1:
- **Đề xuất công nghệ Frontend:** **Vite + Vanilla TypeScript (hoặc Vite + React 19 + TypeScript)**.
  - *Phương án tối ưu khuyến nghị:* **Vite + TypeScript SPA thuần** (hoặc React TS gọn nhẹ). Cung cấp khả năng chia component rõ ràng (`TeamCard`, `TeamTable`, `KpiHeader`, `TeamModal`, `ToastNotification`), quản lý state đồng bộ realtime cực nhanh mà không bị overhead bởi các UI library nặng nề bên thứ ba.
  - Áp dụng nguyên bản 100% bộ CSS T1 Design System Core từ file skill.

---

## 2. Kiến Trúc Tổng Thể Đề Xuất

### 2.1. Sơ đồ tương tác hệ thống

```
+-------------------------------------------------------------------+
|               Browser / Client (T1 3D Neumorphic UI)              |
|   - Quản lý danh sách đội, tìm kiếm (debounce 300ms)             |
|   - Thẻ KPI (Tổng đội, Tổng thành viên)                          |
|   - Modal 3D thêm / sửa đội, Dialog xác nhận xóa                 |
+-------------------------------------------------------------------+
         |                                           ^
         | REST API (JSON)                           | SSE Stream
         | (POST/PUT/DELETE)                         | (/api/teams/events)
         v                                           |
+-------------------------------------------------------------------+
|                     Rust Backend (Axum + Tokio)                   |
|   - Layer Routes & Handlers (Validation, CORS, Rate Limit)        |
|   - Concurrency Manager (Chống cấp trùng "Đội n" bằng Mutex/ETag) |
|   - TeamService (Logic tạo/sửa/xóa, tính slot tên mặc định)       |
|   - Firebase Gateway (Client HTTP Reqwest dùng connection pool)   |
|   - Realtime Broadcaster (tokio::sync::broadcast channel)         |
+-------------------------------------------------------------------+
         |                                           ^
         | HTTPS REST API                            | HTTPS EventStream
         | (/teams/{id}.json)                        | (/teams.json)
         v                                           |
+-------------------------------------------------------------------+
|                    Firebase Realtime Database                     |
|  URL: https://mechamay-7cbce-default-rtdb.asia-southeast1...     |
|   - Node /teams: Lưu thông tin chi tiết từng đội                  |
|   - Node /meta/counters: Lưu kiểm soát chuỗi định danh nếu cần    |
+-------------------------------------------------------------------+
```

### 2.2. Phân tầng kiến trúc Rust Backend
Rust backend được module hóa chặt chẽ theo mô hình Domain-Driven / Layered Architecture:
1. `src/main.rs`: Khởi tạo ứng dụng, nạp config, thiết lập kết nối Firebase, kích hoạt background SSE listener, bind Axum router và xử lý Graceful Shutdown.
2. `src/config.rs`: Đọc cấu hình từ biến môi trường (`.env`), validate cấu hình bắt buộc.
3. `src/models/`: Chứa struct dữ liệu, Serialize/Deserialize, validation rules (`Team`, `CreateTeamDto`, `UpdateTeamDto`, `ApiResponse<T>`, `ErrorResponse`).
4. `src/errors.rs`: Định nghĩa `AppError` enum thống nhất, chuyển đổi tự động sang `IntoResponse` với status code và payload JSON chuẩn `{"code": "...", "message": "..."}`.
5. `src/firebase/`: Quản lý giao tiếp HTTP với Firebase RTDB qua `reqwest::Client`, xử lý auth header (Google OAuth2 token hoặc Database Secret), retry logic và timeout.
6. `src/services/`: 
   - `team_service.rs`: Xử lý nghiệp vụ chính: tìm kiếm slot tên mặc định trống ("Đội 1", "Đội 2"...), kiểm tra tính duy nhất, cập nhật atomicity.
   - `realtime_service.rs`: Duy trì kết nối SSE từ backend tới Firebase RTDB, broadcast sự kiện tới các connected frontend clients.
7. `src/handlers/`: Tiếp nhận HTTP requests, deserialize, gọi service và trả response.
8. `src/routes/`: Cấu hình routing của Axum, CORS middleware, Trace/Logging layer.

---

## 3. Quyết Định Về Đồng Bộ Realtime

Đặc tả yêu cầu phân tích và lựa chọn 1 trong 3 phương án:

| Tiêu chí | Phương án 1: Frontend kết nối trực tiếp Firebase SDK | Phương án 2: Rust Backend làm trung gian SSE tới Frontend | Phương án 3: Rust Backend WebSocket 2 chiều |
| :--- | :--- | :--- | :--- |
| **Bảo mật & Credentials** | Cần lộ config Firebase & mở Rules cho client. Nguy cơ client ghi đè dữ liệu bypass validation. | **Rất cao**: Frontend hoàn toàn không biết Firebase URL/Secret. Mọi dữ liệu phải qua Rust validation. | Cao: Tương tự phương án 2. |
| **Xử lý Race Condition** | Khó kiểm soát khi 2 client cùng tạo "Đội n" qua client SDK. | **Tuyệt đối**: Rust backend kiểm soát hàng đợi ghi và cấp số thứ tự nguyên tử. | Tuyệt đối: Tương tự phương án 2. |
| **Bảo toàn T1 UI & Kiến trúc** | Phải nhúng SDK Firebase nặng vào frontend. | **Cực nhẹ**: Frontend chỉ cần `EventSource` (chuẩn web native zero-dependency). | Cần thư viện/quản lý heartbeat socket phức tạp hơn mức cần thiết. |
| **Khả năng Reconnect** | Tự động qua SDK. | Native `EventSource` tự động reconnect khi mất kết nối mạng. | Phải viết code reconnect + ping/pong thủ công. |

### Lựa chọn kiến trúc: **Phương án 2 (Rust Backend phát SSE cho Frontend)**
- **Lý do lựa chọn:**
  1. **An toàn tuyệt đối:** Toàn bộ quyền truy cập Firebase nằm sau Rust backend. Không rò rỉ credential ra ngoài trình duyệt.
  2. **Zero-dependency ở Frontend:** Frontend dùng chuẩn trình duyệt `const evt = new EventSource('/api/teams/events')` nhẹ nhàng, không cần cài đặt bundle Firebase SDK cồng kềnh (>300KB).
  3. **Cơ chế Reconnect tích hợp sẵn:** `EventSource` của trình duyệt có sẵn tính năng tự động kết nối lại khi mạng chập chờn, tự gửi header `Last-Event-ID`.
  4. **Rust SSE Bridge:** Rust backend sử dụng một background task kết nối đến Firebase Streaming API (`GET /teams.json` với header `Accept: text/event-stream`). Khi Firebase bắn sự kiện (`put`, `patch`), backend chuyển tiếp qua `tokio::sync::broadcast::Sender` tới các frontend client đang mở kênh SSE `/api/teams/events`.

---

## 4. Cấu Trúc Dữ Liệu Firebase Realtime Database

### 4.1. Sơ đồ Node JSON tại Firebase
```json
{
  "teams": {
    "team_01j7bc9k8e7w...": {
      "id": "team_01j7bc9k8e7w...",
      "name": "Đội 1",
      "member1": "Nguyễn Văn A",
      "member2": "Trần Thị B",
      "customName": false,
      "createdAt": 1731339600000,
      "updatedAt": 1731339600000
    },
    "team_01j7bca23f4g...": {
      "id": "team_01j7bca23f4g...",
      "name": "Hổ Cáp",
      "member1": "Lê Văn C",
      "member2": "",
      "customName": true,
      "createdAt": 1731339605000,
      "updatedAt": 1731339620000
    }
  },
  "meta": {
    "lastAllocatedSeq": 2
  }
}
```

### 4.2. Chi tiết các trường dữ liệu thực thể `Team`
| Trường | Kiểu dữ liệu | Bắt buộc | Ràng buộc validation | Mô tả ý nghĩa |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `string` | Có | UUID v7 hoặc nanoid (21 ký tự), không đổi | Định danh duy nhất toàn cục của đội |
| `name` | `string` | Có | 1 - 50 ký tự, được trim khoảng trắng | Tên hiển thị của đội ("Đội 1" hoặc tên riêng) |
| `member1` | `string` | Không | Tối đa 50 ký tự | Tên thành viên thứ nhất (có thể rỗng) |
| `member2` | `string` | Không | Tối đa 50 ký tự | Tên thành viên thứ hai (có thể rỗng) |
| `customName`| `boolean`| Có | `false` nếu mang tên mặc định, `true` nếu do user đặt | Cờ đánh dấu để hệ thống không tự động đổi tên |
| `createdAt` | `number` | Có | Epoch timestamp (milliseconds, UTC) | Thời điểm tạo bản ghi |
| `updatedAt` | `number` | Có | Epoch timestamp (milliseconds, UTC) | Thời điểm cập nhật dữ liệu gần nhất |

---

## 5. Quy Tắc Nghiệp Vụ & Giải Quyết Race Condition

### 5.1. Thuật toán tìm số mặc định ("Đội 1", "Đội 2"...)
Quy tắc:
1. Khi chưa có đội nào: Tạo "Đội 1".
2. Khi có nhiều đội: Cấp số nhỏ nhất còn thiếu trong tập các đội mặc định chưa bị chiếm (Smallest Available Positive Integer Algorithm) hoặc kế tiếp.
   - *Ví dụ:* Hiện có "Đội 1", "Đội 2", "Đội 4" (Đội 3 đã bị xóa hoặc đổi thành "Sát Thủ"): Đội mới tạo sẽ nhận tên **"Đội 3"** (lấp đầy số khuyết) nhằm giữ thứ tự gọn gàng, hoặc nhận số tiếp theo tùy chọn cấu hình.
   - Các đội có `customName == true` (dù tên người dùng tự gõ là "Đội 99") sẽ **không** tính vào danh sách tên mặc định của hệ thống.
3. Khi người dùng sửa trường `name`:
   - Nếu tên mới khác với tên mặc định hiện hành -> Đặt `customName = true`.
   - Nếu người dùng chủ động đổi về lại đúng tên mặc định chưa bị ai chiếm -> Có thể giữ `customName = true` hoặc cho phép đặt lại theo yêu cầu.

### 5.2. Chính sách xử lý trùng tên tự đặt (Custom Name Duplication Policy)
- **Đề xuất trong kế hoạch:** **Cho phép trùng tên tự đặt (Allow Duplicates)**.
  - *Lý do:* Mỗi đội được định danh độc lập bởi trường `id` (UUID). Trong thực tế quản lý nhiều giải đấu/phòng chơi, hai đội có thể trùng nickname ("Chiến Binh") nhưng thuộc về các cặp tuyển thủ khác nhau.
  - *Tùy chọn cấu hình:* Backend cung cấp biến môi trường `ALLOW_DUPLICATE_CUSTOM_NAMES=true` (mặc định: `true`). Nếu đặt `false`, hệ thống sẽ trả mã lỗi `NAME_ALREADY_EXISTS` (HTTP 409 Conflict) khi người dùng cố tình đổi sang tên đã có.

### 5.3. Xử lý đồng thời & Race Condition (2 người tạo đội cùng tích tắc)
Vì Firebase REST API không có multi-path transaction giống như Native Admin SDK:
1. **Serialization qua Tokio Mutex ở Backend:**
   - Tại Rust backend, khối logic `allocate_default_name_and_persist` được bảo vệ bởi một asynchronous mutex (`tokio::sync::Mutex<()>`).
   - Mọi request `POST /api/teams` đều phải đi qua lock này để:
     1. Lấy danh sách tên đội hiện có (từ cache bộ nhớ đã được đồng bộ qua SSE).
     2. Xác định slot số `k` nhỏ nhất chưa có chủ.
     3. Tạo ID mới.
     4. Ghi trực tiếp xuống Firebase RTDB: `PUT /teams/{id}.json`.
     5. Cập nhật cache nội bộ và nhả lock.
   - Thời gian giữ lock chỉ tính bằng mili-giây (thời gian gửi 1 HTTP request qua Reqwest pool).
2. **Khả năng mở rộng Multi-Instance (Nếu scale nhiều backend pod):**
   - Sử dụng cơ chế Conditional Request của Firebase RTDB: Gửi header `if-match: <etag>` hoặc sử dụng node sequence atomic `/meta/sequence` với thao tác `.sv: {"increment": 1}`.
   - Đối với phạm vi ứng dụng quản lý hiện tại, giải pháp **Mutex + Memory Cache + ETag Validation** đảm bảo 100% không bao giờ cấp trùng số "Đội n" kể cả khi hàng chục client bấm nút "Tạo đội" cùng 1 giây.

---

## 6. Đặc Tả Chi Tiết API Backend (Axum REST API)

### 6.1. Bảng danh sách Endpoint
| Phương thức | Đường dẫn | Chức năng | Response Code |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Kiểm tra trạng thái hoạt động của Backend & kết nối Firebase | 200 OK |
| `GET` | `/api/teams` | Lấy toàn bộ danh sách đội (hỗ trợ query `?search=...`) | 200 OK |
| `POST` | `/api/teams` | Tạo đội mới (tự sinh tên mặc định nếu không truyền tên) | 201 Created, 400, 500 |
| `PUT` | `/api/teams/:id`| Cập nhật tên đội hoặc thành viên (validate tồn tại ID) | 200 OK, 400, 404, 409 |
| `DELETE` | `/api/teams/:id`| Xóa một đội khỏi hệ thống | 200 OK, 404, 500 |
| `GET` | `/api/teams/events`| Kênh Server-Sent Events (SSE) phát sự kiện thời gian thực | 200 OK (text/event-stream) |

### 6.2. Cấu trúc Payload Chuẩn

#### Khung Response Thành Công:
```json
{
  "success": true,
  "data": { ... },
  "message": "Thao tác thành công"
}
```

#### Khung Response Thất Bại / Lỗi:
```json
{
  "success": false,
  "error": {
    "code": "TEAM_NOT_FOUND",
    "message": "Không tìm thấy đội với ID đã cung cấp",
    "details": null
  }
}
```

#### Chi tiết Request / Response từng Endpoint:

##### 1. `GET /api/teams`
- Query Params: `search` (string, tùy chọn - lọc theo tên đội hoặc tên thành viên).
- Response (200 OK):
```json
{
  "success": true,
  "data": {
    "teams": [
      {
        "id": "01931ec0-1b77-7813-8994-6b997c48eb01",
        "name": "Đội 1",
        "member1": "Nguyễn Văn A",
        "member2": "Trần Văn B",
        "customName": false,
        "createdAt": 1731339600000,
        "updatedAt": 1731339600000
      }
    ],
    "totalTeams": 1,
    "totalMembers": 2
  }
}
```

##### 2. `POST /api/teams`
- Request Body (tất cả trường đều là optional; nếu rỗng, hệ thống tự cấp tên mặc định "Đội n"):
```json
{
  "name": "Hổ Cáp",
  "member1": "Nguyễn Văn A",
  "member2": "Trần Thị B"
}
```
- Nếu request body rỗng `{}`: Backend tự sinh `name = "Đội 1"` (hoặc số kế tiếp), `customName = false`, `member1 = ""`, `member2 = ""`.
- Response (201 Created):
```json
{
  "success": true,
  "data": {
    "id": "01931ec0-1b77-7813-8994-6b997c48eb02",
    "name": "Đội 1",
    "member1": "",
    "member2": "",
    "customName": false,
    "createdAt": 1731339610000,
    "updatedAt": 1731339610000
  },
  "message": "Tạo đội thành công"
}
```

##### 3. `PUT /api/teams/:id`
- Request Body:
```json
{
  "name": "Chiến Binh Rồng",
  "member1": "Phạm Văn C",
  "member2": "Hoàng Thị D"
}
```
- Ràng buộc:
  - Nếu `name` khác với tên hiện tại: Tự động đánh dấu `customName = true`.
  - Độ dài `name`: 1 - 50 ký tự.
  - Độ dài `member1`, `member2`: 0 - 50 ký tự.
  - Nếu `:id` không tồn tại -> Trả về `404 Not Found` với mã `TEAM_NOT_FOUND`.
- Response (200 OK):
```json
{
  "success": true,
  "data": {
    "id": "01931ec0-1b77-7813-8994-6b997c48eb01",
    "name": "Chiến Binh Rồng",
    "member1": "Phạm Văn C",
    "member2": "Hoàng Thị D",
    "customName": true,
    "createdAt": 1731339600000,
    "updatedAt": 1731339650000
  },
  "message": "Cập nhật đội thành công"
}
```

##### 4. `DELETE /api/teams/:id`
- Ràng buộc:
  - Nếu `:id` không tồn tại trong Firebase -> Trả về `404 Not Found`.
  - Xóa đội không làm đổi tên hay ID của các đội còn lại.
- Response (200 OK):
```json
{
  "success": true,
  "data": {
    "id": "01931ec0-1b77-7813-8994-6b997c48eb01"
  },
  "message": "Đã xóa đội thành công"
}
```

##### 5. `GET /api/teams/events` (SSE Stream)
- Header: `Content-Type: text/event-stream; charset=utf-8`
- Message format:
```
event: team_created
data: {"id":"...","name":"Đội 1",...}

event: team_updated
data: {"id":"...","name":"Rồng Lửa",...}

event: team_deleted
data: {"id":"..."}
```

---

## 7. Thiết Kế Giao Diện T1 3D Neumorphic-Glass

Giao diện sẽ tuân thủ nghiêm ngặt kỹ thuật xây dựng giao diện theo quy chuẩn T1 (`t1.md` và `t1-design-system`):

### 7.1. Cấu trúc màn hình chính
1. **Header & Thanh Tiêu Đề:**
   - Huy hiệu dự án: Icon phát sáng, Badge trạng thái kết nối Realtime (`t1-pill-success` "Đang kết nối Realtime").
   - Nút hành động nhanh: Nút 3D Primary Cyan `+ Thêm Đội Mới` (`.t1-btn .t1-btn-primary`).
2. **Khu vực Thống Kê KPI (KPI Metric Cards):**
   - **Card 1 (Tổng số đội):** Giá trị số lớn 30px font 900, icon nhóm 🏆, phụ chú so với giới hạn.
   - **Card 2 (Tổng thành viên đã nhập):** Đếm số thành viên có tên thực tế (tối đa $Tổng\ số\ đội \times 2$), thanh tiến độ phần trăm lấp đầy.
   - **Card 3 (Đội đủ 2 người):** Đếm số đội đã hoàn thiện cả 2 vị trí.
3. **Thanh Công Cụ & Tìm Kiếm:**
   - Ô Input T1 (`.t1-input`) có icon kính lúp, tính năng Debounce 300ms, tìm tức thì theo cả tên đội lẫn tên bất kỳ thành viên nào.
   - Bộ lọc hiển thị: Tất cả / Đủ thành viên / Chưa đủ thành viên.
4. **Bảng Danh Sách Đội Pro (T1 Pro Table & Cards):**
   - Hiển thị responsive kép: Bảng Pro cho Desktop (`.t1-table-wrap`) và Grid Card 3D cho Mobile.
   - Cột: STT / Tên Đội (Huy hiệu Rank hoặc Tên tùy chỉnh kèm nhãn `Tự đặt`), Thành viên 1, Thành viên 2, Trạng thái (Đủ 2/2 hoặc Khuyết), Ngày cập nhật, Thao tác.
   - Nút thao tác: Sửa (Nút 3D Vàng `.t1-btn-gold`), Xóa (Nút 3D Đỏ `.t1-btn-danger`).
5. **Modal 3D Thủy Tinh (Luxury Glass Modal):**
   - Modal Thêm / Chỉnh sửa đội (`.t1-modal-overlay` với backdrop-blur 8px).
   - Dialog xác nhận xóa an toàn: Cảnh báo đỏ nổi bật, hiển thị rõ tên đội sắp xóa để tránh bấm nhầm.
6. **Toast Notification System:**
   - Nổi góc phải màn hình, thông báo thành công xanh lục (`.t1-pill-success`), cảnh báo lỗi đỏ (`.t1-pill-danger`).

---

## 8. Bảo Mật và Cấu Hình Firebase

### 8.1. Thông tin cấu hình Firebase
- **Database URL:** `https://mechamay-7cbce-default-rtdb.asia-southeast1.firebasedatabase.app/`
- **Phương thức xác thực:**
  - *Phương án A (Khuyến nghị cho Production):* Google Cloud Service Account (tệp JSON hoặc chuỗi Base64 biến môi trường `FIREBASE_SERVICE_ACCOUNT_KEY`). Rust backend tự sinh OAuth2 Bearer Token có thời hạn qua API Google.
  - *Phương án B (Database Secret):* Truyền tham số `?auth=<FIREBASE_DATABASE_SECRET>` trong các HTTP request từ backend.
  - Tuyệt đối **không commit** secret hoặc private key lên Git. File `.env` được đưa vào `.gitignore`.

### 8.2. Đề xuất Firebase Realtime Database Security Rules
Khi chạy thông qua Rust Backend, quy tắc bảo mật của Firebase RTDB được thiết lập như sau:
```json
{
  "rules": {
    "teams": {
      ".read": false,
      ".write": false
    },
    "meta": {
      ".read": false,
      ".write": false
    }
  }
}
```
> **Giải thích:** Khi backend sử dụng Service Account có quyền Admin (`Firebase Admin SDK` hoặc OAuth2 Bearer Token của Service Account với scope Firebase RTDB), backend sẽ bypass Security Rules để đọc/ghi trực tiếp, trong khi mọi truy cập ẩn danh trái phép từ bên ngoài Internet vào URL RTDB đều bị chặn hoàn toàn (`read: false, write: false`).  
> *Lưu ý:* Trong Giai đoạn A, tuyệt đối chưa can thiệp sửa Rules trên Firebase Console.

### 8.3. Danh sách Biến Môi Trường (`.env.example`)
Tệp mẫu cấu hình không chứa dữ liệu nhạy cảm:
```env
# Server Configuration
PORT=3000
HOST=127.0.0.1
RUST_LOG=info,backend=debug

# CORS Settings (Cấu hình domain frontend)
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# Firebase Realtime Database
FIREBASE_DATABASE_URL=https://mechamay-7cbce-default-rtdb.asia-southeast1.firebasedatabase.app
# Chọn 1 trong 2 cơ chế xác thực:
FIREBASE_DATABASE_SECRET=
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-credentials.json

# Business Rules
ALLOW_DUPLICATE_CUSTOM_NAMES=true
MAX_NAME_LENGTH=50
MAX_MEMBER_NAME_LENGTH=50
```

---

## 9. Danh Sách Tệp Dự Kiến Tạo Trong Giai Đoạn B

Khi người dùng duyệt Giai đoạn A và cho phép triển khai Giai đoạn B, các tệp sau sẽ được khởi tạo:

```
d:\HI/
├── docs/
│   └── IMPLEMENTATION_PLAN.md      # Tài liệu đặc tả kỹ thuật (tạo trong Giai đoạn A)
├── backend/                        # Rust Axum Backend
│   ├── Cargo.toml                  # Khai báo dependency (axum, tokio, serde, reqwest, tower-http, etc.)
│   ├── .env.example                # File mẫu biến môi trường
│   ├── src/
│   │   ├── main.rs                 # Entry point & server startup
│   │   ├── config.rs               # Cấu hình môi trường
│   │   ├── errors.rs               # Xử lý lỗi toàn cục & HTTP status code
│   │   ├── models/
│   │   │   ├── mod.rs
│   │   │   └── team.rs             # Struct Team, DTOs, Validation
│   │   ├── routes/
│   │   │   ├── mod.rs
│   │   │   └── team_routes.rs      # Khai báo route /api/teams
│   │   ├── handlers/
│   │   │   ├── mod.rs
│   │   │   └── team_handler.rs     # Logic tiếp nhận HTTP request
│   │   ├── services/
│   │   │   ├── mod.rs
│   │   │   ├── team_service.rs     # Logic nghiệp vụ, cấp số đội nguyên tử
│   │   │   └── realtime_service.rs # SSE stream từ Firebase tới Frontend
│   │   └── firebase/
│   │       ├── mod.rs
│   │       └── client.rs           # HTTP client giao tiếp Firebase RTDB
│   └── tests/
│       └── team_test.rs            # Kiểm thử tích hợp backend
└── frontend/                       # Giao diện T1 3D Neumorphic-Glass
    ├── package.json                # Vite + TypeScript build scripts
    ├── index.html                  # Khung HTML chuẩn T1
    ├── src/
    │   ├── main.ts                 # Điểm khởi chạy Frontend
    │   ├── styles/
    │   │   ├── t1-core.css         # Hệ thống CSS 3D Neumorphic T1 hoàn chỉnh
    │   │   └── app.css             # Layout & responsive styles
    │   ├── types/
    │   │   └── team.ts             # TypeScript interfaces cho Team, DTO, API response
    │   ├── services/
    │   │   ├── api.ts              # Service gọi HTTP API backend
    │   │   └── sse.ts              # Quản lý kết nối SSE & tự động reconnect
    │   └── components/
    │       ├── Header.ts           # Thanh tiêu đề, nút thêm đội, realtime status pill
    │       ├── KpiCards.ts         # 3 Thẻ thống kê KPI 3D
    │       ├── SearchBar.ts        # Thanh tìm kiếm debounce 300ms
    │       ├── TeamTable.ts        # Bảng dữ liệu Pro cho Desktop
    │       ├── TeamCards.ts        # Giao diện thẻ cho Mobile
    │       ├── TeamModal.ts        # Modal 3D thêm/sửa đội
    │       └── Toast.ts            # Hệ thống thông báo nổi
```

---

## 10. Kế Hoạch Kiểm Thử và Tiêu Chí Nghiệm Thu (Acceptance Criteria)

Tất cả các trường hợp kiểm thử phải chạy với Firebase Realtime Database thực tế, không dùng mock data:

| STT | Tình huống kiểm thử | Các bước thực hiện | Kết quả mong đợi |
| :---: | :--- | :--- | :--- |
| **1** | Database rỗng | Xóa sạch node `/teams` trên Firebase, gọi `POST /api/teams` không truyền name | Đội đầu tiên được tạo với tên tự động là **"Đội 1"**, `customName = false`. |
| **2** | Tạo liên tiếp nhiều đội | Nhấn tạo thêm 4 đội liên tiếp | Tên các đội lần lượt là **"Đội 2", "Đội 3", "Đội 4", "Đội 5"**. |
| **3** | Đổi tên tùy chỉnh | Chọn "Đội 2", sửa tên thành "Hải Âu", bấm Lưu | Backend cập nhật `name = "Hải Âu"`, `customName = true`. Tải lại trang (F5) tên vẫn giữ nguyên. |
| **4** | Tạo đội mới sau khi đổi tên | Bấm tạo đội mới sau khi Đội 2 đã đổi tên thành "Hải Âu" | Hệ thống cấp tên **"Đội 2"** (do slot "Đội 2" đã trống) hoặc số kế tiếp chưa dùng mà không ghi đè "Hải Âu". |
| **5** | Xóa một đội | Xóa "Đội 3", kiểm tra các đội còn lại | "Đội 3" biến mất khỏi danh sách; các đội khác giữ nguyên 100% ID và tên cũ. |
| **6** | Cập nhật thành viên | Sửa `member1` thành "Nam", `member2` để trống | Dữ liệu lưu đúng xuống Firebase, tải lại trang vẫn hiển thị "Nam". |
| **7** | Tìm kiếm đa năng | Gõ từ khóa vào ô tìm kiếm | Lọc chính xác kết quả theo cả tên đội lẫn tên thành viên trong vòng 300ms debounce. |
| **8** | Hai client thao tác đồng thời | 2 trình duyệt bấm "Tạo đội" cùng tích tắc | Sinh ra 2 ID duy nhất khác nhau, cấp 2 số thứ tự khác nhau (không bị trùng "Đội 1"). |
| **9** | Ngắt kết nối Firebase | Tạm ngắt mạng hoặc vô hiệu hóa URL Firebase | UI hiển thị lỗi rõ ràng dạng Toast đỏ, không báo lưu thành công giả; rollback dữ liệu UI. |
| **10**| Khởi động lại Backend | Tắt và bật lại Axum backend | Toàn bộ dữ liệu hiển thị trên frontend đầy đủ từ Firebase, không bị mất mát. |
| **11**| Kiểm tra CORS | Gọi API từ origin không nằm trong danh sách trắng | Bị trình duyệt chặn bởi chính sách CORS header từ Axum backend. |
| **12**| Kiểm thử tự động | Chạy `cargo test` tại thư mục backend | Mọi unit test và integration test logic đều PASS 100%. |

---

## 11. Các Rủi Ro, Giả Định & Quyết Định Cần Người Dùng Duyệt

### 11.1. Các thông tin cần người dùng xác nhận trước Giai đoạn B:
1. **Lựa chọn Frontend Stack:**
   - *Khuyến nghị:* **Vite + Vanilla TypeScript** (hoặc Vite + React 19). Người dùng có ưu tiên framework cụ thể nào khác (React / Vue / Svelte / Pure HTML-JS) không?
2. **Chính sách cấp số mặc định khi có khoảng trống (Gap Filling):**
   - *Lựa chọn 1 (Khuyến nghị):* Lấp đầy số nhỏ nhất còn thiếu (nếu xóa Đội 2 thì đội tạo tiếp theo sẽ nhận tên Đội 2).
   - *Lựa chọn 2:* Tăng tiến liên tục (luôn lấy `Max(n) + 1`, không bao giờ dùng lại số cũ đã xóa).
3. **Chính sách trùng tên tùy chỉnh (Duplicate Custom Names):**
   - *Lựa chọn 1 (Khuyến nghị):* Cho phép trùng tên tùy chỉnh (vì đã có `id` phân biệt).
   - *Lựa chọn 2:* Bắt buộc tên đội phải duy nhất (trả lỗi nếu đặt tên trùng).
4. **Phương thức cấp quyền Firebase RTDB:**
   - Firebase URL: `https://mechamay-7cbce-default-rtdb.asia-southeast1.firebasedatabase.app/`
   - Dự án hiện tại của người dùng đang sử dụng **Database Secret** (Legacy Token) hay **Google Service Account JSON Key**?

---

## 12. Hướng Dẫn Chạy Local Dự Kiến Cho Giai Đoạn B

### Khởi chạy Backend (Rust):
```bash
cd backend
# Tạo file .env từ .env.example và điền thông tin Firebase
cp .env.example .env
cargo run
# Backend lắng nghe tại http://127.0.0.1:3000
```

### Khởi chạy Frontend:
```bash
cd frontend
npm install
npm run dev
# Frontend mở tại http://localhost:5173
```
