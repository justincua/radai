# Solana MemeCoin Trader v3.9 — Railway

Bản deploy Railway của dashboard PAPER + Phantom REAL.

## Deploy

Đọc: [`RAILWAY_SETUP.md`](RAILWAY_SETUP.md)

## Chạy local

```bash
cp .env.example .env
npm start
```

Mặc định mở tại `http://localhost:3000`.

## Railway

- Bind `0.0.0.0:$PORT`
- Healthcheck `/health`
- HTTPS tương thích Phantom
- Volume `/data` giữ profile/PNL
- Optional HTTP Basic Auth bằng `APP_USERNAME` + `APP_PASSWORD`
- Graceful shutdown khi Railway redeploy

Không nhập seed phrase hoặc private key vào Variables.


## Meme đang ẩn

Mỗi thẻ meme có nút `🙈 Ẩn`.

- Meme bị loại khỏi danh sách scanner ngay lập tức.
- Vị thế đang mở và nút bán không bị ảnh hưởng.
- Dữ liệu được khóa bằng mint/contract, không theo symbol.
- Nút `🙈 Đang ẩn` trên thanh đầu mở danh sách đã ẩn.
- Có thể mở lại từng meme hoặc mở lại toàn bộ.
- Danh sách ẩn được lưu riêng cho từng profile.

Trên Railway Volume `/data`, file có dạng:

```text
/data/profiles/<profile-id>.hidden-memes.json
```

Redeploy source không xóa danh sách này nếu Volume `/data` vẫn được gắn.


## v3.9 — sửa `custom program error: 0x1` trong self-pay

Bản trước chỉ tính:

- Tiền mua.
- Phí chữ ký và priority fee.
- Rent của token account nhận meme.

Nhưng khi `wrapAndUnwrapSol=true`, Jupiter còn tạo một tài khoản Wrapped SOL tạm thời.
Rent của tài khoản này được hoàn lại cuối transaction, nhưng ví vẫn phải đủ SOL ứng trước.

v3.9:

- Tính thêm WSOL rent vào số SOL cần có trước giao dịch.
- Không coi `-32002 Transaction simulation failed` là lỗi kết nối RPC.
- Không thử lại cùng transaction trên RPC dự phòng khi lỗi mang tính xác định.
- Mô phỏng transaction đã ký trước khi gửi.
- Giải mã instruction index, failed program và simulation logs.
- Nếu thiếu SOL/token, transaction không được gửi nên không mất phí.
- Chỉ gọi `sendTransaction(skipPreflight=true)` sau khi mô phỏng thành công.

Với mua 0.001 SOL và ví chưa có ATA, số dư cần có trước transaction thường gần:

```text
Mua                    0.001000 SOL
ATA nhận meme          ~0.002039 SOL
WSOL tạm, được hoàn    ~0.002039 SOL
Base + priority        ~0.000105 SOL
Reserve + buffer       ~0.000150 SOL
Tổng ứng trước         ~0.005333 SOL
```

Nên để khoảng 0.006–0.008 SOL để thử giao dịch nhỏ, thay vì chỉ 0.002 SOL.
