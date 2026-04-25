# 🚀 DEPLOY-NOW: ຕິດຕາມແຈ່ວຫອມແຊບ

## ✅ ສຳເລັດແລ້ວ (Claude ດຳເນີນໃຫ້):
- [x] ໂຄງສ້າງ project ທັງໝົດ (React + Vite + Tailwind)
- [x] Netlify Functions (create-user, delete-user)
- [x] ໄຟລ໌ `.env` ມີ Supabase keys ທຸກຄ່າ

---

## 📋 STEP 1: ແລ່ນ SQL ໃນ Supabase

**ໄປທີ່:** https://supabase.com/dashboard/project/gtezoocacnpexzdxlzfn/sql/new

1. Copy **ທັງໝົດ** ຈາກໄຟລ໌ `supabase/schema.sql`
2. Paste ໃສ່ SQL Editor
3. ກົດ **"Run"** (ຫຼື Ctrl+Enter)
4. ເຫັນ "Success" ✅

---

## 📋 STEP 2: ສ້າງ Admin User

### 2a) ໄປທີ່ Authentication > Users:
https://supabase.com/dashboard/project/gtezoocacnpexzdxlzfn/auth/users

- ກົດ **"Add user"** → **"Create new user"**
- Email: `admin@jaew.com`
- Password: `Admin@123456`
- ✅ **Auto Confirm User: ON**
- ກົດ **Create User**

### 2b) Copy UUID ຂອງ user ທີ່ສ້າງ → ແລ່ນ SQL ນີ້:
https://supabase.com/dashboard/project/gtezoocacnpexzdxlzfn/sql/new

```sql
INSERT INTO public.profiles (id, name, role)
VALUES (
  'PASTE-UUID-HERE',
  'Admin ຕິດຕາມ',
  'admin'
);
```

---

## 📋 STEP 3: Push ໄປ GitHub

### ກ່ອນ push — ສ້າງ repo ໃໝ່:
1. https://github.com/new
2. Name: `jaew-homxab-tracker` | **Private** ✓
3. **ຢ່າ** tick README (project ມີ files ແລ້ວ)
4. ກົດ **Create repository**

### ແກ້ໄຂ `push-to-github.bat`:
ເປີດໄຟລ໌ `push-to-github.bat` → ປ່ຽນ `YOUR_GITHUB_USERNAME` → username ຂອງທ່ານ

### Double-click `push-to-github.bat`
- Username prompt: GitHub username
- Password prompt: **Personal Access Token (PAT)**

---

## 📋 STEP 4: Deploy ໃນ Netlify

1. https://netlify.com → **"Add new site"** → **"Import an existing project"**
2. ເລືອກ **GitHub** → repo `jaew-homxab-tracker`
3. Build: `npm run build` | Publish: `dist`
4. ກ່ອນ Deploy → **"Environment variables"** → ໃສ່:

| Variable | Value |
|----------|-------|
| `VITE_SUPABASE_URL` | `https://gtezoocacnpexzdxlzfn.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXpvb2NhY25wZXh6ZHhsemZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMjA4OTEsImV4cCI6MjA5MTg5Njg5MX0.IPhxY7VjrFk9qbQMlwEd65Z5lVS6VEmd3eXYneeSscY` |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZXpvb2NhY25wZXh6ZHhsemZuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjMyMDg5MSwiZXhwIjoyMDkxODk2ODkxfQ.VUpfLwNW89H3XL7p5Bpvtn7U4OP0D2qi7k86QPYNt4k` |

5. ກົດ **"Deploy site"** 🚀 → ລໍຖ້າ ~2 ນາທີ

---

## 📋 STEP 5: ຕັ້ງ Supabase Auth URL

ຫຼັງ Netlify deploy ສຳເລັດ — copy URL (ເຊັ່ນ `https://jaew-homxab.netlify.app`):

https://supabase.com/dashboard/project/gtezoocacnpexzdxlzfn/auth/url-configuration

- **Site URL** → ໃສ່ Netlify URL
- ກົດ **Save**

---

## 🎉 ສຳເລັດ!
Admin login: `admin@jaew.com` / `Admin@123456`
