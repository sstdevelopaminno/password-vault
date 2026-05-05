# QA Checklist: Physical Device (APK + PWA) Payment Flow

Date: 2026-05-05  
Target: `https://password-vault-ivory.vercel.app`  
Build: `16.6.36`

## Preconditions
- Android device 1 เครื่อง (แนะนำ Android 13+)
- บัญชีทดสอบที่มีสิทธิ์ใช้งานปกติ
- อินเทอร์เน็ตปกติ และทดสอบโหมดสัญญาณอ่อนอย่างน้อย 1 รอบ
- เปิดการบันทึกหน้าจอระหว่างทดสอบ

## A) APK Physical Test
1. ติดตั้ง APK ล่าสุดและเปิดแอป
2. Login สำเร็จ และเข้า `/our-packages` ได้
3. เลือกแพ็กเกจแบบเสียเงิน แล้วเลือก `QR PromptPay`
4. ตรวจว่า Popup ชำระเงินขึ้นกลางจอ (ไม่เบี้ยว/ไม่ค้าง)
5. สแกน QR จ่ายเงินจริงหรือใช้สลิปทดสอบที่ถูกต้อง
6. อัปโหลดสลิปจากแกลเลอรี
7. ตรวจว่าแสดง Progress bar ระหว่าง `scan -> upload -> verify`
8. ตรวจว่า field ถูกกรอกอัตโนมัติและล็อกแก้ไขไม่ได้
9. ตรวจว่าผ่านแล้วระบบไปขั้นต่อไปอัตโนมัติ (แพ็กเกจ active)
10. ทำกรณีสลิปผิด 1 รอบ ต้อง reject พร้อมข้อความชัดเจน

## B) PWA Physical Test (Android Chrome Install)
1. เปิดเว็บและ Install PWA
2. Login และเข้า `/wallet`
3. สร้าง top-up order ด้วย PromptPay QR
4. อัปโหลดสลิปจากกล้องหรือแกลเลอรี
5. ตรวจ Progress bar ทำงานต่อเนื่อง
6. ตรวจ auto-fill + field lock ทำงานเหมือน APK
7. ตรวจ top-up สำเร็จแล้ว wallet balance เพิ่มจริง
8. ทดสอบสลิปผิด 1 รอบ ต้อง reject ตามเงื่อนไข

## C) Performance/Stability Gate
- เวลาตอบสนองกดปุ่มหลักไม่ควรหน่วงเกิน ~300ms
- ไม่มีอาการค้างหน้าขาว/เด้งออกแอป
- อัปโหลดสลิปขนาดใหญ่ยังไม่ timeout
- UI ไม่กระตุกหนักระหว่าง OCR/verify

## Exit Criteria
- APK ผ่านครบทุกข้อใน A
- PWA ผ่านครบทุกข้อใน B
- ไม่มี error severity สูง (crash, hang, data mismatch)
