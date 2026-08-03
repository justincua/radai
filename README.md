# Solana MemeCoin Trader v3.8.1 — Railway

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
