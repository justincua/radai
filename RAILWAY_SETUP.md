# Deploy MemeCoin Trader v3.8.1 lên Railway

Bản này chạy cả **PAPER + REAL Phantom** trên Railway. Railway cấp HTTPS nên Phantom có thể inject provider trên domain công khai.

## 1. Đưa source lên GitHub

Giải nén source, mở terminal tại thư mục:

```bash
git init
git add .
git commit -m "Deploy MemeCoin Trader to Railway"
git branch -M main
git remote add origin https://github.com/TEN_GITHUB/TEN_REPO.git
git push -u origin main
```

Không commit `.env`. File đã được thêm vào `.gitignore` và `.dockerignore`.

## 2. Tạo Railway Service

1. Railway → **New Project**.
2. Chọn **Deploy from GitHub repo**.
3. Chọn repository vừa tạo.
4. Railway tự nhận `Dockerfile` và `railway.json`.
5. Không tự đặt `PORT`; Railway inject biến này.

## 3. Tạo Variables

Mở service → **Variables** rồi thêm tối thiểu:

```env
APP_USERNAME=cua
APP_PASSWORD=mat_khau_dai_ngau_nhien
AUTO_OPEN=false
HOST=0.0.0.0
MEME_TRADER_DATA_DIR=/data
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=API_KEY
JUPITER_API_KEY=jup_API_KEY
MOCK_MODE=false
GECKO_ENABLED=false
FAST_TICKER_MS=1500
```

`APP_PASSWORD` tạo lớp đăng nhập cho toàn dashboard và API. `/health` vẫn công khai để Railway kiểm tra dịch vụ.

## 4. Gắn Volume — bắt buộc nếu muốn giữ profile/PNL

1. Trong project canvas, bấm chuột phải service.
2. Chọn **Attach Volume**.
3. Mount path:

```text
/data
```

4. Giữ service ở **1 replica**. Railway không cho dùng replicas cùng volume.

Dữ liệu được lưu gồm:

```text
/data/profiles.json
/data/profiles/
/data/real-wallets/
/data/quick-trade-settings.json
/data/profiles/<profile-id>.hidden-memes.json
```

Không có volume, profile và lịch sử có thể mất sau redeploy.

## 5. Tạo domain HTTPS

Service → **Settings** → **Networking** → **Generate Domain**.

Ví dụ:

```text
https://meme-trader-production.up.railway.app
```

Mở domain, trình duyệt hỏi username/password trước, sau đó kết nối Phantom.

Phantom chỉ inject provider trên HTTPS, localhost hoặc 127.0.0.1. Railway domain đã có HTTPS nên phù hợp.

## 6. Kiểm tra trước khi REAL trade

Không cần đăng nhập:

```text
https://DOMAIN_RAILWAY/health
```

Phải trả:

```json
{
  "ok": true,
  "dataWritable": true,
  "railway": true
}
```

Sau khi đăng nhập, kiểm tra:

```text
https://DOMAIN_RAILWAY/api/version
https://DOMAIN_RAILWAY/api/real/rpc-health
```

Sau đó:

1. Chọn `REAL`.
2. Kết nối Phantom.
3. Kiểm tra đúng địa chỉ ví và số dư.
4. Thử token thanh khoản cao với lệnh nhỏ.
5. Xác nhận transaction trên Solscan.

## 7. Lưu ý về tốc độ

Railway đặt server ở một region. Chọn region gần bạn hoặc gần Solana/Jupiter endpoint nhất. Dù dashboard cập nhật 1–1,5 giây, tốc độ transaction còn phụ thuộc:

- Railway region.
- RPC Helius/QuickNode.
- Jupiter.
- Phantom ký.
- Priority fee.
- Tình trạng Solana.

Để ổn định, không dùng Solana public RPC làm nguồn chính cho REAL.

## 8. Mobile Phantom

Trên desktop, dùng extension Phantom. Trên điện thoại, nên mở Railway URL trong **Phantom in-app browser**; Safari/Chrome mobile thông thường có thể không có injected provider.

## 9. Railway CLI — cách thay thế GitHub

```bash
npm i -g @railway/cli
railway login
railway init
railway up
```

Sau deploy vẫn phải tạo Variables, Volume `/data` và Generate Domain trong Railway dashboard.

## 10. Cập nhật source sau này

Push code mới lên GitHub. Railway tự redeploy; Volume `/data` giữ lại profile, PNL và lịch sử.

Do service có Volume, Railway có thể có một khoảng downtime ngắn lúc redeploy và không hỗ trợ replicas.
