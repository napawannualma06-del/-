# ระบบจัดการคิวงานพนักงาน (iPhone Case Queue Management)

เว็บแอปพลิเคชันระบบจัดการคิวงานสำหรับพนักงานและตัวแทน รองรับการรับเคส ตรวจสอบเครดิต อัปเดตสถานะงานแบบเรียลไทม์ และสรุปผลงานพนักงานประจำวัน

---

## 🌟 ฟังก์ชันการทำงานหลัก

1. **ระบบคิวงานแบบเรียลไทม์ (Real-time Queue):**
   - ลงข้อมูลเคสใหม่: ชื่อตัวแทน (ผู้ส่ง), รุ่น iPhone, จังหวัด
   - ลำดับสถานะงาน 3 ขั้นตอน:
     1. `เช็คเครดิต` (Credit Check)
     2. `กำลังทำเคส` (Processing)
     3. `จบเคส` (Case Closed)
   - ระบุชื่อพนักงานผู้รับผิดชอบงานอย่างชัดเจน
   - มีระบบเสียงแจ้งเตือน (Chime) และ Browser Notification เมื่อมีเคสใหม่เข้ามาทันที

2. **ระบบเข้าสู่ระบบแบบง่าย (No Gmail required):**
   - พนักงานสามารถลงทะเบียนชื่อและรหัสผ่าน/PIN ได้เองใน 1 ขั้นตอน
   - มีรายชื่อพนักงานให้แตะเลือกเพื่อเข้าสู่ระบบหรือสลับผู้ใช้ได้อย่างรวดเร็ว

3. **แดชบอร์ดผู้ดูแลระบบ (Admin Dashboard):**
   - สรุปภาพรวมเคสทั้งหมดประจำวัน และอัตราส่วนความสำเร็จ
   - ตารางจัดอันดับผลงานพนักงาน (Performance Leaderboard) ประจำวันแบบสด

4. **รองรับอุปกรณ์ทุกรูปแบบ (Responsive Design):**
   - ออกแบบสำหรับใช้งานบนมือถือ (iPhone, Android), แท็บเล็ต/iPad, และคอมพิวเตอร์

---

## 🛠️ เทคโนโลยีที่ใช้ (Tech Stack)

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, Date-fns
- **Database:** Google Cloud Firestore (Real-time NoSQL)
- **Deployment Ready:** Vercel, Netlify, Cloud Run, Firebase Hosting

---

## 🚀 วิธีรันโปรเจกต์ในเครื่อง (Local Development)

1. ติดตั้ง Dependencies:
```bash
npm install
```

2. รันโหมด Development:
```bash
npm run dev
```
เปิดเบราว์เซอร์ไปที่: `http://localhost:3000`

3. Build สำหรับ Production:
```bash
npm run build
```

---

## 🌐 การนำไป Deploy ขึ้นเว็บไซต์จริง

### 1. ใช้งานผ่าน GitHub Pages โดยตรง (ได้ URL ของ GitHub ทันที เช่น yourname.github.io/repo)
ระบบนี้ได้ติดตั้ง GitHub Actions Automation ให้เรียบร้อยแล้ว:
1. กด Export โค้ดขึ้น GitHub จากเมนู **GitHub** ด้านบน
2. ไปที่ Repository ของคุณบน GitHub -> กดเมนู **Settings** (รูปฟันเฟือง)
3. ที่เมนูด้านซ้าย เลือก **Pages**
4. ตรงหัวข้อ **Build and deployment > Source** ให้เปลี่ยนเป็น:
   👉 **"GitHub Actions"**
5. รอระบบรันประมาณ 1 นาที คุณจะได้ URL เว็บไซต์จริงที่เป็นของ GitHub ทันที! (เช่น `https://<ชื่อคุณ>.github.io/<ชื่อโปรเจกต์>/`)

---

### 2. Deploy บน Netlify
1. เข้าเว็บ [netlify.com](https://netlify.com)
2. เลือก **"Import from Git"** -> เลือก Repo นี้
3. ตั้งค่า Build Command: `npm run build` และ Publish Directory: `dist`
4. กด Deploy

---

## 📄 ข้อมูลความปลอดภัย (Security Rules)
ระบบมีไฟล์ `firestore.rules` สำหรับความปลอดภัยและการเข้าถึงข้อมูล สามารถแก้ไขและปรับแต่งเพิ่มเติมได้ตามนโยบายขององค์กร
