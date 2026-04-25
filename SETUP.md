# 🌶️ ຕິດຕາມແຈ່ວຫອມແຊບ — Setup Guide

## ✅ ຂັ້ນຕອນການ Deploy

---

## STEP 1 — ສ້າງ Supabase Project

1. ໄປທີ່ https://supabase.com → ລ໋ອກອິນ / ສ້າງ Account
2. ກົດ **"New Project"**
3. ຕັ້ງຊື່ Project: `jaew-homxab`
4. ຕັ້ງ Password ສຳລັບ Database
5. ເລືອກ Region ທີ່ໃກ້ທີ່ສຸດ (ແນະນຳ: Singapore)
6. ລໍຖ້າ ~2 ນາທີ

---

## STEP 2 — ຕັ້ງ Database Schema

1. ໃນ Supabase Dashboard → ກົດ **"SQL Editor"**
2. ກົດ **"+ New query"**
3. Copy ທັງໝົດໃນ `supabase/schema.sql`
4. Paste ເຂົ້າ SQL Editor
5. ກົດ **"Run"** (Ctrl+Enter)

---

## STEP 3 — ສ້າງ Storage Buckets

1. ໃນ Supabase Dashboard → ກົດ **"Storage"**
2. ກົດ **"New Bucket"** → ສ້າງ 3 Buckets:
   - `production-images` (Public: OFF)
   - `distribution-images` (Public: OFF)
   - `sales-images` (Public: OFF)
3. ສຳລັບ Bucket Policies, ໃຊ້ SQL ທີ່ຢູ່ທ້າຍ schema.sql ແລ້ວ

---

## STEP 4 — Deploy Edge Functions

ຕ້ອງຕິດຕັ້ງ Supabase CLI ກ່ອນ:

```bash
npm install -g supabase
```

Login:
```bash
supabase login
```

Link project (ໃຊ້ Project Reference ID ຈາກ Settings > General):
```bash
supabase link --project-ref YOUR_PROJECT_REF
```

Deploy functions:
```bash
supabase functions deploy create-user
supabase functions deploy delete-user
```

---

## STEP 5 — ສ້າງ Admin User ທຳອິດ

1. ໃນ Supabase Dashboard → **Authentication → Users → "Invite User"**
2. ໃສ່ Email ຂອງ Admin
3. ກົດ **"SQL Editor"** → ໃສ່ຄຳສັ່ງນີ້ (ແທນ YOUR_USER_ID ດ້ວຍ UUID ຈາກ Users list):

```sql
INSERT INTO profiles (id, name, role)
VALUES ('YOUR_USER_ID', 'Admin ຫຼ້ວ', 'admin');
```

4. ຫຼື: ໃນ Authentication Settings → ປິດ "Email Confirm" ຊົ່ວຄາວ → Signup ຜ່ານ App → ແລ້ວເພີ່ມ Profile

---

## STEP 6 — ສ້າງ GitHub Repository

1. ໄປທີ່ https://github.com → ສ້າງ New Repository
2. ຊື່: `jaew-homxab-tracker`
3. Public ຫຼື Private ກໍໄດ້

ໃນ Terminal (ໂຟລເດີ project):
```bash
git init
git add .
git commit -m "Initial: ຕິດຕາມແຈ່ວຫອມແຊບ"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/jaew-homxab-tracker.git
git push -u origin main
```

---

## STEP 7 — Deploy ກັບ Netlify

1. ໄປທີ່ https://netlify.com → ລ໋ອກອິນ
2. ກົດ **"Add new site → Import an existing project"**
3. ເລືອກ **GitHub** → ເລືອກ repo `jaew-homxab-tracker`
4. Build settings (auto-detected):
   - Build command: `npm run build`
   - Publish directory: `dist`
5. ກ່ອນ Deploy → ກົດ **"Environment Variables"** → ເພີ່ມ:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | ຈາກ Supabase → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | ຈາກ Supabase → Settings → API → anon/public key |

6. ກົດ **"Deploy site"** 🚀

---

## STEP 8 — ຕັ້ງ Supabase Auth Settings

1. Supabase → **Authentication → Settings**
2. Site URL: ໃສ່ URL ຂອງ Netlify app (e.g. `https://jaew-homxab.netlify.app`)
3. Redirect URLs: ເພີ່ມ URL ດຽວກັນ

---

## 📋 Environment Variables Summary

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxxxxx...
```

---

## 👥 User Roles

| Role | ສິດ |
|---|---|
| `producer` | ບັນທຶກການຜະລິດ |
| `distributor` | ບັນທຶກການກະຈາຍ |
| `seller` | ລາຍງານຍອດຂາຍ |
| `admin` | ຈັດການທຸກຢ່າງ + Export Excel |

---

## 🛠️ Local Development

```bash
cd jaew-homxab-tracker
npm install
cp .env.example .env
# ແກ້ .env ໃສ່ Supabase credentials
npm run dev
```

Open: http://localhost:5173

---

## 📦 Products ໃນລະບົບ

- ເຂັ້ມຂຸ້ນ 550ml
- ເຂັ້ມຂຸ້ນ 250ml
- ນຸ້ມນວນ 550ml
- ນຸ້ມນວນ 250ml

(ຂໍ້ມູນ seed ໂດຍ schema.sql ອັດຕະໂນມັດ)

---

## 🆘 Troubleshooting

**ບໍ່ສາມາດ Login:**
- ກວດ Supabase URL ແລະ Key ໃນ .env
- ກວດ Profile ຖືກສ້າງໃນ `profiles` table

**ອັບໂຫລດຮູບບໍ່ໄດ້:**
- ກວດ Storage Buckets ຖືກສ້າງ
- ກວດ RLS Policies ສຳລັບ Storage

**Edge Function Error:**
- ກວດ Function deployed ຖືກ
- ກວດ Supabase CLI linked ຖືກ project
